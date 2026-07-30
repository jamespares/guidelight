-- Exam Dojo: reconstructed practice papers + student attempts with archives

CREATE TABLE dojo_papers (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  created_by_role TEXT NOT NULL CHECK (created_by_role IN ('teacher', 'student')),
  created_by_id TEXT NOT NULL,
  owner_student_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  curriculum TEXT NOT NULL DEFAULT '',
  syllabus_code TEXT NOT NULL DEFAULT '',
  source_file_name TEXT NOT NULL DEFAULT '',
  content_fingerprint TEXT NOT NULL DEFAULT '',
  extracted_text TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{}',
  reconstruction_label TEXT NOT NULL DEFAULT 'ai_reconstructed_practice',
  reconstructed_at TEXT,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'draft', 'ready', 'published', 'failed')),
  duration_seconds INTEGER,
  pass_threshold REAL NOT NULL DEFAULT 50,
  top_threshold REAL NOT NULL DEFAULT 80,
  fail_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE dojo_attempts (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  duration_ms INTEGER,
  answers_json TEXT NOT NULL DEFAULT '{}',
  score_pct REAL,
  feedback_json TEXT NOT NULL DEFAULT '{}',
  topic_tags_json TEXT NOT NULL DEFAULT '[]',
  attempt_archive_md TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  FOREIGN KEY (paper_id) REFERENCES dojo_papers(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX idx_dojo_papers_class ON dojo_papers(class_id);
CREATE INDEX idx_dojo_papers_owner ON dojo_papers(owner_student_id);
CREATE INDEX idx_dojo_papers_fingerprint ON dojo_papers(content_fingerprint);
CREATE INDEX idx_dojo_attempts_student ON dojo_attempts(student_id);
CREATE INDEX idx_dojo_attempts_paper ON dojo_attempts(paper_id);
