import { z } from 'zod';

import { createPinSchema, pinStatusSchema, pinTypeSchema, pinVisibilitySchema, updatePinSchema } from './business';
import { API_LIMITS } from './limits';

export const locationKindSchema = z.enum([
  'gps',
  'twin_simulated',
  'twin_prediction',
  'npc',
]);

export const presenceStatusSchema = z.enum(['available', 'busy', 'away']);
export const memberConnectionStatusSchema = z.enum(['live', 'delayed', 'stale', 'offline']);

export const realtimeLocationSchema = z.object({
  seq: z.number().int().nonnegative(),
  longitude: z.number().finite().min(-180).max(180),
  latitude: z.number().finite().min(-90).max(90),
  accuracy: z.number().finite().nonnegative().max(100_000),
  altitude: z.number().finite().optional(),
  heading: z.number().finite().min(0).max(360).optional(),
  speed: z.number().finite().nonnegative().max(200).optional(),
  kind: locationKindSchema.default('gps'),
}).strict();

const clientEnvelopeSchema = z.object({
  requestId: z.string().min(1).max(100),
  sentAt: z.number().int().nonnegative(),
});

export const joinRoomMessageSchema = clientEnvelopeSchema.extend({
  type: z.literal('room.join'),
  payload: z.object({
    lastSequence: z.number().int().nonnegative().optional(),
    presence: presenceStatusSchema.default('available'),
  }).strict(),
}).strict();

export const locationUpdateSchema = clientEnvelopeSchema.extend({
  type: z.literal('location.update'),
  payload: realtimeLocationSchema,
}).strict();

export const presenceUpdateMessageSchema = clientEnvelopeSchema.extend({
  type: z.literal('presence.update'),
  payload: z.object({
    status: presenceStatusSchema,
    sharingLocation: z.boolean(),
  }).strict(),
}).strict();

export const pinCreateMessageSchema = clientEnvelopeSchema.extend({
  type: z.literal('pin.create'),
  payload: z.object({ pin: createPinSchema }).strict(),
}).strict();

export const pinUpdateMessageSchema = clientEnvelopeSchema.extend({
  type: z.literal('pin.update'),
  payload: z.object({
    pinId: z.string().min(1).max(128),
    update: updatePinSchema,
  }).strict(),
}).strict();

export const pinDeleteMessageSchema = clientEnvelopeSchema.extend({
  type: z.literal('pin.delete'),
  payload: z.object({
    pinId: z.string().min(1).max(128),
    expectedVersion: z.number().int().positive(),
  }).strict(),
}).strict();

export const pingMessageSchema = clientEnvelopeSchema.extend({
  type: z.literal('ping'),
  payload: z.object({ lastSequence: z.number().int().nonnegative().optional() }).strict(),
}).strict();

export const clientMessageSchema = z.discriminatedUnion('type', [
  joinRoomMessageSchema,
  locationUpdateSchema,
  presenceUpdateMessageSchema,
  pinCreateMessageSchema,
  pinUpdateMessageSchema,
  pinDeleteMessageSchema,
  pingMessageSchema,
]);

export const realtimeMemberSchema = z.object({
  userId: z.string().min(1).max(128),
  displayName: z.string().min(1).max(100),
  avatarUrl: z.url().optional(),
  presence: presenceStatusSchema,
  sharingLocation: z.boolean(),
  connectionStatus: memberConnectionStatusSchema,
  joinedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  location: realtimeLocationSchema.optional(),
}).strict();

