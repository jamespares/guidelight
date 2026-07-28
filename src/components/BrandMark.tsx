import { Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Two-tone wordmark: Guide + light (silver in dark, navy in light). */
export function GuidelightWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display font-semibold tracking-tight', className)} aria-label="Guidelight">
      <span style={{ color: 'var(--brand-guide)' }}>Guide</span>
      <span style={{ color: 'var(--brand-light)' }}>light</span>
    </span>
  )
}

export function BrandMark({
  role,
  compact = false,
}: {
  role?: string
  compact?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-3', compact && 'gap-2')}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Lightbulb className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <GuidelightWordmark className="text-lg leading-none" />
        {role ? (
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
            {role}
          </div>
        ) : null}
      </div>
    </div>
  )
}
