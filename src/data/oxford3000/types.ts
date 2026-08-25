/**
 * The Oxford 3000™ word list (A1–B2) with Chinese glosses, extracted from the
 * official "Oxford 3000 by CEFR level" PDF and translated with the open-source
 * ECDICT (stardict) dictionary. Powers the free public flashcards tool.
 *
 * Entries are ordered exactly as in the source PDF: by level (A1→B2), then
 * alphabetically. `ph` is the IPA phonetic (British) where available.
 */
export interface OxfordWord {
  /** Headword, e.g. "about" or "light (from the sun/a lamp)" */
  w: string
  /** Part of speech as printed in the list, e.g. "prep., adv." */
  pos: string
  /** CEFR level */
  lv: 'A1' | 'A2' | 'B1' | 'B2'
  /** Chinese gloss (simplified) */
  zh: string
  /** IPA phonetic transcription, may be empty */
  ph: string
}
