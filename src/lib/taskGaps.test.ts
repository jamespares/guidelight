import { describe, expect, it } from 'vitest'
import { findTaskGaps } from './taskGaps'
import type { Question, TaskContent } from './api'

function q(patch: Partial<Question>): Question {
  return { id: `q-${Math.random().toString(36).slice(2, 8)}`, type: 'short_written', prompt: 'p', topic: 't', ...patch }
}

function content(questions: Question[]): TaskContent {
  return { title: 'T', instructions: 'I', questions }
}

describe('findTaskGaps', () => {
  it('flags nothing when every question has what its type needs', () => {
    const c = content([
      q({ type: 'mcq', options: ['a', 'b'], correctAnswer: 'a' }),
      q({ type: 'cloze', blanks: ['were'] }),
      q({ type: 'listen_respond', audioScript: 'Listen…', correctAnswer: 'It rains.' }),
      q({ type: 'short_written', correctAnswer: 'model answer' }),
    ])
    expect(findTaskGaps(c)).toEqual([])
  })

  it('flags objective questions with no usable correct answer', () => {
    const c = content([
      q({ type: 'mcq', options: ['a', 'b'] }),
      q({ type: 'mcq', options: ['a', 'b'], correctAnswer: 'zzz not an option' }),
      q({ type: 'mcq', options: [], correctAnswer: 'a' }),
      q({ type: 'cloze' }),
    ])
    const gaps = findTaskGaps(c)
    expect(gaps.length).toBe(4)
    expect(gaps.map((g) => g.message).join('\n')).toMatch(/no correct answer set/)
    expect(gaps.map((g) => g.message).join('\n')).toMatch(/not one of the options/)
    expect(gaps.map((g) => g.message).join('\n')).toMatch(/fewer than two options/)
    expect(gaps.map((g) => g.message).join('\n')).toMatch(/no answers set for the gap/)
  })

  it('flags open questions without a model answer', () => {
    const c = content([q({ type: 'short_written' }), q({ type: 'image_analysis' })])
    const gaps = findTaskGaps(c)
    expect(gaps.length).toBe(2)
    expect(gaps.every((g) => g.message.includes('no model answer set'))).toBe(true)
  })

  it('flags listen_respond without script or expected answer', () => {
    const gaps = findTaskGaps(content([q({ type: 'listen_respond' })]))
    expect(gaps.length).toBe(2)
    expect(gaps.map((g) => g.message).join('\n')).toMatch(/no listening script/)
    expect(gaps.map((g) => g.message).join('\n')).toMatch(/no expected answer/)
  })

  it('flags an essay task with no rubric, and only then', () => {
    const essay = content([q({ type: 'extended_written', correctAnswer: 'model points' })])
    expect(findTaskGaps(essay, { rubricText: '' }).map((g) => g.message).join('\n')).toMatch(
      /no marking rubric/,
    )
    expect(findTaskGaps(essay, { rubricText: 'Band descriptors…' })).toEqual([])
    // not an essay task (two questions) → no rubric gap
    const two = content([q({ type: 'extended_written', correctAnswer: 'x' }), q({ type: 'mcq', options: ['a', 'b'], correctAnswer: 'a' })])
    expect(findTaskGaps(two, { rubricText: '' })).toEqual([])
  })
})
