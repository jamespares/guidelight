import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ITEMS,
  PASSAGES,
  type CEFRLevel,
  type ClozeItem,
  type DictationItem,
  type ListeningItem,
  type McqItem,
  type ReadingItem,
  type WrittenItem,
} from './items'
import { WRITING_RUBRICS } from './rubrics'

const LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

type ObjectiveItem = McqItem | ClozeItem | ReadingItem | ListeningItem
type AudioItem = DictationItem | ListeningItem

const isObjective = (i: (typeof ITEMS)[number]): i is ObjectiveItem =>
  i.type === 'mcq' || i.type === 'cloze' || i.type === 'reading' || i.type === 'listening'
const isAudio = (i: (typeof ITEMS)[number]): i is AudioItem =>
  i.type === 'dictation' || i.type === 'listening'

/** Mirrors worker/lib/cefr.ts audioPublicUrl: audioKey 'audio/x.mp3' → public/cefr-audio/x.mp3 */
function audioFileFor(audioKey: string): string {
  return path.join(process.cwd(), 'public', 'cefr-audio', audioKey.replace(/^audio\//, ''))
}

describe('CEFR item bank integrity', () => {
  it('has 24 items per level, 144 total, with unique ids', () => {
    expect(ITEMS.length).toBe(144)
    const ids = new Set(ITEMS.map((i) => i.id))
    expect(ids.size).toBe(ITEMS.length)
    for (const level of LEVELS) {
      expect(ITEMS.filter((i) => i.level === level).length).toBe(24)
    }
  })

  it('has the expected type/skill mix per level', () => {
    for (const level of LEVELS) {
      const at = ITEMS.filter((i) => i.level === level)
      const count = (type: string) => at.filter((i) => i.type === type).length
      expect(count('mcq')).toBe(10) // vocabulary
      expect(count('cloze')).toBe(4) // grammar
      expect(count('reading')).toBe(5)
      expect(count('dictation')).toBe(1)
      expect(count('listening')).toBe(2)
      expect(count('written')).toBe(2)
      for (const item of at) expect(item.maxScore).toBeGreaterThan(0)
    }
  })

  it('every objective item has a programmed correct answer present in its options', () => {
    const objective = ITEMS.filter(isObjective)
    expect(objective.length).toBeGreaterThan(0)
    for (const item of objective) {
      expect(item.prompt.trim().length).toBeGreaterThan(0)
      expect(item.options.length).toBeGreaterThanOrEqual(2)
      expect(new Set(item.options).size).toBe(item.options.length)
      expect(item.options).toContain(item.correct)
    }
  })

  it('reading items reference valid passages and gap markers', () => {
    for (const level of LEVELS) {
      const passageId = `reading-${level}`
      const passage = PASSAGES[passageId]
      expect(passage, `missing passage ${passageId}`).toBeTruthy()
      for (let gap = 1; gap <= 5; gap++) {
        expect(passage).toContain(`__(${gap})__`)
      }
      const items = ITEMS.filter((i): i is ReadingItem => i.type === 'reading' && i.level === level)
      expect(items.length).toBe(5)
      for (const item of items) {
        expect(item.passageId).toBe(passageId)
        expect(item.gapIndex).toBeGreaterThanOrEqual(1)
        expect(item.gapIndex).toBeLessThanOrEqual(5)
      }
      // one item per gap
      expect(new Set(items.map((i) => i.gapIndex)).size).toBe(5)
    }
  })

  it('listening and dictation items carry transcripts for marking and review', () => {
    for (const level of LEVELS) {
      const dictation = ITEMS.find((i) => i.type === 'dictation' && i.level === level)
      expect(dictation, `missing dictation ${level}`).toBeTruthy()
      if (dictation?.type !== 'dictation') throw new Error('unreachable')
      expect(dictation.transcript.trim().length).toBeGreaterThan(0)
      expect(dictation.audioKey).toBe(`audio/dictation-${level}.mp3`)

      const listening = ITEMS.filter((i): i is ListeningItem => i.type === 'listening' && i.level === level)
      expect(listening.length).toBe(2)
      for (const item of listening) {
        expect(item.audioKey).toBe(`audio/listening-${level}.mp3`)
        expect(item.audioText.trim().length).toBeGreaterThan(0)
        expect(item.passageId).toBe(`listening-${level}`)
      }
    }
  })

  it('every audio file referenced by the bank exists in public/cefr-audio', () => {
    const audioKeys = new Set(ITEMS.filter(isAudio).map((i) => i.audioKey))
    expect(audioKeys.size).toBe(12)
    for (const key of audioKeys) {
      expect(existsSync(audioFileFor(key)), `missing audio file for ${key}`).toBe(true)
    }
  })

  it('audio manifest covers exactly the bank audio keys with non-empty scripts', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), 'scripts', 'audio-manifest.json'), 'utf8'),
    ) as Array<{ key: string; text: string; voice: string; rate: string }>
    const bankKeys = new Set(ITEMS.filter(isAudio).map((i) => i.audioKey))
    expect(manifest.length).toBe(bankKeys.size)
    for (const entry of manifest) {
      expect(bankKeys.has(entry.key), `manifest key ${entry.key} not in bank`).toBe(true)
      expect(entry.text.trim().length).toBeGreaterThan(0)
      expect(entry.voice.trim().length).toBeGreaterThan(0)
      expect(existsSync(audioFileFor(entry.key)), `missing audio for ${entry.key}`).toBe(true)
    }
  })

  it('manifest scripts match the transcripts stored in the items', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), 'scripts', 'audio-manifest.json'), 'utf8'),
    ) as Array<{ key: string; text: string }>
    const byKey = new Map(manifest.map((e) => [e.key, e.text.trim()]))
    for (const item of ITEMS) {
      if (item.type === 'dictation') {
        expect(byKey.get(item.audioKey), `dictation ${item.level} manifest text`).toBe(
          item.transcript.trim(),
        )
      }
      if (item.type === 'listening') {
        expect(byKey.get(item.audioKey), `listening ${item.level} manifest text`).toBe(
          item.audioText.trim(),
        )
      }
    }
  })

  it('written items have keywords and every level has a writing rubric for AI marking', () => {
    for (const level of LEVELS) {
      const written = ITEMS.filter((i): i is WrittenItem => i.type === 'written' && i.level === level)
      expect(written.length).toBe(2)
      for (const item of written) {
        expect(item.keywords.length).toBeGreaterThan(0)
      }
      expect(WRITING_RUBRICS[level].trim().length).toBeGreaterThan(0)
    }
  })
})
