import { z } from 'zod';

const nullableIdSchema = z.string().trim().min(1).max(128).nullable();

export const twinPrivacyModeSchema = z.enum(['private', 'friends', 'room']);
export const twinEventTypeSchema = z.enum(['class', 'meal', 'study', 'exercise', 'club', 'custom']);
export const twinEventSourceSchema = z.enum(['timetable', 'manual', 'system']);
export const twinMovementTypeSchema = z.enum(['walk', 'run', 'bike']);
export const twinPlanStatusSchema = z.enum(['active', 'arrived', 'cancelled']);
export const twinBehaviorStateSchema = z.enum([
  'idle',
  'preparing',
  'walking',
  'running',
  'cycling',
  'arrived',
  'in_class',
  'eating',
  'studying',
  'exercising',
  'returning_home',
  'sleeping',
]);

export const updateTwinProfileSchema = z.object({
  enabled: z.boolean().optional(),
  simulationEnabled: z.boolean().optional(),
  homePlaceId: nullableIdSchema.optional(),
  avatarId: nullableIdSchema.optional(),
  privacyMode: twinPrivacyModeSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one profile field must be updated',
});

export const twinProfileSchema = z.object({
  userId: z.string().min(1).max(128),
  enabled: z.boolean(),
  simulationEnabled: z.boolean(),
  homePlaceId: nullableIdSchema,
  avatarId: nullableIdSchema,
  privacyMode: twinPrivacyModeSchema,
  updatedAt: z.iso.datetime().nullable(),
}).strict();

export const twinScheduleDetailsSchema = z.object({
  courseName: z.string().trim().min(1).max(120).optional(),
  roomName: z.string().trim().min(1).max(120).optional(),
  weeks: z.array(z.number().int().min(1).max(30)).max(30).optional(),
  rescheduledFrom: z.iso.datetime().nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one timetable detail must be provided',
});

export const createTwinEventSchema = z.object({
  type: twinEventTypeSchema,
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime().nullable().optional(),
  originPlaceId: z.string().trim().min(1).max(128).nullable().optional(),
  destinationPlaceId: z.string().trim().min(1).max(128),
  source: twinEventSourceSchema,
  schedule: twinScheduleDetailsSchema.nullable().optional(),
}).strict()
  .refine((value) => !value.endAt || value.endAt >= value.startAt, {
    message: 'endAt must not be earlier than startAt',
    path: ['endAt'],
  })
  .refine((value) => value.source !== 'timetable' || Boolean(value.schedule), {
    message: 'Timetable events require schedule details',
    path: ['schedule'],
  });

export const twinEventSchema = z.object({
  id: z.string().min(1).max(128),
  type: twinEventTypeSchema,
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime().nullable(),
  originPlaceId: nullableIdSchema,
  destinationPlaceId: z.string().trim().min(1).max(128),
  source: twinEventSourceSchema,
  schedule: twinScheduleDetailsSchema.nullable(),
  createdAt: z.iso.datetime(),
}).strict();

export const generateTwinMovementPlanSchema = z.object({
  eventId: z.string().trim().min(1).max(128),
  movementType: twinMovementTypeSchema.default('walk'),
}).strict();

export const twinMovementPlanSchema = z.object({
  id: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
  eventId: z.string().min(1).max(128),
  originPlaceId: z.string().min(1).max(128),
  destinationPlaceId: z.string().min(1).max(128),
  pathNodeIds: z.array(z.string().min(1).max(128)).min(2).max(5_000),
  startedAt: z.number().int().nonnegative(),
  expectedArrivalAt: z.number().int().nonnegative(),
  speedMetersPerSecond: z.number().finite().positive().max(20),
  movementType: twinMovementTypeSchema,
  routeVersion: z.number().int().positive(),
  status: twinPlanStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict().refine((value) => value.expectedArrivalAt > value.startedAt, {
  message: 'expectedArrivalAt must be later than startedAt',
  path: ['expectedArrivalAt'],
});

export type UpdateTwinProfileInput = z.infer<typeof updateTwinProfileSchema>;
export type TwinProfile = z.infer<typeof twinProfileSchema>;
export type CreateTwinEventInput = z.infer<typeof createTwinEventSchema>;
export type TwinEvent = z.infer<typeof twinEventSchema>;
export type GenerateTwinMovementPlanInput = z.infer<typeof generateTwinMovementPlanSchema>;
export type TwinPrivacyMode = z.infer<typeof twinPrivacyModeSchema>;
export type TwinEventType = z.infer<typeof twinEventTypeSchema>;
export type TwinEventSource = z.infer<typeof twinEventSourceSchema>;
export type TwinMovementType = z.infer<typeof twinMovementTypeSchema>;
export type TwinPlanStatus = z.infer<typeof twinPlanStatusSchema>;
export type TwinBehaviorState = z.infer<typeof twinBehaviorStateSchema>;
export type TwinMovementPlan = z.infer<typeof twinMovementPlanSchema>;
