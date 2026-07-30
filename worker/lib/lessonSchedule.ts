import type { GeneratedLesson, LessonDay, LessonPlan } from '../types'
import { LESSON_DAYS } from '../types'

const DAY_TO_JS: Record<LessonDay, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const JS_TO_DAY: LessonDay[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export type ScheduledSlot = {
  week_index: number
  sequence_index: number
  scheduled_date: string
  day_of_week: LessonDay
}

/** Normalize and order selected days Mon→Sun (weekends included). */
export function normalizeDaysOfWeek(days: string[]): LessonDay[] {
  const set = new Set(days.map((d) => d.trim()).filter(Boolean))
  return LESSON_DAYS.filter((d) => set.has(d))
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Walk forward from start_date, placing one lesson on each selected day
 * (Mon–Sun including weekends) for `weeks` syllabus weeks.
 */
export function scheduleLessonSlots(
  startDate: string,
  daysOfWeek: string[],
  weeks: number,
): ScheduledSlot[] {
  const selected = normalizeDaysOfWeek(daysOfWeek)
  if (!selected.length || weeks < 1) return []

  const selectedJs = new Set(selected.map((d) => DAY_TO_JS[d]))
  const total = weeks * selected.length
  const slots: ScheduledSlot[] = []
  const cursor = parseIsoDate(startDate)

  // Safety: don't scan forever if days never match (shouldn't happen)
  for (let guard = 0; slots.length < total && guard < total * 14 + 400; guard++) {
    const jsDay = cursor.getUTCDay()
    if (selectedJs.has(jsDay)) {
      const i = slots.length
      slots.push({
        week_index: Math.floor(i / selected.length) + 1,
        sequence_index: i,
        scheduled_date: toIsoDate(cursor),
        day_of_week: JS_TO_DAY[jsDay],
      })
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return slots
}

export function emptyStage(durationMins: number, steps: string[]): LessonPlan['presentation'] {
  return { durationMins, steps, teacherNotes: '' }
}

export function traditionalFallbackPlan(
  subject: string,
  durationMinutes: number,
  weekIndex: number,
  lessonInWeek: number,
): LessonPlan {
  const present = Math.max(8, Math.round(durationMinutes * 0.35))
  const practice = Math.max(8, Math.round(durationMinutes * 0.35))
  const production = Math.max(5, durationMinutes - present - practice)

  return {
    learningObjective: `Build core ${subject} understanding for week ${weekIndex}, session ${lessonInWeek}.`,
    materials: ['Whiteboard', 'Worksheet'],
    activityStyle: 'traditional',
    presentation: emptyStage(present, [
      `Teacher introduces the week's ${subject} focus with a short slide/input.`,
      'Check understanding with 2–3 quick questions.',
    ]),
    practice: emptyStage(practice, [
      'Guided worksheet or textbook practice in pairs.',
      'Teacher circulates and supports.',
    ]),
    production: emptyStage(production, [
      "Independent short written or spoken response using today's language/content.",
    ]),
    differentiation: 'Support: sentence starters. Challenge: extend with an extra example.',
    plenary: 'Exit ticket: one thing learned, one question remaining.',
    homeworkOptional: '',
  }
}

export function communicativeFallbackPlan(
  subject: string,
  durationMinutes: number,
  weekIndex: number,
): LessonPlan {
  const present = Math.max(8, Math.round(durationMinutes * 0.3))
  const practice = Math.max(8, Math.round(durationMinutes * 0.3))
  const production = Math.max(8, durationMinutes - present - practice)

  return {
    learningObjective: `Apply ${subject} skills in a collaborative career-style task (week ${weekIndex}).`,
    materials: ['Whiteboard', 'Role cards'],
    activityStyle: 'communicative',
    careerContext: 'Junior consultant advising a small business on next steps',
    presentation: emptyStage(present, [
      `Brief input on the ${subject} tools needed for the advisory task.`,
      'Model one example recommendation as a class.',
    ]),
    practice: emptyStage(practice, [
      'In pairs, prepare talking points for the struggling business scenario.',
    ]),
    production: emptyStage(production, [
      'Teams deliver a short advisory pitch; peers give one strength and one improvement.',
    ]),
    differentiation: 'Support: prompt cards. Challenge: add a data-backed recommendation.',
    plenary: 'Reflect: which workplace skill did you practise today?',
    homeworkOptional: '',
  }
}

/** Build editable fallback lessons when AI is unavailable. */
export function fallbackGeneratedLessons(
  slots: ScheduledSlot[],
  subject: string,
  durationMinutes: number,
): GeneratedLesson[] {
  return slots.map((slot, i) => {
    // Roughly every 4th lesson gets a communicative career activity
    const communicative = i % 4 === 3
    const lessonInWeek = (slot.sequence_index % Math.max(1, slots.filter((s) => s.week_index === slot.week_index).length)) + 1
    const plan = communicative
      ? communicativeFallbackPlan(subject, durationMinutes, slot.week_index)
      : traditionalFallbackPlan(subject, durationMinutes, slot.week_index, lessonInWeek)
    return {
      title: communicative
        ? `${subject}: career task — week ${slot.week_index}`
        : `${subject}: week ${slot.week_index} lesson ${lessonInWeek}`,
      weekIndex: slot.week_index,
      plan,
    }
  })
}
