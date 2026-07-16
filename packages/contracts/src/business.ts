import { z } from 'zod';

export const roomVisibilitySchema = z.enum(['private', 'unlisted', 'public']);
export const roomMemberRoleSchema = z.enum(['owner', 'member', 'moderator']);
export const pinTypeSchema = z.enum(['note', 'event', 'hazard', 'meetup']);
export const pinStatusSchema = z.enum(['active', 'resolved', 'archived']);
export const pinVisibilitySchema = z.enum(['private', 'room', 'public']);
export const twinPrivacyModeSchema = z.enum(['private', 'room', 'public']);

const nullableIdSchema = z.string().trim().min(1).max(128).nullable();
const optionalExpirySchema = z.iso.datetime().nullable().optional().refine(
  (value) => !value || value > new Date().toISOString(),
  { message: 'Expiry must be in the future' },
);
const locationMetadataKeys = new Set(['accuracy', 'coordinates', 'gps', 'heading', 'latitude', 'location', 'longitude', 'speed', 'trajectory']);

function containsLocationMetadata(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsLocationMetadata);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => locationMetadataKeys.has(key.toLowerCase()) || containsLocationMetadata(nested));
}

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(100),
  visibility: roomVisibilitySchema,
  expiresAt: optionalExpirySchema,
}).strict();

export const createPinSchema = z.object({
  roomId: nullableIdSchema.optional(),
  type: pinTypeSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180),
  latitude: z.number().finite().min(-90).max(90),
  status: pinStatusSchema.default('active'),
  visibility: pinVisibilitySchema.default('private'),
  expiresAt: optionalExpirySchema,
}).strict().refine((value) => value.visibility !== 'room' || Boolean(value.roomId), {
  message: 'roomId is required for room-visible pins',
  path: ['roomId'],
});

export const updatePinSchema = z.object({
  expectedVersion: z.number().int().positive(),
  type: pinTypeSchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  status: pinStatusSchema.optional(),
  visibility: pinVisibilitySchema.optional(),
  expiresAt: optionalExpirySchema,
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'expectedVersion'), {
  message: 'At least one pin field must be updated',
});

export const createPinCommentSchema = z.object({
  content: z.string().trim().min(1).max(1_000),
}).strict();

export const updateTwinProfileSchema = z.object({
  enabled: z.boolean().optional(),
  homePlaceId: nullableIdSchema.optional(),
  avatarId: nullableIdSchema.optional(),
  privacyMode: twinPrivacyModeSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one profile field must be updated',
});

export const createTwinEventSchema = z.object({
  eventType: z.string().trim().min(1).max(64),
  destinationPlaceId: z.string().trim().min(1).max(128).nullable().optional(),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime().nullable().optional(),
  source: z.enum(['manual', 'calendar', 'navigation']),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict()
  .refine((value) => !value.endAt || value.endAt >= value.startAt, {
    message: 'endAt must not be earlier than startAt',
    path: ['endAt'],
  })
  .refine((value) => !/gps|location|trajectory/i.test(value.eventType), {
    message: 'Twin events must not represent GPS trajectory samples',
    path: ['eventType'],
  })
  .refine((value) => !containsLocationMetadata(value.metadata), {
    message: 'Twin event metadata must not contain GPS location fields',
    path: ['metadata'],
  });

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type CreatePinInput = z.infer<typeof createPinSchema>;
export type UpdatePinInput = z.infer<typeof updatePinSchema>;
export type CreatePinCommentInput = z.infer<typeof createPinCommentSchema>;
export type UpdateTwinProfileInput = z.infer<typeof updateTwinProfileSchema>;
export type CreateTwinEventInput = z.infer<typeof createTwinEventSchema>;
export type RoomVisibility = z.infer<typeof roomVisibilitySchema>;
export type RoomMemberRole = z.infer<typeof roomMemberRoleSchema>;
export type PinType = z.infer<typeof pinTypeSchema>;
export type PinStatus = z.infer<typeof pinStatusSchema>;
export type PinVisibility = z.infer<typeof pinVisibilitySchema>;
export type TwinPrivacyMode = z.infer<typeof twinPrivacyModeSchema>;
