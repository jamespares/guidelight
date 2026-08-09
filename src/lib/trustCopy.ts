/** Canonical trust + cap-hit copy for PAYG AI billing. */

export const TRUST_DIAL =
  'Powered by Cloudflare Workers AI. Your class data isn’t sent to OpenAI or ChatGPT — only pay for the AI you use.'

export const TRUST_LANDING =
  'Secure AI on Cloudflare — not shipped to big AI companies. Pay only for what you use.'

export const CAP_HIT_TEACHER =
  'You’ve hit your monthly AI spending cap, so AI features are paused. Increase your limit in Billing to turn them back on.'

export const CAP_HIT_STUDENT =
  'This feature isn’t available right now. Please ask your teacher to check their Guidelight settings.'

export const BILLING_SETTINGS_PATH = '/teacher/settings#billing'

export function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

export const FEATURE_LABELS: Record<string, string> = {
  task_gen: 'Homework & assessments',
  mark_attempt: 'Marking',
  lesson_plans: 'Lesson planning',
  cefr_mark: 'English level marking',
  weakspots: 'Weakspot analysis',
  report: 'Reports',
  summary: 'Student summaries',
  practice_tools: 'Student practice tools',
  past_paper_vision: 'Past-paper vision',
}
