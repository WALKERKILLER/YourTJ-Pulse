import type {
  AuthenticatedUser,
  CreatePinCommentInput,
  CreatePinInput,
  CreateRoomInput,
  CreateTwinEventInput,
  PinStatus,
  PinVisibility,
  RoomMemberRole,
  RoomVisibility,
  TwinPrivacyMode,
  UpdatePinInput,
  UpdateTwinProfileInput,
  UserRole,
} from '@yourtj/contracts';

import { ApiError } from '../utils/responses';

const ROLE_PRIORITY: Record<UserRole, number> = { user: 0, mapper: 1, moderator: 2, admin: 3 };

interface RoomRow {
  id: string;
  owner_id: string;
  name: string;
  visibility: RoomVisibility;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  membership_role: RoomMemberRole | null;
}

interface PinRow {
  id: string;
  room_id: string | null;
  creator_id: string;
  type: CreatePinInput['type'];
  title: string;
  description: string | null;
  longitude: number;
  latitude: number;
  status: PinStatus;
  visibility: PinVisibility;
  version: number;
  expires_at: string | null;
  room_expires_at?: string | null;
  created_at: string;
  updated_at: string;
  membership_role?: RoomMemberRole | null;
}

interface CommentRow {
  id: string;
  pin_id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

interface TwinProfileRow {
  user_id: string;
  enabled: number;
  home_place_id: string | null;
  avatar_id: string | null;
  privacy_mode: TwinPrivacyMode;
  updated_at: string;
}

interface TwinEventRow {
  id: string;
  event_type: string;
  destination_place_id: string | null;
  start_at: string;
  end_at: string | null;
  source: CreateTwinEventInput['source'];
  metadata_json: string | null;
}

export interface RoomRecord {
  id: string;
  ownerId: string;
  name: string;
  visibility: RoomVisibility;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  membershipRole: RoomMemberRole | null;
}

export interface PinRecord {
  id: string;
  roomId: string | null;
  creatorId: string;
  type: CreatePinInput['type'];
  title: string;
  description: string | null;
  longitude: number;
  latitude: number;
  status: PinStatus;
  visibility: PinVisibility;
  version: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function now(): string {
  return new Date().toISOString();
}

function elevated(user: AuthenticatedUser): boolean {
  return user.roles.includes('moderator') || user.roles.includes('admin');
}

function primaryRole(user: AuthenticatedUser): UserRole {
  return [...user.roles].sort((left, right) => ROLE_PRIORITY[right] - ROLE_PRIORITY[left])[0] ?? 'user';
}

function roomFromRow(row: RoomRow): RoomRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    visibility: row.visibility,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    membershipRole: row.membership_role,
  };
}

