import { WORDS_A1 } from './A1'
import { WORDS_A2 } from './A2'
import { WORDS_B1 } from './B1'
import { WORDS_B2 } from './B2'
import type { OxfordWord, RawWord } from './types'

export type { OxfordWord } from './types'

// Split per level: a single 3,300-element literal trips TS2590 (union type too
// complex); ~850-element literals stay well under the limit. Entries are stored
// as compact tuples to keep the bundle small; expand to OxfordWord here.
function expand(lv: OxfordWord['lv'], raw: RawWord[]): OxfordWord[] {
  return raw.map(([w, pos, zh, ph]) => ({ w, pos, lv, zh, ph: ph ?? '' }))
}

export const OXFORD_3000: OxfordWord[] = [
  ...expand('A1', WORDS_A1),
  ...expand('A2', WORDS_A2),
  ...expand('B1', WORDS_B1),
  ...expand('B2', WORDS_B2),
]
