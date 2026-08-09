/**
 * Teacher billing API: usage dial data, caps, Stripe setup, invoices, webhooks.
 */
import type { Env, SessionUser } from '../types'
import { error, generateId, json } from './auth'
import { parseJsonBody } from './validation'
import {
  ensureBillingAccount,
  getUsageSummary,
  nextPeriodStart,
  periodUsageCents,
  currentPeriodStart,
} from './billing'
import {
  createBillingPortalSession,
  createCheckoutSetupSession,
  createPeriodChargeInvoice,
  createStripeCustomer,
  createUsageStatementInvoice,
  listStripeInvoices,
  stripeConfigured,
  stripeStatus,
  updateStripeCustomer,
  verifyStripeWebhook,
} from './stripe'

function appOrigin(env: Env, request: Request): string {
  return (env.APP_URL || new URL(request.url).origin).replace(/\/$/, '')
}

export async function handleBillingApi(
  request: Request,
  env: Env,
  path: string,
  user: SessionUser,
): Promise<Response | null> {
  if (!path.startsWith('/api/billing')) return null

  // Webhook is unauthenticated
  if (path === '/api/billing/webhook' && request.method === 'POST') {
    return handleWebhook(request, env)
  }

  if (user.role !== 'teacher') {
    return error('Teachers only', 403)
  }

  if (path === '/api/billing/usage' && request.method === 'GET') {
    const summary = await getUsageSummary(env, user.id)
    return json({
      ...summary,
      stripe_configured: stripeConfigured(env),
      stripe_status: stripeStatus(env),
      stripe_publishable_key: env.STRIPE_PUBLISHABLE_KEY || null,
      portal_login_url: env.STRIPE_CUSTOMER_PORTAL_LOGIN_URL || null,
      has_stripe_customer: Boolean(summary.stripe_customer_id),
    })
  }

  if (path === '/api/billing/cap' && request.method === 'PATCH') {
    const parsed = await parseJsonBody(request)
    if (parsed instanceof Response) return parsed
    const body = parsed as { monthly_cap_cents?: number }
    const cap = Math.round(Number(body.monthly_cap_cents))
    if (!Number.isFinite(cap) || cap < 100) {
      return error('Monthly cap must be at least $1.00 (100 cents)')
    }
    if (cap > 1_000_000) return error('Monthly cap is too high')
    await ensureBillingAccount(env, user.id)
    await env.DB.prepare(
      `UPDATE billing_accounts SET monthly_cap_cents = ?, updated_at = datetime('now') WHERE teacher_id = ?`,
    )
      .bind(cap, user.id)
      .run()
    return json(await getUsageSummary(env, user.id))
  }

  if (path === '/api/billing/profile' && request.method === 'PATCH') {
    const parsed = await parseJsonBody(request)
    if (parsed instanceof Response) return parsed
    const body = parsed as {
      school_name?: string
      billing_email?: string
      purchase_order?: string
    }
    const account = await ensureBillingAccount(env, user.id)
    const school = (body.school_name ?? account.school_name).trim().slice(0, 200)
    const billingEmail = (body.billing_email ?? account.billing_email).trim().slice(0, 200)
    const po = (body.purchase_order ?? account.purchase_order).trim().slice(0, 80)

    await env.DB.prepare(
      `UPDATE billing_accounts
       SET school_name = ?, billing_email = ?, purchase_order = ?, updated_at = datetime('now')
       WHERE teacher_id = ?`,
    )
      .bind(school, billingEmail, po, user.id)
      .run()

    if (account.stripe_customer_id && stripeConfigured(env)) {
      try {
        await updateStripeCustomer(env, account.stripe_customer_id, {
          name: school || user.name,
          email: billingEmail || user.email,
          schoolName: school,
          purchaseOrder: po,
        })
      } catch (err) {
        console.error('updateStripeCustomer failed', err)
      }
    }

    return json(await getUsageSummary(env, user.id))
  }

  if (path === '/api/billing/setup' && request.method === 'POST') {
    if (!stripeConfigured(env)) {
      return error('Card setup is not available yet. Usage tracking is active.', 503)
    }
    const account = await ensureBillingAccount(env, user.id)
    let customerId = account.stripe_customer_id
    if (!customerId) {
      const customer = await createStripeCustomer(env, {
        email: user.email || `${user.id}@users.getguidelight.com`,
        name: user.name,
        teacherId: user.id,
      })
      customerId = customer.id
      await env.DB.prepare(
        `UPDATE billing_accounts SET stripe_customer_id = ?, updated_at = datetime('now') WHERE teacher_id = ?`,
      )
        .bind(customerId, user.id)
        .run()
    }

    const origin = appOrigin(env, request)
    const session = await createCheckoutSetupSession(env, {
      customerId,
      successUrl: `${origin}/teacher/settings?billing=success#billing`,
      cancelUrl: `${origin}/teacher/settings?billing=cancel#billing`,
    })
    return json({ url: session.url })
  }

  if (path === '/api/billing/portal' && request.method === 'POST') {
    if (!stripeConfigured(env)) {
      return error('Billing portal is not available yet.', 503)
    }
    const account = await ensureBillingAccount(env, user.id)
    if (!account.stripe_customer_id) {
      return error('Add a payment method first.', 400)
    }
    const origin = appOrigin(env, request)
    const portal = await createBillingPortalSession(env, {
      customerId: account.stripe_customer_id,
      returnUrl: `${origin}/teacher/settings#billing`,
    })
    return json({ url: portal.url })
  }

  if (path === '/api/billing/invoices' && request.method === 'GET') {
    const account = await ensureBillingAccount(env, user.id)
    if (!stripeConfigured(env) || !account.stripe_customer_id) {
      return json({ invoices: [], stripe_configured: stripeConfigured(env) })
    }
    const invoices = await listStripeInvoices(env, account.stripe_customer_id)
    return json({
      stripe_configured: true,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        status: inv.status,
        amount_due: inv.amount_due,
        amount_paid: inv.amount_paid,
        currency: inv.currency,
        created: inv.created,
        invoice_pdf: inv.invoice_pdf,
        hosted_invoice_url: inv.hosted_invoice_url,
        number: inv.number,
        kind: inv.metadata?.kind ?? null,
        period_start: inv.metadata?.period_start ?? null,
      })),
    })
  }

  if (path === '/api/billing/invoices/preview' && request.method === 'POST') {
    const account = await ensureBillingAccount(env, user.id)
    const used = await periodUsageCents(env, user.id, account.period_start)
    const credit = Math.min(account.starter_credit_remaining_cents, used)
    const amountDue = Math.max(0, used - credit)

    // Always return a D1 usage statement (school can print); Stripe PDF when configured
    const statement = {
      period_start: account.period_start,
      period_end: nextPeriodStart(account.period_start),
      usage_cents: used,
      credit_applied_cents: credit,
      amount_due_cents: amountDue,
      school_name: account.school_name,
      purchase_order: account.purchase_order,
      teacher_name: user.name,
      teacher_email: user.email,
    }

    if (!stripeConfigured(env) || !account.stripe_customer_id) {
      return json({
        statement,
        invoice: null,
        message:
          'Usage statement ready. Official Stripe invoice PDFs are available after card setup and at month end.',
      })
    }

    if (used <= 0) {
      return json({
        statement,
        invoice: null,
        message: 'No AI usage this period yet.',
      })
    }

    try {
      const invoice = await createUsageStatementInvoice(env, {
        customerId: account.stripe_customer_id,
        teacherId: user.id,
        periodStart: account.period_start,
        amountCents: Math.max(amountDue, 1), // Stripe needs a positive amount for a line item
        description: `Guidelight AI usage ${account.period_start} → ${nextPeriodStart(account.period_start)} (statement for school reimbursement — final charge at month end)`,
        schoolName: account.school_name,
        purchaseOrder: account.purchase_order,
      })
      return json({
        statement,
        invoice: {
          id: invoice.id,
          status: invoice.status,
          invoice_pdf: invoice.invoice_pdf,
          hosted_invoice_url: invoice.hosted_invoice_url,
          amount_due: invoice.amount_due,
        },
      })
    } catch (err) {
      console.error('createUsageStatementInvoice failed', err)
      return json({
        statement,
        invoice: null,
        message: err instanceof Error ? err.message : 'Could not create Stripe statement invoice',
      })
    }
  }

  return error('Not found', 404)
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const raw = await request.text()
  const sig = request.headers.get('Stripe-Signature')
  const ok = await verifyStripeWebhook(env, raw, sig)
  if (!ok) return error('Invalid signature', 400)

  let event: { type: string; data?: { object?: Record<string, unknown> } }
  try {
    event = JSON.parse(raw) as typeof event
  } catch {
    return error('Invalid payload', 400)
  }

  const obj = event.data?.object ?? {}
  const customerId = typeof obj.customer === 'string' ? obj.customer : null

  if (event.type === 'checkout.session.completed' && customerId) {
    await env.DB.prepare(
      `UPDATE billing_accounts SET has_payment_method = 1, payment_status = 'ok', updated_at = datetime('now')
       WHERE stripe_customer_id = ?`,
    )
      .bind(customerId)
      .run()
  }

  if (event.type === 'invoice.paid' && customerId) {
    const invoiceId = typeof obj.id === 'string' ? obj.id : null
    const meta = (obj.metadata ?? {}) as Record<string, string>
    await env.DB.prepare(
      `UPDATE billing_accounts SET payment_status = 'ok', has_payment_method = 1, updated_at = datetime('now')
       WHERE stripe_customer_id = ?`,
    )
      .bind(customerId)
      .run()
    if (invoiceId && meta.kind === 'period_charge') {
      await env.DB.prepare(
        `UPDATE billing_periods SET status = 'paid', stripe_invoice_id = ? WHERE stripe_invoice_id = ? OR (teacher_id = (
           SELECT teacher_id FROM billing_accounts WHERE stripe_customer_id = ?
         ) AND period_start = ?)`,
      )
        .bind(invoiceId, invoiceId, customerId, meta.period_start ?? '')
        .run()
    }
  }

  if (
    (event.type === 'invoice.payment_failed' || event.type === 'invoice.marked_uncollectible') &&
    customerId
  ) {
    await env.DB.prepare(
      `UPDATE billing_accounts SET payment_status = 'past_due', updated_at = datetime('now')
       WHERE stripe_customer_id = ?`,
    )
      .bind(customerId)
      .run()
  }

  // Grace: after sustained failure, suspend (client can still raise cap / update card)
  if (event.type === 'customer.subscription.deleted' && customerId) {
    await env.DB.prepare(
      `UPDATE billing_accounts SET payment_status = 'suspended', updated_at = datetime('now')
       WHERE stripe_customer_id = ?`,
    )
      .bind(customerId)
      .run()
  }

  return json({ received: true })
}

