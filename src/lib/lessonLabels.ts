import type { LessonActivityStyle } from '@/lib/api'

/** Teacher-facing labels — storage keys stay traditional | communicative. */
const ACTIVITY_STYLE_LABELS: Record<LessonActivityStyle, string> = {
  traditional: 'Quiet work',
  communicative: 'Interactive',
}

const ACTIVITY_STYLE_HINTS: Record<LessonActivityStyle, string> = {
  traditional: 'Input, then independent practice (good marking time)',
  communicative: 'Roleplay, debate, or career task (you facilitate)',
}

export function activityStyleLabel(
  style: LessonActivityStyle | string | null | undefined,
): string {
  if (style === 'communicative') return ACTIVITY_STYLE_LABELS.communicative
  return ACTIVITY_STYLE_LABELS.traditional
}

export function activityStyleHint(
  style: LessonActivityStyle | string | null | undefined,
): string {
  if (style === 'communicative') return ACTIVITY_STYLE_HINTS.communicative
  return ACTIVITY_STYLE_HINTS.traditional
}

export const ACTIVITY_STYLE_OPTIONS: Array<{
  value: LessonActivityStyle
  label: string
  hint: string
}> = [
  {
    value: 'traditional',
    label: ACTIVITY_STYLE_LABELS.traditional,
    hint: ACTIVITY_STYLE_HINTS.traditional,
  },
  {
    value: 'communicative',
    label: ACTIVITY_STYLE_LABELS.communicative,
    hint: ACTIVITY_STYLE_HINTS.communicative,
  },
]
