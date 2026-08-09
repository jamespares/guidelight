import type { TaskSubtype } from '@/lib/api'

/** Semantic badge class for task type / assessment subtype (importance → colour). */
export type TaskKind =
  | 'english_level'
  | 'summative'
  | 'mock_exam'
  | 'diagnostic'
  | 'formative'
  | 'reading_speed'
  | 'homework'

export function resolveTaskKind(
  type: 'homework' | 'assessment' | string,
  subtype: TaskSubtype | string | null | undefined,
): TaskKind {
  if (type === 'homework' && !subtype) return 'homework'
  switch (subtype) {
    case 'english_level':
      return 'english_level'
    case 'summative':
      return 'summative'
    case 'mock_exam':
      return 'mock_exam'
    case 'diagnostic':
      return 'diagnostic'
    case 'formative':
      return 'formative'
    case 'reading_speed':
      return 'reading_speed'
    default:
      return type === 'homework' ? 'homework' : 'formative'
  }
}

const LABELS: Record<TaskKind, string> = {
  english_level: 'English level',
  summative: 'Summative',
  mock_exam: 'Mock exam',
  diagnostic: 'Diagnostic',
  formative: 'Formative',
  reading_speed: 'Reading speed',
  homework: 'Homework',
}

/** Solid muted backgrounds + readable foregrounds via CSS tokens. */
const BADGE_CLASSES: Record<TaskKind, string> = {
  english_level:
    'border-transparent bg-[hsl(var(--task-english-level-bg))] text-[hsl(var(--task-english-level-fg))]',
  summative:
    'border-transparent bg-[hsl(var(--task-summative-bg))] text-[hsl(var(--task-summative-fg))]',
  mock_exam:
    'border-transparent bg-[hsl(var(--task-summative-bg))] text-[hsl(var(--task-summative-fg))]',
  diagnostic:
    'border-transparent bg-[hsl(var(--task-diagnostic-bg))] text-[hsl(var(--task-diagnostic-fg))]',
  formative:
    'border-transparent bg-[hsl(var(--task-formative-bg))] text-[hsl(var(--task-formative-fg))]',
  reading_speed:
    'border-transparent bg-[hsl(var(--task-reading-speed-bg))] text-[hsl(var(--task-reading-speed-fg))]',
  homework:
    'border-transparent bg-[hsl(var(--task-homework-bg))] text-[hsl(var(--task-homework-fg))]',
}

export function taskKindLabel(kind: TaskKind): string {
  return LABELS[kind]
}

export function taskKindBadgeClass(kind: TaskKind): string {
  return BADGE_CLASSES[kind]
}

export function taskTypeLabel(
  type: 'homework' | 'assessment' | string,
  subtype: TaskSubtype | string | null | undefined,
): string {
  return taskKindLabel(resolveTaskKind(type, subtype))
}

export function taskTypeBadgeClass(
  type: 'homework' | 'assessment' | string,
  subtype: TaskSubtype | string | null | undefined,
): string {
  return taskKindBadgeClass(resolveTaskKind(type, subtype))
}

/** Ordered kinds for colour legends on How-to pages. */
const KIND_DESCRIPTIONS: Record<TaskKind, string> = {
  homework: 'Practice assignments on your class subject',
  diagnostic: 'Baseline check on your class subject — unlocks personalisation',
  formative: 'Ongoing checks for learning on your class subject',
  summative: 'High-stakes exam-like assessment on your class subject',
  mock_exam: 'Timed mock exam — contributes to exam readiness score',
  english_level: 'General English proficiency (CEFR) — not tied to class subject',
  reading_speed: 'Reading fluency and comprehension — not tied to class subject',
}

/** Grouped for legends: subject-linked vs literacy skills. */
export const TASK_KIND_GROUPS: Array<{
  title: string
  note: string
  kinds: TaskKind[]
}> = [
  {
    title: 'Class subject',
    note: 'Homework and these assessments cover the class subject (or the subject you pick when creating the task).',
    kinds: ['homework', 'diagnostic', 'formative', 'mock_exam'],
  },
  {
    title: 'English & literacy',
    note: 'These measure general English level and reading skills — not Biology, History, or your class topic.',
    kinds: ['english_level', 'reading_speed'],
  },
]

export const TASK_KIND_LEGEND: Array<{ kind: TaskKind; description: string }> =
  TASK_KIND_GROUPS.flatMap((g) =>
    g.kinds.map((kind) => ({ kind, description: KIND_DESCRIPTIONS[kind] })),
  )
