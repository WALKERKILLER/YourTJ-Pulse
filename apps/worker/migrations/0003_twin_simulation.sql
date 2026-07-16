PRAGMA foreign_keys = OFF;

DROP INDEX twin_events_user_start_idx;

ALTER TABLE twin_profiles RENAME TO twin_profiles_legacy;
ALTER TABLE twin_events RENAME TO twin_events_legacy;

CREATE TABLE twin_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  simulation_enabled INTEGER NOT NULL DEFAULT 0 CHECK (simulation_enabled IN (0, 1)),
  home_place_id TEXT,
  avatar_id TEXT,
  privacy_mode TEXT NOT NULL DEFAULT 'private' CHECK (privacy_mode IN ('private', 'friends', 'room')),
  updated_at TEXT NOT NULL,
  CHECK (simulation_enabled = 0 OR enabled = 1)
);

INSERT INTO twin_profiles (
  user_id, enabled, simulation_enabled, home_place_id, avatar_id, privacy_mode, updated_at
)
SELECT
  user_id,
  enabled,
  0,
  home_place_id,
  avatar_id,
  CASE privacy_mode WHEN 'public' THEN 'friends' ELSE privacy_mode END,
  updated_at
FROM twin_profiles_legacy;

CREATE TABLE twin_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('class', 'meal', 'study', 'exercise', 'club', 'custom')),
  origin_place_id TEXT,
  destination_place_id TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  source TEXT NOT NULL CHECK (source IN ('timetable', 'manual', 'system')),
  schedule_json TEXT CHECK (schedule_json IS NULL OR json_valid(schedule_json)),
  created_at TEXT NOT NULL,
  CHECK (end_at IS NULL OR end_at >= start_at)
);

INSERT INTO twin_events (
  id, user_id, event_type, origin_place_id, destination_place_id, start_at, end_at,
  source, schedule_json, created_at
)
SELECT
  id,
  user_id,
  CASE
    WHEN event_type IN ('class', 'meal', 'study', 'exercise', 'club', 'custom') THEN event_type
    ELSE 'custom'
  END,
  NULL,
  destination_place_id,
  start_at,
  end_at,
  CASE source WHEN 'calendar' THEN 'timetable' WHEN 'navigation' THEN 'system' ELSE 'manual' END,
  metadata_json,
  start_at
FROM twin_events_legacy;

DROP TABLE twin_events_legacy;
DROP TABLE twin_profiles_legacy;

CREATE INDEX twin_events_user_start_idx ON twin_events(user_id, start_at);

CREATE TABLE twin_movement_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES twin_events(id) ON DELETE CASCADE,
  origin_place_id TEXT NOT NULL,
  destination_place_id TEXT NOT NULL,
  path_node_ids_json TEXT NOT NULL CHECK (json_valid(path_node_ids_json)),
  started_at INTEGER NOT NULL CHECK (started_at >= 0),
  expected_arrival_at INTEGER NOT NULL,
  speed_meters_per_second REAL NOT NULL CHECK (speed_meters_per_second > 0 AND speed_meters_per_second <= 20),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('walk', 'run', 'bike')),
  route_version INTEGER NOT NULL CHECK (route_version > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'arrived', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (expected_arrival_at > started_at)
);

CREATE INDEX twin_plans_user_status_start_idx
  ON twin_movement_plans(user_id, status, started_at DESC);
CREATE UNIQUE INDEX twin_plans_active_event_idx
  ON twin_movement_plans(user_id, event_id) WHERE status = 'active';

PRAGMA foreign_keys = ON;
