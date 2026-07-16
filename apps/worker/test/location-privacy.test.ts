import { describe, expect, it } from 'vitest';

import { applyLocationPrivacy } from '../src/realtime/location-privacy';

const location = {
  seq: 1,
  longitude: 121.501_234,
  latitude: 31.282_345,
  accuracy: 6,
  altitude: 12,
  heading: 45,
  speed: 1.4,
  kind: 'gps' as const,
};

describe('location privacy', () => {
  it('keeps precise samples only when explicitly selected', () => {
    expect(applyLocationPrivacy(location, 'precise', 'room:user')).toBe(location);
  });

  it('hides samples without returning coordinates', () => {
    expect(applyLocationPrivacy(location, 'hidden', 'room:user')).toBeUndefined();
  });

  it('uses a stable approximate grid and strips motion details', () => {
    const first = applyLocationPrivacy(location, 'approximate', 'room:user');
    const second = applyLocationPrivacy(location, 'approximate', 'room:user');
    expect(first).toEqual(second);
    expect(first?.longitude).not.toBe(location.longitude);
    expect(first?.latitude).not.toBe(location.latitude);
    expect(first?.accuracy).toBe(80);
    expect(first).not.toHaveProperty('altitude');
    expect(first).not.toHaveProperty('heading');
    expect(first).not.toHaveProperty('speed');
  });
});
