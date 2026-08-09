import { cn } from '@/lib/utils'

type Size = 'sm' | 'md'
type Variant = 'onPrimary' | 'onSurface'

const SIZES: Record<Size, { px: number; stroke: number; text: string; sizeClass: string }> = {
  sm: { px: 28, stroke: 2.5, text: 'text-[9px]', sizeClass: 'h-[28px] w-[28px]' },
  md: { px: 32, stroke: 3, text: 'text-[10px]', sizeClass: 'h-[32px] w-[32px]' },
}

/**
 * Compact circular progress dial for AI generation waits.
 * Shows estimated % in the center; pair with a busy label + elapsed time.
 * data-progress-dial + explicit size classes defeat Button's [&_svg]:size-4 rule.
 */
export function GenerationProgress({
  value,
  size = 'sm',
  variant = 'onPrimary',
  className,
}: {
  value: number
  size?: Size
  /** onPrimary = default/filled buttons; onSurface = outline/ghost buttons */
  variant?: Variant
  className?: string
}) {
  const { px, stroke, text, sizeClass } = SIZES[size]
  const r = (px - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, value))
  const offset = c - (clamped / 100) * c
  const track =
    variant === 'onPrimary' ? 'text-primary-foreground/25' : 'text-muted-foreground/35'
  const arc = variant === 'onPrimary' ? 'text-primary-foreground' : 'text-foreground'

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: px, height: px }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        data-progress-dial=""
        className={cn('-rotate-90', sizeClass)}
        aria-hidden
      >
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className={track}
        />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={cn(arc, 'transition-[stroke-dashoffset] duration-100 ease-linear')}
        />
      </svg>
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center font-semibold leading-none tabular-nums',
          text,
        )}
      >
        {clamped}
      </span>
    </span>
  )
}

/** Busy button row: dial + label · elapsed */
export function GenerationBusyLabel({
  label,
  percent,
  elapsedLabel,
  variant = 'onPrimary',
}: {
  label: string
  percent: number
  elapsedLabel: string
  variant?: Variant
}) {
  return (
    <>
      <GenerationProgress value={percent} size="sm" variant={variant} />
      <span className="min-w-0 truncate">
        {label} · {elapsedLabel}
      </span>
    </>
  )
}
