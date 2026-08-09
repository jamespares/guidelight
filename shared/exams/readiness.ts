export type GradeBoundary = {
  grade: string
  minPct: number
  pass?: boolean
}

export type ExamFormatSection = {
  name: string
  questionTypes: string[]
  questionCount: number
  marks: number
}

export type ExamFormat = {
  sections: ExamFormatSection[]
}

export type ExamRubric = {
  general?: string
  criteria?: string[]
}

function formatProfileContext(input: {
  examFormat?: ExamFormat
  gradeBoundaries?: GradeBoundary[]
  rubric?: ExamRubric
}): string {
  const parts: string[] = []
  if (input.examFormat?.sections?.length) {
    parts.push(
      `Exam format (follow this structure):\n${JSON.stringify(input.examFormat.sections, null, 2)}`,
    )
  }
  if (input.gradeBoundaries?.length) {
    parts.push(
      `Grade boundaries (% minimum for each grade):\n${input.gradeBoundaries.map((b) => `${b.grade}: ${b.minPct}%${b.pass ? ' (pass)' : ''}`).join(', ')}`,
    )
  }
  if (input.rubric?.general || input.rubric?.criteria?.length) {
    parts.push(
      `Marking rubric:\n${input.rubric.general || ''}\n${(input.rubric.criteria || []).map((c) => `- ${c}`).join('\n')}`,
    )
  }
  return parts.join('\n\n')
}

export function questionTypesFromFormat(format?: ExamFormat): string[] {
  if (!format?.sections?.length) return []
  const types = new Set<string>()
  for (const s of format.sections) {
    for (const t of s.questionTypes) types.add(t)
  }
  return [...types]
}

export function questionCountFromFormat(format?: ExamFormat): number {
  if (!format?.sections?.length) return 0
  return format.sections.reduce((sum, s) => sum + s.questionCount, 0)
}

export { formatProfileContext }

export type ExamReadiness = {
  mockExamsCompleted: number
  averageScore: number | null
  /** Probability of scoring ≥ pass threshold, 0–100. Null if n < 3. */
  passProbability: number | null
  targetProbability: number | null
  predictedGrade: string | null
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

function recommendAverage(
  scores: number[],
  threshold: number,
  targetConfidence = 80,
): { moreMocks: number; targetAverage: number } | null {
  const n = scores.length
  const mu = mean(scores)
  const sigma = sampleStd(scores)
  const currentP = probabilityAtOrAbove(mu, sigma, threshold)
  if (currentP >= targetConfidence) {
    return { moreMocks: 0, targetAverage: Math.ceil(mu) }
  }

  const zNeeded =
    targetConfidence >= 90 ? 1.28 : targetConfidence >= 80 ? 0.84 : 0.52
  const neededMean = threshold + zNeeded * sigma

  for (let m = 3; m <= 12; m++) {
    const a = (neededMean * (n + m) - n * mu) / m
    if (a <= 100) {
      return { moreMocks: m, targetAverage: Math.min(100, Math.ceil(a)) }
    }
  }
  return { moreMocks: 12, targetAverage: Math.min(100, Math.ceil(neededMean)) }
}

/** Map a percentage score to the highest matching grade boundary. */
export function gradeForScore(scorePct: number, boundaries: GradeBoundary[]): string | null {
  if (!boundaries.length) return null
  const sorted = [...boundaries].sort((a, b) => b.minPct - a.minPct)
  for (const b of sorted) {
    if (scorePct >= b.minPct) return b.grade
  }
  return sorted[sorted.length - 1]?.grade ?? null
}

export function resolveThresholds(
  boundaries: GradeBoundary[],
  passGrade?: string,
  targetGrade?: string,
): { passThreshold: number; targetThreshold: number } {
  const sorted = [...boundaries].sort((a, b) => a.minPct - b.minPct)
  const passBoundary =
    (passGrade && boundaries.find((b) => b.grade === passGrade)) ||
    boundaries.find((b) => b.pass) ||
    sorted[0]
  const targetBoundary =
    (targetGrade && boundaries.find((b) => b.grade === targetGrade)) ||
    [...boundaries].sort((a, b) => b.minPct - a.minPct)[0]

  return {
    passThreshold: passBoundary?.minPct ?? 50,
    targetThreshold: targetBoundary?.minPct ?? 80,
  }
}

export function computeExamReadiness(input: {
  scores: number[]
  gradeBoundaries: GradeBoundary[]
  passGrade?: string
  targetGrade?: string
  examTitle?: string
}): ExamReadiness {
  const scores = input.scores.filter((s) => Number.isFinite(s))
  const n = scores.length
  const { passThreshold, targetThreshold } = resolveThresholds(
    input.gradeBoundaries,
    input.passGrade,
    input.targetGrade,
  )
  const passLabel =
    input.passGrade ||
    input.gradeBoundaries.find((b) => b.pass)?.grade ||
    `${passThreshold}%`
  const targetLabel = input.targetGrade || `${targetThreshold}%`
  const examRef = input.examTitle ? ` for ${input.examTitle}` : ''

  if (n < 3) {
    return {
      mockExamsCompleted: n,
      averageScore: n ? Math.round(mean(scores) * 10) / 10 : null,
      passProbability: null,
      targetProbability: null,
      predictedGrade: n ? gradeForScore(mean(scores), input.gradeBoundaries) : null,
      unlockMessage: `Complete ${3 - n} more mock exam${3 - n === 1 ? '' : 's'} to unlock readiness estimates.`,
    }
  }

  const mu = Math.round(mean(scores) * 10) / 10
  const sigma = sampleStd(scores)
  const passProbability = probabilityAtOrAbove(mu, sigma, passThreshold)
  const targetProbability = probabilityAtOrAbove(mu, sigma, targetThreshold)
  const predictedGrade = gradeForScore(mu, input.gradeBoundaries)
  const rec = recommendAverage(scores, targetThreshold, 80)

  let recommendation: string
  if (!rec || rec.moreMocks === 0) {
    recommendation = `Based on ${n} mock exams${examRef} (avg ${mu}%), you have ~${targetProbability}% chance of reaching ${targetLabel}. Keep practising to stay sharp.`
  } else {
    recommendation = `Based on ${n} mock exams${examRef} (avg ${mu}%), you have ~${passProbability}% chance of reaching ${passLabel} and ~${targetProbability}% chance of reaching ${targetLabel}. To reach ~80% chance of hitting ${targetLabel}, aim for avg ≥${rec.targetAverage}% across ${rec.moreMocks} more mock exams.`
  }

  return {
    mockExamsCompleted: n,
    averageScore: mu,
    passProbability,
    targetProbability,
    predictedGrade,
    recommendation,
  }
}
