// Generated from "The Oxford 3000™ by CEFR level" (Oxford University Press).
// English headwords + parts of speech are (c) Oxford University Press;
// Oxford 3000 is a trademark of Oxford University Press.
// Chinese glosses written for Guidelight flashcards. Do not edit by hand —
// regenerate via the flashcard data pipeline if the list changes.

export type FlashcardLevel = 'A1' | 'A2' | 'B1' | 'B2'

export interface FlashcardEntry {
  /** Headword as printed in the Oxford 3000 list (qualifier kept, e.g. "bank (money)"). */
  w: string
  /** Part-of-speech label as printed, e.g. "n.", "v., n.", "modal v.". */
  pos: string
  /** Simplified Chinese gloss (concise, POS-matched). */
  zh: string
}

export const FLASHCARD_LEVELS: FlashcardLevel[] = ['A1', 'A2', 'B1', 'B2']

export const OXFORD_3000: Record<FlashcardLevel, FlashcardEntry[]> = {