/** Cron: close prior calendar month — apply starter credit, Stripe invoice, mark events billed. */
export async function runMonthlyBilling(env: Env): Promise<{ processed: number }> {
  const now = new Date()
  // Bill the previous UTC month
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const periodStart = currentPeriodStart(prev)
  const periodEnd = nextPeriodStart(periodStart)

  const { results: accounts } = await env.DB.prepare(`SELECT * FROM billing_accounts`).all<{
    teacher_id: string
    stripe_customer_id: string | null
    starter_credit_remaining_cents: number
  }>()

  let processed = 0
  for (const account of accounts) {
    const used = await periodUsageCents(env, account.teacher_id, periodStart)
    // Only events in [periodStart, periodEnd)
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(cost_cents), 0) AS total
       FROM ai_usage_events
       WHERE teacher_id = ? AND created_at >= ? AND created_at < ? AND billed = 0`,
    )
      .bind(account.teacher_id, periodStart, periodEnd)
      .first<{ total: number }>()
    const usageCents = Number(row?.total ?? 0)
    if (usageCents <= 0 && used <= 0) continue

    const credit = Math.min(account.starter_credit_remaining_cents, usageCents)
    const amountDue = Math.max(0, usageCents - credit)

    const periodId = generateId()
    await env.DB.prepare(
      `INSERT INTO billing_periods (
         id, teacher_id, period_start, period_end, usage_cents, credit_applied_cents, amount_due_cents, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        periodId,
        account.teacher_id,
        periodStart,
        periodEnd,
        usageCents,
        credit,
        amountDue,
        amountDue > 0 ? 'invoiced' : 'paid',
      )
      .run()

    if (credit > 0) {
      const remaining = Math.max(0, account.starter_credit_remaining_cents - credit)
      await env.DB.prepare(
        `UPDATE billing_accounts
         SET starter_credit_remaining_cents = ?, updated_at = datetime('now')
         WHERE teacher_id = ?`,
      )
        .bind(remaining, account.teacher_id)
        .run()
    }

    let invoiceId: string | null = null
    if (
      amountDue > 0 &&
      account.stripe_customer_id &&
      stripeConfigured(env)
    ) {
      try {
        const inv = await createPeriodChargeInvoice(env, {
          customerId: account.stripe_customer_id,
          teacherId: account.teacher_id,
          periodStart,
          periodEnd,
          amountCents: amountDue,
          description: `Guidelight AI usage ${periodStart} → ${periodEnd}`,
        })
        invoiceId = inv?.id ?? null
        if (invoiceId) {
          await env.DB.prepare(
            `UPDATE billing_periods SET stripe_invoice_id = ? WHERE id = ?`,
          )
            .bind(invoiceId, periodId)
            .run()
        }
      } catch (err) {
        console.error('period invoice failed', account.teacher_id, err)
        await env.DB.prepare(
          `UPDATE billing_periods SET status = 'failed' WHERE id = ?`,
        )
          .bind(periodId)
          .run()
      }
    }

    await env.DB.prepare(
      `UPDATE ai_usage_events SET billed = 1
       WHERE teacher_id = ? AND created_at >= ? AND created_at < ? AND billed = 0`,
    )
      .bind(account.teacher_id, periodStart, periodEnd)
      .run()

    // Roll account period_start forward if still on closed month
    await env.DB.prepare(
      `UPDATE billing_accounts SET period_start = ?, updated_at = datetime('now')
       WHERE teacher_id = ? AND period_start = ?`,
    )
      .bind(currentPeriodStart(), account.teacher_id, periodStart)
      .run()

    processed += 1
  }

  return { processed }
}
