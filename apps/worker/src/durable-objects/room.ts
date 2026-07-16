import {
  API_LIMITS,
  authenticatedUserSchema,
  clientMessageSchema,
  isWebSocketMessageWithinLimit,
  type AuthenticatedUser,
  type ClientMessage,
  type PresenceStatus,
  type RealtimeLocation,
  type RealtimeMember,
  type ServerMessage,
} from '@yourtj/contracts';
import { z } from 'zod';

import { createPin, deletePin, getPin, updatePin } from '../repositories/business';
import type { PinRecord } from '../repositories/business';
import type { WorkerBindings } from '../types';
import { ApiError } from '../utils/responses';
import { REALTIME_PROTOCOL } from '../routes/realtime';

const DISCONNECT_GRACE_MS = 15_000;
const MAX_BROADCAST_ACCURACY_METERS = 100;
const SESSION_EXPIRED_CLOSE_CODE = 4001;
const ROOM_EXPIRED_CLOSE_CODE = 4004;
const PROTOCOL_ERROR_CLOSE_CODE = 4400;

const identitySchema = z.object({
  user: authenticatedUserSchema,
  sessionExpiresAt: z.iso.datetime().nullable(),
}).strict();

interface SocketAttachment {
  avatarUrl?: string;
  displayName: string;
  joined: boolean;
  joinedAt: number;
  lastLocation?: RealtimeLocation;
  lastLocationAt?: number;
  lastSeq: number;
  presence: PresenceStatus;
  processedRequestIds: string[];
  roomExpiresAt: string | null;
  roomId: string;
  sessionExpiresAt: string | null;
  sharingLocation: boolean;
  updatedAt: number;
  user: AuthenticatedUser;
  userId: string;
}

interface Departure {
  deadline: number;
  userId: string;
}

interface StoredPinMutation {
  deleted?: { deletedAt: string; pinId: string; version: number };
  expiresAt: number;
  eventType?: 'pin.created' | 'pin.updated' | 'pin.deleted';
  pin?: PinRecord;
  status: 'complete' | 'processing';
}

type Departures = Record<string, Departure>;

function decodeBase64Url(value: string): string | undefined {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(normalized);
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  } catch {
    return undefined;
  }
}

function attachment(ws: WebSocket): SocketAttachment | undefined {
  return ws.deserializeAttachment() as SocketAttachment | undefined;
}

function connectionStatus(updatedAt: number, timestamp: number): RealtimeMember['connectionStatus'] {
  const age = timestamp - updatedAt;
  if (age <= 10_000) return 'live';
  if (age <= 30_000) return 'delayed';
  if (age <= 90_000) return 'stale';
  return 'offline';
}

export class RoomDurableObject {
  private sequence = Date.now() * 1_000;

