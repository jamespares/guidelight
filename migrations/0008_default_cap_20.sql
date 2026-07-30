-- Default monthly AI spending cap is now $20 (was $10).
-- Bump accounts still on the previous default; custom caps are left alone.
UPDATE billing_accounts
SET monthly_cap_cents = 2000, updated_at = datetime('now')
WHERE monthly_cap_cents = 1000;
