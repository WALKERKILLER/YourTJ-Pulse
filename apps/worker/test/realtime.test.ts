import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AuthenticatedUser } from '@yourtj/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src';
import { RoomDurableObject } from '../src/durable-objects/room';
import { createRoom, syncAuthenticatedUser } from '../src/repositories/business';
import type { WorkerBindings } from '../src/types';
import { createTestDatabase } from './sqlite-d1';

const migrationPath = fileURLToPath(new URL('../migrations/0001_core.sql', import.meta.url));

interface TestAttachment {
  displayName: string;
  joined: boolean;
  joinedAt: number;
  lastSeq: number;
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
      status: 'available', sharingLocation: true,
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
    const database = createTestDatabase(await readFile(migrationPath, 'utf8'));
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
    const database = createTestDatabase(await readFile(migrationPath, 'utf8'));
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
        pin: { type: 'meetup', title: '同一个集合点', longitude: 121.5, latitude: 31.28 },
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
});
