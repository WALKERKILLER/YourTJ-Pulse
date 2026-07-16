import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src';
import { claimSubmissionReview } from '../src/repositories/business';
import type { WorkerBindings } from '../src/types';
import { createTestDatabase, type TestDatabase } from './sqlite-d1';

const migrationPaths = [
  fileURLToPath(new URL('../migrations/0001_core.sql', import.meta.url)),
  fileURLToPath(new URL('../migrations/0002_map_collaboration.sql', import.meta.url)),
];
const ownerToken = 'owner-test-session-000000000000000001';
const memberToken = 'member-test-session-00000000000000001';
const outsiderToken = 'outsider-test-session-000000000000001';

const credentials = [
  { token: ownerToken, user: { id: 'owner-1', displayName: 'Owner', roles: ['admin'] } },
  { token: memberToken, user: { id: 'member-1', displayName: 'Member', roles: ['user'] } },
  { token: outsiderToken, user: { id: 'outsider-1', displayName: 'Outsider', roles: ['user'] } },
];

function bindings(database: D1Database, overrides: Partial<WorkerBindings> = {}): WorkerBindings {
  return {
    DB: database,
    ROOMS: {} as DurableObjectNamespace,
    TILES: {} as R2Bucket,
    ASSETS: { fetch: () => Promise.resolve(new Response('asset')) } as unknown as Fetcher,
    TRUSTED_SESSION_TOKENS_JSON: JSON.stringify(credentials),
    ...overrides,
  };
}

function request(database: D1Database, path: string, token: string | undefined, init: RequestInit = {}, overrides?: Partial<WorkerBindings>) {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body) headers.set('content-type', 'application/json');
  return createApp().request(path, { ...init, headers }, bindings(database, overrides));
}

async function data<T>(response: Response): Promise<T> {
  const body = await response.json<{ data: T }>();
  return body.data;
}

