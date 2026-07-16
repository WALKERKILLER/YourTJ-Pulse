import type { LocationSharingLevel, RealtimeLocation } from '@yourtj/contracts';

const APPROXIMATE_GRID_METERS = 80;
const METERS_PER_LATITUDE_DEGREE = 111_320;

function stableFraction(value: string, salt: number): number {
  let hash = 2_166_136_261 ^ salt;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return 0.2 + (hash >>> 0) / 0xffff_ffff * 0.6;
}

export function applyLocationPrivacy(
  location: RealtimeLocation,
  level: LocationSharingLevel,
  stableIdentity: string,
): RealtimeLocation | undefined {
  if (level === 'hidden') return undefined;
  if (level === 'precise') return location;

  const latitudeStep = APPROXIMATE_GRID_METERS / METERS_PER_LATITUDE_DEGREE;
  const longitudeScale = Math.max(0.2, Math.cos(location.latitude * Math.PI / 180));
  const longitudeStep = APPROXIMATE_GRID_METERS / (METERS_PER_LATITUDE_DEGREE * longitudeScale);
  const latitudeOffset = stableFraction(stableIdentity, 17);
  const longitudeOffset = stableFraction(stableIdentity, 31);
  return {
    seq: location.seq,
    latitude: (Math.floor(location.latitude / latitudeStep) + latitudeOffset) * latitudeStep,
    longitude: (Math.floor(location.longitude / longitudeStep) + longitudeOffset) * longitudeStep,
    accuracy: Math.max(location.accuracy, APPROXIMATE_GRID_METERS),
    kind: 'gps',
  };
}
