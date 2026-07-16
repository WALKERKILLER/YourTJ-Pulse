import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AuthenticatedUser } from '@yourtj/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src';
import { RoomDurableObject } from '../src/durable-objects/room';
import { createRoom, joinRoom, syncAuthenticatedUser } from '../src/repositories/business';
import type { WorkerBindings } from '../src/types';
import { createTestDatabase } from './sqlite-d1';

const migrationPaths = [
  fileURLToPath(new URL('../migrations/0001_core.sql', import.meta.url)),
  fileURLToPath(new URL('../migrations/0002_map_collaboration.sql', import.meta.url)),
];

async function migrations() {
  return (await Promise.all(migrationPaths.map((path) => readFile(path, 'utf8')))).join('\n');
}

interface TestAttachment {
  displayName: string;
  joined: boolean;
  joinedAt: number;
  lastSeq: number;
  lastLocation?: {
    seq: number; longitude: number; latitude: number; accuracy: number; kind: 'gps';
  };
  locationSharingLevel: 'precise' | 'approximate' | 'hidden';
  presence: 'available' | 'busy' | 'away';
  processedRequestIds: string[];
  roomExpiresAt: string | null;
  roomId: string;
  sessionExpiresAt: string | null;
  sharingLocation: boolean;
  updatedAt: number;
  user: { id: string; displayName: string; roles: ['user'] };
  userId: string;
}

class TestSocket {
  attachment: TestAttachment;
  readonly messages: Array<Record<string, unknown>> = [];
  closed: { code?: number; reason?: string } | null = null;

  constructor(userId: string) {
    this.attachment = {
      displayName: userId,
      joined: false,
      joinedAt: Date.now(),
      lastSeq: -1,
      locationSharingLevel: 'hidden',
      presence: 'available',
      processedRequestIds: [],
      roomExpiresAt: null,
      roomId: 'room-1',
      sessionExpiresAt: null,
      sharingLocation: false,
      updatedAt: Date.now(),
      user: { id: userId, displayName: userId, roles: ['user'] },
      userId,
    };
  }

  send(message: string): void {
    this.messages.push(JSON.parse(message) as Record<string, unknown>);
  }

  close(code?: number, reason?: string): void {
    this.closed = { ...(code === undefined ? {} : { code }), ...(reason === undefined ? {} : { reason }) };
  }

  serializeAttachment(value: TestAttachment): void {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment(): TestAttachment {
    return structuredClone(this.attachment);
  }
}

class TestState {
  readonly sockets: TestSocket[] = [];
  readonly values = new Map<string, unknown>();
  alarmAt: number | null = null;
  readonly storage = {
    get: async <T>(key: string) => this.values.get(key) as T | undefined,
    put: async (key: string, value: unknown) => { this.values.set(key, structuredClone(value)); },
    delete: async (key: string) => this.values.delete(key),
    setAlarm: async (timestamp: number) => { this.alarmAt = timestamp; },
    deleteAlarm: async () => { this.alarmAt = null; },
  };

  getWebSockets(tag?: string): WebSocket[] {
    const sockets = tag?.startsWith('user:')
      ? this.sockets.filter((socket) => socket.attachment.userId === tag.slice(5))
      : this.sockets;
    return sockets as unknown as WebSocket[];
  }

