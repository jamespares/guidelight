CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action, created_at);
