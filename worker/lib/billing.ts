/**
 * Pay-as-you-go AI billing: accounts, soft caps, usage metering.
 * Teacher is the sole payer; student AI usage rolls up via class ownership.
 */
import type { Env } from '../types'
import { generateId, json } from './auth'

export type AiFeature =
  | 'task_gen'
  | 'mark_attempt'
  | 'lesson_plans'
  | 'dojo_reconstruct'
  | 'dojo_mark'
  | 'cefr_mark'
  | 'weakspots'
  | 'report'
  | 'summary'
  | 'practice_tools'
  | 'past_paper_vision'

export interface AiMeterContext {
  teacherId: string
  classId?: string | null
  feature: AiFeature
}

export class AiBudgetExceededError extends Error {
  readonly code = 'ai_budget_exceeded' as const
  constructor(
    public usedCents: number,
    public capCents: number,
  ) {
    super('AI spending cap reached')
    this.name = 'AiBudgetExceededError'
  }
}

export function billingSettingsPath() {
  return '/teacher/settings#billing'
}

export function aiBudgetExceededResponse(usedCents: number, capCents: number): Response {
  return json(
    {
      error: 'You’ve hit your monthly AI spending cap, so AI features are paused.',
      code: 'ai_budget_exceeded',
      used_cents: usedCents,
      cap_cents: capCents,
      settings_path: billingSettingsPath(),
    },
    402,
  )
}

function defaultCapCents(env: Env): number {
  const n = Number(env.DEFAULT_MONTHLY_CAP_CENTS ?? '2000')
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 2000
}

function defaultStarterCreditCents(env: Env): number {
  const n = Number(env.DEFAULT_STARTER_CREDIT_CENTS ?? '500')
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 500
}

export function currentPeriodStart(d = new Date()): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

export function nextPeriodStart(periodStart: string): string {
  const [y, m] = periodStart.split('-').map(Number)
  const next = new Date(Date.UTC(y, m, 1)) // m is 1-based month → Date month index = m (next month)
  const yy = next.getUTCFullYear()
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0')
  return `${yy}-${mm}-01`
}

/** Estimate tokens when Workers AI does not return usage. */
export function estimateTokens(text: string): number {
  // ~4 chars per token heuristic
  return Math.max(1, Math.ceil(text.length / 4))
}

export function computeCostCents(
  env: Env,
  inputTokens: number,
  outputTokens: number,
): number {
  const inputPerM = Number(env.AI_PRICE_INPUT_PER_M ?? '0.95')
  const outputPerM = Number(env.AI_PRICE_OUTPUT_PER_M ?? '4.00')
  const markupBps = Number(env.AI_MARKUP_BPS ?? '20000') // 2× default
  const cogs =
    (inputTokens / 1_000_000) * inputPerM + (outputTokens / 1_000_000) * outputPerM
  const retail = cogs * (markupBps / 10_000)
  return Math.max(1, Math.ceil(retail * 100)) // at least 1¢ per successful call
}

export interface BillingAccountRow {
  teacher_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  monthly_cap_cents: number
  starter_credit_cents: number
  starter_credit_remaining_cents: number
  period_start: string
  school_name: string
  billing_email: string
  purchase_order: string
  payment_status: 'ok' | 'past_due' | 'suspended'
  has_payment_method: number
}

export async function ensureBillingAccount(
  env: Env,
  teacherId: string,
): Promise<BillingAccountRow> {
  const existing = await env.DB.prepare(`SELECT * FROM billing_accounts WHERE teacher_id = ?`)
    .bind(teacherId)
    .first<BillingAccountRow>()

  const period = currentPeriodStart()
  if (existing) {
    if (existing.period_start !== period) {
      await env.DB.prepare(
        `UPDATE billing_accounts SET period_start = ?, updated_at = datetime('now') WHERE teacher_id = ?`,
      )
        .bind(period, teacherId)
        .run()
      return { ...existing, period_start: period }
    }
    return existing
  }

  const cap = defaultCapCents(env)
  const credit = defaultStarterCreditCents(env)
  await env.DB.prepare(
    `INSERT INTO billing_accounts (
       teacher_id, monthly_cap_cents, starter_credit_cents, starter_credit_remaining_cents, period_start
     ) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(teacherId, cap, credit, credit, period)
    .run()

  return (
    (await env.DB.prepare(`SELECT * FROM billing_accounts WHERE teacher_id = ?`)
      .bind(teacherId)
      .first<BillingAccountRow>()) ?? {
      teacher_id: teacherId,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      monthly_cap_cents: cap,
      starter_credit_cents: credit,
      starter_credit_remaining_cents: credit,
      period_start: period,
      school_name: '',
      billing_email: '',
      purchase_order: '',
      payment_status: 'ok',
      has_payment_method: 0,
    }
  )
}

export async function periodUsageCents(
  env: Env,
  teacherId: string,
  periodStart: string,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(cost_cents), 0) AS total
     FROM ai_usage_events
     WHERE teacher_id = ? AND created_at >= ?`,
  )
    .bind(teacherId, periodStart)
    .first<{ total: number }>()
  return Number(row?.total ?? 0)
}