export const realtimePinSchema = z.object({
  id: z.string().min(1).max(128),
  roomId: z.string().min(1).max(128).nullable(),
  creatorId: z.string().min(1).max(128),
  type: pinTypeSchema,
  title: z.string().min(1).max(120),
  description: z.string().max(2_000).nullable(),
  longitude: z.number().finite().min(-180).max(180),
  latitude: z.number().finite().min(-90).max(90),
  status: pinStatusSchema,
  visibility: pinVisibilitySchema,
  version: z.number().int().positive(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

const serverEnvelopeSchema = z.object({
  eventId: z.string().min(1).max(100),
  sequence: z.number().int().nonnegative(),
  sentAt: z.number().int().nonnegative(),
  requestId: z.string().min(1).max(100).optional(),
});

export const roomSnapshotMessageSchema = serverEnvelopeSchema.extend({
  type: z.literal('room.snapshot'),
  payload: z.object({
    roomId: z.string().min(1).max(128),
    members: z.array(realtimeMemberSchema).max(API_LIMITS.roomMembers),
  }).strict(),
}).strict();

export const memberJoinedMessageSchema = serverEnvelopeSchema.extend({
  type: z.literal('member.joined'),
  payload: z.object({ member: realtimeMemberSchema }).strict(),
}).strict();

export const memberLeftMessageSchema = serverEnvelopeSchema.extend({
  type: z.literal('member.left'),
  payload: z.object({ userId: z.string().min(1).max(128), leftAt: z.number().int().nonnegative() }).strict(),
}).strict();

export const memberLocationMessageSchema = serverEnvelopeSchema.extend({
  type: z.literal('member.location'),
  payload: z.object({
    userId: z.string().min(1).max(128),
    location: realtimeLocationSchema,
    receivedAt: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const memberPresenceMessageSchema = serverEnvelopeSchema.extend({
  type: z.literal('member.presence'),
  payload: z.object({
    userId: z.string().min(1).max(128),
    presence: presenceStatusSchema,
    sharingLocation: z.boolean(),
    updatedAt: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const pinCreatedMessageSchema = serverEnvelopeSchema.extend({
  type: z.literal('pin.created'),
  payload: z.object({ pin: realtimePinSchema }).strict(),
}).strict();

export const pinUpdatedMessageSchema = serverEnvelopeSchema.extend({
  type: z.literal('pin.updated'),
  payload: z.object({ pin: realtimePinSchema }).strict(),
}).strict();

export const pinDeletedMessageSchema = serverEnvelopeSchema.extend({
  type: z.literal('pin.deleted'),
  payload: z.object({
    pinId: z.string().min(1).max(128),
    version: z.number().int().positive(),
    deletedAt: z.iso.datetime(),
  }).strict(),
}).strict();

export const roomErrorMessageSchema = serverEnvelopeSchema.extend({
  type: z.literal('room.error'),
  payload: z.object({
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(500),
    retryable: z.boolean(),
  }).strict(),
}).strict();

export const roomAckMessageSchema = serverEnvelopeSchema.extend({
  type: z.literal('room.ack'),
  requestId: z.string().min(1).max(100),
  payload: z.object({
    acceptedType: z.enum(['room.join', 'location.update', 'presence.update', 'pin.create', 'pin.update', 'pin.delete', 'ping']),
    status: z.enum(['accepted', 'duplicate', 'ignored']),
  }).strict(),
}).strict();

export const serverMessageSchema = z.discriminatedUnion('type', [
  roomSnapshotMessageSchema,
  memberJoinedMessageSchema,
  memberLeftMessageSchema,
  memberLocationMessageSchema,
  memberPresenceMessageSchema,
  pinCreatedMessageSchema,
  pinUpdatedMessageSchema,
  pinDeletedMessageSchema,
  roomErrorMessageSchema,
  roomAckMessageSchema,
]);

export const roomCapacitySchema = z.number().int().min(1).max(API_LIMITS.roomMembers);

export function isWebSocketMessageWithinLimit(message: string | ArrayBuffer) {
  const size =
    typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength;
  return size <= API_LIMITS.webSocketMessageBytes;
}

export type LocationKind = z.infer<typeof locationKindSchema>;
export type RealtimeLocation = z.infer<typeof realtimeLocationSchema>;
export type PresenceStatus = z.infer<typeof presenceStatusSchema>;
export type MemberConnectionStatus = z.infer<typeof memberConnectionStatusSchema>;
export type JoinRoomMessage = z.infer<typeof joinRoomMessageSchema>;
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;
export type PresenceUpdateMessage = z.infer<typeof presenceUpdateMessageSchema>;
export type PinCreateMessage = z.infer<typeof pinCreateMessageSchema>;
export type PinUpdateMessage = z.infer<typeof pinUpdateMessageSchema>;
export type PinDeleteMessage = z.infer<typeof pinDeleteMessageSchema>;
export type PingMessage = z.infer<typeof pingMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type RealtimeMember = z.infer<typeof realtimeMemberSchema>;
export type RealtimePin = z.infer<typeof realtimePinSchema>;
export type RoomSnapshotMessage = z.infer<typeof roomSnapshotMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
