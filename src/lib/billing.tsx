import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CapHitModal, UsageDial } from '@/components/UsageDial'
import { api, isAiBudgetError, type BillingUsage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { CAP_HIT_STUDENT, TRUST_DIAL } from '@/lib/trustCopy'

type BillingCtx = {
  usage: BillingUsage | null
  loading: boolean
  refresh: () => Promise<void>
  /** Call from AI action catch blocks — returns true if handled */
  handleAiError: (err: unknown) => boolean
}

const Ctx = createContext<BillingCtx | null>(null)

export function useBilling() {
  return useContext(Ctx)
}

export function BillingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [usage, setUsage] = useState<BillingUsage | null>(null)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [studentNotice, setStudentNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user || user.role !== 'teacher') {
      setUsage(null)
      return
    }
    setLoading(true)
    try {
      const data = await api.billingUsage()
      setUsage(data)
    } catch {
      /* ignore until migration applied */
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleAiError = useCallback(
    (err: unknown) => {
      if (!isAiBudgetError(err)) return false
      if (user?.role === 'student') {
        setStudentNotice(CAP_HIT_STUDENT)
        return true
      }
      if (user?.role === 'teacher') {
        setModalOpen(true)
        void refresh()
        return true
      }
      return false
    },
    [user?.role, refresh],
  )

  useEffect(() => {
    const onBudget = (ev: Event) => {
      handleAiError((ev as CustomEvent).detail ?? { code: 'ai_budget_exceeded' })
    }
    window.addEventListener('guidelight:ai-budget-exceeded', onBudget)
    return () => window.removeEventListener('guidelight:ai-budget-exceeded', onBudget)
  }, [handleAiError])

  return (
    <Ctx.Provider value={{ usage, loading, refresh, handleAiError }}>
      {children}
      {user?.role === 'teacher' ? (
        <CapHitModal open={modalOpen} onClose={() => setModalOpen(false)} />
      ) : null}
      <Dialog open={!!studentNotice} onOpenChange={() => setStudentNotice(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>AI usage notice</DialogTitle>
            <DialogDescription>{studentNotice}</DialogDescription>
          </DialogHeader>
          <button
            type="button"
            className="text-sm font-medium text-primary underline"
            onClick={() => setStudentNotice(null)}
          >
            OK
          </button>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  )
}

/** Sidebar footer usage dial for teachers. */
export function SidebarUsageDial() {
  const billing = useBilling()
  if (!billing?.usage) return null
  const { usage } = billing
  return (
    <div className="space-y-1 rounded-lg bg-foreground/5 px-3 py-2">
      <UsageDial usedCents={usage.used_cents} capCents={usage.cap_cents} size={56} />
      <p className="text-[10px] leading-snug text-sidebar-muted">{TRUST_DIAL}</p>
    </div>
  )
}
