import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readPmtilesVectorTile } from '../src/services/pmtiles';

function tileCoordinate(longitude: number, latitude: number, zoom: number) {
  const scale = 2 ** zoom;
  const latitudeRadians = latitude * Math.PI / 180;
  return {
    x: Math.floor((longitude + 180) / 360 * scale),
    y: Math.floor((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale),
  };
}

describe('PMTiles R2 vector tile reader', () => {
  it('extracts an uncompressed campus MVT from ranged R2 reads', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../tongji.pmtiles'));
    const bucket = {
      async get(_key: string, options: { range: { offset: number; length: number } }) {
        const { offset, length } = options.range;
        const slice = bytes.subarray(offset, offset + length);
        return {
          body: {},
          httpEtag: 'test-etag',
          httpMetadata: { cacheControl: 'public, max-age=60' },
          arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength),
        };
      },
    } as unknown as R2Bucket;
    const { x, y } = tileCoordinate(121.5012, 31.2825, 14);

    const tile = await readPmtilesVectorTile(bucket, 'tongji.pmtiles', 14, x, y);

    expect(tile?.data.byteLength).toBeGreaterThan(0);
  });
});
