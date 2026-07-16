import { z } from 'zod';

export const clientTelemetryEventSchema = z.enum([
  'web.crash',
  'web.unhandled-rejection',
  'web.long-task',
  'flutter.error',
  'flutter.jank',
  'realtime.reconnect',
]);

export const clientTelemetrySchema = z.object({
  event: clientTelemetryEventSchema,
  result: z.enum(['error', 'recovered']),
  durationMs: z.number().finite().min(0).max(60_000).optional(),
}).strict();

export type ClientTelemetry = z.infer<typeof clientTelemetrySchema>;
