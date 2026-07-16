import { describe, expect, it, vi } from 'vitest';

import { bucketAccuracy, hashIdentifier, observe, type ObservationRecord } from '../src/observability';

describe('privacy-safe observability', () => {
  it('buckets accuracy without recording a location sample', () => {
    expect(bucketAccuracy(undefined)).toBe('unknown');
    expect(bucketAccuracy(8)).toBe('0-10m');
    expect(bucketAccuracy(40)).toBe('11-50m');
    expect(bucketAccuracy(80)).toBe('51-100m');
    expect(bucketAccuracy(101)).toBe('over-100m');
  });

  it('uses stable truncated hashes instead of raw user identifiers', async () => {
    const first = await hashIdentifier('user-sensitive-id');
    expect(first).toBe(await hashIdentifier('user-sensitive-id'));
    expect(first).toHaveLength(24);
    expect(first).not.toContain('user-sensitive-id');
  });

  it('emits only the allowlisted operational record', () => {
    const records: ObservationRecord[] = [];
    const sink = vi.fn((record: ObservationRecord) => records.push(record));
    observe({
      event: 'realtime.message',
      result: 'ok',
      roomId: 'room-1',
      userHash: 'hashed-user',
      messageType: 'location.update',
      accuracyBucket: '11-50m',
      durationMs: 12.6,
      memberCount: 2,
    }, sink);

    expect(sink).toHaveBeenCalledOnce();
    expect(records[0]?.durationMs).toBe(13);
    const encoded = JSON.stringify(records[0]);
    for (const forbidden of ['longitude', 'latitude', 'altitude', 'heading', 'speed', 'payload', 'userId']) {
      expect(encoded).not.toContain(forbidden);
    }
  });
});