describe('M4 D1 business API', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = createTestDatabase((await Promise.all(migrationPaths.map((path) => readFile(path, 'utf8')))).join('\n'));
  });

  afterEach(() => database.close());

  it('creates the nine constrained core tables without a GPS trajectory table', async () => {
    const result = await database.binding.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all<{ name: string }>();
    const names = result.results.map((row) => row.name);
    for (const name of ['users', 'rooms', 'room_members', 'pins', 'pin_comments', 'feature_revisions', 'twin_profiles', 'twin_events', 'audit_logs']) {
      expect(names).toContain(name);
    }
    expect(names.some((name) => /gps|trajectory|location_history/.test(name))).toBe(false);
    await expect(database.binding.prepare("INSERT INTO pins (id, creator_id, type, title, longitude, latitude, status, visibility, created_at, updated_at) VALUES ('bad', 'missing', 'task', 'bad', 181, 0, 'active', 'public', 'x', 'x')").run()).rejects.toThrow();
  });

  it('supports an explicitly enabled development identity and persists the user', async () => {
    const response = await request(database.binding, '/api/me', undefined, {}, {
      TRUSTED_SESSION_TOKENS_JSON: '[]',
      APP_ENV: 'development',
      DEV_AUTH_ENABLED: 'true',
      DEV_USER_ID: 'dev-user',
      DEV_USER_DISPLAY_NAME: '开发用户',
      DEV_USER_ROLE: 'mapper',
    });
    expect(response.status).toBe(200);
    expect(await data(response)).toMatchObject({ id: 'dev-user', roles: ['mapper'] });
    expect(await database.binding.prepare('SELECT role FROM users WHERE id = ?').bind('dev-user').first<{ role: string }>()).toEqual({ role: 'mapper' });

    const expired = await request(database.binding, '/api/me', ownerToken, {}, {
      TRUSTED_SESSION_TOKENS_JSON: JSON.stringify([{ ...credentials[0], expiresAt: '2020-01-01T00:00:00.000Z' }]),
    });
    expect(expired.status).toBe(401);
    const productionDevIdentity = await request(database.binding, '/api/me', undefined, {}, {
      APP_ENV: 'production', DEV_AUTH_ENABLED: 'true', DEV_USER_ID: 'forged-admin', DEV_USER_ROLE: 'admin',
    });
    expect(productionDevIdentity.status).toBe(401);
  });

  it('creates, joins, leaves, protects, and deletes persisted rooms with audit logs', async () => {
    const createResponse = await request(database.binding, '/api/rooms', ownerToken, {
      method: 'POST', body: JSON.stringify({ name: '测绘协作房', visibility: 'public' }),
    });
    expect(createResponse.status).toBe(201);
    const room = await data<{ id: string; membershipRole: string }>(createResponse);
    expect(room.membershipRole).toBe('owner');

    const joinResponse = await request(database.binding, `/api/rooms/${room.id}/join`, memberToken, { method: 'POST' });
    expect((await data<{ membershipRole: string }>(joinResponse)).membershipRole).toBe('member');
    expect((await request(database.binding, `/api/rooms/${room.id}`, outsiderToken)).status).toBe(200);
    expect((await request(database.binding, `/api/rooms/${room.id}`, memberToken)).status).toBe(200);
    expect((await request(database.binding, `/api/rooms/${room.id}/leave`, memberToken, { method: 'POST' })).status).toBe(200);
    expect((await request(database.binding, `/api/rooms/${room.id}`, memberToken)).status).toBe(200);
    expect((await request(database.binding, `/api/rooms/${room.id}`, memberToken, { method: 'DELETE' })).status).toBe(403);
    expect((await request(database.binding, `/api/rooms/${room.id}`, ownerToken, { method: 'DELETE' })).status).toBe(200);
    const audit = await database.binding.prepare("SELECT count(*) AS count FROM audit_logs WHERE target_type = 'room'").first<{ count: number }>();
    expect(audit?.count).toBeGreaterThanOrEqual(4);
  });

  it('enforces private room membership', async () => {
    const room = await data<{ id: string }>(await request(database.binding, '/api/rooms', ownerToken, {
      method: 'POST', body: JSON.stringify({ name: '私密房间', visibility: 'private' }),
    }));
    const detail = await request(database.binding, `/api/rooms/${room.id}`, outsiderToken);
    expect(detail.status).toBe(403);
    expect(await detail.json()).toMatchObject({ error: { code: 'ROOM_ACCESS_DENIED' } });
    expect((await request(database.binding, `/api/rooms/${room.id}/join`, outsiderToken, { method: 'POST' })).status).toBe(403);
  });

  it('hides expired rooms and pins while allowing their owners to delete them', async () => {
    const room = await data<{ id: string }>(await request(database.binding, '/api/rooms', ownerToken, {
      method: 'POST', body: JSON.stringify({ name: '临时房间', visibility: 'public', expiresAt: '2099-01-01T00:00:00.000Z' }),
    }));
    const roomPin = await data<{ id: string }>(await request(database.binding, '/api/pins', ownerToken, {
      method: 'POST', body: JSON.stringify({ roomId: room.id, type: 'task', title: '房间临时点', longitude: 121.5, latitude: 31.28, visibility: 'room' }),
    }));
    await database.binding.prepare("UPDATE rooms SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").bind(room.id).run();
    expect((await request(database.binding, `/api/rooms/${room.id}`, ownerToken)).status).toBe(410);
    expect((await request(database.binding, '/api/pins', ownerToken, {
      method: 'POST', body: JSON.stringify({ roomId: room.id, type: 'task', title: '过期房间点', longitude: 121.5, latitude: 31.28, visibility: 'room' }),
    })).status).toBe(410);
    expect((await request(database.binding, `/api/pins/${roomPin.id}`, ownerToken)).status).toBe(410);
    expect((await request(database.binding, `/api/pins/${roomPin.id}/comments`, ownerToken, {
      method: 'POST', body: JSON.stringify({ content: '房间过期后不应写入' }),
    })).status).toBe(410);
    const roomPins = await data<Array<{ id: string }>>(await request(database.binding, `/api/pins?roomId=${room.id}`, ownerToken));
    expect(roomPins).toEqual([]);
    expect((await request(database.binding, `/api/pins/${roomPin.id}`, ownerToken, { method: 'DELETE' })).status).toBe(200);
    expect((await request(database.binding, `/api/rooms/${room.id}`, ownerToken, { method: 'DELETE' })).status).toBe(200);

    const pin = await data<{ id: string }>(await request(database.binding, '/api/pins', memberToken, {
      method: 'POST', body: JSON.stringify({ type: 'task', title: '临时点', longitude: 121.5, latitude: 31.28, visibility: 'private', expiresAt: '2099-01-01T00:00:00.000Z' }),
    }));
    await database.binding.prepare("UPDATE pins SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").bind(pin.id).run();
    expect((await request(database.binding, `/api/pins/${pin.id}`, memberToken)).status).toBe(410);
    expect((await request(database.binding, `/api/pins/${pin.id}/comments`, memberToken, {
      method: 'POST', body: JSON.stringify({ content: '不应写入' }),
    })).status).toBe(410);
    expect((await request(database.binding, `/api/pins/${pin.id}`, memberToken, { method: 'DELETE' })).status).toBe(200);
  });

  it('persists collaborative pins, comments, optimistic versions, and audits', async () => {
    const room = await data<{ id: string }>(await request(database.binding, '/api/rooms', ownerToken, {
      method: 'POST', body: JSON.stringify({ name: '公开协作', visibility: 'public' }),
    }));
    await request(database.binding, `/api/rooms/${room.id}/join`, memberToken, { method: 'POST' });
    const created = await request(database.binding, '/api/pins', memberToken, {
      method: 'POST',
      body: JSON.stringify({ roomId: room.id, type: 'meeting', title: '集合点', longitude: 121.5, latitude: 31.28, visibility: 'room' }),
    });
    expect(created.status).toBe(201);
    const pin = await data<{ id: string; version: number }>(created);
    expect(pin.version).toBe(1);

    const updated = await request(database.binding, `/api/pins/${pin.id}`, memberToken, {
      method: 'PATCH', body: JSON.stringify({ expectedVersion: 1, title: '新的集合点' }),
    });
    expect(await data(updated)).toMatchObject({ title: '新的集合点', version: 2 });
    const conflict = await request(database.binding, `/api/pins/${pin.id}`, memberToken, {
      method: 'PATCH', body: JSON.stringify({ expectedVersion: 1, status: 'resolved' }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: 'PIN_VERSION_CONFLICT' } });

    const comment = await request(database.binding, `/api/pins/${pin.id}/comments`, ownerToken, {
      method: 'POST', body: JSON.stringify({ content: '收到，稍后到。' }),
    });
    expect(comment.status).toBe(201);
    expect(await data(await request(database.binding, `/api/pins/${pin.id}/comments`, memberToken))).toHaveLength(1);
    expect((await request(database.binding, `/api/pins/${pin.id}`, memberToken, { method: 'DELETE' })).status).toBe(200);
    const audit = await database.binding.prepare("SELECT action FROM audit_logs WHERE target_type IN ('pin', 'room')").all<{ action: string }>();
    expect(audit.results.map((row) => row.action)).toEqual(expect.arrayContaining(['pin.create', 'pin.update', 'pin.comment.create', 'pin.delete']));
  });

  it('persists twin profiles and destination events while rejecting GPS fields', async () => {
    const profile = await request(database.binding, '/api/twin/profile', memberToken, {
      method: 'PATCH', body: JSON.stringify({ enabled: true, homePlaceId: 'tongji-siping-way-1', privacyMode: 'private' }),
    });
    expect(await data(profile)).toMatchObject({ enabled: true, privacyMode: 'private' });
    const event = await request(database.binding, '/api/twin/events', memberToken, {
      method: 'POST', body: JSON.stringify({ eventType: 'class', destinationPlaceId: 'tongji-siping-way-1', startAt: '2026-07-17T08:00:00.000Z', source: 'manual', metadata: { course: '高等数学' } }),
    });
    expect(event.status).toBe(201);
    expect(await data(await request(database.binding, '/api/twin/events', memberToken))).toHaveLength(1);
    const gps = await request(database.binding, '/api/twin/events', memberToken, {
      method: 'POST', body: JSON.stringify({ eventType: 'gps', startAt: '2026-07-17T08:00:00.000Z', source: 'manual', longitude: 121.5, latitude: 31.28 }),
    });
    expect(gps.status).toBe(400);
    const nestedGps = await request(database.binding, '/api/twin/events', memberToken, {
      method: 'POST', body: JSON.stringify({ eventType: 'class', startAt: '2026-07-17T08:00:00.000Z', source: 'manual', metadata: { lastPosition: { coordinates: [121.5, 31.28] } } }),
    });
    expect(nestedGps.status).toBe(400);
  });

  it('serves generated places, offline search, and shared routes with unified responses', async () => {
    const search = await request(database.binding, '/api/search?q=xinan%20yi&limit=3', undefined);
    expect(search.status).toBe(200);
    const results = await data<Array<{ id: string; name: string }>>(search);
    expect(results[0]?.name).toContain('西南一');
    const destination = await data<Array<{ id: string }>>(await request(database.binding, '/api/search?q=海洋学院', undefined));
    const route = await request(database.binding, '/api/routes', undefined, {
      method: 'POST',
      body: JSON.stringify({ origin: { placeId: results[0]?.id }, destination: { placeId: destination[0]?.id }, profile: 'walking' }),
    });
    expect(route.status).toBe(200);
    expect((await data<Array<{ coordinates: unknown[]; instructions: unknown[] }>>(route))[0]?.coordinates.length).toBeGreaterThan(1);
  });

  it('serializes submission reviews with a persistent D1 claim', async () => {
    await request(database.binding, '/api/me', ownerToken);
    await claimSubmissionReview(database.binding, 'owner-1', 'submission-1', 'apply');
    await expect(claimSubmissionReview(database.binding, 'owner-1', 'submission-1', 'reject')).rejects.toMatchObject({
      status: 409,
      code: 'SUBMISSION_REVIEW_CLAIMED',
    });
    const audit = await database.binding.prepare("SELECT action FROM audit_logs WHERE id = 'submission-review:submission-1'").first<{ action: string }>();
    expect(audit?.action).toBe('submission.apply');
  });
});
