// Generated from "The Oxford 3000™ by CEFR level" (Oxford University Press).
// English headwords + parts of speech are (c) Oxford University Press;
// Oxford 3000 is a trademark of Oxford University Press.
// Chinese glosses written for Guidelight flashcards. Do not edit by hand.
// Entry order matches the printed list — that order is the word numbering
// shown to students. Raw per-level lists live in ./oxford3000-a1 .. b2.

import { A1_RAW } from './oxford3000-a1'
import { A2_RAW } from './oxford3000-a2'
import { B1_RAW } from './oxford3000-b1'
import { B2_RAW } from './oxford3000-b2'

export type FlashcardLevel = 'A1' | 'A2' | 'B1' | 'B2'

export interface FlashcardEntry {
  /** Headword as printed in the Oxford 3000 list (qualifier kept, e.g. "bank (money)"). */
  w: string
  /** Part-of-speech label as printed, e.g. "n.", "v., n.", "modal v.". */
  pos: string
  /** Simplified Chinese gloss (concise, POS-matched). */
  zh: string
}

function parseLevel(raw: string): FlashcardEntry[] {
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [w, pos, zh] = line.split('\t')
      return { w, pos, zh }
    })
}

export const FLASHCARD_LEVELS: FlashcardLevel[] = ['A1', 'A2', 'B1', 'B2']

export const OXFORD_3000: Record<FlashcardLevel, FlashcardEntry[]> = {
  A1: parseLevel(A1_RAW),
  A2: parseLevel(A2_RAW),
  B1: parseLevel(B1_RAW),
  B2: parseLevel(B2_RAW),
}
