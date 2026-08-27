/**
 * Marking for the IELTS listening mock tests: answer normalisation,
 * raw score, and the raw -> band conversion used by IELTS listening.
 */
import type { AnswerSpec } from './listeningTest1'

/**
 * Normalise a typed completion answer: case- and punctuation-insensitive,
 * whitespace collapsed, leading currency symbols dropped. Spelling itself is
 * NOT forgiven — IELTS completion answers must be spelled correctly.
 */
export function normaliseAnswer(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^[£$€]\s*/, '')
    .replace(/[.,;:!?'"‘’“”()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function markTextAnswer(input: string, accept: string[]): boolean {
  const norm = normaliseAnswer(input)
  if (!norm) return false
  return accept.some((a) => normaliseAnswer(a) === norm)
}

export function markChoiceAnswer(input: number | null, correct: number): boolean {
  return input !== null && input === correct
}

/**
 * Official IELTS listening raw-score -> band conversion (Academic & General
 * Training share the same listening band table).
 */
export const LISTENING_BAND_BOUNDARIES: readonly { minRaw: number; band: number }[] = [
  { minRaw: 39, band: 9 },
  { minRaw: 37, band: 8.5 },
  { minRaw: 35, band: 8 },
  { minRaw: 32, band: 7.5 },
  { minRaw: 30, band: 7 },
  { minRaw: 26, band: 6.5 },
  { minRaw: 23, band: 6 },
  { minRaw: 18, band: 5.5 },
  { minRaw: 16, band: 5 },
  { minRaw: 13, band: 4.5 },
  { minRaw: 10, band: 4 },
  { minRaw: 8, band: 3.5 },
  { minRaw: 6, band: 3 },
  { minRaw: 4, band: 2.5 },
  { minRaw: 0, band: 2 },
]

export function bandForScore(raw: number): number {
  for (const { minRaw, band } of LISTENING_BAND_BOUNDARIES) {
    if (raw >= minRaw) return band
  }
  return 0
}

export type UserAnswer = string | number | null

export interface MarkResult {
  raw: number
  total: number
  band: number
  correct: Record<number, boolean>
}

export function markTest(
  answers: Record<number, AnswerSpec>,
  userAnswers: Record<number, UserAnswer>,
): MarkResult {
  const correct: Record<number, boolean> = {}
  let raw = 0
  for (const [key, spec] of Object.entries(answers)) {
    const q = Number(key)
    const user = userAnswers[q] ?? null
    const ok =
      spec.kind === 'text'
        ? markTextAnswer(typeof user === 'string' ? user : '', spec.accept)
        : markChoiceAnswer(typeof user === 'number' ? user : null, spec.correct)
    correct[q] = ok
    if (ok) raw += 1
  }
  const total = Object.keys(answers).length
  return { raw, total, band: bandForScore(raw), correct }
}
