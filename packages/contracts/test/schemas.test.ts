import { describe, expect, it } from 'vitest';

import {
  API_LIMITS,
  clientMessageSchema,
  createTwinEventSchema,
  isWebSocketMessageWithinLimit,
  locationUpdateSchema,
  serverMessageSchema,
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

  it('defines every realtime client message as a strict discriminated union', () => {
    const messages = [
      { type: 'room.join', requestId: '1', sentAt: 1, payload: {} },
      { type: 'presence.update', requestId: '2', sentAt: 2, payload: { status: 'away', sharingLocation: false } },
      { type: 'pin.create', requestId: '3', sentAt: 3, payload: { pin: { type: 'meeting', title: '集合', longitude: 121.5, latitude: 31.28 } } },
      { type: 'pin.update', requestId: '4', sentAt: 4, payload: { pinId: 'pin-1', update: { expectedVersion: 1, title: '新集合点' } } },
      { type: 'pin.delete', requestId: '5', sentAt: 5, payload: { pinId: 'pin-1', expectedVersion: 2 } },
      { type: 'ping', requestId: '6', sentAt: 6, payload: {} },
    ];
    for (const message of messages) expect(clientMessageSchema.safeParse(message).success).toBe(true);
    expect(clientMessageSchema.safeParse({ ...messages[0], unexpected: true }).success).toBe(false);
  });

  it('validates snapshots and acknowledgements from the room server', () => {
    expect(serverMessageSchema.safeParse({
      type: 'room.snapshot', eventId: 'event-1', sequence: 1, sentAt: 10,
      payload: { roomId: 'room-1', members: [] },
    }).success).toBe(true);
    expect(serverMessageSchema.safeParse({
      type: 'room.ack', eventId: 'event-2', sequence: 2, sentAt: 11, requestId: 'request-1',
      payload: { acceptedType: 'room.join', status: 'accepted' },
    }).success).toBe(true);
  });

  it('enforces the transport message size limit before parsing', () => {
    expect(isWebSocketMessageWithinLimit('x'.repeat(API_LIMITS.webSocketMessageBytes))).toBe(true);
    expect(isWebSocketMessageWithinLimit('x'.repeat(API_LIMITS.webSocketMessageBytes + 1))).toBe(
      false,
    );
  });
});
