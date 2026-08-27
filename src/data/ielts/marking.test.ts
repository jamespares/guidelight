import { LISTENING_TEST_1, type QuestionBlock } from './listeningTest1'
import { bandForScore, markTest, markTextAnswer, normaliseAnswer } from './marking'

function questionNumbers(blocks: QuestionBlock[]): number[] {
  const out: number[] = []
  for (const block of blocks) {
    if (block.type === 'notes') {
      for (const line of block.lines) {
        for (const seg of line.segments) {
          if (typeof seg !== 'string') out.push(seg.q)
        }
      }
    } else if (block.type === 'mcq') {
      for (const item of block.questions) out.push(item.q)
    } else {
      for (const item of block.items) out.push(item.q)
    }
  }
  return out
}

describe('listening test 1 content integrity', () => {
  it('has exactly 40 questions numbered 1–40 with no gaps or duplicates', () => {
    const qs = LISTENING_TEST_1.parts.flatMap((p) => questionNumbers(p.blocks)).sort(
      (a, b) => a - b,
    )
    expect(qs).toEqual(Array.from({ length: 40 }, (_, i) => i + 1))
  })

  it('covers every question with an answer spec and nothing extra', () => {
    const qs = new Set(LISTENING_TEST_1.parts.flatMap((p) => questionNumbers(p.blocks)))
    const specKeys = Object.keys(LISTENING_TEST_1.answers).map(Number)
    expect(specKeys.sort((a, b) => a - b)).toEqual([...qs].sort((a, b) => a - b))
  })

  it('gives each part the question range its blocks actually use', () => {
    for (const part of LISTENING_TEST_1.parts) {
      const qs = questionNumbers(part.blocks)
      expect(Math.min(...qs)).toBe(part.questionRange[0])
      expect(Math.max(...qs)).toBe(part.questionRange[1])
    }
  })

  it('keeps choice answers within the options/bank bounds', () => {
    for (const part of LISTENING_TEST_1.parts) {
      for (const block of part.blocks) {
        if (block.type === 'mcq') {
          for (const item of block.questions) {
            const spec = LISTENING_TEST_1.answers[item.q]
            expect(spec.kind).toBe('choice')
            if (spec.kind === 'choice') {
              expect(spec.correct).toBeGreaterThanOrEqual(0)
              expect(spec.correct).toBeLessThan(item.options.length)
            }
          }
        }
        if (block.type === 'matching') {
          for (const item of block.items) {
            const spec = LISTENING_TEST_1.answers[item.q]
            expect(spec.kind).toBe('choice')
            if (spec.kind === 'choice') {
              expect(spec.correct).toBeGreaterThanOrEqual(0)
              expect(spec.correct).toBeLessThan(block.bank.length)
            }
          }
        }
      }
    }
  })

  it('gives every text answer at least one accepted variant', () => {
    for (const spec of Object.values(LISTENING_TEST_1.answers)) {
      if (spec.kind === 'text') {
        expect(spec.accept.length).toBeGreaterThan(0)
        for (const a of spec.accept) expect(normaliseAnswer(a).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('answer normalisation', () => {
  it('is case-insensitive and whitespace-tolerant', () => {
    expect(markTextAnswer('  MILTON ', ['Milton'])).toBe(true)
    expect(markTextAnswer('nr2  4qp', ['NR2 4QP'])).toBe(true)
  })

  it('strips a leading currency symbol', () => {
    expect(markTextAnswer('£145', ['145'])).toBe(true)
  })

  it('accepts listed variants and rejects wrong spellings', () => {
    expect(markTextAnswer('3rd October', ['3 October', '3rd October'])).toBe(true)
    expect(markTextAnswer('Melton', ['Milton'])).toBe(false)
    expect(markTextAnswer('', ['Milton'])).toBe(false)
  })
})

describe('band conversion', () => {
  it('maps raw scores to the official listening bands', () => {
    expect(bandForScore(40)).toBe(9)
    expect(bandForScore(39)).toBe(9)
    expect(bandForScore(37)).toBe(8.5)
    expect(bandForScore(35)).toBe(8)
    expect(bandForScore(32)).toBe(7.5)
    expect(bandForScore(30)).toBe(7)
    expect(bandForScore(26)).toBe(6.5)
    expect(bandForScore(23)).toBe(6)
    expect(bandForScore(18)).toBe(5.5)
    expect(bandForScore(16)).toBe(5)
    expect(bandForScore(13)).toBe(4.5)
    expect(bandForScore(10)).toBe(4)
    expect(bandForScore(0)).toBe(2)
  })
})

describe('markTest', () => {
  it('awards a perfect score for the answer key itself', () => {
    const perfect: Record<number, string | number> = {}
    for (const [key, spec] of Object.entries(LISTENING_TEST_1.answers)) {
      perfect[Number(key)] = spec.kind === 'choice' ? spec.correct : spec.accept[0]
    }
    const result = markTest(LISTENING_TEST_1.answers, perfect)
    expect(result.raw).toBe(40)
    expect(result.band).toBe(9)
  })

  it('counts blank answers as wrong without crashing', () => {
    const result = markTest(LISTENING_TEST_1.answers, {})
    expect(result.raw).toBe(0)
    expect(result.band).toBe(2)
  })
})
