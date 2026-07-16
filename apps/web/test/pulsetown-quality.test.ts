import { describe, expect, it } from 'vitest';
import { resolvePulseQuality } from '../src/features/pulsetown/quality';

describe('PulseTown quality selection', () => {
  it('falls back without WebGL or with reduced motion', () => {
    expect(resolvePulseQuality({ webgl: false, webgl2: false, reducedMotion: false })).toBe('low');
    expect(resolvePulseQuality({ webgl: true, webgl2: true, reducedMotion: true })).toBe('low');
  });

  it('selects high only for capable WebGL2 devices', () => {
    expect(resolvePulseQuality({ webgl: true, webgl2: true, reducedMotion: false, deviceMemoryGb: 8, hardwareConcurrency: 8 })).toBe('high');
    expect(resolvePulseQuality({ webgl: true, webgl2: false, reducedMotion: false, deviceMemoryGb: 16, hardwareConcurrency: 16 })).toBe('medium');
    expect(resolvePulseQuality({ webgl: true, webgl2: true, reducedMotion: false, deviceMemoryGb: 4, hardwareConcurrency: 4 })).toBe('medium');
  });
});
