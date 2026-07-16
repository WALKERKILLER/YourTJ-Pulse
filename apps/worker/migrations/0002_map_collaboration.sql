PRAGMA foreign_keys = OFF;

DROP INDEX pin_comments_pin_created_idx;
DROP INDEX pins_room_status_idx;
DROP INDEX pins_visibility_expiry_idx;

ALTER TABLE pin_comments RENAME TO pin_comments_legacy;
ALTER TABLE pins RENAME TO pins_legacy;

CREATE TABLE pins (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN (
    'meeting', 'task', 'event', 'warning', 'repair', 'lost_found', 'checkin', 'road_closed'
  )),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  status TEXT NOT NULL CHECK (status IN (
    'draft', 'active', 'resolved', 'expired', 'deleted',
    'reported', 'confirmed', 'processing', 'rejected'
  )),
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'room', 'public')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (visibility <> 'room' OR room_id IS NOT NULL)
);

INSERT INTO pins (
  id, room_id, creator_id, type, title, description, longitude, latitude,
  status, visibility, version, expires_at, created_at, updated_at
)
SELECT
  id,
  room_id,
  creator_id,
  CASE type
    WHEN 'note' THEN 'task'
    WHEN 'hazard' THEN 'warning'
    WHEN 'meetup' THEN 'meeting'
    ELSE 'event'
  END,
  title,
  description,
  longitude,
  latitude,
  CASE status
    WHEN 'archived' THEN 'expired'
    ELSE status
  END,
  visibility,
  version,
  expires_at,
  created_at,
  updated_at
FROM pins_legacy;

CREATE TABLE pin_comments (
  id TEXT PRIMARY KEY,
  pin_id TEXT NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL
);

INSERT INTO pin_comments (id, pin_id, author_id, content, created_at)
SELECT id, pin_id, author_id, content, created_at FROM pin_comments_legacy;

DROP TABLE pin_comments_legacy;
DROP TABLE pins_legacy;

CREATE INDEX pins_room_status_idx ON pins(room_id, status);
CREATE INDEX pins_visibility_expiry_idx ON pins(visibility, expires_at);
CREATE INDEX pin_comments_pin_created_idx ON pin_comments(pin_id, created_at);

CREATE TABLE pin_reports (
  id TEXT PRIMARY KEY,
  pin_id TEXT NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'inaccurate', 'safety', 'other')),
  detail TEXT CHECK (detail IS NULL OR length(detail) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  resolver_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE UNIQUE INDEX pin_reports_pending_reporter_idx
  ON pin_reports(pin_id, reporter_id) WHERE status = 'pending';
CREATE INDEX pin_reports_pin_created_idx ON pin_reports(pin_id, created_at);
CREATE INDEX pin_reports_status_created_idx ON pin_reports(status, created_at);

ALTER TABLE feature_revisions ADD COLUMN submission_id TEXT;
CREATE INDEX feature_revisions_submission_idx ON feature_revisions(submission_id, status);

PRAGMA foreign_keys = ON;
