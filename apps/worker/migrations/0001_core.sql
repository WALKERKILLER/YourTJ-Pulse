PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'mapper', 'moderator', 'admin')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'unlisted', 'public')),
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE room_members (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'moderator')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE pins (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('note', 'event', 'hazard', 'meetup')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  status TEXT NOT NULL CHECK (status IN ('active', 'resolved', 'archived')),
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'room', 'public')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (visibility <> 'room' OR room_id IS NOT NULL)
);

CREATE TABLE pin_comments (
  id TEXT PRIMARY KEY,
  pin_id TEXT NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL
);

CREATE TABLE feature_revisions (
  id TEXT PRIMARY KEY,
  feature_id TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  base_version INTEGER NOT NULL CHECK (base_version >= 0),
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'rejected')),
  reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  review_message TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE TABLE twin_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  home_place_id TEXT,
  avatar_id TEXT,
  privacy_mode TEXT NOT NULL CHECK (privacy_mode IN ('private', 'room', 'public')),
  updated_at TEXT NOT NULL
);

CREATE TABLE twin_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 64),
  destination_place_id TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  source TEXT NOT NULL CHECK (source IN ('manual', 'calendar', 'navigation')),
  metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  CHECK (end_at IS NULL OR end_at >= start_at)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX rooms_owner_idx ON rooms(owner_id);
CREATE INDEX rooms_visibility_expiry_idx ON rooms(visibility, expires_at);
CREATE INDEX room_members_user_idx ON room_members(user_id);
CREATE INDEX pins_room_status_idx ON pins(room_id, status);
CREATE INDEX pins_visibility_expiry_idx ON pins(visibility, expires_at);
CREATE INDEX pin_comments_pin_created_idx ON pin_comments(pin_id, created_at);
CREATE INDEX feature_revisions_feature_status_idx ON feature_revisions(feature_id, status);
CREATE INDEX twin_events_user_start_idx ON twin_events(user_id, start_at);
CREATE INDEX audit_logs_target_idx ON audit_logs(target_type, target_id, created_at);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at);

CREATE TRIGGER room_member_capacity
BEFORE INSERT ON room_members
WHEN (SELECT count(*) FROM room_members WHERE room_id = NEW.room_id) >= 100
BEGIN
  SELECT RAISE(ABORT, 'ROOM_FULL');
END;
