import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateFeatureCollection } from '../src/validate.mjs';

describe('validateFeatureCollection', () => {
  it('accepts valid WGS84 GeoJSON', () => {
    const result = validateFeatureCollection({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'node/1',
          geometry: { type: 'Point', coordinates: [121.5, 31.28] },
          properties: {},
        },
      ],
    });
    assert.deepEqual(result, { featureCount: 1, identifiedFeatureCount: 1 });
  });

  it('rejects invalid coordinates', () => {
    assert.throws(
      () =>
        validateFeatureCollection({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [200, 31.28] },
              properties: {},
            },
          ],
        }),
      /invalid WGS84 position/,
    );
  });
});
