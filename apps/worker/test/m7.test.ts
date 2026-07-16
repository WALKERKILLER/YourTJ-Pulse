import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src';
import type { WorkerBindings } from '../src/types';
import { createTestDatabase, type TestDatabase } from './sqlite-d1';

const migrationPaths = [
  fileURLToPath(new URL('../migrations/0001_core.sql', import.meta.url)),
  fileURLToPath(new URL('../migrations/0002_map_collaboration.sql', import.meta.url)),
  fileURLToPath(new URL('../migrations/0003_twin_simulation.sql', import.meta.url)),
];
const token = 'm7-twin-session-000000000000000000001';

function bindings(database: D1Database): WorkerBindings {
  return {
    DB: database,
    ROOMS: {} as DurableObjectNamespace,
    TILES: {} as R2Bucket,
    ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
    TRUSTED_SESSION_TOKENS_JSON: JSON.stringify([{
      token, user: { id: 'm7-user', displayName: 'M7 User', roles: ['user'] },
    }]),
  };
}

function request(env: WorkerBindings, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (init.body) headers.set('content-type', 'application/json');
  return createApp().request(path, { ...init, headers }, env);
}

async function data<T>(response: Response): Promise<T> {
  return (await response.json<{ data: T }>()).data;
}

describe('M7 twin migration', () => {
  it('preserves legacy profiles and events while disabling simulation by default', async () => {
    const [core, collaboration, twin] = await Promise.all(migrationPaths.map((path) => readFile(path, 'utf8')));
    const database = createTestDatabase(`${core}\n${collaboration}`);
    try {
      const timestamp = '2026-07-17T00:00:00.000Z';
      await database.binding.prepare(
        "INSERT INTO users (id, display_name, role, created_at, updated_at) VALUES ('legacy-twin', 'Legacy Twin', 'user', ?, ?)",
      ).bind(timestamp, timestamp).run();
      await database.binding.prepare(
        "INSERT INTO twin_profiles (user_id, enabled, privacy_mode, updated_at) VALUES ('legacy-twin', 1, 'public', ?)",
      ).bind(timestamp).run();
      await database.binding.prepare(
        `INSERT INTO twin_events (id, user_id, event_type, destination_place_id, start_at, source, metadata_json)
         VALUES ('legacy-event', 'legacy-twin', 'lecture', 'legacy-place', ?, 'calendar', '{"course":"Math"}')`,
      ).bind(timestamp).run();
      await database.binding.exec(twin!);
      expect(await database.binding.prepare('SELECT enabled, simulation_enabled, privacy_mode FROM twin_profiles').first()).toEqual({
        enabled: 1, simulation_enabled: 0, privacy_mode: 'friends',
      });
      expect(await database.binding.prepare('SELECT event_type, source, schedule_json FROM twin_events').first()).toEqual({
        event_type: 'custom', source: 'timetable', schedule_json: '{"course":"Math"}',
      });
    } finally {
      database.close();
    }
  });
});

describe('M7 twin plan API', () => {
  let database: TestDatabase;
  let env: WorkerBindings;

  beforeEach(async () => {
    const migrations = await Promise.all(migrationPaths.map((path) => readFile(path, 'utf8')));
    database = createTestDatabase(migrations.join('\n'));
    env = bindings(database.binding);
  });

  afterEach(() => database.close());

  it('requires explicit opt-in and stores only a deterministic movement plan', async () => {
    const event = await request(env, '/api/twin/events', {
      method: 'POST', body: JSON.stringify({
        type: 'class',
        originPlaceId: 'tongji-siping-way-1465759871',
        destinationPlaceId: 'tongji-siping-way-183383474',
        startAt: '2099-07-17T08:00:00.000Z',
        endAt: '2099-07-17T09:40:00.000Z',
        source: 'timetable',
        schedule: { courseName: '高等数学', roomName: '教学北楼', weeks: [1, 2, 3] },
      }),
    });
    expect(event.status).toBe(201);
    const eventId = (await data<{ id: string }>(event)).id;
    const denied = await request(env, '/api/twin/plans', {
      method: 'POST', body: JSON.stringify({ eventId, movementType: 'walk' }),
    });
    expect(denied.status).toBe(403);

    expect((await request(env, '/api/twin/profile', {
      method: 'PATCH', body: JSON.stringify({ enabled: false, simulationEnabled: true }),
    })).status).toBe(400);
    const profile = await request(env, '/api/twin/profile', {
      method: 'PATCH', body: JSON.stringify({ enabled: true, simulationEnabled: true, privacyMode: 'private' }),
    });
    expect(await data(profile)).toMatchObject({ enabled: true, simulationEnabled: true });

    const created = await request(env, '/api/twin/plans', {
      method: 'POST', body: JSON.stringify({ eventId, movementType: 'walk' }),
    });
    expect(created.status).toBe(201);
    const plan = await data<{ id: string; pathNodeIds: string[]; startedAt: number; expectedArrivalAt: number; status: string }>(created);
    expect(plan.pathNodeIds.length).toBeGreaterThan(1);
    expect(plan.expectedArrivalAt).toBeGreaterThan(plan.startedAt);
    expect(plan.status).toBe('active');
    const duplicate = await data<{ id: string }>(await request(env, '/api/twin/plans', {
      method: 'POST', body: JSON.stringify({ eventId, movementType: 'walk' }),
    }));
    expect(duplicate.id).toBe(plan.id);
    expect(await data<unknown[]>(await request(env, '/api/twin/plans'))).toHaveLength(1);

    await database.binding.prepare('UPDATE twin_movement_plans SET started_at = 0, expected_arrival_at = 1 WHERE id = ?')
      .bind(plan.id).run();
    const arrived = await data<Array<{ status: string }>>(await request(env, '/api/twin/plans'));
    expect(arrived[0]?.status).toBe('arrived');

    const columns = await database.binding.prepare("PRAGMA table_info('twin_movement_plans')").all<{ name: string }>();
    expect(columns.results.map(({ name }) => name)).not.toEqual(expect.arrayContaining(['longitude', 'latitude', 'coordinates_json']));
    const cancelled = await data<{ status: string }>(await request(env, `/api/twin/plans/${plan.id}`, { method: 'DELETE' }));
    expect(cancelled.status).toBe('cancelled');
  });
});
