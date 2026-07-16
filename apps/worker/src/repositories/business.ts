import type {
  AuthenticatedUser,
  CreatePinCommentInput,
  CreatePinInput,
  CreatePinReportInput,
  CreateRoomInput,
  CreateTwinEventInput,
  PinStatus,
  PinReportReason,
  PinReportStatus,
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

interface ReportRow {
  id: string;
  pin_id: string;
  reporter_id: string;
  reporter_name: string;
  reason: PinReportReason;
  detail: string | null;
  status: PinReportStatus;
  resolver_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  metadata_json: string | null;
  created_at: string;
}

interface TwinProfileRow {
  user_id: string;
  enabled: number;
  simulation_enabled: number;
  home_place_id: string | null;
  avatar_id: string | null;
  privacy_mode: TwinPrivacyMode;
  updated_at: string;
}

interface TwinEventRow {
  id: string;
  event_type: CreateTwinEventInput['type'];
  origin_place_id: string | null;
  destination_place_id: string | null;
  start_at: string;
  end_at: string | null;
  source: CreateTwinEventInput['source'];
  schedule_json: string | null;
  created_at: string;
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

export function hasElevatedRole(user: AuthenticatedUser): boolean {
  return elevated(user);
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

const GENERIC_PIN_STATES = new Set<PinStatus>(['draft', 'active', 'resolved', 'expired', 'deleted']);
const REPAIR_PIN_STATES = new Set<PinStatus>([
  'draft', 'reported', 'confirmed', 'processing', 'resolved', 'rejected', 'deleted',
]);
const GENERIC_TRANSITIONS: Partial<Record<PinStatus, readonly PinStatus[]>> = {
  draft: ['active', 'deleted'],
  active: ['resolved', 'expired', 'deleted'],
  resolved: ['active', 'deleted'],
  expired: ['deleted'],
};
const REPAIR_TRANSITIONS: Partial<Record<PinStatus, readonly PinStatus[]>> = {
  draft: ['reported', 'deleted'],
  reported: ['confirmed', 'rejected', 'deleted'],
  confirmed: ['processing', 'rejected', 'deleted'],
  processing: ['resolved', 'rejected', 'deleted'],
  resolved: ['deleted'],
  rejected: ['deleted'],
};

function assertPinState(type: CreatePinInput['type'], status: PinStatus): void {
  const states = type === 'repair' ? REPAIR_PIN_STATES : GENERIC_PIN_STATES;
  if (!states.has(status)) {
    throw new ApiError(400, 'INVALID_PIN_STATE', `Status ${status} is not valid for pin type ${type}`);
  }
}

function assertInitialPinState(type: CreatePinInput['type'], status: PinStatus): void {
  const allowed = type === 'repair' ? ['draft', 'reported'] : ['draft', 'active'];
  if (!allowed.includes(status)) {
    throw new ApiError(400, 'INVALID_INITIAL_PIN_STATE', `A ${type} pin cannot be created with status ${status}`);
  }
}

function assertStatusTransition(
  currentType: CreatePinInput['type'],
  currentStatus: PinStatus,
  nextType: CreatePinInput['type'],
  nextStatus: PinStatus,
): void {
  if (currentType !== nextType) {
    if (currentStatus !== 'draft' || !['draft', 'active', 'reported'].includes(nextStatus)) {
      throw new ApiError(409, 'INVALID_PIN_TRANSITION', 'Pin type can only change while the pin is a draft');
    }
    return;
  }
  if (currentStatus === nextStatus) return;
  const allowed = (currentType === 'repair' ? REPAIR_TRANSITIONS : GENERIC_TRANSITIONS)[currentStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new ApiError(409, 'INVALID_PIN_TRANSITION', `Cannot move ${currentType} pin from ${currentStatus} to ${nextStatus}`);
  }
}

export async function getPin(db: D1Database, pinId: string, user: AuthenticatedUser): Promise<PinRecord> {
  const row = await pinRow(db, pinId, user.id);
  if (!row || row.status === 'deleted') throw new ApiError(404, 'PIN_NOT_FOUND', 'Pin was not found');
  if (row.status === 'expired' || pinExpired(row, now())) throw new ApiError(410, 'PIN_EXPIRED', 'Pin or its room has expired');
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
    "p.status <> 'deleted'",
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
  } else {
    conditions.push("p.status <> 'expired'");
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
  assertPinState(input.type, input.status);
  assertInitialPinState(input.type, input.status);
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
  const currentRow = await pinRow(db, pinId, user.id);
  const canCollaborate = currentRow?.visibility === 'room' && Boolean(currentRow.membership_role);
  if (current.creatorId !== user.id && !elevated(user) && !canCollaborate) {
    throw new ApiError(403, 'PIN_UPDATE_DENIED', 'Only the creator or a room member can update this pin');
  }
  if (input.visibility === 'room' && !current.roomId) throw new ApiError(400, 'ROOM_ID_REQUIRED', 'A room-visible pin must belong to a room');
  if (input.status === 'deleted') throw new ApiError(400, 'PIN_DELETE_REQUIRES_DELETE', 'Use DELETE to delete a pin');
  const nextType = input.type ?? current.type;
  const nextStatus = input.status ?? current.status;
  assertPinState(nextType, nextStatus);
  if (input.status !== undefined) assertStatusTransition(current.type, current.status, nextType, input.status);
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
      JSON.stringify({
        fromVersion: input.expectedVersion,
        toVersion: input.expectedVersion + 1,
        changedFields: fields.filter(([key]) => input[key] !== undefined).map(([key]) => key),
      }), updatedAt, pinId, input.expectedVersion + 1, updatedAt),
  ]);
  const result = results[0];
  if (!result) throw new ApiError(500, 'PIN_UPDATE_FAILED', 'Pin update did not return a database result');
  if (result.meta.changes === 0) {
    const latest = await pinRow(db, pinId, user.id);
    throw new ApiError(409, 'PIN_VERSION_CONFLICT', 'Pin was updated by another client', {
      expectedVersion: input.expectedVersion,
      currentVersion: latest?.version ?? current.version,
    });
  }
  return getPin(db, pinId, user);
}