function pinFromRow(row: PinRow): PinRecord {
  return {
    id: row.id,
    roomId: row.room_id,
    creatorId: row.creator_id,
    type: row.type,
    title: row.title,
    description: row.description,
    longitude: row.longitude,
    latitude: row.latitude,
    status: row.status,
    visibility: row.visibility,
    version: row.version,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function auditStatement(
  db: D1Database,
  actorId: string | null,
  action: string,
  targetType: string | null,
  targetId: string | null,
  metadata?: unknown,
): D1PreparedStatement {
  return db.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    crypto.randomUUID(),
    actorId,
    action,
    targetType,
    targetId,
    metadata === undefined ? null : JSON.stringify(metadata),
    now(),
  );
}

export async function writeAudit(
  db: D1Database,
  actorId: string | null,
  action: string,
  targetType: string | null,
  targetId: string | null,
  metadata?: unknown,
): Promise<void> {
  await auditStatement(db, actorId, action, targetType, targetId, metadata).run();
}

export async function claimSubmissionReview(
  db: D1Database,
  actorId: string,
  submissionId: string,
  action: 'apply' | 'reject',
): Promise<void> {
  try {
    await db.prepare(
      'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(`submission-review:${submissionId}`, actorId, `submission.${action}`, 'submission', submissionId, null, now()).run();
  } catch (error) {
    if (/UNIQUE|PRIMARY KEY/i.test(String(error))) {
      throw new ApiError(409, 'SUBMISSION_REVIEW_CLAIMED', 'Submission is already being reviewed or has been reviewed');
    }
    throw error;
  }
}

export async function releaseSubmissionReview(db: D1Database, submissionId: string): Promise<void> {
  await db.prepare('DELETE FROM audit_logs WHERE id = ?').bind(`submission-review:${submissionId}`).run();
}

export async function syncAuthenticatedUser(db: D1Database, user: AuthenticatedUser): Promise<void> {
  const timestamp = now();
  await db.prepare(
    `INSERT INTO users (id, display_name, avatar_url, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, avatar_url = excluded.avatar_url,
       role = excluded.role, updated_at = excluded.updated_at`,
  ).bind(user.id, user.displayName, user.avatarUrl ?? null, primaryRole(user), timestamp, timestamp).run();
}

async function roomRow(db: D1Database, roomId: string, userId: string): Promise<RoomRow | null> {
  return db.prepare(
    `SELECT r.*, rm.role AS membership_role
     FROM rooms r LEFT JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = ?
     WHERE r.id = ?`,
  ).bind(userId, roomId).first<RoomRow>();
}

export async function getRoom(db: D1Database, roomId: string, user: AuthenticatedUser): Promise<RoomRecord> {
  const row = await roomRow(db, roomId, user.id);
  if (!row) throw new ApiError(404, 'ROOM_NOT_FOUND', 'Room was not found');
  if (row.expires_at && row.expires_at <= now()) throw new ApiError(410, 'ROOM_EXPIRED', 'Room has expired');
  if (row.visibility === 'private' && !row.membership_role && !elevated(user)) {
    throw new ApiError(403, 'ROOM_ACCESS_DENIED', 'This room is private');
  }
  return roomFromRow(row);
}

export async function createRoom(db: D1Database, user: AuthenticatedUser, input: CreateRoomInput): Promise<RoomRecord> {
  const id = crypto.randomUUID();
  const timestamp = now();
  await db.batch([
    db.prepare('INSERT INTO rooms (id, owner_id, name, visibility, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, user.id, input.name, input.visibility, input.expiresAt ?? null, timestamp, timestamp),
    db.prepare('INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .bind(id, user.id, 'owner', timestamp),
    auditStatement(db, user.id, 'room.create', 'room', id, { visibility: input.visibility }),
  ]);
  return getRoom(db, id, user);
}

export async function joinRoom(db: D1Database, roomId: string, user: AuthenticatedUser): Promise<RoomRecord> {
  const row = await roomRow(db, roomId, user.id);
  if (!row) throw new ApiError(404, 'ROOM_NOT_FOUND', 'Room was not found');
  if (row.visibility === 'private' && !row.membership_role && !elevated(user)) {
    throw new ApiError(403, 'ROOM_JOIN_DENIED', 'A private room requires an invitation');
  }
  if (row.expires_at && row.expires_at <= now()) throw new ApiError(410, 'ROOM_EXPIRED', 'Room has expired');
  if (!row.membership_role) {
    try {
      await db.batch([
        db.prepare('INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
          .bind(roomId, user.id, 'member', now()),
        auditStatement(db, user.id, 'room.join', 'room', roomId),
      ]);
    } catch (error) {
      if (String(error).includes('ROOM_FULL')) throw new ApiError(409, 'ROOM_FULL', 'Room member limit has been reached');
      throw error;
    }
  }
  return getRoom(db, roomId, user);
}

export async function leaveRoom(db: D1Database, roomId: string, user: AuthenticatedUser): Promise<void> {
  const row = await roomRow(db, roomId, user.id);
  if (!row) throw new ApiError(404, 'ROOM_NOT_FOUND', 'Room was not found');
  if (row.owner_id === user.id) throw new ApiError(409, 'OWNER_CANNOT_LEAVE', 'The room owner must delete the room instead');
  if (!row.membership_role) throw new ApiError(404, 'ROOM_MEMBERSHIP_NOT_FOUND', 'Room membership was not found');
  await db.batch([
    db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').bind(roomId, user.id),
    auditStatement(db, user.id, 'room.leave', 'room', roomId),
  ]);
}

export async function deleteRoom(db: D1Database, roomId: string, user: AuthenticatedUser): Promise<void> {
  const row = await roomRow(db, roomId, user.id);
  if (!row) throw new ApiError(404, 'ROOM_NOT_FOUND', 'Room was not found');
  if (row.owner_id !== user.id && !elevated(user)) throw new ApiError(403, 'ROOM_DELETE_DENIED', 'Only the owner can delete this room');
  await db.batch([
    db.prepare('DELETE FROM rooms WHERE id = ?').bind(roomId),
    auditStatement(db, user.id, 'room.delete', 'room', roomId),
  ]);
}

async function pinRow(db: D1Database, pinId: string, userId: string): Promise<PinRow | null> {
  return db.prepare(
    `SELECT p.*, r.expires_at AS room_expires_at, rm.role AS membership_role
     FROM pins p
     LEFT JOIN rooms r ON r.id = p.room_id
     LEFT JOIN room_members rm ON rm.room_id = p.room_id AND rm.user_id = ?
     WHERE p.id = ?`,
  ).bind(userId, pinId).first<PinRow>();
}

function pinExpired(row: PinRow, timestamp: string): boolean {
  return Boolean(
    (row.expires_at && row.expires_at <= timestamp)
      || (row.room_expires_at && row.room_expires_at <= timestamp),
  );
}

function canReadPin(row: PinRow, user: AuthenticatedUser): boolean {
  return elevated(user) || row.creator_id === user.id || row.visibility === 'public'
    || (row.visibility === 'room' && Boolean(row.membership_role));
}

export async function getPin(db: D1Database, pinId: string, user: AuthenticatedUser): Promise<PinRecord> {
  const row = await pinRow(db, pinId, user.id);
  if (!row) throw new ApiError(404, 'PIN_NOT_FOUND', 'Pin was not found');
  if (pinExpired(row, now())) throw new ApiError(410, 'PIN_EXPIRED', 'Pin or its room has expired');
  if (!canReadPin(row, user)) throw new ApiError(403, 'PIN_ACCESS_DENIED', 'This pin is not visible to the current user');
  return pinFromRow(row);
}

export async function listPins(
  db: D1Database,
  user: AuthenticatedUser,
  filters: { roomId?: string | undefined; status?: PinStatus | undefined; visibility?: PinVisibility | undefined },
): Promise<PinRecord[]> {
  const timestamp = now();
  const conditions = [
    '(p.expires_at IS NULL OR p.expires_at > ?)',
    '(r.expires_at IS NULL OR r.expires_at > ?)',
  ];
  const values: Array<string> = [timestamp, timestamp];
  if (!elevated(user)) {
    conditions.push(`(p.visibility = 'public' OR p.creator_id = ? OR (p.visibility = 'room' AND rm.user_id IS NOT NULL))`);
    values.push(user.id);
  }
  if (filters.roomId) {
    conditions.push('p.room_id = ?');
    values.push(filters.roomId);
  }
  if (filters.status) {
    conditions.push('p.status = ?');
    values.push(filters.status);
  }
  if (filters.visibility) {
    conditions.push('p.visibility = ?');
    values.push(filters.visibility);
  }
  const statement = db.prepare(
    `SELECT p.* FROM pins p
     LEFT JOIN rooms r ON r.id = p.room_id
     LEFT JOIN room_members rm ON rm.room_id = p.room_id AND rm.user_id = ?
     WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC LIMIT 500`,
  );
  const result = await statement.bind(user.id, ...values).all<PinRow>();
  return result.results.map(pinFromRow);
}

export async function createPin(db: D1Database, user: AuthenticatedUser, input: CreatePinInput): Promise<PinRecord> {
  if (input.roomId) {
    const room = await getRoom(db, input.roomId, user);
    if (!room.membershipRole && !elevated(user)) throw new ApiError(403, 'ROOM_MEMBERSHIP_REQUIRED', 'Join the room before creating a pin');
  }
  const id = crypto.randomUUID();
  const timestamp = now();
  await db.batch([
    db.prepare(
      `INSERT INTO pins (id, room_id, creator_id, type, title, description, longitude, latitude, status, visibility, version, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).bind(id, input.roomId ?? null, user.id, input.type, input.title, input.description ?? null,
      input.longitude, input.latitude, input.status, input.visibility, input.expiresAt ?? null, timestamp, timestamp),
    auditStatement(db, user.id, 'pin.create', 'pin', id, { roomId: input.roomId ?? null }),
  ]);
  return getPin(db, id, user);
}

export async function updatePin(db: D1Database, pinId: string, user: AuthenticatedUser, input: UpdatePinInput): Promise<PinRecord> {
  const current = await getPin(db, pinId, user);
  if (current.creatorId !== user.id && !elevated(user)) throw new ApiError(403, 'PIN_UPDATE_DENIED', 'Only the creator can update this pin');
  if (input.visibility === 'room' && !current.roomId) throw new ApiError(400, 'ROOM_ID_REQUIRED', 'A room-visible pin must belong to a room');
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  const fields: Array<[keyof Omit<UpdatePinInput, 'expectedVersion'>, string]> = [
    ['type', 'type'], ['title', 'title'], ['description', 'description'], ['longitude', 'longitude'],
    ['latitude', 'latitude'], ['status', 'status'], ['visibility', 'visibility'], ['expiresAt', 'expires_at'],
  ];
  for (const [key, column] of fields) {
    if (input[key] !== undefined) {
      assignments.push(`${column} = ?`);
      values.push(input[key] ?? null);
    }
  }
  const updatedAt = now();
  assignments.push('version = version + 1', 'updated_at = ?');
  values.push(updatedAt, pinId, input.expectedVersion);
  const results = await db.batch([
    db.prepare(`UPDATE pins SET ${assignments.join(', ')} WHERE id = ? AND version = ?`).bind(...values),
    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata_json, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
         SELECT 1 FROM pins WHERE id = ? AND version = ? AND updated_at = ?
       )`,
    ).bind(crypto.randomUUID(), user.id, 'pin.update', 'pin', pinId,
      JSON.stringify({ fromVersion: input.expectedVersion }), updatedAt, pinId, input.expectedVersion + 1, updatedAt),
  ]);
  const result = results[0];
  if (!result) throw new ApiError(500, 'PIN_UPDATE_FAILED', 'Pin update did not return a database result');
  if (result.meta.changes === 0) {
    throw new ApiError(409, 'PIN_VERSION_CONFLICT', 'Pin was updated by another client', { currentVersion: current.version });
  }
  return getPin(db, pinId, user);
}

export async function deletePin(db: D1Database, pinId: string, user: AuthenticatedUser): Promise<void> {
  const row = await pinRow(db, pinId, user.id);
  if (!row) throw new ApiError(404, 'PIN_NOT_FOUND', 'Pin was not found');
  if (row.creator_id !== user.id && !elevated(user)) throw new ApiError(403, 'PIN_DELETE_DENIED', 'Only the creator can delete this pin');
  await db.batch([
    db.prepare('DELETE FROM pins WHERE id = ?').bind(pinId),
    auditStatement(db, user.id, 'pin.delete', 'pin', pinId),
  ]);
}

export async function listPinComments(db: D1Database, pinId: string, user: AuthenticatedUser) {
  await getPin(db, pinId, user);
  const result = await db.prepare(
    `SELECT c.*, u.display_name AS author_name FROM pin_comments c
     JOIN users u ON u.id = c.author_id WHERE c.pin_id = ? ORDER BY c.created_at ASC LIMIT 500`,
  ).bind(pinId).all<CommentRow>();
  return result.results.map((row) => ({
    id: row.id,
    pinId: row.pin_id,
    authorId: row.author_id,
    authorName: row.author_name,
    content: row.content,
    createdAt: row.created_at,
  }));
}

export async function createPinComment(db: D1Database, pinId: string, user: AuthenticatedUser, input: CreatePinCommentInput) {
  await getPin(db, pinId, user);
  const id = crypto.randomUUID();
  const timestamp = now();
  await db.batch([
    db.prepare('INSERT INTO pin_comments (id, pin_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, pinId, user.id, input.content, timestamp),
    auditStatement(db, user.id, 'pin.comment.create', 'pin', pinId, { commentId: id }),
  ]);
  return { id, pinId, authorId: user.id, authorName: user.displayName, content: input.content, createdAt: timestamp };
}

export async function getTwinProfile(db: D1Database, userId: string) {
  const row = await db.prepare('SELECT * FROM twin_profiles WHERE user_id = ?').bind(userId).first<TwinProfileRow>();
  if (!row) return { userId, enabled: false, homePlaceId: null, avatarId: null, privacyMode: 'private' as const, updatedAt: null };
  return {
    userId: row.user_id,
    enabled: row.enabled === 1,
    homePlaceId: row.home_place_id,
    avatarId: row.avatar_id,
    privacyMode: row.privacy_mode,
    updatedAt: row.updated_at,
  };
}

export async function updateTwinProfile(db: D1Database, user: AuthenticatedUser, input: UpdateTwinProfileInput) {
  const current = await getTwinProfile(db, user.id);
  const profile = {
    enabled: input.enabled ?? current.enabled,
    homePlaceId: input.homePlaceId === undefined ? current.homePlaceId : input.homePlaceId,
    avatarId: input.avatarId === undefined ? current.avatarId : input.avatarId,
    privacyMode: input.privacyMode ?? current.privacyMode,
    updatedAt: now(),
  };
  await db.batch([
    db.prepare(
      `INSERT INTO twin_profiles (user_id, enabled, home_place_id, avatar_id, privacy_mode, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, home_place_id = excluded.home_place_id,
         avatar_id = excluded.avatar_id, privacy_mode = excluded.privacy_mode, updated_at = excluded.updated_at`,
    ).bind(user.id, profile.enabled ? 1 : 0, profile.homePlaceId, profile.avatarId, profile.privacyMode, profile.updatedAt),
    auditStatement(db, user.id, 'twin.profile.update', 'twin_profile', user.id),
  ]);
  return { userId: user.id, ...profile };
}

export async function listTwinEvents(db: D1Database, userId: string) {
  const result = await db.prepare('SELECT * FROM twin_events WHERE user_id = ? ORDER BY start_at DESC LIMIT 500')
    .bind(userId).all<TwinEventRow>();
  return result.results.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    destinationPlaceId: row.destination_place_id,
    startAt: row.start_at,
    endAt: row.end_at,
    source: row.source,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) as unknown : null,
  }));
}

export async function createTwinEvent(db: D1Database, user: AuthenticatedUser, input: CreateTwinEventInput) {
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare(
      `INSERT INTO twin_events (id, user_id, event_type, destination_place_id, start_at, end_at, source, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, user.id, input.eventType, input.destinationPlaceId ?? null, input.startAt, input.endAt ?? null,
      input.source, input.metadata === undefined || input.metadata === null ? null : JSON.stringify(input.metadata)),
    auditStatement(db, user.id, 'twin.event.create', 'twin_event', id, { source: input.source }),
  ]);
  return { id, ...input, destinationPlaceId: input.destinationPlaceId ?? null, endAt: input.endAt ?? null, metadata: input.metadata ?? null };
}
