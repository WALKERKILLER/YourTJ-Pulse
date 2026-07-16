export type ObservationEvent =
  | 'api.request'
  | 'flutter.error'
  | 'flutter.jank'
  | 'pmtiles.request'
  | 'realtime.connection'
  | 'realtime.message'
  | 'realtime.reconnect'
  | 'web.crash'
  | 'web.long-task'
  | 'web.unhandled-rejection'
  | 'worker.error';

export type ObservationResult = 'ok' | 'rejected' | 'error';
export type AccuracyBucket = 'unknown' | '0-10m' | '11-50m' | '51-100m' | 'over-100m';

export interface Observation {
  event: ObservationEvent;
  result: ObservationResult;
  durationMs?: number;
  status?: number;
  route?: string;
  roomId?: string;
  userHash?: string;
  messageType?: string;
  accuracyBucket?: AccuracyBucket;
  memberCount?: number;
}

export interface ObservationRecord extends Observation {
  schemaVersion: 1;
  timestamp: string;
}

export type ObservationSink = (record: ObservationRecord) => void;

export function bucketAccuracy(accuracy: number | undefined): AccuracyBucket {
  if (accuracy === undefined || !Number.isFinite(accuracy) || accuracy < 0) return 'unknown';
  if (accuracy <= 10) return '0-10m';
  if (accuracy <= 50) return '11-50m';
  if (accuracy <= 100) return '51-100m';
  return 'over-100m';
}

export async function hashIdentifier(identifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identifier));
  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function observe(observation: Observation, sink: ObservationSink = defaultSink): void {
  sink({
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    ...observation,
    ...(observation.durationMs === undefined
      ? {}
      : { durationMs: Math.max(0, Math.round(observation.durationMs)) }),
  });
}

function defaultSink(record: ObservationRecord): void {
  console.info(JSON.stringify(record));
}
