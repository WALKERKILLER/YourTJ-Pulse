import type { RealtimeLocation } from '@yourtj/contracts';

import type { DeviceLocation } from './use-device-location';

const EARTH_RADIUS_METERS = 6_371_000;

export interface SentLocation {
  location: DeviceLocation;
  sentAt: number;
}

export function distanceMeters(left: Pick<DeviceLocation, 'latitude' | 'longitude'>, right: Pick<DeviceLocation, 'latitude' | 'longitude'>): number {
  const toRadians = (degrees: number): number => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

export function locationIntervalMs(speed: number | undefined, background: boolean): number {
  if (background) return 30_000;
  if ((speed ?? 0) >= 3) return 2_500;
  if ((speed ?? 0) >= 0.5) return 4_000;
  return 15_000;
}

export function shouldSendLocation(previous: SentLocation | null, next: DeviceLocation, now: number, background: boolean): boolean {
  if (next.accuracy > 100) return false;
  if (!previous) return true;
  const elapsed = now - previous.sentAt;
  const interval = locationIntervalMs(next.speed, background);
  if (elapsed < interval) return false;
  if ((next.speed ?? 0) < 0.5) return true;
  const threshold = Math.max(3, Math.min(15, next.accuracy * 0.25));
  return distanceMeters(previous.location, next) >= threshold;
}

export function smoothLocation(previous: RealtimeLocation | undefined, next: RealtimeLocation): RealtimeLocation {
  if (!previous) return next;
  const weight = 0.65;
  return {
    ...next,
    longitude: previous.longitude + (next.longitude - previous.longitude) * weight,
    latitude: previous.latitude + (next.latitude - previous.latitude) * weight,
  };
}