  remove(socket: TestSocket): void {
    const index = this.sockets.indexOf(socket);
    if (index >= 0) this.sockets.splice(index, 1);
  }
}

function clientMessage(type: string, requestId: string, payload: Record<string, unknown>) {
  return JSON.stringify({ type, requestId, sentAt: Date.now(), payload });
}

describe('RoomDurableObject realtime semantics', () => {
  let state: TestState;
  let room: RoomDurableObject;
  let alice: TestSocket;
  let bob: TestSocket;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T08:00:00.000Z'));
    state = new TestState();
    const bindings = { DB: {} as D1Database } as WorkerBindings;
    room = new RoomDurableObject(state as unknown as DurableObjectState, bindings);
    alice = new TestSocket('alice');
    bob = new TestSocket('bob');
    state.sockets.push(alice, bob);
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('room.join', 'join-a', {}));
    await room.webSocketMessage(bob as unknown as WebSocket, clientMessage('room.join', 'join-b', {}));
    alice.messages.length = 0;
    bob.messages.length = 0;
  });

  afterEach(() => vi.useRealTimers());

  it('broadcasts precise locations to two members and drops duplicate or inaccurate updates', async () => {
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('location.update', 'location-without-consent', {
      seq: 1, longitude: 121.5, latitude: 31.28, accuracy: 10, kind: 'gps',
    }));
    expect(bob.messages.some((message) => message.type === 'member.location')).toBe(false);
    expect((alice.messages.at(-1)?.payload as Record<string, unknown>).status).toBe('ignored');
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('presence.update', 'share-a', {
      status: 'available', sharingLocation: true, locationSharingLevel: 'precise',
    }));
    alice.messages.length = 0;
    bob.messages.length = 0;
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('location.update', 'location-1', {
      seq: 2, longitude: 121.501, latitude: 31.282, accuracy: 12, kind: 'gps',
    }));
    expect(bob.messages.some((message) => message.type === 'member.location')).toBe(true);
    expect(alice.messages.some((message) => message.type === 'room.ack')).toBe(true);

    bob.messages.length = 0;
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('location.update', 'location-old', {
      seq: 1, longitude: 121.6, latitude: 31.3, accuracy: 10, kind: 'gps',
    }));
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('location.update', 'location-poor', {
      seq: 3, longitude: 121.6, latitude: 31.3, accuracy: 500, kind: 'gps',
    }));
    expect(bob.messages.some((message) => message.type === 'member.location')).toBe(false);
    expect(JSON.stringify([...state.values.values()])).not.toContain('121.501');
  });

  it('rejects simulated coordinates on the GPS sharing channel', async () => {
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('presence.update', 'share-a', {
      status: 'available', sharingLocation: true,
    }));
    alice.messages.length = 0;
    bob.messages.length = 0;
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('location.update', 'simulated-location', {
      seq: 1, longitude: 121.5, latitude: 31.28, accuracy: 1, kind: 'twin_simulated',
    }));
    expect(alice.messages.at(-1)).toMatchObject({ type: 'room.error', payload: { code: 'LOCATION_KIND_NOT_ALLOWED' } });
    expect(bob.messages.some((message) => message.type === 'member.location')).toBe(false);
  });

  it('broadcasts stable approximate locations without exact coordinates or motion details', async () => {
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('presence.update', 'share-approximate', {
      status: 'available', sharingLocation: true, locationSharingLevel: 'approximate',
    }));
    bob.messages.length = 0;
    const exact = {
      seq: 4, longitude: 121.501_234, latitude: 31.282_345, accuracy: 8,
      altitude: 12, heading: 90, speed: 1.2, kind: 'gps',
    };
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('location.update', 'approximate-1', exact));
    const first = bob.messages.find((message) => message.type === 'member.location');
    const firstLocation = (first?.payload as { location: Record<string, unknown> }).location;
    expect(firstLocation.longitude).not.toBe(exact.longitude);
    expect(firstLocation.latitude).not.toBe(exact.latitude);
    expect(firstLocation.accuracy).toBe(80);
    expect(firstLocation).not.toHaveProperty('altitude');
    expect(firstLocation).not.toHaveProperty('heading');
    expect(firstLocation).not.toHaveProperty('speed');

    bob.messages.length = 0;
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('location.update', 'approximate-2', { ...exact, seq: 5 }));
    const second = bob.messages.find((message) => message.type === 'member.location');
    const secondLocation = (second?.payload as { location: Record<string, unknown> }).location;
    expect(secondLocation.longitude).toBe(firstLocation.longitude);
    expect(secondLocation.latitude).toBe(firstLocation.latitude);
  });

  it('defaults legacy sharing requests and attachments to approximate locations', async () => {
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('presence.update', 'legacy-share', {
      status: 'available', sharingLocation: true,
    }));
    bob.messages.length = 0;
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('location.update', 'legacy-location', {
      seq: 7, longitude: 121.501_234, latitude: 31.282_345, accuracy: 8, kind: 'gps',
    }));
    const location = (bob.messages.find((message) => message.type === 'member.location')?.payload as {
      location: Record<string, unknown>;
    }).location;
    expect(location.longitude).not.toBe(121.501_234);
    expect(location.latitude).not.toBe(31.282_345);
    expect(location.accuracy).toBe(80);

    const legacy = new TestSocket('legacy');
    legacy.attachment.joined = true;
    legacy.attachment.sharingLocation = true;
    legacy.attachment.lastLocation = {
      seq: 1, longitude: 121.509_876, latitude: 31.289_876, accuracy: 5, kind: 'gps',
    };
    delete (legacy.attachment as Partial<TestAttachment>).locationSharingLevel;
    state.sockets.push(legacy);
    await room.webSocketMessage(legacy as unknown as WebSocket, clientMessage('ping', 'legacy-ping', {}));
    expect(legacy.attachment.locationSharingLevel).toBe('approximate');
    expect(legacy.attachment.lastLocation?.longitude).not.toBe(121.509_876);
    expect(legacy.attachment.lastLocation?.accuracy).toBe(80);
  });

  it('keeps another active socket for the same user visible when one socket closes', async () => {
    const secondAlice = new TestSocket('alice');
    state.sockets.push(secondAlice);
    await room.webSocketMessage(secondAlice as unknown as WebSocket, clientMessage('room.join', 'join-a-second', {}));
    await room.webSocketMessage(secondAlice as unknown as WebSocket, clientMessage('presence.update', 'share-a-second', {
      status: 'available', sharingLocation: true, locationSharingLevel: 'approximate',
    }));
    bob.messages.length = 0;

    await room.webSocketClose(alice as unknown as WebSocket);

    expect(bob.messages.some((message) => message.type === 'member.presence')).toBe(false);
    expect(secondAlice.attachment.sharingLocation).toBe(true);
    expect(state.values.get('departures')).toBeUndefined();
  });

  it('stops sharing immediately and emits member.left after the disconnect grace alarm', async () => {
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('presence.update', 'pause-a', {
      status: 'away', sharingLocation: false,
    }));
    expect(bob.messages.at(-1)?.type).toBe('member.presence');
    expect((bob.messages.at(-1)?.payload as Record<string, unknown>).sharingLocation).toBe(false);

    bob.messages.length = 0;
    await room.webSocketClose(alice as unknown as WebSocket);
    state.remove(alice);
    vi.advanceTimersByTime(15_001);
    await room.alarm();
    expect(bob.messages.at(-1)?.type).toBe('member.left');
  });

  it('closes an active socket when the room expiry is observed', async () => {
    alice.attachment.roomExpiresAt = '2020-01-01T00:00:00.000Z';
    await room.webSocketMessage(alice as unknown as WebSocket, clientMessage('ping', 'expired-ping', {}));
    expect(alice.messages.at(-1)?.type).toBe('room.error');
    expect(alice.closed?.code).toBe(4004);
  });

  it('closes silent sockets from the alarm when their session expires', async () => {
    alice.attachment.sessionExpiresAt = '2026-07-17T08:00:01.000Z';
    vi.advanceTimersByTime(1_001);
    await room.alarm();
    expect(alice.messages.at(-1)?.type).toBe('room.error');
    expect(alice.closed?.code).toBe(4001);
  });
});

