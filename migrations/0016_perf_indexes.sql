-- Performance indexes and constraint hardening for common read paths.

-- Remove duplicate task_assignments before adding unique indexes.
-- Keep the oldest row for each (task_id, student_id) combination.
DELETE FROM task_assignments
WHERE id IN (
  SELECT id FROM task_assignments
  WHERE id NOT IN (
    SELECT MIN(id) FROM task_assignments GROUP BY task_id, COALESCE(student_id, '')
  )
);

-- At most one whole-class assignment per task.
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_assignments_whole_class
  ON task_assignments(task_id) WHERE student_id IS NULL;

-- At most one per-student assignment per task.
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_assignments_student
  ON task_assignments(task_id, student_id) WHERE student_id IS NOT NULL;

-- Attempts: common filters and ordering.
CREATE INDEX IF NOT EXISTS idx_attempts_submitted_at ON attempts(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_task_status ON attempts(task_id, status);
CREATE INDEX IF NOT EXISTS idx_attempts_student_status ON attempts(student_id, status);
CREATE INDEX IF NOT EXISTS idx_attempts_student_submitted ON attempts(student_id, status, submitted_at DESC);

-- Tasks: teacher/class listings and publish ordering.
CREATE INDEX IF NOT EXISTS idx_tasks_teacher_status_type ON tasks(created_by, status, type);
CREATE INDEX IF NOT EXISTS idx_tasks_class_status_published ON tasks(class_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_exam_profile_status ON tasks(exam_profile_id, status, subtype);
CREATE INDEX IF NOT EXISTS idx_tasks_class_status_type ON tasks(class_id, status, type);

-- Sessions: expiry-based cleanup.
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Reports: teacher report listing.
CREATE INDEX IF NOT EXISTS idx_reports_teacher ON reports(teacher_id, updated_at DESC);

-- Reading materials: teacher-authored texts.
CREATE INDEX IF NOT EXISTS idx_reading_materials_teacher ON reading_materials(teacher_id);

-- Lesson batches: class-scoped lookups.
CREATE INDEX IF NOT EXISTS idx_lesson_batches_class ON lesson_batches(class_id);
