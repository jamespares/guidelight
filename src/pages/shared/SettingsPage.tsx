import { useEffect, useState, type FormEvent } from 'react'
import { Moon, Sun } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { UsageDial } from '@/components/UsageDial'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, type BillingInvoice, type BillingUsage } from '@/lib/api'
import { useBilling } from '@/lib/billing'
import { useTheme, type Theme } from '@/lib/theme'
import {
  FEATURE_LABELS,
  TRUST_DIAL,
  formatUsdFromCents,
} from '@/lib/trustCopy'

export function SettingsPage({ role }: { role: 'teacher' | 'student' | 'parent' }) {
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    if (role !== 'teacher') return
    if (window.location.hash === '#billing') {
      document.getElementById('billing')?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [role])

  const description =
    role === 'teacher'
      ? 'Personal preferences and AI billing for your teacher workspace.'
      : role === 'student'
        ? 'Personal preferences for your student workspace.'
        : 'Personal preferences for your parent view.'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" description={description} />

      <Card>
        <CardHeader>
          <CardTitle as="h2">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Theme</legend>
            <p className="text-sm text-muted-foreground">
              Choose light or dark mode. Your choice is saved on this device.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {(
                [
                  { value: 'light' as Theme, label: 'Light', icon: Sun },
                  { value: 'dark' as Theme, label: 'Dark', icon: Moon },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={theme === value ? 'default' : 'outline'}
                  onClick={() => setTheme(value)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {role === 'teacher' ? <TeacherBillingSection /> : null}
    </div>
  )
}

function TeacherBillingSection() {
  const billing = useBilling()
  const [usage, setUsage] = useState<BillingUsage | null>(billing?.usage ?? null)
  const [capDollars, setCapDollars] = useState('20')
  const [schoolName, setSchoolName] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [purchaseOrder, setPurchaseOrder] = useState('')
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (billing?.usage) {
      setUsage(billing.usage)
      setCapDollars(String(billing.usage.cap_cents / 100))
      setSchoolName(billing.usage.school_name || '')
      setBillingEmail(billing.usage.billing_email || '')
      setPurchaseOrder(billing.usage.purchase_order || '')
    }
  }, [billing?.usage])

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.billingInvoices()
        setInvoices(res.invoices)
      } catch {
        /* ignore */
      }
    })()
  }, [])

  async function saveCap(e: FormEvent) {
    e.preventDefault()
    setBusy('cap')
    setError('')
    setMessage('')
    try {
      const cents = Math.round(Number(capDollars) * 100)
      const next = await api.billingSetCap(cents)
      setUsage(next)
      await billing?.refresh()
      setMessage('Monthly limit updated. AI resumes if you were over the previous cap.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update cap')
    } finally {
      setBusy('')
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setBusy('profile')
    setError('')
    setMessage('')
    try {
      const next = await api.billingUpdateProfile({
        school_name: schoolName,
        billing_email: billingEmail,
        purchase_order: purchaseOrder,
      })
      setUsage(next)
      setMessage('School billing details saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setBusy('')
    }
  }

  async function addCard() {
    setBusy('setup')
    setError('')
    try {
      const { url } = await api.billingSetup()
      if (url) window.location.href = url
      else setError('Card setup is not available yet.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start card setup')
    } finally {
      setBusy('')
    }
  }

  async function openPortal() {
    setBusy('portal')
    setError('')
    try {
      const { url } = await api.billingPortal()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open portal')
    } finally {
      setBusy('')
    }
  }

  async function getStatement() {
    setBusy('invoice')
    setError('')
    setMessage('')
    try {
      const res = await api.billingInvoicePreview()
      if (res.invoice?.invoice_pdf) {
        window.open(res.invoice.invoice_pdf, '_blank', 'noopener,noreferrer')
        setMessage('Opened Stripe invoice PDF for school reimbursement.')
      } else if (res.invoice?.hosted_invoice_url) {
        window.open(res.invoice.hosted_invoice_url, '_blank', 'noopener,noreferrer')
        setMessage('Opened Stripe hosted invoice.')
      } else {
        setMessage(
          res.message ||
            `Usage statement: ${formatUsdFromCents(res.statement.usage_cents)} used this period (credit ${formatUsdFromCents(res.statement.credit_applied_cents)}). Official PDF invoices appear after card setup / month end.`,
        )
      }
      const list = await api.billingInvoices()
      setInvoices(list.invoices)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate invoice')
    } finally {
      setBusy('')
    }
  }

  return (
    <Card id="billing">
      <CardHeader>
        <CardTitle as="h2">Billing & AI usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">{TRUST_DIAL}</p>
        <p className="text-sm text-muted-foreground">
          No subscription — you pay at month end only for the AI you use. Your default monthly
          spending cap is $20; raise it anytime so costs never surprise you.
        </p>

        {usage ? (
          <div className="space-y-3">
            <UsageDial usedCents={usage.used_cents} capCents={usage.cap_cents} />
            {usage.starter_credit_remaining_cents > 0 ? (
              <p className="text-xs text-muted-foreground">
                Starter credit remaining:{' '}
                {formatUsdFromCents(usage.starter_credit_remaining_cents)} (applied at invoice)
              </p>
            ) : null}
            {usage.by_feature.length ? (
              <ul className="space-y-1 text-sm">
                {usage.by_feature.map((f) => (
                  <li key={f.feature} className="flex justify-between gap-4">
                    <span>{FEATURE_LABELS[f.feature] || f.feature}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {f.calls} · {formatUsdFromCents(f.cost_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No AI usage this month yet.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading usage…</p>
        )}

        <form onSubmit={(e) => void saveCap(e)} className="space-y-3 border-t border-border pt-4">
          <Label htmlFor="cap">Monthly AI spending limit (USD)</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="cap"
              type="number"
              min={1}
              step={1}
              value={capDollars}
              onChange={(e) => setCapDollars(e.target.value)}
              className="max-w-[140px]"
            />
            <Button type="submit" disabled={busy === 'cap'}>
              {busy === 'cap' ? 'Saving…' : 'Increase / save limit'}
            </Button>
          </div>
        </form>

        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-semibold">Payment method</p>
          <p className="text-sm text-muted-foreground">
            {usage?.has_payment_method
              ? 'Card on file — charged at month end for AI usage over your starter credit.'
              : 'Add a card so month-end invoices can collect automatically.'}
            {!usage?.stripe_configured ? ' (Stripe not configured in this environment yet.)' : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy === 'setup' || !usage?.stripe_configured}
              onClick={() => void addCard()}
            >
              {busy === 'setup' ? 'Opening…' : 'Add payment method'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                busy === 'portal' ||
                !usage?.stripe_configured ||
                !(usage?.has_payment_method || usage?.has_stripe_customer)
              }
              onClick={() => void openPortal()}
            >
              Manage cards & invoices
            </Button>
            {usage?.portal_login_url ? (
              <Button type="button" variant="ghost" asChild>
                <a href={usage.portal_login_url} target="_blank" rel="noreferrer">
                  Stripe portal login
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <form
          onSubmit={(e) => void saveProfile(e)}
          className="space-y-3 border-t border-border pt-4"
        >
          <p className="text-sm font-semibold">School reimbursement details</p>
          <p className="text-sm text-muted-foreground">
            Shown on Stripe invoices so you can reclaim AI costs from your school.
          </p>
          <Input
            placeholder="School / organisation name"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
          />
          <Input
            placeholder="Billing email"
            type="email"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
          />
          <Input
            placeholder="PO / cost centre"
            value={purchaseOrder}
            onChange={(e) => setPurchaseOrder(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={busy === 'profile'}>
            {busy === 'profile' ? 'Saving…' : 'Save school details'}
          </Button>
        </form>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Invoices</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy === 'invoice'}
              onClick={() => void getStatement()}
            >
              {busy === 'invoice' ? 'Generating…' : 'Get invoice for this month'}
            </Button>
          </div>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Stripe invoices yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span>
                    {inv.number || inv.id.slice(-8)} · {inv.status} ·{' '}
                    {formatUsdFromCents(inv.amount_due || inv.amount_paid)}
                  </span>
                  {inv.invoice_pdf || inv.hosted_invoice_url ? (
                    <a
                      className="text-primary underline"
                      href={inv.invoice_pdf || inv.hosted_invoice_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download PDF
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {message ? (
          <div aria-live="polite" role="status">
            <p className="text-sm text-foreground">{message}</p>
          </div>
        ) : null}
        {error ? (
          <div aria-live="polite" role="status">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