export async function deletePin(
  db: D1Database,
  pinId: string,
  user: AuthenticatedUser,
  expectedVersion?: number,
) {
  const row = await pinRow(db, pinId, user.id);
  if (!row || row.status === 'deleted') throw new ApiError(404, 'PIN_NOT_FOUND', 'Pin was not found');
  if (row.creator_id !== user.id && !elevated(user)) throw new ApiError(403, 'PIN_DELETE_DENIED', 'Only the creator can delete this pin');
  if (expectedVersion !== undefined && row.version !== expectedVersion) {
    throw new ApiError(409, 'PIN_VERSION_CONFLICT', 'Pin was updated by another client', {
      expectedVersion,
      currentVersion: row.version,
    });
  }
  const timestamp = now();
  const deleteVersion = expectedVersion ?? row.version;
  const results = await db.batch([
    db.prepare("UPDATE pins SET status = 'deleted', version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .bind(timestamp, pinId, deleteVersion),
    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata_json, created_at)
       SELECT ?, ?, 'pin.delete', 'pin', ?, ?, ? WHERE EXISTS (
         SELECT 1 FROM pins WHERE id = ? AND status = 'deleted' AND version = ? AND updated_at = ?
       )`,
    ).bind(crypto.randomUUID(), user.id, pinId,
      JSON.stringify({ fromVersion: deleteVersion, toVersion: deleteVersion + 1 }), timestamp,
      pinId, deleteVersion + 1, timestamp),
  ]);
  if (results[0]?.meta.changes === 0) {
    throw new ApiError(409, 'PIN_VERSION_CONFLICT', 'Pin was updated by another client');
  }
  return { pinId, version: deleteVersion + 1, deletedAt: timestamp };
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

function reportFromRow(row: ReportRow) {
  return {
    id: row.id,
    pinId: row.pin_id,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name,
    reason: row.reason,
    detail: row.detail,
    status: row.status,
    resolverId: row.resolver_id,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export async function createPinReport(
  db: D1Database,
  pinId: string,
  user: AuthenticatedUser,
  input: CreatePinReportInput,
) {
  await getPin(db, pinId, user);
  const id = crypto.randomUUID();
  const timestamp = now();
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO pin_reports (id, pin_id, reporter_id, reason, detail, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      ).bind(id, pinId, user.id, input.reason, input.detail ?? null, timestamp),
      auditStatement(db, user.id, 'pin.report.create', 'pin', pinId, { reportId: id, reason: input.reason }),
    ]);
  } catch (error) {
    if (/UNIQUE|pin_reports_pending_reporter_idx/i.test(String(error))) {
      throw new ApiError(409, 'PIN_ALREADY_REPORTED', 'The current user already has a pending report for this pin');
    }
    throw error;
  }
  return {
    id,
    pinId,
    reporterId: user.id,
    reporterName: user.displayName,
    reason: input.reason,
    detail: input.detail ?? null,
    status: 'pending' as const,
    resolverId: null,
    createdAt: timestamp,
    resolvedAt: null,
  };
}

export async function listPinReports(db: D1Database, pinId: string, user: AuthenticatedUser) {
  await getPin(db, pinId, user);
  if (!elevated(user)) throw new ApiError(403, 'PIN_REPORTS_ACCESS_DENIED', 'Only moderators can view pin reports');
  const result = await db.prepare(
    `SELECT pr.*, u.display_name AS reporter_name
     FROM pin_reports pr JOIN users u ON u.id = pr.reporter_id
     WHERE pr.pin_id = ? ORDER BY pr.created_at DESC LIMIT 500`,
  ).bind(pinId).all<ReportRow>();
  return result.results.map(reportFromRow);
}

export async function resolvePinReport(
  db: D1Database,
  pinId: string,
  reportId: string,
  user: AuthenticatedUser,
  status: Exclude<PinReportStatus, 'pending'>,
) {
  await getPin(db, pinId, user);
  if (!elevated(user)) throw new ApiError(403, 'PIN_REPORT_RESOLVE_DENIED', 'Only moderators can resolve reports');
  const timestamp = now();
  const results = await db.batch([
    db.prepare(
      `UPDATE pin_reports SET status = ?, resolver_id = ?, resolved_at = ?
       WHERE id = ? AND pin_id = ? AND status = 'pending'`,
    ).bind(status, user.id, timestamp, reportId, pinId),
    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata_json, created_at)
       SELECT ?, ?, 'pin.report.resolve', 'pin', ?, ?, ? WHERE EXISTS (
         SELECT 1 FROM pin_reports WHERE id = ? AND pin_id = ? AND status = ? AND resolved_at = ?
       )`,
    ).bind(crypto.randomUUID(), user.id, pinId, JSON.stringify({ reportId, status }), timestamp,
      reportId, pinId, status, timestamp),
  ]);
  if (results[0]?.meta.changes === 0) {
    throw new ApiError(404, 'PENDING_PIN_REPORT_NOT_FOUND', 'Pending pin report was not found');
  }
  const row = await db.prepare(
    `SELECT pr.*, u.display_name AS reporter_name
     FROM pin_reports pr JOIN users u ON u.id = pr.reporter_id WHERE pr.id = ?`,
  ).bind(reportId).first<ReportRow>();
  if (!row) throw new ApiError(404, 'PIN_REPORT_NOT_FOUND', 'Pin report was not found');
  return reportFromRow(row);
}

