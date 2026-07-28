import { cn } from '@/lib/utils'

/** Build a bold 8-point compass star (longer N/S tips, shorter E/W + diagonals). */
function compassStarPath(
  cx: number,
  cy: number,
  verticalR: number,
  horizontalR: number,
  shortR: number,
  innerR: number,
) {
  const pts: string[] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2
    const tip = i % 2 === 0
    const cardinal = i % 4 === 0
    // i=0 N, i=4 E, i=8 S, i=12 W
    let r = innerR
    if (tip) {
      if (cardinal) {
        r = i === 0 || i === 8 ? verticalR : horizontalR
      } else {
        r = shortR
      }
    }
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return `${pts.join(' ')} Z`
}

// Stockier star; N/S tips stretched a touch for the brand mark
const STAR_PATH = compassStarPath(16, 16, 15.8, 14.2, 10.5, 6.2)

/**
 * Eight-pointed compass star from the Guidelight logo.
 * Uses currentColor — pair with --brand-guide for light/dark.
 */
export function GuidelightStar({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <path d={STAR_PATH} />
    </svg>
  )
}

/** Logo star — silver in dark mode, navy in light mode. */
export function BrandStar({ className }: { className?: string }) {
  return <GuidelightStar className={cn('text-[var(--brand-guide)]', className)} />
}

/** Wordmark with logo star — single colour, tight professional lockup. */
export function GuidelightWordmark({
  className,
  showStar = true,
}: {
  className?: string
  showStar?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-display font-semibold tracking-tight text-[var(--brand-guide)]',
        className,
      )}
      aria-label="Guidelight"
    >
      {showStar ? (
        // Cap-height match; slight optical nudge for Fraunces baseline
        <BrandStar className="relative top-[0.02em] block h-[0.92em] w-[0.92em] shrink-0" />
      ) : null}
      <span className="leading-none">Guidelight</span>
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
    <div className={cn('flex items-center gap-2.5', compact && 'gap-2')}>
      <BrandStar className={cn(compact ? 'h-6 w-6' : 'h-7 w-7')} />
      <div className="min-w-0">
        <GuidelightWordmark showStar={false} className="text-lg leading-none" />
        {role ? (
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
            {role}
          </div>
        ) : null}
      </div>
    </div>
  )
}
