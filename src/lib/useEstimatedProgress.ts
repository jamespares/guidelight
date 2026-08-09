import { useEffect, useState } from 'react'

/** Typical AI wait presets (ms). Progress eases toward ~90% over this window. */
export const AI_WAIT_MS = {
  lessonBase: 35_000,
  lessonPerWeek: 12_000,
  draft: 40_000,
  practice: 25_000,
  report: 30_000,
  marking: 25_000,
  /** Matches worker pinpoint timeout (~55s) plus archive prep. */
  pinpoint: 60_000,
} as const

export function lessonPlanExpectedMs(weeks: number) {
  return AI_WAIT_MS.lessonBase + Math.max(1, weeks) * AI_WAIT_MS.lessonPerWeek
}

function formatElapsed(ms: number) {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Estimated progress for fire-and-forget AI calls.
 * Eases toward ~90% over expectedMs; holds until active becomes false, then snaps to 100%.
 */
export function useEstimatedProgress(active: boolean, expectedMs: number) {
  const [percent, setPercent] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!active) {
      // Snap complete briefly when a run ends, then reset for next time.
      setPercent((prev) => (prev > 0 ? 100 : 0))
      const reset = window.setTimeout(() => {
        setPercent(0)
        setElapsedMs(0)
      }, 400)
      return () => window.clearTimeout(reset)
    }

    const start = performance.now()
    setPercent(0)
    setElapsedMs(0)
    const duration = Math.max(1000, expectedMs)

    const tick = () => {
      const elapsed = performance.now() - start
      setElapsedMs(elapsed)
      // Ease-out toward 90%: fast early, slows near the ceiling.
      const t = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - t, 2.2)
      setPercent(Math.min(90, Math.round(eased * 90)))
    }

    tick()
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [active, expectedMs])

  return {
    percent,
    elapsedMs,
    elapsedLabel: formatElapsed(elapsedMs),
  }
}
