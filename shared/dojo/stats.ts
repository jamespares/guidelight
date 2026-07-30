/** Deterministic Exam Dojo pass / top-mark probability helpers (no AI). */

export type DojoRecommendation = {
  papersCompleted: number
  averageScore: number | null
  /** Probability of scoring ≥ threshold on a future exam, 0–100. Null if n < 3. */
  passProbability: number | null
  topProbability: number | null
  unlockMessage?: string
  recommendation?: string
}

function mean(scores: number[]): number {
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

function sampleStd(scores: number[]): number {
  if (scores.length < 2) return 8
  const m = mean(scores)
  const variance = scores.reduce((sum, s) => sum + (s - m) ** 2, 0) / (scores.length - 1)
  return Math.max(Math.sqrt(variance), 8)
}

/** Approximate standard normal CDF. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p =
    d *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

function probabilityAtOrAbove(mu: number, sigma: number, threshold: number): number {
  const z = (mu - threshold) / sigma
  return Math.round(normalCdf(z) * 1000) / 10
}

/**
 * Find average A over next M papers so projected mean yields ~targetConfidence%
 * chance of scoring ≥ threshold.
 */
function recommendAverage(
  scores: number[],
  threshold: number,
  targetConfidence = 80,
): { morePapers: number; targetAverage: number } | null {
  const n = scores.length
  const mu = mean(scores)
  const sigma = sampleStd(scores)
  const currentP = probabilityAtOrAbove(mu, sigma, threshold)
  if (currentP >= targetConfidence) {
    return { morePapers: 0, targetAverage: Math.ceil(mu) }
  }

  // Need projected mean high enough that Φ((μ' - T) / σ) ≥ targetConfidence
  // μ' ≈ T + z * σ where z = inverse-ish of targetConfidence
  const zNeeded =
    targetConfidence >= 90 ? 1.28 : targetConfidence >= 80 ? 0.84 : 0.52
  const neededMean = threshold + zNeeded * sigma

  for (let m = 3; m <= 12; m++) {
    // Solve: (n*mu + m*A) / (n+m) >= neededMean  =>  A >= (neededMean*(n+m) - n*mu) / m
    const a = (neededMean * (n + m) - n * mu) / m
    if (a <= 100) {
      return { morePapers: m, targetAverage: Math.min(100, Math.ceil(a)) }
    }
  }
  return { morePapers: 12, targetAverage: Math.min(100, Math.ceil(neededMean)) }
}

export function computeDojoStats(input: {
  scores: number[]
  passThreshold: number
  topThreshold: number
  idealLabel?: string
}): DojoRecommendation {
  const scores = input.scores.filter((s) => Number.isFinite(s))
  const n = scores.length

  if (n < 3) {
    return {
      papersCompleted: n,
      averageScore: n ? Math.round(mean(scores) * 10) / 10 : null,
      passProbability: null,
      topProbability: null,
      unlockMessage: `Complete ${3 - n} more paper${3 - n === 1 ? '' : 's'} to unlock pass-probability estimates.`,
    }
  }

  const mu = Math.round(mean(scores) * 10) / 10
  const sigma = sampleStd(scores)
  const passProbability = probabilityAtOrAbove(mu, sigma, input.passThreshold)
  const topProbability = probabilityAtOrAbove(mu, sigma, input.topThreshold)

  const ideal = input.idealLabel || `${input.topThreshold}%`
  const rec = recommendAverage(scores, input.topThreshold, 80)

  let recommendation: string
  if (!rec || rec.morePapers === 0) {
    recommendation = `Based on ${n} papers (avg ${mu}%), you have ~${topProbability}% chance of scoring ≥${input.topThreshold}%. Keep practising to stay sharp.`
  } else {
    recommendation = `Based on ${n} papers (avg ${mu}%), you have ~${passProbability}% chance of passing (≥${input.passThreshold}%) and ~${topProbability}% chance of scoring ≥${input.topThreshold}%. To reach ~80% chance of hitting ${ideal}, aim for **avg ≥${rec.targetAverage}% across ${rec.morePapers} more papers**.`
  }

  return {
    papersCompleted: n,
    averageScore: mu,
    passProbability,
    topProbability,
    recommendation,
  }
}
