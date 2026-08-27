/**
 * On-device persistence for the public IELTS listening mock: an in-progress
 * draft (answers + how far the student got) and the last submitted result.
 * Mirrors the flashcards pattern — SSR-safe, storage failures are ignored.
 */
import type { UserAnswer } from '@/data/ielts/marking'

export interface IeltsDraft {
  answers: Record<number, UserAnswer>
  /** Index of the part the student was on (resumes at that part's intro). */
  partIndex: number
  practiceMode: boolean
}

export interface IeltsResult {
  raw: number
  total: number
  band: number
  date: string
}

const draftKey = (slug: string) => `guidelight.ielts-listening.${slug}.draft.v1`
const resultKey = (slug: string) => `guidelight.ielts-listening.${slug}.result.v1`

export function loadDraft(slug: string): IeltsDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(draftKey(slug))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<IeltsDraft>
    if (!parsed.answers || typeof parsed.answers !== 'object') return null
    const answers: Record<number, UserAnswer> = {}
    for (const [k, v] of Object.entries(parsed.answers)) {
      const q = Number(k)
      if (!Number.isInteger(q)) continue
      if (typeof v === 'string' || typeof v === 'number' || v === null) answers[q] = v
    }
    const partIndex =
      typeof parsed.partIndex === 'number' && parsed.partIndex >= 0 && parsed.partIndex <= 3
        ? Math.floor(parsed.partIndex)
        : 0
    return { answers, partIndex, practiceMode: parsed.practiceMode === true }
  } catch {
    return null
  }
}

export function saveDraft(slug: string, draft: IeltsDraft): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(draftKey(slug), JSON.stringify(draft))
  } catch {
    // storage unavailable (private mode etc.) — progress just won't persist
  }
}

export function clearDraft(slug: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(draftKey(slug))
  } catch {
    // ignore
  }
}

export function loadSavedResult(slug: string): IeltsResult | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(resultKey(slug))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<IeltsResult>
    if (typeof parsed.raw !== 'number' || typeof parsed.band !== 'number') return null
    return {
      raw: parsed.raw,
      total: typeof parsed.total === 'number' ? parsed.total : 40,
      band: parsed.band,
      date: typeof parsed.date === 'string' ? parsed.date : '',
    }
  } catch {
    return null
  }
}

export function saveResult(slug: string, result: IeltsResult): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(resultKey(slug), JSON.stringify(result))
  } catch {
    // ignore
  }
}

export function resultLabel(result: IeltsResult): string {
  return `Band ${result.band.toFixed(1)} (${result.raw}/${result.total})`
}
