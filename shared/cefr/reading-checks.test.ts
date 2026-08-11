import { describe, expect, it } from 'vitest'
import {
  buildSpotChecks,
  computeWpm,
  contentWords,
  scoreSpotChecks,
  SPOT_CHECK_COUNT,
  SPOT_CHECK_PASS,
  wpmBoundError,
} from './reading-checks'

const PASSAGE =
  "Last Saturday, I went to the beach with my friends. We took the bus at nine o'clock. " +
  'The weather was sunny and hot. We swam in the sea and played volleyball on the sand. ' +
  'In the evening, we ate pizza in a small restaurant near the beach. We were very tired, ' +
  'but we had a great day.'

describe('buildSpotChecks', () => {
  it('is deterministic for a given seed and differs across seeds', () => {
    const a = buildSpotChecks(PASSAGE, 42)
    const b = buildSpotChecks(PASSAGE, 42)
    const c = buildSpotChecks(PASSAGE, 7)
    expect(a).toEqual(b)
    expect(a.map((x) => x.answer)).not.toEqual(c.map((x) => x.answer))
  })

  it('builds 3 four-option checks whose answers appear in the passage', () => {
    const checks = buildSpotChecks(PASSAGE, 1)
    expect(checks.length).toBe(SPOT_CHECK_COUNT)
    const passageWords = new Set(contentWords(PASSAGE).map((w) => w.toLowerCase()))
    for (const ch of checks) {
      expect(ch.options.length).toBe(4)
      expect(new Set(ch.options.map((o) => o.toLowerCase())).size).toBe(4)
      expect(ch.options).toContain(ch.answer)
      expect(passageWords.has(ch.answer.toLowerCase())).toBe(true)
    }
  })

  it('distractors never come from the passage (honest readers can answer)', () => {
    const passageWords = new Set(contentWords(PASSAGE).map((w) => w.toLowerCase()))
    for (let seed = 1; seed <= 50; seed++) {
      for (const ch of buildSpotChecks(PASSAGE, seed)) {
        for (const opt of ch.options) {
          if (opt === ch.answer) continue
          expect(
            passageWords.has(opt.toLowerCase()),
            `seed ${seed}: distractor "${opt}" appears in the passage`,
          ).toBe(false)
        }
      }
    }
  })

  it('handles very short passages with the fallback pool', () => {
    const checks = buildSpotChecks('Tiny cat sat.', 3)
    expect(checks.length).toBe(SPOT_CHECK_COUNT)
    for (const ch of checks) expect(ch.options.length).toBe(4)
  })
})

describe('scoreSpotChecks', () => {
  it('passes at >= 2/3 correct, case-insensitively', () => {
    const checks = buildSpotChecks(PASSAGE, 9)
    const allRight = Object.fromEntries(checks.map((c) => [c.id, c.answer.toUpperCase()]))
    expect(scoreSpotChecks(checks, allRight)).toEqual({ correct: 3, total: 3, passed: true })

    const oneRight = { [checks[0]!.id]: checks[0]!.answer }
    const twoRight = {
      [checks[0]!.id]: checks[0]!.answer,
      [checks[1]!.id]: checks[1]!.answer,
    }
    expect(SPOT_CHECK_PASS).toBe(2)
    expect(scoreSpotChecks(checks, oneRight).passed).toBe(false)
    expect(scoreSpotChecks(checks, twoRight).passed).toBe(true)
  })
})

describe('computeWpm / wpmBoundError', () => {
  it('computes rounded wpm with a 1-second floor', () => {
    expect(computeWpm(100, 60)).toBe(100)
    expect(computeWpm(100, 0)).toBe(6000) // clamped to 1s, not Infinity
    expect(computeWpm(45, 10)).toBe(270)
  })

  it('rejects wpm outside 80..500 and accepts within', () => {
    expect(wpmBoundError(501)).toMatch(/fast/)
    expect(wpmBoundError(79)).toMatch(/slow/)
    expect(wpmBoundError(80)).toBeNull()
    expect(wpmBoundError(500)).toBeNull()
    expect(wpmBoundError(250)).toBeNull()
  })
})
