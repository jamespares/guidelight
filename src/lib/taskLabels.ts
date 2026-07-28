import type { TaskSubtype } from '@/lib/api'

/** Semantic badge class for task type / assessment subtype (importance → colour). */
export type TaskKind =
  | 'english_level'
  | 'summative'
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
export const TASK_KIND_LEGEND: Array<{ kind: TaskKind; description: string }> = [
  { kind: 'english_level', description: 'Highest-stakes placement assessment' },
  { kind: 'summative', description: 'High-stakes exam-like assessment' },
  { kind: 'diagnostic', description: 'Baseline assessment — unlocks personalisation' },
  { kind: 'formative', description: 'Ongoing checks for learning' },
  { kind: 'reading_speed', description: 'Reading fluency skill metric' },
  { kind: 'homework', description: 'Practice assignments' },
]
