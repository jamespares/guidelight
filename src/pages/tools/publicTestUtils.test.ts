import {
  buildEnglishLevelReport,
  buildReadingSpeedReport,
  PUBLIC_READING_PASSAGE,
  PUBLIC_READING_WORD_COUNT,
  reportDate,
} from './publicTestUtils'
import { buildSpotChecks, MAX_WPM, MIN_WPM, scoreSpotChecks } from '@shared/cefr/reading-checks'

describe('public reading passage', () => {
  it('is long enough for a meaningful WPM measurement', () => {
    expect(PUBLIC_READING_WORD_COUNT).toBeGreaterThanOrEqual(300)
    expect(PUBLIC_READING_WORD_COUNT).toBeLessThanOrEqual(600)
    // Stays close to a naive whitespace split (only standalone punctuation differs)
    const naive = PUBLIC_READING_PASSAGE.split(/\s+/).filter(Boolean).length
    expect(Math.abs(naive - PUBLIC_READING_WORD_COUNT)).toBeLessThanOrEqual(2)
  })

  it('yields 3 answerable spot-checks', () => {
    const checks = buildSpotChecks(PUBLIC_READING_PASSAGE, 20260925)
    expect(checks).toHaveLength(3)
    for (const ch of checks) {
      expect(ch.options).toContain(ch.answer)
      expect(ch.options.length).toBeGreaterThanOrEqual(3)
    }
    // Full marks passes; no answers fails
    const allRight = Object.fromEntries(checks.map((c) => [c.id, c.answer]))
    expect(scoreSpotChecks(checks, allRight).passed).toBe(true)
    expect(scoreSpotChecks(checks, {}).passed).toBe(false)
  })

  it('keeps a natural reading time inside the WPM bounds', () => {
    // 300 wpm on this passage must be within MIN_WPM..MAX_WPM by construction
    expect(MIN_WPM).toBeLessThan(300)
    expect(MAX_WPM).toBeGreaterThan(300)
  })
})

describe('buildReadingSpeedReport', () => {
  it('includes name, wpm, time and checks', () => {
    const report = buildReadingSpeedReport({
      name: 'Sam Wang',
      date: '25 Sep 2026',
      wpm: 214,
      wordCount: 400,
      durationSeconds: 112,
      checksCorrect: 3,
      checksTotal: 3,
    })
    expect(report).toContain('Sam Wang')
    expect(report).toContain('214 wpm')
    expect(report).toContain('1 min 52 sec')
    expect(report).toContain('3/3')
    expect(report).toContain('reading-speed-test')
  })

  it('handles a missing name', () => {
    const report = buildReadingSpeedReport({
      name: '',
      date: '25 Sep 2026',
      wpm: 150,
      wordCount: 400,
      durationSeconds: 45,
      checksCorrect: 2,
      checksTotal: 3,
    })
    expect(report).toContain('(not given)')
    expect(report).toContain('45 sec')
  })
})

describe('buildEnglishLevelReport', () => {
  it('includes level, score, band and per-level breakdown', () => {
    const report = buildEnglishLevelReport({
      name: 'Ava Li',
      date: '25 Sep 2026',
      level: 'B2',
      score: 180,
      max: 240,
      ieltsBand: '5.5–6.5',
      perLevel: [
        { level: 'A1', score: 12, max: 12 },
        { level: 'A2', score: 11, max: 12 },
      ],
    })
    expect(report).toContain('Ava Li')
    expect(report).toContain('CEFR level: B2')
    expect(report).toContain('180/240')
    expect(report).toContain('5.5–6.5')
    expect(report).toContain('A1: 12/12 (100%)')
    expect(report).toContain('A2: 11/12 (92%)')
    expect(report).toContain('english-level-test')
  })
})

describe('reportDate', () => {
  it('formats as an en-GB short date', () => {
    const d = reportDate(new Date('2026-09-25T12:00:00Z'))
    expect(d.startsWith('25 ')).toBe(true)
    expect(d.endsWith(' 2026')).toBe(true)
  })
})
