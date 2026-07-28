-- Attempt archives for Pinpoint weakspots + class-level weakspot store.

ALTER TABLE attempts ADD COLUMN attempt_archive_md TEXT NOT NULL DEFAULT '';

ALTER TABLE students ADD COLUMN weakspots_updated_at TEXT;
ALTER TABLE students ADD COLUMN weakspots_summary TEXT NOT NULL DEFAULT '';

ALTER TABLE classes ADD COLUMN weakspots_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE classes ADD COLUMN weakspots_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE classes ADD COLUMN weakspots_updated_at TEXT;
