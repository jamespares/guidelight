-- Pay-as-you-go AI billing: teacher accounts, usage ledger, billing periods

CREATE TABLE billing_accounts (
  teacher_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  monthly_cap_cents INTEGER NOT NULL DEFAULT 2000,
  starter_credit_cents INTEGER NOT NULL DEFAULT 500,
  starter_credit_remaining_cents INTEGER NOT NULL DEFAULT 500,
  period_start TEXT NOT NULL DEFAULT (date('now', 'start of month')),
  school_name TEXT NOT NULL DEFAULT '',
  billing_email TEXT NOT NULL DEFAULT '',
  purchase_order TEXT NOT NULL DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT 'ok'
    CHECK (payment_status IN ('ok', 'past_due', 'suspended')),
  has_payment_method INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE ai_usage_events (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  class_id TEXT,
  feature TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  billed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_usage_teacher_created ON ai_usage_events(teacher_id, created_at);
CREATE INDEX idx_ai_usage_teacher_billed ON ai_usage_events(teacher_id, billed);

CREATE TABLE billing_periods (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  usage_cents INTEGER NOT NULL DEFAULT 0,
  credit_applied_cents INTEGER NOT NULL DEFAULT 0,
  amount_due_cents INTEGER NOT NULL DEFAULT 0,
  stripe_invoice_id TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'invoiced', 'paid', 'failed', 'void')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE INDEX idx_billing_periods_teacher ON billing_periods(teacher_id, period_start);
