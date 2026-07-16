import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src';
import type { WorkerBindings } from '../src/types';
import { createTestDatabase, type TestDatabase } from './sqlite-d1';

const coreMigrationPath = fileURLToPath(new URL('../migrations/0001_core.sql', import.meta.url));
const collaborationMigrationPath = fileURLToPath(new URL('../migrations/0002_map_collaboration.sql', import.meta.url));
const adminToken = 'm6-admin-session-00000000000000000001';
const memberToken = 'm6-member-session-0000000000000000001';
const credentials = [
  { token: adminToken, user: { id: 'm6-admin', displayName: 'M6 Admin', roles: ['admin'] } },
  { token: memberToken, user: { id: 'm6-member', displayName: 'M6 Member', roles: ['user'] } },
];

class MemoryBucket {
  readonly values = new Map<string, string>();

  async get(key: string) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return {
      etag: `etag:${value}`,
      async json<T>() { return JSON.parse(value) as T; },
    };
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } },
  ) {
    if (typeof value !== 'string') throw new Error('MemoryBucket only supports string values');
    const current = this.values.get(key);
    if (options?.onlyIf?.etagMatches && (!current || options.onlyIf.etagMatches !== `etag:${current}`)) return null;
    if (options?.onlyIf?.etagDoesNotMatch === '*' && current !== undefined) return null;
    this.values.set(key, value);
    return { etag: `etag:${value}` };
  }
}

function bindings(database: D1Database, bucket = new MemoryBucket()): WorkerBindings {
  return {
    DB: database,
    ROOMS: {} as DurableObjectNamespace,
    TILES: bucket as unknown as R2Bucket,
    ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
    TRUSTED_SESSION_TOKENS_JSON: JSON.stringify(credentials),
  };
}

function request(env: WorkerBindings, path: string, token?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body) headers.set('content-type', 'application/json');
  return createApp().request(path, { ...init, headers }, env);
}

async function data<T>(response: Response): Promise<T> {
  return (await response.json<{ data: T }>()).data;
}

describe('M6 collaboration migration', () => {
  it('maps legacy pins without losing comments', async () => {
    const database = createTestDatabase(await readFile(coreMigrationPath, 'utf8'));
    try {
      const timestamp = '2026-07-17T00:00:00.000Z';
      await database.binding.prepare(
        "INSERT INTO users (id, display_name, role, created_at, updated_at) VALUES ('legacy-user', 'Legacy', 'user', ?, ?)",
      ).bind(timestamp, timestamp).run();
      await database.binding.prepare(
        `INSERT INTO pins (id, creator_id, type, title, longitude, latitude, status, visibility, created_at, updated_at)
         VALUES ('legacy-pin', 'legacy-user', 'note', '旧任务', 121.5, 31.28, 'archived', 'public', ?, ?)`,
      ).bind(timestamp, timestamp).run();
      await database.binding.prepare(
        "INSERT INTO pin_comments (id, pin_id, author_id, content, created_at) VALUES ('legacy-comment', 'legacy-pin', 'legacy-user', '保留评论', ?)",
      ).bind(timestamp).run();

      await database.binding.exec(await readFile(collaborationMigrationPath, 'utf8'));

      expect(await database.binding.prepare("SELECT type, status FROM pins WHERE id = 'legacy-pin'").first()).toEqual({
        type: 'task', status: 'expired',
      });
      expect(await database.binding.prepare("SELECT content FROM pin_comments WHERE id = 'legacy-comment'").first()).toEqual({
        content: '保留评论',
      });
      await expect(database.binding.prepare(
        `INSERT INTO pins (id, creator_id, type, title, longitude, latitude, status, visibility, created_at, updated_at)
         VALUES ('invalid-pin', 'legacy-user', 'note', 'bad', 121.5, 31.28, 'active', 'public', ?, ?)`,
      ).bind(timestamp, timestamp).run()).rejects.toThrow();
    } finally {
      database.close();
    }
  });
});