export async function assertAiBudget(env: Env, teacherId: string): Promise<void> {
  const account = await ensureBillingAccount(env, teacherId)
  if (account.payment_status === 'suspended') {
    throw new AiBudgetExceededError(
      await periodUsageCents(env, teacherId, account.period_start),
      account.monthly_cap_cents,
    )
  }
  const used = await periodUsageCents(env, teacherId, account.period_start)
  if (used >= account.monthly_cap_cents) {
    throw new AiBudgetExceededError(used, account.monthly_cap_cents)
  }
}

export async function recordAiUsage(
  env: Env,
  ctx: AiMeterContext,
  opts: {
    model: string
    inputTokens: number
    outputTokens: number
  },
): Promise<void> {
  await ensureBillingAccount(env, ctx.teacherId)
  const cost = computeCostCents(env, opts.inputTokens, opts.outputTokens)
  await env.DB.prepare(
    `INSERT INTO ai_usage_events (
       id, teacher_id, class_id, feature, model, input_tokens, output_tokens, cost_cents, billed
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  )
    .bind(
      generateId(),
      ctx.teacherId,
      ctx.classId ?? null,
      ctx.feature,
      opts.model,
      opts.inputTokens,
      opts.outputTokens,
      cost,
    )
    .run()
}

/** Resolve the billing teacher for a student (via their class). */
export async function teacherIdForStudent(
  env: Env,
  studentId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT c.teacher_id AS teacher_id
     FROM students s
     JOIN classes c ON c.id = s.class_id
     WHERE s.id = ?`,
  )
    .bind(studentId)
    .first<{ teacher_id: string }>()
  return row?.teacher_id ?? null
}

export async function teacherIdForClass(
  env: Env,
  classId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT teacher_id FROM classes WHERE id = ?`)
    .bind(classId)
    .first<{ teacher_id: string }>()
  return row?.teacher_id ?? null
}

export async function getUsageSummary(env: Env, teacherId: string) {
  const account = await ensureBillingAccount(env, teacherId)
  const used = await periodUsageCents(env, teacherId, account.period_start)
  const { results: byFeature } = await env.DB.prepare(
    `SELECT feature, COUNT(*) AS calls, COALESCE(SUM(cost_cents), 0) AS cost_cents
     FROM ai_usage_events
     WHERE teacher_id = ? AND created_at >= ?
     GROUP BY feature
     ORDER BY cost_cents DESC`,
  )
    .bind(teacherId, account.period_start)
    .all<{ feature: string; calls: number; cost_cents: number }>()

  return {
    used_cents: used,
    cap_cents: account.monthly_cap_cents,
    capped: used >= account.monthly_cap_cents || account.payment_status === 'suspended',
    starter_credit_remaining_cents: account.starter_credit_remaining_cents,
    period_start: account.period_start,
    period_end: nextPeriodStart(account.period_start),
    payment_status: account.payment_status,
    has_payment_method: !!account.has_payment_method,
    school_name: account.school_name,
    billing_email: account.billing_email,
    purchase_order: account.purchase_order,
    stripe_customer_id: account.stripe_customer_id,
    settings_path: billingSettingsPath(),
    by_feature: byFeature.map((r) => ({
      feature: r.feature,
      calls: Number(r.calls),
      cost_cents: Number(r.cost_cents),
    })),
  }
}

export function extractUsageTokens(result: unknown): {
  inputTokens: number
  outputTokens: number
} | null {
  if (!result || typeof result !== 'object') return null
  const r = result as Record<string, unknown>
  const usage = (r.usage ?? r.usage_stats) as Record<string, unknown> | undefined
  if (!usage || typeof usage !== 'object') return null
  const input = Number(
    usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? NaN,
  )
  const output = Number(
    usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? NaN,
  )
  if (!Number.isFinite(input) && !Number.isFinite(output)) return null
  return {
    inputTokens: Number.isFinite(input) ? Math.max(0, Math.round(input)) : 0,
    outputTokens: Number.isFinite(output) ? Math.max(0, Math.round(output)) : 0,
  }
}
