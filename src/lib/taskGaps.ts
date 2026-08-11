import type { TaskContent } from './api'

export interface TaskGap {
  questionId?: string
  message: string
}

function answerText(q: { correctAnswer?: string | string[] }): string {
  const a = q.correctAnswer
  return (Array.isArray(a) ? a.join(' ') : (a ?? '')).trim()
}

/**
 * Marking gaps the teacher should fill before publishing: objective questions
 * without a programmed answer, open questions without a model answer, and
 * essay tasks without a marking rubric. The AI marker anchors on these — a
 * task without them can't be marked the way the landing page describes.
 */
export function findTaskGaps(content: TaskContent, opts: { rubricText?: string | null } = {}): TaskGap[] {
  const gaps: TaskGap[] = []
  const questions = content.questions ?? []

  questions.forEach((q, i) => {
    const where = `Q${i + 1} (${q.type.replace('_', ' ')})`
    switch (q.type) {
      case 'mcq':
      case 'bloom': {
        if (!q.options || q.options.filter((o) => o.trim()).length < 2) {
          gaps.push({ questionId: q.id, message: `${where}: fewer than two options` })
        }
        const ans = answerText(q)
        if (!ans) {
          gaps.push({ questionId: q.id, message: `${where}: no correct answer set` })
        } else if (q.options?.length && !q.options.includes(ans)) {
          gaps.push({ questionId: q.id, message: `${where}: correct answer is not one of the options` })
        }
        break
      }
      case 'cloze': {
        const blanks = (q.blanks ?? []).filter((b) => b.trim())
        if (blanks.length === 0 && !answerText(q)) {
          gaps.push({ questionId: q.id, message: `${where}: no answers set for the gap(s)` })
        }
        break
      }
      case 'listen_respond': {
        if (!q.audioScript?.trim()) {
          gaps.push({ questionId: q.id, message: `${where}: no listening script (transcript) set` })
        }
        if (!answerText(q)) {
          gaps.push({ questionId: q.id, message: `${where}: no expected answer set` })
        }
        break
      }
      default: {
        // Open types (short_written, extended_written, reading_comprehension,
        // image_analysis, frayer): a model answer anchors the AI marker.
        if (!answerText(q)) {
          gaps.push({ questionId: q.id, message: `${where}: no model answer set` })
        }
      }
    }
  })

  // Essay task = a single extended_written question (mirrors the worker's
  // model-essay rule). Without a rubric the marker has nothing to grade against.
  const isEssay = questions.length === 1 && questions[0]?.type === 'extended_written'
  if (isEssay && !(opts.rubricText ?? '').trim()) {
    gaps.push({ message: 'Essay task: no marking rubric — add one so marking matches the exam board' })
  }

  return gaps
}
