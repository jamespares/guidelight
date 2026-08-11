import { describe, expect, it } from 'vitest'
import { clampWpm, countWords, tokenizeText, wpmToMsPerWord } from './rsvp'

describe('tokenizeText / countWords', () => {
  it('splits on whitespace and keeps punctuation attached', () => {
    const words = tokenizeText('Hello, world! How are you?')
    expect(words.map((w) => w.text)).toEqual(['Hello,', 'world!', 'How', 'are', 'you?'])
    expect(words.map((w) => w.idx)).toEqual([0, 1, 2, 3, 4])
  })

  it('strips markdown headings, emphasis and links but keeps the words', () => {
    expect(countWords('## Title here')).toBe(2)
    expect(countWords('some *bold* and _italic_ `code`')).toBe(5)
    expect(countWords('a [link text](https://example.com) here')).toBe(4)
  })

  it('drops punctuation-only tokens and keeps accented latin words', () => {
    expect(tokenizeText('wait — what … really').map((w) => w.text)).toEqual([
      'wait',
      'what',
      'really',
    ])
    expect(countWords('café naïve über')).toBe(3)
  })

  it('normalises CRLF and counts an empty string as zero', () => {
    expect(countWords('one\r\ntwo\r\nthree')).toBe(3)
    expect(countWords('')).toBe(0)
    expect(countWords('   \n  ')).toBe(0)
  })
})

describe('wpmToMsPerWord / clampWpm', () => {
  it('converts wpm to ms per word', () => {
    expect(wpmToMsPerWord(60)).toBe(1000)
    expect(wpmToMsPerWord(120)).toBe(500)
    expect(wpmToMsPerWord(300)).toBe(200)
  })

  it('clamps to the 60..1000 wpm engine range', () => {
    expect(wpmToMsPerWord(10)).toBe(1000) // treated as 60 wpm
    expect(wpmToMsPerWord(5000)).toBe(60) // treated as 1000 wpm
  })

  it('clamps to the 150..600 UI range and defaults junk to 250', () => {
    expect(clampWpm(50)).toBe(150)
    expect(clampWpm(9999)).toBe(600)
    expect(clampWpm(275)).toBe(275)
    expect(clampWpm(Number.NaN)).toBe(250)
  })
})
