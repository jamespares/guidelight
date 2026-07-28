/* Karaoke alignment: map story text words onto per-word audio timings so the
   story page can highlight the word (and sentence) being read aloud.
   Ported from support materials/site/player.js as pure, testable functions. */

export interface WordTiming {
  /** Start time in seconds. */
  t: number;
  /** Duration in seconds (unused for sync, kept from the source data). */
  d?: number;
  /** The word as transcribed. */
  w: string;
}

export interface StoryWord {
  /** The word exactly as printed (punctuation included). */
  text: string;
  /** Global word index across the whole story (title first). */
  idx: number;
  /** Sentence index this word belongs to (title counts as its own). */
  sent: number;
}

export interface StoryBlock {
  kind: 'title' | 'paragraph';
  words: StoryWord[];
}

export interface Cue {
  /** Start time in seconds. */
  t: number;
  /** Index into the story's word spans. */
  span: number;
}

/** Normalise a printed/transcribed word for comparison. */
export function normToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/^["'(\[]+/, '')
    .replace(/["')\].,!?;:]+$/, '');
}

const SENTENCE_END = /[.!?]["'”’)]*$/;

/**
 * Split the story into word tokens for rendering as spans.
 * The title comes first (the narration reads it); it counts as its own
 * sentence even without a terminating full stop.
 */
export function splitStoryWords(title: string, paragraphs: string[]): StoryBlock[] {
  const blocks: StoryBlock[] = [];
  let idx = 0;
  let sent = 0;

  const addBlock = (kind: StoryBlock['kind'], text: string): void => {
    const words: StoryWord[] = [];
    for (const chunk of text.split(/(\s+)/)) {
      if (!chunk || /^\s+$/.test(chunk) || !/[A-Za-z0-9]/.test(chunk)) continue;
      words.push({ text: chunk, idx: idx++, sent });
      if (SENTENCE_END.test(chunk)) sent++;
    }
    if (words.length) blocks.push({ kind, words });
  };

  addBlock('title', title);
  // The title counts as a complete sentence even without .!? at the end.
  const titleWords = blocks[0]?.kind === 'title' ? blocks[0].words : [];
  if (titleWords.length && !SENTENCE_END.test(titleWords[titleWords.length - 1].text)) sent++;
  for (const para of paragraphs) addBlock('paragraph', para);
  return blocks;
}

/**
 * Map text tokens to timing entries (two-pointer, tolerant of small
 * mismatches). Returns span index -> timing index, plus the fraction of
 * timing words that matched. Below ~0.85 the sync should be disabled.
 */
export function align(
  spanTokens: string[],
  timingWords: string[]
): { map: number[]; ratio: number } {
  const map = new Array<number>(spanTokens.length).fill(-1);
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < spanTokens.length && j < timingWords.length) {
    if (spanTokens[i] === timingWords[j]) {
      map[i] = j;
      matched++;
      i++;
      j++;
    } else if (j + 1 < timingWords.length && spanTokens[i] === timingWords[j + 1]) {
      map[i] = j + 1;
      matched++;
      i++;
      j += 2;
    } else {
      i++;
    }
  }
  const ratio = timingWords.length ? matched / timingWords.length : 0;
  return { map, ratio };
}

/** Build time-ordered cue points (span index -> start time) from an alignment map. */
export function buildCues(map: number[], timings: WordTiming[]): Cue[] {
  const cues: Cue[] = [];
  map.forEach((timingIdx, spanIdx) => {
    if (timingIdx >= 0) cues.push({ t: timings[timingIdx].t, span: spanIdx });
  });
  cues.sort((a, b) => a.t - b.t);
  return cues;
}

/** Minimum alignment quality required to enable the live highlight. */
export const SYNC_MIN_RATIO = 0.85;

/**
 * Full pipeline for one story: word blocks for rendering + cue points for
 * the player. Returns cues: null when the audio/text match is too poor.
 */
export function prepareKaraoke(
  title: string,
  paragraphs: string[],
  timings: WordTiming[]
): { blocks: StoryBlock[]; cues: Cue[] | null } {
  const blocks = splitStoryWords(title, paragraphs);
  const spanTokens = blocks.flatMap((b) => b.words.map((w) => normToken(w.text)));
  const timingTokens = timings.map((t) => normToken(t.w));
  const { map, ratio } = align(spanTokens, timingTokens);
  if (ratio < SYNC_MIN_RATIO) return { blocks, cues: null };
  return { blocks, cues: buildCues(map, timings) };
}
