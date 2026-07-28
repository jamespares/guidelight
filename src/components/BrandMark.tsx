import { Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Soft sky / water multicolor wordmark. */
const LETTER_COLORS = [
  'var(--brand-sky)',
  'var(--brand-aqua)',
  'var(--brand-seafoam)',
  'var(--brand-periwinkle)',
  'var(--brand-mist)',
]

export function GuidelightWordmark({ className }: { className?: string }) {
  const letters = 'Guidelight'.split('')
  return (
    <span className={cn('font-display font-semibold tracking-tight', className)} aria-label="Guidelight">
      {letters.map((ch, i) => (
        <span key={`${ch}-${i}`} style={{ color: LETTER_COLORS[i % LETTER_COLORS.length] }}>
          {ch}
        </span>
      ))}
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
