import { API_LIMITS } from '@yourtj/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src';
import type { WorkerBindings } from '../src/types';

const adminCredential = 'admin-test-credential-0000000000000001';
const userCredential = 'user-test-credential-00000000000000001';

class MemoryBucket {
  readonly values = new Map<string, string>();

  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    const bytes = new TextEncoder().encode(value);
    const range = options?.range;
    const responseBytes =
      range === undefined ? bytes : bytes.slice(range.offset, range.offset + range.length);
    return {
      body: new Blob([responseBytes]).stream(),
      size: bytes.byteLength,
      httpEtag: '"test-etag"',
      writeHttpMetadata(headers: Headers) {
        headers.set('content-type', 'application/json; charset=utf-8');
      },
      async json<T>() {
        return JSON.parse(value) as T;
      },
    };
  }

  async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream) {
    if (typeof value !== 'string') throw new Error('MemoryBucket only supports string test values');
    this.values.set(key, value);
    return {};
  }

  json<T>(key: string) {
    const value = this.values.get(key);
    if (value === undefined) throw new Error(`Missing test object ${key}`);
    return JSON.parse(value) as T;
  }
}

function testBindings(bucket: MemoryBucket): WorkerBindings {
  return {
    TILES: bucket as unknown as R2Bucket,
    ASSETS: {
      fetch: () => Promise.resolve(new Response('asset')),
      connect: () => {
        throw new Error('connect is not implemented in tests');
      },
    },
    AUTH_TOKENS_JSON: JSON.stringify([
      {
        token: adminCredential,
        user: { id: 'admin-1', displayName: 'Admin', roles: ['admin'] },
      },
      {
        token: userCredential,
        user: { id: 'user-1', displayName: 'User', roles: ['user'] },
      },
    ]),
    CORS_ORIGINS: 'https://allowed.example',
  };
}

const feature = {
  type: 'Feature',
  id: 'node/1',
  geometry: { type: 'Point', coordinates: [121.5, 31.28] },
  properties: { name: '测试地点' },
};

