import type { Question, TaskContent } from '../types'

export type AttemptFeedback = Record<
  string,
  {
    correct?: boolean
    feedback?: string
    topic?: string
    learningObjective?: string
    marksAwarded?: number
    marksPossible?: number
  }
>

export function buildAttemptArchiveMd(input: {
  studentName: string
  taskTitle: string
  taskType: string
  subtype: string | null
  subject: string
  submittedAt: string
  scorePct: number | null
  content: TaskContent
  answers: Record<string, unknown>
  feedback: AttemptFeedback
}): string {
  const lines: string[] = [
    '# Attempt archive',
    `- Student: ${input.studentName}`,
    `- Task: ${input.taskTitle}`,
    `- Type: ${input.taskType}`,
    `- Subtype: ${input.subtype ?? 'n/a'}`,
    `- Subject: ${input.subject}`,
    `- Submitted: ${input.submittedAt}`,
    `- Score: ${input.scorePct == null ? 'n/a' : `${input.scorePct}%`}`,
    '',
  ]

  const questions = input.content.questions ?? []
  questions.forEach((q, i) => {
    const fb = input.feedback[q.id] ?? {}
    const answer = input.answers[q.id]
    lines.push(`## Question ${i + 1}`)
    lines.push(`- Topic: ${fb.topic || q.topic || 'n/a'}`)
    lines.push(
      `- Learning objective: ${fb.learningObjective || q.learningObjective || 'n/a'}`,
    )
    lines.push(`- Type: ${q.type}`)
    lines.push(`- Prompt: ${q.prompt}`)
    lines.push(`- Student answer: ${formatAnswer(answer)}`)
    lines.push(`- Correct?: ${fb.correct === true ? 'yes' : fb.correct === false ? 'no' : 'n/a'}`)
    lines.push(
      `- Marks: ${fb.marksAwarded ?? 0}/${fb.marksPossible ?? q.marks ?? 1}`,
    )
    lines.push(`- Feedback: ${fb.feedback || 'n/a'}`)
    lines.push('')
  })

  return lines.join('\n').trim() + '\n'
}

function formatAnswer(answer: unknown): string {
  if (answer == null) return '(blank)'
  if (typeof answer === 'string') return answer || '(blank)'
  try {
    return JSON.stringify(answer)
  } catch {
    return String(answer)
  }
}

/** Truncate archive corpus newest-first to a character budget. */
export function truncateArchives(
  chunks: Array<{ label: string; md: string }>,
  maxChars: number,
): string {
  const parts: string[] = []
  let used = 0
  for (const chunk of chunks) {
    const block = `### ${chunk.label}\n${chunk.md}\n`
    if (used + block.length > maxChars) {
      const remaining = maxChars - used
      if (remaining > 200) {
        parts.push(block.slice(0, remaining) + '\n…[truncated]')
      }
      break
    }
    parts.push(block)
    used += block.length
  }
  return parts.join('\n')
}

export function ensureQuestionObjectives(questions: Question[]): Question[] {
  return questions.map((q) => ({
    ...q,
    topic: q.topic || 'general',
    learningObjective:
      q.learningObjective ||
      `Assess understanding of ${q.topic || 'the subject'} for this question.`,
  }))
}
