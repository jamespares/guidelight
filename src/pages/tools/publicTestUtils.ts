import { countWords } from '@shared/cefr/rsvp'

/**
 * Shared helpers for the free public tests (no login required):
 * the reading-speed passage, word counts and the plain-text result reports
 * students copy and send to their teacher.
 */

export const PUBLIC_READING_SEED = 20260925

/**
 * Fixed passage for the public reading-speed test (~400 words, B1-ish).
 * A single well-known passage keeps results comparable across a class.
 */
export const PUBLIC_READING_PASSAGE = `The library at the end of our street opens at eight o'clock every morning, and for as long as I can remember, the same man has been waiting outside when it does. He is not homeless, and he is not waiting for a job. He is simply, as he once told my mother, "a person who likes to be early for the things he loves."

His name is Mr Alvarez, and he reads newspapers. Not on a phone or a tablet, but real newspapers, folded into quarters, the ink coming off faintly on his fingers. He reads three every morning: one from this country, one from Spain, where he was born, and one from Argentina, where his daughter lives with her family. He reads them slowly, page by page, and he finishes just before ten, when the primary school next door lets out its youngest class for break and the noise of the playground spills over the wall.

Last winter, during the coldest week anyone could remember, the library heating broke down. The librarians apologised and said they would have to close for three days. Mr Alvarez stood in the doorway for a moment, stamped the snow from his boots, and asked if he could read anyway. "The newspapers," he said, "do not mind the cold." So they let him in, and he sat by the window in his coat and gloves, turning the pages with the tips of his fingers, breath rising in small clouds above the international news.

The story might have ended there, a small odd moment in a cold week, except that a girl from the school next door wrote about it. Her teacher had asked the class to write about "someone who never gives up", and she wrote four paragraphs about the old man who would not let broken heating come between him and the news. Her teacher put the piece on the classroom wall, where a parent photographed it and shared it online.

Within a week, the heating was fixed — not by the city, which had said the part would take a month to arrive, but by a heating engineer whose own grandfather had read newspapers in the same library thirty years earlier. He drove across town on his day off and refused to send a bill. "Some things should stay warm," he said.

Mr Alvarez still arrives at eight. He still reads three newspapers, and he still finishes just before the playground fills with noise. The only difference is that now, when he looks up from the sports pages, the librarians bring him coffee, and sometimes one of the children from next door waves at him through the window, and he waves back, folding the paper carefully, as if the news could wait a moment after all.`

export const PUBLIC_READING_WORD_COUNT = countWords(PUBLIC_READING_PASSAGE)

export interface LevelBreakdownRow {
  level: string
  score: number
  max: number
}

/** Plain-text English level report — students paste this into a message to their teacher. */
export function buildEnglishLevelReport(args: {
  name: string
  date: string
  level: string
  score: number
  max: number
  ieltsBand: string
  perLevel: LevelBreakdownRow[]
}): string {
  const lines = [
    'Guidelight — Free English Level Test (CEFR) — Report',
    `Name: ${args.name || '(not given)'}`,
    `Date: ${args.date}`,
    `Indicative CEFR level: ${args.level}`,
    `Score: ${args.score}/${args.max}`,
    `Indicative IELTS band: ${args.ieltsBand}`,
    '',
    'Level breakdown:',
    ...args.perLevel.map(
      (r) =>
        `  ${r.level}: ${r.score}/${r.max}${r.max > 0 ? ` (${Math.round((100 * r.score) / r.max)}%)` : ''}`,
    ),
    '',
    'Written answers were marked by automatic key-point matching, so the level is indicative only.',
    'Test: https://getguidelight.com/english-level-test',
  ]
  return lines.join('\n')
}

/** Plain-text reading speed report — students paste this into a message to their teacher. */
export function buildReadingSpeedReport(args: {
  name: string
  date: string
  wpm: number
  wordCount: number
  durationSeconds: number
  checksCorrect: number
  checksTotal: number
}): string {
  const minutes = Math.floor(args.durationSeconds / 60)
  const seconds = args.durationSeconds % 60
  const time =
    minutes > 0 ? `${minutes} min ${seconds} sec` : `${args.durationSeconds} sec`
  const lines = [
    'Guidelight — Free Reading Speed Test — Report',
    `Name: ${args.name || '(not given)'}`,
    `Date: ${args.date}`,
    `Reading speed: ${args.wpm} wpm`,
    `Time: ${time} (${args.wordCount} words)`,
    `Comprehension spot-checks: ${args.checksCorrect}/${args.checksTotal}`,
    '',
    'Test: https://getguidelight.com/reading-speed-test',
  ]
  return lines.join('\n')
}

/** Format today's date for reports (e.g. "25 Sep 2026"). */
export function reportDate(now = new Date()): string {
  return now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Copy text to the clipboard, falling back to a hidden textarea on older browsers. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}
