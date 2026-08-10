import { describe, expect, it } from 'vitest'
import {
  calculateLevel,
  scoreResponse,
  selectItems,
  totalScore,
} from './test-engine'
import { ITEMS, type DictationItem, type McqItem, type WrittenItem } from './items'

function firstMcq(level: string) {
  return ITEMS.find((i) => i.type === 'mcq' && i.level === level) as McqItem
}

function firstCloze(level: string) {
  return ITEMS.find((i) => i.type === 'cloze' && i.level === level) as McqItem
}

function firstDictation(level: string) {
  return ITEMS.find((i) => i.type === 'dictation' && i.level === level) as DictationItem
}

function firstWritten(level: string) {
  return ITEMS.find((i) => i.type === 'written' && i.level === level) as WrittenItem
}

describe('scoreResponse', () => {
  it('marks MCQ/reading/listening correct when response matches', () => {
    const item = firstMcq('A1')
    expect(scoreResponse(item, item.correct).score).toBe(item.maxScore)
    expect(scoreResponse(item, 'wrong answer').score).toBe(0)
  })

  it('marks cloze correct when response matches', () => {
    const item = firstCloze('A1')
    expect(scoreResponse(item, item.correct).score).toBe(item.maxScore)
    expect(scoreResponse(item, 'wrong').score).toBe(0)
  })

  it('scores dictation by word accuracy', () => {
    const item = firstDictation('A1')
    const full = scoreResponse(item, item.transcript)
    expect(full.score).toBe(item.maxScore)

    const half = scoreResponse(item, item.transcript.split(' ').slice(0, 3).join(' '))
    expect(half.score).toBeGreaterThan(0)
    expect(half.score).toBeLessThan(item.maxScore)

    const empty = scoreResponse(item, '')
    expect(empty.score).toBe(0)
  })

  it('scores written answers by keyword matches capped at maxScore', () => {
    const item = firstWritten('A1')
    const allKeywords = item.keywords.join(' ')
    const full = scoreResponse(item, allKeywords)
    expect(full.score).toBe(item.maxScore)

    const partial = scoreResponse(item, item.keywords[0])
    expect(partial.score).toBeGreaterThan(0)
    expect(partial.score).toBeLessThan(item.maxScore)

    const empty = scoreResponse(item, '')
    expect(empty.score).toBe(0)
  })
})

describe('calculateLevel', () => {
  it('returns A1 when no responses are provided', () => {
    expect(calculateLevel([])).toBe('A1')
  })

  it('progresses level only when current and all lower levels reach 80%', () => {
    const responses = [
      { itemId: 'a', itemLevel: 'A1', itemSkill: 'vocabulary', itemType: 'mcq', response: '', score: 8, maxScore: 10 },
      { itemId: 'b', itemLevel: 'A2', itemSkill: 'vocabulary', itemType: 'mcq', response: '', score: 8, maxScore: 10 },
      { itemId: 'c', itemLevel: 'B1', itemSkill: 'vocabulary', itemType: 'mcq', response: '', score: 7, maxScore: 10 },
    ] as const
    expect(calculateLevel(responses as never)).toBe('A2')
  })

  it('breaks at the first level that fails the 80% threshold', () => {
    const responses = [
      { itemId: 'a', itemLevel: 'A1', itemSkill: 'vocabulary', itemType: 'mcq', response: '', score: 10, maxScore: 10 },
      { itemId: 'b', itemLevel: 'A2', itemSkill: 'vocabulary', itemType: 'mcq', response: '', score: 10, maxScore: 10 },
      { itemId: 'c', itemLevel: 'B1', itemSkill: 'vocabulary', itemType: 'mcq', response: '', score: 0, maxScore: 10 },
      { itemId: 'd', itemLevel: 'B2', itemSkill: 'vocabulary', itemType: 'mcq', response: '', score: 10, maxScore: 10 },
    ] as const
    expect(calculateLevel(responses as never)).toBe('A2')
  })
})

describe('selectItems', () => {
  it('builds a 72-item diagnostic form with equal items per level', () => {
    const items = selectItems()
    expect(items).toHaveLength(72)
    for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
      const levelItems = items.filter((i) => i.level === level)
      expect(levelItems).toHaveLength(12)
      expect(levelItems.some((i) => i.skill === 'grammar')).toBe(true)
      expect(levelItems.some((i) => i.skill === 'writing')).toBe(true)
    }
  })

  it('rotates item picks across parallel forms', () => {
    const base = selectItems({ formIndex: 0 })
    const rotated = selectItems({ formIndex: 1 })
    expect(rotated).toHaveLength(base.length)
    expect(rotated.map((i) => i.id)).not.toEqual(base.map((i) => i.id))
  })

  it('uses the interest seed to vary writing prompts', () => {
    const seeds = ['sports', 'music', 'travel', 'food', 'science']
    const sets = seeds.map((seed) =>
      selectItems({ formIndex: 0, interestSeed: seed })
        .filter((i) => i.type === 'written')
        .map((i) => i.id)
        .join(','),
    )
    const unique = new Set(sets)
    expect(unique.size).toBeGreaterThan(1)
  })
})

describe('totalScore', () => {
  it('sums scores and max scores', () => {
    const responses = [
      { itemId: 'a', itemLevel: 'A1', itemSkill: 'vocabulary', itemType: 'mcq', response: '', score: 1, maxScore: 1 },
      { itemId: 'b', itemLevel: 'A1', itemSkill: 'vocabulary', itemType: 'mcq', response: '', score: 0, maxScore: 3 },
    ] as const
    expect(totalScore(responses as never)).toEqual({ score: 1, max: 4 })
  })
})
