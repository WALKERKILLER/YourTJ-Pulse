import { describe, expect, it } from 'vitest';

import {
  API_LIMITS,
  createTwinEventSchema,
  isWebSocketMessageWithinLimit,
  locationUpdateSchema,
  submitFeatureSchema,
} from '../src';

const pointFeature = {
  type: 'Feature' as const,
  id: 'node/1',
  geometry: { type: 'Point' as const, coordinates: [121.5, 31.28] },
  properties: { name: '测试地点' },
};

describe('submitFeatureSchema', () => {
  it('accepts a bounded GeoJSON submission', () => {
    expect(submitFeatureSchema.parse({ features: [pointFeature] }).features).toHaveLength(1);
  });

  it('rejects invalid coordinates', () => {
    const result = submitFeatureSchema.safeParse({
      features: [
        {
          ...pointFeature,
          geometry: { type: 'Point', coordinates: [181, 31.28] },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects positions with unsupported extra dimensions', () => {
    expect(
      submitFeatureSchema.safeParse({
        features: [
          {
            ...pointFeature,
            geometry: { type: 'Point', coordinates: [121.5, 31.28, 5, 10] },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects empty and oversized feature batches', () => {
    expect(submitFeatureSchema.safeParse({ features: [] }).success).toBe(false);
    expect(
      submitFeatureSchema.safeParse({
        features: Array.from({ length: API_LIMITS.featuresPerSubmission + 1 }, () => pointFeature),
      }).success,
    ).toBe(false);
  });

  it('limits image count and declared upload size', () => {
    expect(
      submitFeatureSchema.safeParse({
        features: [pointFeature],
        images: [
          {
            url: 'https://example.test/image.png',
            contentType: 'image/png',
            sizeBytes: API_LIMITS.imageBytes + 1,
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('createTwinEventSchema', () => {
  it('accepts destination events without retaining GPS samples', () => {
    expect(createTwinEventSchema.safeParse({
      eventType: 'class', destinationPlaceId: 'place-1', startAt: '2026-07-17T08:00:00.000Z', source: 'manual', metadata: { course: '高等数学' },
    }).success).toBe(true);
    expect(createTwinEventSchema.safeParse({
      eventType: 'location', startAt: '2026-07-17T08:00:00.000Z', source: 'manual', metadata: { latitude: 31.28 },
    }).success).toBe(false);
    expect(createTwinEventSchema.safeParse({
      eventType: 'class', startAt: '2026-07-17T08:00:00.000Z', source: 'manual', metadata: { nested: { coordinates: [121.5, 31.28] } },
    }).success).toBe(false);
  });
});

describe('locationUpdateSchema', () => {
  it('separates real and simulated location kinds', () => {
    const message = locationUpdateSchema.parse({
      type: 'location.update',
      requestId: 'request-1',
      sentAt: 1,
      payload: {
        seq: 1,
        longitude: 121.5,
        latitude: 31.28,
        accuracy: 10,
        kind: 'twin_simulated',
      },
    });
    expect(message.payload.kind).toBe('twin_simulated');
  });

  it('enforces the transport message size limit before parsing', () => {
    expect(isWebSocketMessageWithinLimit('x'.repeat(API_LIMITS.webSocketMessageBytes))).toBe(true);
    expect(isWebSocketMessageWithinLimit('x'.repeat(API_LIMITS.webSocketMessageBytes + 1))).toBe(
      false,
    );
  });
});
