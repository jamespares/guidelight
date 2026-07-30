/**
 * Minimal Stripe REST client for Workers (no SDK).
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 */
import type { Env } from '../types'

export function stripeConfigured(env: Env): boolean {
  const key = env.STRIPE_SECRET_KEY?.trim() ?? ''
  // Standard secret keys (sk_) or restricted keys (rk_)
  return (
    key.startsWith('sk_test_') ||
    key.startsWith('sk_live_') ||
    key.startsWith('rk_test_') ||
    key.startsWith('rk_live_')
  )
}

/** Safe diagnostics for billing setup (never returns key material). */
export function stripeStatus(env: Env): {
  configured: boolean
  secret_present: boolean
  secret_looks_valid: boolean
  webhook_secret_present: boolean
  publishable_present: boolean
} {
  const key = env.STRIPE_SECRET_KEY?.trim() ?? ''
  const secret_looks_valid =
    key.startsWith('sk_test_') ||
    key.startsWith('sk_live_') ||
    key.startsWith('rk_test_') ||
    key.startsWith('rk_live_')
  return {
    configured: secret_looks_valid,
    secret_present: key.length > 0,
    secret_looks_valid,
    webhook_secret_present: Boolean(env.STRIPE_WEBHOOK_SECRET?.trim()),
    publishable_present: Boolean(env.STRIPE_PUBLISHABLE_KEY?.trim()),
  }
}

async function stripeRequest<T>(
  env: Env,
  method: string,
  path: string,
  body?: Record<string, string | number | boolean | undefined | null>,
): Promise<T> {
  const key = env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Stripe is not configured')

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  }
  let payload: string | undefined
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue
      params.set(k, String(v))
    }
    payload = params.toString()
  }

  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers,
    body: payload,
  })
  const data = (await res.json()) as T & { error?: { message?: string } }
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe error (${res.status})`)
  }
  return data
}

/** Nested form encoding for Stripe (e.g. metadata[foo]=bar). */
async function stripeRequestNested<T>(
  env: Env,
  method: string,
  path: string,
  form: URLSearchParams,
): Promise<T> {
  const key = env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Stripe is not configured')
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })
  const data = (await res.json()) as T & { error?: { message?: string } }
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe error (${res.status})`)
  }
  return data
}

export interface StripeCustomer {
  id: string
  email?: string | null
  name?: string | null
}

export interface StripeCheckoutSession {
  id: string
  url: string | null
}

export interface StripePortalSession {
  url: string
}

export interface StripeInvoice {
  id: string
  status: string
  amount_due: number
  amount_paid: number
  currency: string
  created: number
  invoice_pdf: string | null
  hosted_invoice_url: string | null
  metadata?: Record<string, string>
  period_start?: number
  period_end?: number
  number?: string | null
}

export async function createStripeCustomer(
  env: Env,
  opts: { email: string; name: string; teacherId: string },
): Promise<StripeCustomer> {
  const form = new URLSearchParams()
  form.set('email', opts.email)
  form.set('name', opts.name)
  form.set('metadata[teacher_id]', opts.teacherId)
  form.set('metadata[product]', 'guidelight')
  return stripeRequestNested(env, 'POST', '/customers', form)
}

export async function updateStripeCustomer(
  env: Env,
  customerId: string,
  opts: {
    name?: string
    email?: string
    schoolName?: string
    purchaseOrder?: string
  },
): Promise<StripeCustomer> {
  const form = new URLSearchParams()
  if (opts.name) form.set('name', opts.name)
  if (opts.email) form.set('email', opts.email)
  if (opts.schoolName !== undefined) form.set('metadata[school_name]', opts.schoolName)
  if (opts.purchaseOrder !== undefined) {
    form.set('metadata[purchase_order]', opts.purchaseOrder)
    form.set('invoice_settings[custom_fields][0][name]', 'PO / Cost centre')
    form.set('invoice_settings[custom_fields][0][value]', opts.purchaseOrder.slice(0, 30) || 'n/a')
  }
  return stripeRequestNested(env, 'POST', `/customers/${customerId}`, form)
}

export async function createCheckoutSetupSession(
  env: Env,
  opts: { customerId: string; successUrl: string; cancelUrl: string },
): Promise<StripeCheckoutSession> {
  const form = new URLSearchParams()
  form.set('mode', 'setup')
  form.set('customer', opts.customerId)
  form.set('success_url', opts.successUrl)
  form.set('cancel_url', opts.cancelUrl)
  form.set('payment_method_types[0]', 'card')
  return stripeRequestNested(env, 'POST', '/checkout/sessions', form)
}

export async function createBillingPortalSession(
  env: Env,
  opts: { customerId: string; returnUrl: string },
): Promise<StripePortalSession> {
  return stripeRequest(env, 'POST', '/billing_portal/sessions', {
    customer: opts.customerId,
    return_url: opts.returnUrl,
  })
}