  constructor(private readonly state: DurableObjectState, private readonly env: WorkerBindings) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: { code: 'WEBSOCKET_UPGRADE_REQUIRED', message: 'WebSocket upgrade required' } }, { status: 426 });
    }
    const roomId = request.headers.get('X-YourTJ-Room-Id');
    const encodedIdentity = request.headers.get('X-YourTJ-Realtime-Identity');
    const decodedIdentity = encodedIdentity ? decodeBase64Url(encodedIdentity) : undefined;
    let decodedIdentityValue: unknown;
    try {
      decodedIdentityValue = decodedIdentity ? JSON.parse(decodedIdentity) : undefined;
    } catch {
      decodedIdentityValue = undefined;
    }
    const identity = identitySchema.safeParse(decodedIdentityValue);
    if (!roomId || !identity?.success) {
      return Response.json({ error: { code: 'INVALID_REALTIME_IDENTITY', message: 'Trusted realtime identity is missing' } }, { status: 401 });
    }
    const roomExpiresAt = request.headers.get('X-YourTJ-Room-Expires-At');
    if (roomExpiresAt && roomExpiresAt <= new Date().toISOString()) {
      return Response.json({ error: { code: 'ROOM_EXPIRED', message: 'Room has expired' } }, { status: 410 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const timestamp = Date.now();
    const socketAttachment: SocketAttachment = {
      ...(identity.data.user.avatarUrl ? { avatarUrl: identity.data.user.avatarUrl } : {}),
      displayName: identity.data.user.displayName,
      joined: false,
      joinedAt: timestamp,
      lastSeq: -1,
      presence: 'available',
      processedRequestIds: [],
      roomExpiresAt,
      roomId,
      sessionExpiresAt: identity.data.sessionExpiresAt,
      sharingLocation: false,
      updatedAt: timestamp,
      user: identity.data.user,
      userId: identity.data.user.id,
    };
    server.serializeAttachment(socketAttachment);
    this.state.acceptWebSocket(server, [`room:${roomId}`, `user:${identity.data.user.id}`]);
    if (roomExpiresAt) await this.state.storage.put('roomExpiresAt', roomExpiresAt);
    await this.clearDeparture(identity.data.user.id);
    await this.scheduleNextAlarm();
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': REALTIME_PROTOCOL },
    });
  }

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    const current = attachment(ws);
    if (!current) {
      ws.close(PROTOCOL_ERROR_CLOSE_CODE, 'Missing socket attachment');
      return;
    }
    if (!isWebSocketMessageWithinLimit(rawMessage)) {
      this.sendError(ws, 'MESSAGE_TOO_LARGE', `Messages are limited to ${API_LIMITS.webSocketMessageBytes} bytes`, false);
      ws.close(PROTOCOL_ERROR_CLOSE_CODE, 'Message too large');
      return;
    }
    if (this.expired(current)) {
      this.sendError(ws, current.sessionExpiresAt && current.sessionExpiresAt <= new Date().toISOString() ? 'SESSION_EXPIRED' : 'ROOM_EXPIRED', 'Realtime session is no longer active', false);
      ws.close(current.sessionExpiresAt && current.sessionExpiresAt <= new Date().toISOString() ? SESSION_EXPIRED_CLOSE_CODE : ROOM_EXPIRED_CLOSE_CODE, 'Realtime session expired');
      return;
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage));
    } catch {
      this.sendError(ws, 'INVALID_JSON', 'Message must be valid JSON', false);
      ws.close(PROTOCOL_ERROR_CLOSE_CODE, 'Invalid JSON');
      return;
    }
    const parsed = clientMessageSchema.safeParse(decoded);
    if (!parsed.success) {
      this.sendError(ws, 'INVALID_MESSAGE', 'Message failed realtime protocol validation', false);
      return;
    }
    const message = parsed.data;
    if (current.processedRequestIds.includes(message.requestId)) {
      this.sendAck(ws, message, 'duplicate');
      return;
    }
    if (!current.joined && message.type !== 'room.join') {
      this.sendError(ws, 'ROOM_JOIN_REQUIRED', 'Send room.join before other messages', true, message.requestId);
      return;
    }

    try {
      await this.handleMessage(ws, current, message);
      current.processedRequestIds = [...current.processedRequestIds.slice(-99), message.requestId];
      ws.serializeAttachment(current);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : undefined;
      const retryable = !apiError || apiError.status >= 500 || apiError.code === 'REQUEST_IN_PROGRESS';
      this.sendError(ws, apiError?.code ?? 'REALTIME_INTERNAL_ERROR', apiError?.message ?? 'Realtime message failed', retryable, message.requestId);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const current = attachment(ws);
    if (!current?.joined) return;
    const storedLastSeq = await this.state.storage.get<number>(`lastSeq:${current.userId}`) ?? -1;
    const activeLastSeq = Math.max(...this.state.getWebSockets(`user:${current.userId}`)
      .map((socket) => attachment(socket)?.lastSeq ?? -1));
    await this.state.storage.put(`lastSeq:${current.userId}`, Math.max(storedLastSeq, activeLastSeq, current.lastSeq));
    const hasOtherSocket = this.state.getWebSockets(`user:${current.userId}`).some((candidate) => candidate !== ws && attachment(candidate)?.joined);
    if (hasOtherSocket) return;
    const departures = await this.departures();
    departures[current.userId] = { userId: current.userId, deadline: Date.now() + DISCONNECT_GRACE_MS };
    await this.state.storage.put('departures', departures);
    await this.scheduleNextAlarm();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  async alarm(): Promise<void> {
    const timestamp = Date.now();
    const roomExpiresAt = await this.state.storage.get<string>('roomExpiresAt');
    if (roomExpiresAt && roomExpiresAt <= new Date(timestamp).toISOString()) {
      for (const socket of this.state.getWebSockets()) {
        this.sendError(socket, 'ROOM_EXPIRED', 'Room has expired', false);
        socket.close(ROOM_EXPIRED_CLOSE_CODE, 'Room expired');
      }
      await this.state.storage.delete('departures');
      return;
    }
    for (const socket of this.state.getWebSockets()) {
      const current = attachment(socket);
      if (!current?.sessionExpiresAt || Date.parse(current.sessionExpiresAt) > timestamp) continue;
      this.sendError(socket, 'SESSION_EXPIRED', 'Realtime session has expired', true);
      socket.close(SESSION_EXPIRED_CLOSE_CODE, 'Session expired');
    }
    const departures = await this.departures();
    for (const departure of Object.values(departures)) {
      if (departure.deadline > timestamp) continue;
      const reconnected = this.state.getWebSockets(`user:${departure.userId}`).some((socket) => attachment(socket)?.joined);
      if (!reconnected) this.broadcast('member.left', { userId: departure.userId, leftAt: timestamp });
      delete departures[departure.userId];
    }
    await this.state.storage.put('departures', departures);
    await this.scheduleNextAlarm();
  }

  private async handleMessage(ws: WebSocket, current: SocketAttachment, message: ClientMessage): Promise<void> {
    const timestamp = Date.now();
    switch (message.type) {
      case 'room.join': {
        const firstJoin = !current.joined;
        current.joined = true;
        current.presence = message.payload.presence;
        current.updatedAt = timestamp;
        current.lastSeq = Math.max(current.lastSeq, await this.state.storage.get<number>(`lastSeq:${current.userId}`) ?? -1);
        await this.clearDeparture(current.userId);
        this.send(ws, 'room.snapshot', { roomId: current.roomId, members: this.members(timestamp) }, message.requestId);
        if (firstJoin) this.broadcast('member.joined', { member: this.member(current, timestamp) }, message.requestId, ws);
        this.sendAck(ws, message, 'accepted');
        return;
      }
      case 'location.update': {
        if (!current.sharingLocation) {
          this.sendAck(ws, message, 'ignored');
          return;
        }
        if (message.payload.seq <= current.lastSeq) {
          this.sendAck(ws, message, 'duplicate');
          return;
        }
        current.lastSeq = message.payload.seq;
        current.updatedAt = timestamp;
        if (message.payload.accuracy > MAX_BROADCAST_ACCURACY_METERS) {
          this.sendAck(ws, message, 'ignored');
          return;
        }
        current.lastLocation = message.payload;
        current.lastLocationAt = timestamp;
        this.broadcast('member.location', { userId: current.userId, location: message.payload, receivedAt: timestamp }, message.requestId);
        this.sendAck(ws, message, 'accepted');
        return;
      }
      case 'presence.update': {
        current.presence = message.payload.status;
        current.sharingLocation = message.payload.sharingLocation;
        current.updatedAt = timestamp;
        if (!current.sharingLocation) {
          delete current.lastLocation;
          delete current.lastLocationAt;
        }
        this.broadcast('member.presence', { userId: current.userId, presence: current.presence, sharingLocation: current.sharingLocation, updatedAt: timestamp }, message.requestId);
        this.sendAck(ws, message, 'accepted');
        return;
      }
      case 'pin.create': {
        const requestKey = `request:${message.requestId}`;
        const stored = await this.state.storage.get<StoredPinMutation>(requestKey);
        if (stored && stored.expiresAt > timestamp) {
          if (stored.status === 'processing') throw new ApiError(409, 'REQUEST_IN_PROGRESS', 'Pin request is still being processed');
          if (stored.pin && (stored.eventType === 'pin.created' || stored.eventType === 'pin.updated')) {
            this.send(ws, stored.eventType, { pin: stored.pin }, message.requestId);
          }
          this.sendAck(ws, message, 'duplicate');
          return;
        }
        await this.state.storage.put(requestKey, { status: 'processing', expiresAt: timestamp + 86_400_000 } satisfies StoredPinMutation);
        try {
          const pin = await createPin(this.env.DB, current.user, {
            ...message.payload.pin,
            roomId: current.roomId,
            visibility: 'room',
          });
          await this.state.storage.put(requestKey, {
            status: 'complete', eventType: 'pin.created', pin, expiresAt: timestamp + 86_400_000,
          } satisfies StoredPinMutation);
          this.broadcast('pin.created', { pin }, message.requestId);
          this.sendAck(ws, message, 'accepted');
        } catch (error) {
          await this.state.storage.delete(requestKey);
          throw error;
        }
        return;
      }
      case 'pin.update': {
        const requestKey = `request:${message.requestId}`;
        const stored = await this.state.storage.get<StoredPinMutation>(requestKey);
        if (stored && stored.expiresAt > timestamp) {
          if (stored.status === 'processing') throw new ApiError(409, 'REQUEST_IN_PROGRESS', 'Pin request is still being processed');
          if (stored.pin && (stored.eventType === 'pin.created' || stored.eventType === 'pin.updated')) {
            this.send(ws, stored.eventType, { pin: stored.pin }, message.requestId);
          }
          this.sendAck(ws, message, 'duplicate');
          return;
        }
        const currentPin = await getPin(this.env.DB, message.payload.pinId, current.user);
        if (currentPin.roomId !== current.roomId || currentPin.visibility !== 'room') {
          throw new ApiError(403, 'PIN_ROOM_MISMATCH', 'Realtime edits are limited to room-visible pins in this room');
        }
        if (message.payload.update.visibility && message.payload.update.visibility !== 'room') {
          throw new ApiError(400, 'PIN_VISIBILITY_LOCKED', 'Realtime room edits cannot change pin visibility');
        }
        await this.state.storage.put(requestKey, { status: 'processing', expiresAt: timestamp + 86_400_000 } satisfies StoredPinMutation);
        try {
          const pin = await updatePin(this.env.DB, message.payload.pinId, current.user, message.payload.update);
          await this.state.storage.put(requestKey, {
            status: 'complete', eventType: 'pin.updated', pin, expiresAt: timestamp + 86_400_000,
          } satisfies StoredPinMutation);
          this.broadcast('pin.updated', { pin }, message.requestId);
          this.sendAck(ws, message, 'accepted');
        } catch (error) {
          await this.state.storage.delete(requestKey);
          throw error;
        }
        return;
      }
      case 'pin.delete': {
        const requestKey = `request:${message.requestId}`;
        const stored = await this.state.storage.get<StoredPinMutation>(requestKey);
        if (stored && stored.expiresAt > timestamp) {
          if (stored.status === 'processing') throw new ApiError(409, 'REQUEST_IN_PROGRESS', 'Pin request is still being processed');
          if (stored.deleted) this.send(ws, 'pin.deleted', stored.deleted, message.requestId);
          this.sendAck(ws, message, 'duplicate');
          return;
        }
        const currentPin = await getPin(this.env.DB, message.payload.pinId, current.user);
        if (currentPin.roomId !== current.roomId || currentPin.visibility !== 'room') {
          throw new ApiError(403, 'PIN_ROOM_MISMATCH', 'Realtime deletes are limited to room-visible pins in this room');
        }
        await this.state.storage.put(requestKey, { status: 'processing', expiresAt: timestamp + 86_400_000 } satisfies StoredPinMutation);
        try {
          const deleted = await deletePin(
            this.env.DB,
            message.payload.pinId,
            current.user,
            message.payload.expectedVersion,
          );
          await this.state.storage.put(requestKey, {
            status: 'complete', eventType: 'pin.deleted', deleted, expiresAt: timestamp + 86_400_000,
          } satisfies StoredPinMutation);
          this.broadcast('pin.deleted', deleted, message.requestId);
          this.sendAck(ws, message, 'accepted');
        } catch (error) {
          await this.state.storage.delete(requestKey);
          throw error;
        }
        return;
      }
      case 'ping': {
        current.updatedAt = timestamp;
        this.sendAck(ws, message, 'accepted');
      }
    }
  }

  private expired(current: SocketAttachment): boolean {
    const timestamp = new Date().toISOString();
    return Boolean(
      (current.sessionExpiresAt && current.sessionExpiresAt <= timestamp)
        || (current.roomExpiresAt && current.roomExpiresAt <= timestamp),
    );
  }

  private member(current: SocketAttachment, timestamp: number): RealtimeMember {
    const memberUpdatedAt = current.lastLocationAt ?? current.updatedAt;
    return {
      userId: current.userId,
      displayName: current.displayName,
      ...(current.avatarUrl ? { avatarUrl: current.avatarUrl } : {}),
      presence: current.presence,
      sharingLocation: current.sharingLocation,
      connectionStatus: connectionStatus(memberUpdatedAt, timestamp),
      joinedAt: current.joinedAt,
      updatedAt: memberUpdatedAt,
      ...(current.sharingLocation && current.lastLocation ? { location: current.lastLocation } : {}),
    };
  }

  private members(timestamp: number): RealtimeMember[] {
    const byUser = new Map<string, SocketAttachment>();
    for (const socket of this.state.getWebSockets()) {
      const current = attachment(socket);
      if (!current?.joined) continue;
      const previous = byUser.get(current.userId);
      if (!previous || previous.updatedAt < current.updatedAt) byUser.set(current.userId, current);
    }
    return [...byUser.values()].map((current) => this.member(current, timestamp)).slice(0, API_LIMITS.roomMembers);
  }

  private nextEnvelope(type: ServerMessage['type'], payload: ServerMessage['payload'], requestId?: string): ServerMessage {
    this.sequence = Math.max(this.sequence + 1, Date.now() * 1_000);
    return {
      type,
      eventId: crypto.randomUUID(),
      sequence: this.sequence,
      sentAt: Date.now(),
      ...(requestId ? { requestId } : {}),
      payload,
    } as ServerMessage;
  }

  private send(ws: WebSocket, type: ServerMessage['type'], payload: ServerMessage['payload'], requestId?: string): void {
    ws.send(JSON.stringify(this.nextEnvelope(type, payload, requestId)));
  }

  private broadcast(type: ServerMessage['type'], payload: ServerMessage['payload'], requestId?: string, exclude?: WebSocket): void {
    const encoded = JSON.stringify(this.nextEnvelope(type, payload, requestId));
    for (const socket of this.state.getWebSockets()) if (socket !== exclude && attachment(socket)?.joined) socket.send(encoded);
  }

  private sendAck(ws: WebSocket, message: ClientMessage, status: 'accepted' | 'duplicate' | 'ignored'): void {
    this.send(ws, 'room.ack', { acceptedType: message.type, status }, message.requestId);
  }

  private sendError(ws: WebSocket, code: string, message: string, retryable: boolean, requestId?: string): void {
    this.send(ws, 'room.error', { code, message, retryable }, requestId);
  }

  private async departures(): Promise<Departures> {
    return await this.state.storage.get<Departures>('departures') ?? {};
  }

  private async clearDeparture(userId: string): Promise<void> {
    const departures = await this.departures();
    if (!departures[userId]) return;
    delete departures[userId];
    await this.state.storage.put('departures', departures);
  }

  private async scheduleNextAlarm(): Promise<void> {
    const timestamp = Date.now();
    const roomExpiresAt = await this.state.storage.get<string>('roomExpiresAt');
    const roomDeadline = roomExpiresAt ? Date.parse(roomExpiresAt) : Number.POSITIVE_INFINITY;
    const departures = await this.departures();
    const departureDeadline = Math.min(...Object.values(departures).map(({ deadline }) => deadline), Number.POSITIVE_INFINITY);
    const sessionDeadline = Math.min(...this.state.getWebSockets()
      .map((socket) => attachment(socket)?.sessionExpiresAt)
      .filter((value): value is string => Boolean(value))
      .map(Date.parse)
      .filter((deadline) => deadline > timestamp), Number.POSITIVE_INFINITY);
    const deadline = Math.min(roomDeadline, departureDeadline, sessionDeadline);
    if (Number.isFinite(deadline)) await this.state.storage.setAlarm(Math.max(Date.now(), deadline));
    else await this.state.storage.deleteAlarm();
  }
}
