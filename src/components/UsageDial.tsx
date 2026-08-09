import { Link } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BILLING_SETTINGS_PATH, CAP_HIT_TEACHER, formatUsdFromCents, TRUST_DIAL } from '@/lib/trustCopy'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Compact arc dial for sidebar / settings. */
export function UsageDial({
  usedCents,
  capCents,
  className,
  size = 72,
}: {
  usedCents: number
  capCents: number
  className?: string
  size?: number
}) {
  const pct = capCents > 0 ? Math.min(1, usedCents / capCents) : 0
  const capped = usedCents >= capCents
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const dash = c * pct

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted/40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={capped ? 'text-destructive' : 'text-primary'}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground text-[10px] font-semibold"
        >
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="min-w-0 text-sm">
        <div className="font-medium tabular-nums">
          {formatUsdFromCents(usedCents)}
          <span className="text-muted-foreground"> / {formatUsdFromCents(capCents)}</span>
        </div>
        <div className="text-xs text-muted-foreground">This month’s AI</div>
      </div>
    </div>
  )
}

export function CapHitBanner({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
      <p className="text-destructive">{CAP_HIT_TEACHER}</p>
      <div className="flex items-center gap-2">
        <Button asChild size="sm">
          <Link to={BILLING_SETTINGS_PATH}>Increase limit</Link>
        </Button>
        {onDismiss ? (
          <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function CapHitModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>AI spending cap reached</DialogTitle>
          <DialogDescription>{CAP_HIT_TEACHER}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{TRUST_DIAL}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button asChild onClick={onClose}>
            <Link to={BILLING_SETTINGS_PATH}>Increase your monthly limit</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
