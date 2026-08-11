/** Spot-checks and WPM bounds for reading-speed integrity. */

import { tokenizeText } from './rsvp';

export const MIN_WPM = 80;
export const MAX_WPM = 500;
export const SPOT_CHECK_COUNT = 3;
export const SPOT_CHECK_PASS = 2;

export interface SpotCheck {
  id: string;
  prompt: string;
  options: string[];
  answer: string;
}

/** Simple deterministic PRNG for stable checks per assignment. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Distractor pool for spot-checks: common concrete English words. Distractors
 * must NOT come from the passage itself — otherwise every option "appeared in
 * the passage" and honest readers can only guess (they failed ~86% of the
 * time before this fix). Any pool words that do occur in the passage are
 * filtered out per task.
 */
const DISTRACTOR_POOL = [
  'apple', 'bicycle', 'blanket', 'bottle', 'bridge', 'camera', 'candle', 'carpet',
  'castle', 'church', 'cloud', 'coffee', 'doctor', 'dollar', 'engine', 'farmer',
  'forest', 'garden', 'hammer', 'island', 'jacket', 'kitchen', 'ladder', 'letter',
  'market', 'mirror', 'monkey', 'mountain', 'pencil', 'pocket', 'rabbit', 'river',
  'rocket', 'school', 'shadow', 'silver', 'spider', 'station', 'teacher', 'window',
];

function normalizeWord(w: string): string {
  return w.replace(/^[^A-Za-z0-9\u00C0-\u024F]+|[^A-Za-z0-9\u00C0-\u024F]+$/g, '');
}

/** Content words of length ≥ 4 for spot-checks. */
export function contentWords(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of tokenizeText(body)) {
    const n = normalizeWord(tok.text);
    if (n.length < 4) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/**
 * Build 3 MCQ spot-checks from start / middle / end of the passage.
 * Seed should be the assignment id so options are stable for that task.
 */
export function buildSpotChecks(body: string, seed: number): SpotCheck[] {
  const words = contentWords(body);
  if (words.length < 4) {
    // Fallback: use any tokens
    const all = tokenizeText(body).map((w) => normalizeWord(w.text)).filter((w) => w.length >= 2);
    const uniq = [...new Set(all.map((w) => w.toLowerCase()))].map(
      (k) => all.find((w) => w.toLowerCase() === k)!
    );
    return buildFromPool(uniq.length >= 4 ? uniq : ['the', 'and', 'for', 'with', ...uniq], seed);
  }
  return buildFromPool(words, seed);
}

function buildFromPool(words: string[], seed: number): SpotCheck[] {
  const rand = mulberry32(seed || 1);
  const n = words.length;
  const thirds = [
    words.slice(0, Math.max(1, Math.floor(n / 3))),
    words.slice(Math.floor(n / 3), Math.floor((2 * n) / 3)),
    words.slice(Math.floor((2 * n) / 3)),
  ].map((t) => (t.length ? t : words));

  const checks: SpotCheck[] = [];
  const usedAnswers = new Set<string>();
  const passageKeys = new Set(words.map((w) => w.toLowerCase()));

  for (let i = 0; i < SPOT_CHECK_COUNT; i++) {
    const pool = thirds[i] ?? words;
    let answer = pool[Math.floor(rand() * pool.length)]!;
    let guard = 0;
    while (usedAnswers.has(answer.toLowerCase()) && guard++ < 20) {
      answer = pool[Math.floor(rand() * pool.length)]!;
    }
    usedAnswers.add(answer.toLowerCase());

    const distractors: string[] = [];
    const distractPool = DISTRACTOR_POOL.filter(
      (w) => !passageKeys.has(w) && !usedAnswers.has(w),
    );
    while (distractors.length < 3 && distractPool.length > 0) {
      const d = distractPool[Math.floor(rand() * distractPool.length)]!;
      if (!distractors.some((x) => x.toLowerCase() === d.toLowerCase())) {
        distractors.push(d);
      } else {
        // remove to avoid infinite loop on tiny pools
        const idx = distractPool.findIndex((x) => x.toLowerCase() === d.toLowerCase());
        if (idx >= 0) distractPool.splice(idx, 1);
      }
    }
    while (distractors.length < 3) {
      distractors.push(`option${distractors.length + 1}`);
    }

    const options = shuffle([answer, ...distractors.slice(0, 3)], rand);
    checks.push({
      id: `check-${i + 1}`,
      prompt: 'Which of these words appeared in the passage you just read?',
      options,
      answer,
    });
  }
  return checks;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function computeWpm(wordCount: number, durationSeconds: number): number {
  const secs = Math.max(1, durationSeconds);
  return Math.max(1, Math.round(wordCount / (secs / 60)));
}

/** Null if WPM is within bounds; otherwise a student-facing error. */
export function wpmBoundError(wpm: number): string | null {
  if (wpm > MAX_WPM) {
    return `That time looks unrealistically fast (over ${MAX_WPM} wpm). Start again and read at a natural pace.`;
  }
  if (wpm < MIN_WPM) {
    return `That time looks unrealistically slow (under ${MIN_WPM} wpm). Start again when you are ready.`;
  }
  return null;
}

export function scoreSpotChecks(
  checks: SpotCheck[],
  answers: Record<string, string>
): { correct: number; total: number; passed: boolean } {
  let correct = 0;
  for (const ch of checks) {
    const given = (answers[ch.id] ?? '').trim().toLowerCase();
    if (given && given === ch.answer.toLowerCase()) correct += 1;
  }
  return {
    correct,
    total: checks.length,
    passed: correct >= SPOT_CHECK_PASS,
  };
}