describe('realtime WebSocket upgrade route', () => {
  it('authenticates membership and forwards only trusted identity to the room namespace', async () => {
    const database = createTestDatabase(await migrations());
    try {
      const owner: AuthenticatedUser = { id: 'route-owner', displayName: 'Route Owner', roles: ['user'] };
      await syncAuthenticatedUser(database.binding, owner);
      const roomRecord = await createRoom(database.binding, owner, { name: '实时房间', visibility: 'public' });
      let forwarded: Request | undefined;
      let durableObjectName = '';
      const rooms = {
        getByName(name: string) {
          durableObjectName = name;
          return { fetch: async (request: Request) => {
            forwarded = request;
            return new Response(null, { status: 204 });
          } };
        },
      } as unknown as DurableObjectNamespace;
      const token = 'route-owner-session-000000000000000001';
      const encodedToken = btoa(token).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
      const bindings: WorkerBindings = {
        ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
        DB: database.binding,
        ROOMS: rooms,
        TILES: {} as R2Bucket,
        TRUSTED_SESSION_TOKENS_JSON: JSON.stringify([{ token, user: owner }]),
      };
      const response = await createApp().request(`/api/realtime/rooms/${roomRecord.id}`, {
        headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `yourtj.realtime.v1, yourtj.auth.${encodedToken}` },
      }, bindings);
      expect(response.status).toBe(204);
      expect(durableObjectName).toBe(`room:${roomRecord.id}`);
      expect(forwarded?.headers.get('Sec-WebSocket-Protocol')).toBe('yourtj.realtime.v1');
      expect(forwarded?.headers.get('X-YourTJ-Realtime-Identity')).toBeTruthy();
      expect(forwarded?.headers.get('X-YourTJ-Room-Id')).toBe(roomRecord.id);
    } finally {
      database.close();
    }
  });

  it('deduplicates pin creation across a reconnected socket', async () => {
    const database = createTestDatabase(await migrations());
    try {
      const owner: AuthenticatedUser = { id: 'pin-owner', displayName: 'Pin Owner', roles: ['user'] };
      await syncAuthenticatedUser(database.binding, owner);
      const roomRecord = await createRoom(database.binding, owner, { name: 'Pin 房间', visibility: 'public' });
      const state = new TestState();
      const room = new RoomDurableObject(state as unknown as DurableObjectState, { DB: database.binding } as WorkerBindings);
      const first = new TestSocket(owner.id);
      first.attachment.roomId = roomRecord.id;
      state.sockets.push(first);
      await room.webSocketMessage(first as unknown as WebSocket, clientMessage('room.join', 'join-first', {}));
      const pinMessage = clientMessage('pin.create', 'stable-pin-request', {
        pin: { type: 'meeting', title: '同一个集合点', longitude: 121.5, latitude: 31.28 },
      });
      await room.webSocketMessage(first as unknown as WebSocket, pinMessage);
      state.remove(first);

      const reconnected = new TestSocket(owner.id);
      reconnected.attachment.roomId = roomRecord.id;
      state.sockets.push(reconnected);
      await room.webSocketMessage(reconnected as unknown as WebSocket, clientMessage('room.join', 'join-second', {}));
      reconnected.messages.length = 0;
      await room.webSocketMessage(reconnected as unknown as WebSocket, pinMessage);
      const count = await database.binding.prepare('SELECT count(*) AS count FROM pins').first<{ count: number }>();
      expect(count?.count).toBe(1);
      expect(reconnected.messages.some((message) => message.type === 'pin.created')).toBe(true);
      const acknowledgement = reconnected.messages.find((message) => message.type === 'room.ack');
      expect((acknowledgement?.payload as Record<string, unknown>).status).toBe('duplicate');
    } finally {
      database.close();
    }
  });

  it('broadcasts room-member pin edits and rejects a stale expectedVersion', async () => {
    const database = createTestDatabase(await migrations());
    try {
      const owner: AuthenticatedUser = { id: 'edit-owner', displayName: 'Edit Owner', roles: ['user'] };
      const member: AuthenticatedUser = { id: 'edit-member', displayName: 'Edit Member', roles: ['user'] };
      await syncAuthenticatedUser(database.binding, owner);
      await syncAuthenticatedUser(database.binding, member);
      const roomRecord = await createRoom(database.binding, owner, { name: '多人编辑房间', visibility: 'public' });
      await joinRoom(database.binding, roomRecord.id, member);
      const state = new TestState();
      const room = new RoomDurableObject(state as unknown as DurableObjectState, { DB: database.binding } as WorkerBindings);
      const ownerSocket = new TestSocket(owner.id);
      ownerSocket.attachment.roomId = roomRecord.id;
      ownerSocket.attachment.user = { ...owner, roles: ['user'] };
      const memberSocket = new TestSocket(member.id);
      memberSocket.attachment.roomId = roomRecord.id;
      memberSocket.attachment.user = { ...member, roles: ['user'] };
      state.sockets.push(ownerSocket, memberSocket);
      await room.webSocketMessage(ownerSocket as unknown as WebSocket, clientMessage('room.join', 'edit-owner-join', {}));
      await room.webSocketMessage(memberSocket as unknown as WebSocket, clientMessage('room.join', 'edit-member-join', {}));

      await room.webSocketMessage(ownerSocket as unknown as WebSocket, clientMessage('pin.create', 'edit-create', {
        pin: { type: 'meeting', title: '原集合点', longitude: 121.5, latitude: 31.28 },
      }));
      const createdEvent = memberSocket.messages.find((message) => message.type === 'pin.created');
      const createdPin = (createdEvent?.payload as { pin: { id: string } }).pin;
      ownerSocket.messages.length = 0;
      memberSocket.messages.length = 0;

      await room.webSocketMessage(memberSocket as unknown as WebSocket, clientMessage('pin.update', 'edit-update', {
        pinId: createdPin.id, update: { expectedVersion: 1, title: '成员修改后的集合点' },
      }));
      const update = ownerSocket.messages.find((message) => message.type === 'pin.updated');
      expect(update?.payload).toMatchObject({ pin: { title: '成员修改后的集合点', version: 2 } });

      await room.webSocketMessage(ownerSocket as unknown as WebSocket, clientMessage('pin.update', 'edit-stale', {
        pinId: createdPin.id, update: { expectedVersion: 1, title: '陈旧覆盖' },
      }));
      expect(ownerSocket.messages.at(-1)).toMatchObject({
        type: 'room.error', payload: { code: 'PIN_VERSION_CONFLICT', retryable: false },
      });
      memberSocket.messages.length = 0;
      await room.webSocketMessage(ownerSocket as unknown as WebSocket, clientMessage('pin.delete', 'edit-delete', {
        pinId: createdPin.id, expectedVersion: 2,
      }));
      expect(memberSocket.messages.at(-1)).toMatchObject({
        type: 'pin.deleted', payload: { pinId: createdPin.id, version: 3 },
      });
      expect(await database.binding.prepare('SELECT title, status, version FROM pins WHERE id = ?').bind(createdPin.id).first()).toEqual({
        title: '成员修改后的集合点', status: 'deleted', version: 3,
      });
    } finally {
      database.close();
    }
  });
});