describe('M6 collaboration API', () => {
  let database: TestDatabase;
  let env: WorkerBindings;

  beforeEach(async () => {
    const migrations = await Promise.all([
      readFile(coreMigrationPath, 'utf8'),
      readFile(collaborationMigrationPath, 'utf8'),
    ]);
    database = createTestDatabase(migrations.join('\n'));
    env = bindings(database.binding);
  });

  afterEach(() => database.close());

  it('enforces repair and generic state machines with optimistic versions', async () => {
    const invalid = await request(env, '/api/pins', memberToken, {
      method: 'POST', body: JSON.stringify({
        type: 'repair', title: '错误初始状态', longitude: 121.5, latitude: 31.28, status: 'active',
      }),
    });
    expect(invalid.status).toBe(400);

    const created = await data<{ id: string; version: number }>(await request(env, '/api/pins', memberToken, {
      method: 'POST', body: JSON.stringify({
        type: 'repair', title: '路灯维修', longitude: 121.5, latitude: 31.28, status: 'reported',
      }),
    }));
    for (const [expectedVersion, status] of [[1, 'confirmed'], [2, 'processing'], [3, 'resolved']] as const) {
      const updated = await request(env, `/api/pins/${created.id}`, memberToken, {
        method: 'PATCH', body: JSON.stringify({ expectedVersion, status }),
      });
      expect(updated.status).toBe(200);
    }
    const conflict = await request(env, `/api/pins/${created.id}`, memberToken, {
      method: 'PATCH', body: JSON.stringify({ expectedVersion: 1, title: '过期客户端写入' }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      error: { code: 'PIN_VERSION_CONFLICT', details: { expectedVersion: 1, currentVersion: 4 } },
    });
  });

  it('supports room-member edits, comments, reports, activity, and soft deletion', async () => {
    const room = await data<{ id: string }>(await request(env, '/api/rooms', adminToken, {
      method: 'POST', body: JSON.stringify({ name: 'M6 协作房', visibility: 'public' }),
    }));
    await request(env, `/api/rooms/${room.id}/join`, memberToken, { method: 'POST' });
    const pin = await data<{ id: string; version: number }>(await request(env, '/api/pins', adminToken, {
      method: 'POST', body: JSON.stringify({
        roomId: room.id, type: 'meeting', title: '集合点', longitude: 121.5, latitude: 31.28,
        visibility: 'room',
      }),
    }));
    const edit = await request(env, `/api/pins/${pin.id}`, memberToken, {
      method: 'PATCH', body: JSON.stringify({ expectedVersion: pin.version, title: '东门集合点' }),
    });
    expect(await data(edit)).toMatchObject({ title: '东门集合点', version: 2 });

    expect((await request(env, `/api/pins/${pin.id}/comments`, memberToken, {
      method: 'POST', body: JSON.stringify({ content: '已到达。' }),
    })).status).toBe(201);
    const report = await request(env, `/api/pins/${pin.id}/reports`, memberToken, {
      method: 'POST', body: JSON.stringify({ reason: 'inaccurate', detail: '位置偏西' }),
    });
    expect(report.status).toBe(201);
    const reportRecord = await data<{ id: string }>(report);
    expect((await request(env, `/api/pins/${pin.id}/reports`, memberToken, {
      method: 'POST', body: JSON.stringify({ reason: 'inaccurate' }),
    })).status).toBe(409);
    expect((await request(env, `/api/pins/${pin.id}/reports`, memberToken)).status).toBe(403);
    expect(await data<unknown[]>(await request(env, `/api/pins/${pin.id}/reports`, adminToken))).toHaveLength(1);
    expect((await request(env, `/api/pins/${pin.id}/reports/${reportRecord.id}`, adminToken, {
      method: 'PATCH', body: JSON.stringify({ status: 'reviewed' }),
    })).status).toBe(200);

    const activity = await data<Array<{ action: string }>>(await request(env, `/api/pins/${pin.id}/activity`, memberToken));
    expect(activity.map(({ action }) => action)).toEqual(expect.arrayContaining([
      'pin.create', 'pin.update', 'pin.comment.create', 'pin.report.create', 'pin.report.resolve',
    ]));
    expect((await request(env, `/api/pins/${pin.id}`, adminToken, { method: 'DELETE' })).status).toBe(200);
    expect((await request(env, `/api/pins/${pin.id}`, memberToken)).status).toBe(404);
    const deletedActivity = await data<Array<{ action: string }>>(await request(env, `/api/pins/${pin.id}/activity`, memberToken));
    expect(deletedActivity.at(-1)?.action).toBe('pin.delete');
    expect(await database.binding.prepare('SELECT status, version FROM pins WHERE id = ?').bind(pin.id).first()).toEqual({
      status: 'deleted', version: 3,
    });
  });

  it('records authenticated submissions as pending revisions and finalizes them after formal review', async () => {
    const bucket = new MemoryBucket();
    env = bindings(database.binding, bucket);
    const feature = {
      type: 'Feature', id: 'node/m6',
      geometry: { type: 'Point', coordinates: [121.5, 31.28] },
      properties: { name: 'M6 地点', version: 7 },
    };
    const submit = await request(env, '/api/submit', memberToken, {
      method: 'POST', body: JSON.stringify({ features: [feature], message: '正式地图修改' }),
    });
    expect(submit.status).toBe(200);
    const submission = await submit.json<{ id: string }>();
    const pending = await data<Array<{ submissionId: string; baseVersion: number; status: string }>>(
      await request(env, `/api/feature-revisions?submissionId=${submission.id}`, memberToken),
    );
    expect(pending).toEqual([expect.objectContaining({
      submissionId: submission.id, baseVersion: 7, status: 'pending',
    })]);

    const review = await request(env, `/api/admin/submissions/${submission.id}/apply`, adminToken, {
      method: 'POST', body: JSON.stringify({ message: '审核通过' }),
    });
    expect(review.status).toBe(200);
    const applied = await data<Array<{ status: string; reviewerId: string }>>(
      await request(env, `/api/feature-revisions?submissionId=${submission.id}`, memberToken),
    );
    expect(applied[0]).toMatchObject({ status: 'applied', reviewerId: 'm6-admin' });
    expect(bucket.values.has('data/custom.geojson')).toBe(true);
  });
});
