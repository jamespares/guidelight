/** Pure helpers for RSVP reading machine and reading word counts. */

export interface RsvpWord {
  text: string;
  idx: number;
}

/**
 * Strip light markdown noise and split into word tokens for RSVP / WPM.
 * Keeps punctuation attached to words (e.g. "Hello,").
 */
export function tokenizeText(body: string): RsvpWord[] {
  const cleaned = body
    .replace(/\r\n/g, '\n')
    // ATX headings / emphasis markers — keep the words
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();

  const words: RsvpWord[] = [];
  let idx = 0;
  for (const chunk of cleaned.split(/(\s+)/)) {
    if (!chunk || /^\s+$/.test(chunk)) continue;
    if (!/[A-Za-z0-9\u00C0-\u024F]/.test(chunk)) continue;
    words.push({ text: chunk, idx: idx++ });
  }
  return words;
}

/** Word count for speed-test scoring (same tokenisation as RSVP). */
export function countWords(body: string): number {
  return tokenizeText(body).length;
}

/** Milliseconds to display each word at the given words-per-minute. */
export function wpmToMsPerWord(wpm: number): number {
  const safe = Math.max(60, Math.min(1000, Math.round(wpm)));
  return Math.round(60000 / safe);
}

/** Clamp WPM into the reading-machine control range. */
export function clampWpm(wpm: number, min = 150, max = 600): number {
  if (!Number.isFinite(wpm)) return 250;
  return Math.max(min, Math.min(max, Math.round(wpm)));
}