export async function listPinActivity(db: D1Database, pinId: string, user: AuthenticatedUser) {
  const row = await pinRow(db, pinId, user.id);
  if (!row) throw new ApiError(404, 'PIN_NOT_FOUND', 'Pin was not found');
  if (row.status !== 'deleted') await getPin(db, pinId, user);
  else if (!canReadPin(row, user)) throw new ApiError(403, 'PIN_ACCESS_DENIED', 'This pin is not visible to the current user');
  const result = await db.prepare(
    `SELECT a.id, a.actor_id, u.display_name AS actor_name, a.action, a.metadata_json, a.created_at
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.target_type = 'pin' AND a.target_id = ?
     ORDER BY a.created_at ASC, a.id ASC LIMIT 500`,
  ).bind(pinId).all<AuditRow>();
  return result.results.map((row) => {
    let metadata: unknown = null;
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(row.metadata_json) as unknown;
      } catch {
        metadata = { malformed: true };
      }
    }
    return {
      id: row.id,
      actorId: row.actor_id,
      actorName: row.actor_name,
      action: row.action,
      metadata,
      createdAt: row.created_at,
    };
  });
}

export async function getTwinProfile(db: D1Database, userId: string) {
  const row = await db.prepare('SELECT * FROM twin_profiles WHERE user_id = ?').bind(userId).first<TwinProfileRow>();
  if (!row) return { userId, enabled: false, simulationEnabled: false, homePlaceId: null, avatarId: null, privacyMode: 'private' as const, updatedAt: null };
  return {
    userId: row.user_id,
    enabled: row.enabled === 1,
    simulationEnabled: row.simulation_enabled === 1,
    homePlaceId: row.home_place_id,
    avatarId: row.avatar_id,
    privacyMode: row.privacy_mode,
    updatedAt: row.updated_at,
  };
}

