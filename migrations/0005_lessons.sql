-- Teacher lesson planning batches and individual lessons
CREATE TABLE lesson_batches (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  curriculum TEXT NOT NULL DEFAULT '',
  age_range TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  weekly_frequency INTEGER NOT NULL DEFAULT 1,
  days_of_week TEXT NOT NULL DEFAULT '[]',
  resources_json TEXT NOT NULL DEFAULT '[]',
  weeks INTEGER NOT NULL DEFAULT 1 CHECK (weeks >= 1 AND weeks <= 12),
  start_date TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  week_index INTEGER NOT NULL,
  sequence_index INTEGER NOT NULL,
  scheduled_date TEXT NOT NULL,
  day_of_week TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  plan_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (batch_id) REFERENCES lesson_batches(id) ON DELETE CASCADE
);

CREATE INDEX idx_lesson_batches_teacher ON lesson_batches(teacher_id);
CREATE INDEX idx_lessons_batch ON lessons(batch_id);
CREATE INDEX idx_lessons_date ON lessons(scheduled_date);
