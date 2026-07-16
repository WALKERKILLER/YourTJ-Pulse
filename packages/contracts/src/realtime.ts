import { z } from 'zod';

import { API_LIMITS } from './limits';

export const locationKindSchema = z.enum([
  'gps',
  'twin_simulated',
  'twin_prediction',
  'npc',
]);

export const locationUpdateSchema = z
  .object({
    type: z.literal('location.update'),
    requestId: z.string().min(1).max(100),
    sentAt: z.number().int().nonnegative(),
    payload: z
      .object({
        seq: z.number().int().nonnegative(),
        longitude: z.number().finite().min(-180).max(180),
        latitude: z.number().finite().min(-90).max(90),
        accuracy: z.number().finite().nonnegative().max(100_000),
        heading: z.number().finite().min(0).max(360).optional(),
        speed: z.number().finite().nonnegative().max(200).optional(),
        kind: locationKindSchema.default('gps'),
      })
      .strict(),
  })
  .strict();

export const roomCapacitySchema = z.number().int().min(1).max(API_LIMITS.roomMembers);

export function isWebSocketMessageWithinLimit(message: string | ArrayBuffer) {
  const size =
    typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength;
  return size <= API_LIMITS.webSocketMessageBytes;
}

export type LocationKind = z.infer<typeof locationKindSchema>;
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;