export async function listStripeInvoices(
  env: Env,
  customerId: string,
  limit = 24,
): Promise<StripeInvoice[]> {
  const data = await stripeRequest<{ data: StripeInvoice[] }>(
    env,
    'GET',
    `/invoices?customer=${encodeURIComponent(customerId)}&limit=${limit}`,
  )
  return data.data ?? []
}

/** Mid-period statement invoice (send_invoice) — PDF for school reimbursement, not auto-charged. */
export async function createUsageStatementInvoice(
  env: Env,
  opts: {
    customerId: string
    teacherId: string
    periodStart: string
    amountCents: number
    description: string
    schoolName?: string
    purchaseOrder?: string
  },
): Promise<StripeInvoice> {
  // Void prior unpaid mid-period statements for this teacher/period
  const existing = await listStripeInvoices(env, opts.customerId, 10)
  for (const inv of existing) {
    if (
      inv.metadata?.kind === 'mid_period_statement' &&
      inv.metadata?.period_start === opts.periodStart &&
      (inv.status === 'open' || inv.status === 'draft')
    ) {
      try {
        await stripeRequest(env, 'POST', `/invoices/${inv.id}/void`, {})
      } catch {
        /* ignore */
      }
    }
  }

  const amount = Math.max(0, Math.round(opts.amountCents))
  const formItem = new URLSearchParams()
  formItem.set('customer', opts.customerId)
  formItem.set('amount', String(amount || 0))
  formItem.set('currency', 'usd')
  formItem.set('description', opts.description.slice(0, 500))
  await stripeRequestNested(env, 'POST', '/invoiceitems', formItem)

  const formInv = new URLSearchParams()
  formInv.set('customer', opts.customerId)
  formInv.set('collection_method', 'send_invoice')
  formInv.set('days_until_due', '30')
  formInv.set('auto_advance', 'true')
  formInv.set('metadata[kind]', 'mid_period_statement')
  formInv.set('metadata[teacher_id]', opts.teacherId)
  formInv.set('metadata[period_start]', opts.periodStart)
  if (opts.schoolName) formInv.set('metadata[school_name]', opts.schoolName)
  if (opts.purchaseOrder) formInv.set('metadata[purchase_order]', opts.purchaseOrder)
  formInv.set('pending_invoice_items_behavior', 'include')

  const created = await stripeRequestNested<StripeInvoice>(env, 'POST', '/invoices', formInv)
  // Finalize so PDF is available
  const finalized = await stripeRequest<StripeInvoice>(
    env,
    'POST',
    `/invoices/${created.id}/finalize`,
    {},
  )
  return finalized
}

/** Month-end charge invoice — voids mid-period statements first, then charges card if present. */
export async function createPeriodChargeInvoice(
  env: Env,
  opts: {
    customerId: string
    teacherId: string
    periodStart: string
    periodEnd: string
    amountCents: number
    description: string
  },
): Promise<StripeInvoice | null> {
  const existing = await listStripeInvoices(env, opts.customerId, 20)
  for (const inv of existing) {
    if (
      inv.metadata?.kind === 'mid_period_statement' &&
      inv.metadata?.period_start === opts.periodStart &&
      (inv.status === 'open' || inv.status === 'draft')
    ) {
      try {
        await stripeRequest(env, 'POST', `/invoices/${inv.id}/void`, {})
      } catch {
        /* ignore */
      }
    }
  }

  const amount = Math.max(0, Math.round(opts.amountCents))
  if (amount <= 0) return null

  const formItem = new URLSearchParams()
  formItem.set('customer', opts.customerId)
  formItem.set('amount', String(amount))
  formItem.set('currency', 'usd')
  formItem.set('description', opts.description.slice(0, 500))
  await stripeRequestNested(env, 'POST', '/invoiceitems', formItem)

  const formInv = new URLSearchParams()
  formInv.set('customer', opts.customerId)
  formInv.set('collection_method', 'charge_automatically')
  formInv.set('auto_advance', 'true')
  formInv.set('metadata[kind]', 'period_charge')
  formInv.set('metadata[teacher_id]', opts.teacherId)
  formInv.set('metadata[period_start]', opts.periodStart)
  formInv.set('metadata[period_end]', opts.periodEnd)
  formInv.set('pending_invoice_items_behavior', 'include')

  const created = await stripeRequestNested<StripeInvoice>(env, 'POST', '/invoices', formInv)
  const finalized = await stripeRequest<StripeInvoice>(
    env,
    'POST',
    `/invoices/${created.id}/finalize`,
    {},
  )
  try {
    await stripeRequest(env, 'POST', `/invoices/${finalized.id}/pay`, {})
  } catch {
    /* pay may fail if no default PM — invoice stays open */
  }
  return finalized
}

/** Verify Stripe webhook signature (v1). */
export async function verifyStripeWebhook(
  env: Env,
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = env.STRIPE_WEBHOOK_SECRET
  if (!secret || !signatureHeader) return false

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, v] = p.split('=')
      return [k, v]
    }),
  )
  const timestamp = parts.t
  const sig = parts.v1
  if (!timestamp || !sig) return false

  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (age > 300) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  )
  const digest = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(digest, sig)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}
