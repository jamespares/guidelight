-- Guidelight initial schema
CREATE TABLE teachers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  curriculum TEXT NOT NULL DEFAULT '',
  age_range TEXT NOT NULL DEFAULT '',
  student_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE students (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  interests TEXT NOT NULL DEFAULT '',
  career_ambitions TEXT NOT NULL DEFAULT '',
  weakspots TEXT NOT NULL DEFAULT '[]',
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  ai_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('homework', 'assessment')),
  subtype TEXT CHECK (subtype IN ('diagnostic', 'formative', 'summative') OR subtype IS NULL),
  class_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  time_limit_seconds INTEGER,
  content_json TEXT NOT NULL DEFAULT '{}',
  reading_text TEXT NOT NULL DEFAULT '',
  past_paper_text TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE task_assignments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  student_id TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  duration_ms INTEGER,
  answers_json TEXT NOT NULL DEFAULT '{}',
  score_pct REAL,
  feedback_json TEXT NOT NULL DEFAULT '{}',
  topic_tags_json TEXT NOT NULL DEFAULT '[]',
  focus_leave_count INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  student_id TEXT,
  class_id TEXT,
  content TEXT NOT NULL DEFAULT '',
  teacher_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE INDEX idx_students_class ON students(class_id);
CREATE INDEX idx_classes_teacher ON classes(teacher_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_tasks_class ON tasks(class_id);
CREATE INDEX idx_attempts_student ON attempts(student_id);
CREATE INDEX idx_attempts_task ON attempts(task_id);