export async function updateTwinProfile(db: D1Database, user: AuthenticatedUser, input: UpdateTwinProfileInput) {
  const current = await getTwinProfile(db, user.id);
  const enabled = input.enabled ?? current.enabled;
  const requestedSimulation = input.simulationEnabled ?? current.simulationEnabled;
  if (requestedSimulation && !enabled) {
    throw new ApiError(400, 'TWIN_OPT_IN_REQUIRED', 'Twin profile must be enabled before simulation can be enabled');
  }
  const profile = {
    enabled,
    simulationEnabled: enabled && requestedSimulation,
    homePlaceId: input.homePlaceId === undefined ? current.homePlaceId : input.homePlaceId,
    avatarId: input.avatarId === undefined ? current.avatarId : input.avatarId,
    privacyMode: input.privacyMode ?? current.privacyMode,
    updatedAt: now(),
  };
  await db.batch([
    db.prepare(
      `INSERT INTO twin_profiles (user_id, enabled, simulation_enabled, home_place_id, avatar_id, privacy_mode, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, simulation_enabled = excluded.simulation_enabled, home_place_id = excluded.home_place_id,
         avatar_id = excluded.avatar_id, privacy_mode = excluded.privacy_mode, updated_at = excluded.updated_at`,
    ).bind(user.id, profile.enabled ? 1 : 0, profile.simulationEnabled ? 1 : 0, profile.homePlaceId, profile.avatarId, profile.privacyMode, profile.updatedAt),
    auditStatement(db, user.id, 'twin.profile.update', 'twin_profile', user.id),
  ]);
  return { userId: user.id, ...profile };
}

export async function listTwinEvents(db: D1Database, userId: string) {
  const result = await db.prepare('SELECT * FROM twin_events WHERE user_id = ? ORDER BY start_at DESC LIMIT 500')
    .bind(userId).all<TwinEventRow>();
  return result.results.map((row) => ({
    id: row.id,
    type: row.event_type,
    originPlaceId: row.origin_place_id,
    destinationPlaceId: row.destination_place_id,
    startAt: row.start_at,
    endAt: row.end_at,
    source: row.source,
    schedule: row.schedule_json ? JSON.parse(row.schedule_json) as unknown : null,
    createdAt: row.created_at,
  }));
}

export async function createTwinEvent(db: D1Database, user: AuthenticatedUser, input: CreateTwinEventInput) {
  const id = crypto.randomUUID();
  const createdAt = now();
  await db.batch([
    db.prepare(
      `INSERT INTO twin_events (id, user_id, event_type, origin_place_id, destination_place_id, start_at, end_at, source, schedule_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, user.id, input.type, input.originPlaceId ?? null, input.destinationPlaceId, input.startAt, input.endAt ?? null,
      input.source, input.schedule === undefined || input.schedule === null ? null : JSON.stringify(input.schedule), createdAt),
    auditStatement(db, user.id, 'twin.event.create', 'twin_event', id, { source: input.source }),
  ]);
  return { id, ...input, originPlaceId: input.originPlaceId ?? null, endAt: input.endAt ?? null, schedule: input.schedule ?? null, createdAt };
}