describe('worker application', () => {
  let bucket: MemoryBucket;
  let bindings: WorkerBindings;

  beforeEach(() => {
    bucket = new MemoryBucket();
    bindings = testBindings(bucket);
  });

  it('validates and stores submissions', async () => {
    const response = await createApp().request(
      '/api/submit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: [feature] }),
      },
      bindings,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{ id: string; count: number }>();
    expect(body.count).toBe(1);
    expect(bucket.values.has(`submissions/${body.id}.json`)).toBe(true);
  });

  it('rejects invalid coordinates before writing', async () => {
    const response = await createApp().request(
      '/api/submit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          features: [{ ...feature, geometry: { type: 'Point', coordinates: [181, 31.28] } }],
        }),
      },
      bindings,
    );
    expect(response.status).toBe(400);
    expect(bucket.values.size).toBe(0);
  });

  it('rejects oversized bodies before parsing', async () => {
    const response = await createApp().request(
      '/api/submit',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(API_LIMITS.requestBytes + 1),
        },
        body: '{}',
      },
      bindings,
    );
    expect(response.status).toBe(413);
  });

  it('returns 401 without authentication and 403 for a regular user', async () => {
    const unauthenticated = await createApp().request('/api/admin/submissions', {}, bindings);
    expect(unauthenticated.status).toBe(401);

    const forbidden = await createApp().request(
      '/api/admin/submissions',
      { headers: { authorization: `Bearer ${userCredential}` } },
      bindings,
    );
    expect(forbidden.status).toBe(403);
  });

  it('does not authenticate URL or Cookie tokens', async () => {
    const queryResponse = await createApp().request(
      `/api/admin/submissions?token=${adminCredential}`,
      {},
      bindings,
    );
    expect(queryResponse.status).toBe(401);

    const cookieResponse = await createApp().request(
      '/api/admin/submissions',
      { headers: { cookie: `admin_token=${adminCredential}` } },
      bindings,
    );
    expect(cookieResponse.status).toBe(401);
  });

  it('allows moderators or administrators to list the review queue', async () => {
    const response = await createApp().request(
      '/api/admin/submissions',
      { headers: { authorization: `Bearer ${adminCredential}` } },
      bindings,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
  });

  it('returns the authenticated session without exposing credentials', async () => {
    const response = await createApp().request(
      '/api/me',
      { headers: { authorization: `Bearer ${adminCredential}` } },
      bindings,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { id: 'admin-1', displayName: 'Admin', roles: ['admin'] },
    });
  });

  it('preserves legacy review API success response shapes', async () => {
    const listResponse = await createApp().request(
      '/api/submissions',
      { headers: { authorization: `Bearer ${adminCredential}` } },
      bindings,
    );
    expect(await listResponse.json()).toEqual([]);

    const createResponse = await createApp().request(
      '/api/submit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: [feature] }),
      },
      bindings,
    );
    const created = await createResponse.json<{ id: string }>();
    const detailResponse = await createApp().request(
      `/api/submissions/${created.id}`,
      { headers: { authorization: `Bearer ${adminCredential}` } },
      bindings,
    );
    expect((await detailResponse.json<{ id: string }>()).id).toBe(created.id);

    const reviewResponse = await createApp().request(
      `/api/submissions/${created.id}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminCredential}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'reject' }),
      },
      bindings,
    );
    expect(await reviewResponse.json()).toEqual({ ok: true, action: 'rejected' });
  });

  it('records the reviewer when an administrator applies a submission', async () => {
    const createResponse = await createApp().request(
      '/api/submit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: [feature] }),
      },
      bindings,
    );
    const created = await createResponse.json<{ id: string }>();

    const reviewResponse = await createApp().request(
      `/api/admin/submissions/${created.id}/apply`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminCredential}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message: '结构与属性正确' }),
      },
      bindings,
    );

    expect(reviewResponse.status).toBe(200);
    const stored = bucket.json<{
      status: string;
      reviewerId: string;
      reviewMessage: string;
    }>(`submissions/${created.id}.json`);
    expect(stored).toMatchObject({
      status: 'applied',
      reviewerId: 'admin-1',
      reviewMessage: '结构与属性正确',
    });
    expect(bucket.json<{ features: unknown[] }>('data/custom.geojson').features).toHaveLength(1);
  });

  it('validates and applies reviewer-modified features while retaining the original', async () => {
    const createResponse = await createApp().request(
      '/api/submit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: [feature] }),
      },
      bindings,
    );
    const created = await createResponse.json<{ id: string }>();
    const reviewedFeature = { ...feature, properties: { name: '审核后名称', wheelchair: 'yes' } };

    const applyResponse = await createApp().request(
      `/api/admin/submissions/${created.id}/apply`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminCredential}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ features: [reviewedFeature] }),
      },
      bindings,
    );

    expect(applyResponse.status).toBe(200);
    expect(bucket.json<{ features: typeof feature[] }>('data/custom.geojson').features[0]?.properties.name).toBe('审核后名称');
    const stored = bucket.json<{ features: typeof feature[]; reviewedFeatures: typeof feature[] }>(`submissions/${created.id}.json`);
    expect(stored.features[0]?.properties.name).toBe('测试地点');
    expect(stored.reviewedFeatures[0]?.properties.name).toBe('审核后名称');
  });

  it('serves existing map data and PMTiles objects', async () => {
    bucket.values.set('data/custom.geojson', JSON.stringify({ type: 'FeatureCollection', features: [] }));
    bucket.values.set('tongji.pmtiles', 'pmtiles-test-body');

    const places = await createApp().request('/api/custom-data', {}, bindings);
    expect(places.status).toBe(200);
    expect(await places.json()).toEqual({ type: 'FeatureCollection', features: [] });

    const tiles = await createApp().request('/tiles/tongji.pmtiles', {}, bindings);
    expect(tiles.status).toBe(200);
    expect(await tiles.text()).toBe('pmtiles-test-body');
  });

  it('rejects unconfigured cross-origin requests', async () => {
    const response = await createApp().request(
      '/api/custom-data',
      { headers: { origin: 'https://denied.example' } },
      bindings,
    );
    expect(response.status).toBe(403);
  });

  it('echoes only explicitly allowed cross-origin origins', async () => {
    bucket.values.set('data/custom.geojson', JSON.stringify({ type: 'FeatureCollection', features: [] }));
    const response = await createApp().request(
      '/api/custom-data',
      { headers: { origin: 'https://allowed.example' } },
      bindings,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
  });
});
