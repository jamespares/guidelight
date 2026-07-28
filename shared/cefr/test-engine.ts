import { ITEMS, ITEMS_BY_ID, LEVEL_ORDER, type CEFRLevel, type Item } from './items';

export const TEST_TIME_LIMIT_SECONDS = 60 * 60; // 1 hour
export const MASTERY_THRESHOLD = 0.6; // 60% to "pass" a level

export interface TestResponseInput {
  itemId: string;
  response: string;
}

export interface ScoredResponse {
  itemId: string;
  itemLevel: CEFRLevel;
  itemSkill: Item['skill'];
  itemType: Item['type'];
  response: string;
  score: number;
  maxScore: number;
}

export const PARALLEL_FORM_COUNT = 10;

export interface SelectItemsOptions {
  /** Parallel form index 0–9; rotates item picks within each pool when extras exist. */
  formIndex?: number;
  /** From onboarding interests — lightly reorders writing prompts for personalisation. */
  interestSeed?: string;
}

/** Deterministic 32-bit hash for seeded picks. */
function seedHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick `n` items from a sorted pool, rotating start by formIndex (Phase 8 parallel forms). */
function pickRotated<T>(pool: T[], n: number, formIndex: number): T[] {
  if (pool.length === 0 || n <= 0) return [];
  const start = pool.length > n ? formIndex % pool.length : 0;
  const out: T[] = [];
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    out.push(pool[(start + i) % pool.length]);
  }
  return out;
}

/** Items for one CEFR band: vocab → dictation → listening → reading → grammar (A1–B1) → writing. */
function itemsForLevel(
  level: CEFRLevel,
  formIndex: number,
  interestOffset: number,
  byLevelAndSkill: (level: CEFRLevel, skill: Item['skill']) => Item[],
  byLevelAndType: (level: CEFRLevel, type: Item['type']) => Item[]
): Item[] {
  const block: Item[] = [];
  block.push(...pickRotated(byLevelAndSkill(level, 'vocabulary'), 1, formIndex));
  block.push(...pickRotated(byLevelAndType(level, 'dictation'), 1, formIndex));
  block.push(...pickRotated(byLevelAndType(level, 'listening'), 2, formIndex));
  block.push(...pickRotated(byLevelAndSkill(level, 'reading'), 5, formIndex));
  if (level === 'A1' || level === 'A2' || level === 'B1') {
    block.push(...pickRotated(byLevelAndSkill(level, 'grammar'), 2, formIndex));
  }
  block.push(...pickRotated(byLevelAndSkill(level, 'writing'), 1, formIndex + interestOffset));
  return block;
}

/** Build a balanced 66-item diagnostic form from the item bank (~1 hour). */
export function selectItems(opts: SelectItemsOptions = {}): Item[] {
  const formIndex = ((opts.formIndex ?? 0) % PARALLEL_FORM_COUNT + PARALLEL_FORM_COUNT) % PARALLEL_FORM_COUNT;
  const byLevelAndSkill = (level: CEFRLevel, skill: Item['skill']) =>
    ITEMS.filter((i) => i.level === level && i.skill === skill).sort((a, b) => a.id.localeCompare(b.id));
  const byLevelAndType = (level: CEFRLevel, type: Item['type']) =>
    ITEMS.filter((i) => i.level === level && i.type === type).sort((a, b) => a.id.localeCompare(b.id));

  const interestOffset = opts.interestSeed ? seedHash(opts.interestSeed) % PARALLEL_FORM_COUNT : 0;
  const selected: Item[] = [];
  for (const level of LEVEL_ORDER) {
    selected.push(...itemsForLevel(level, formIndex, interestOffset, byLevelAndSkill, byLevelAndType));
  }
  return selected;
}

export function scoreResponse(item: Item, response: string): { score: number; maxScore: number } {
  const maxScore = item.maxScore;
  if (item.type === 'mcq' || item.type === 'cloze' || item.type === 'reading' || item.type === 'listening') {
    return { score: response.trim() === item.correct ? maxScore : 0, maxScore };
  }

  if (item.type === 'dictation') {
    // Word accuracy: fraction of transcript words present in the response
    // (case/punctuation-insensitive, multiset match), scaled to maxScore.
    const expected = wordMultiset(item.transcript);
    if (expected.size === 0) return { score: 0, maxScore };
    const actual = wordMultiset(response);
    let matched = 0;
    for (const [word, count] of expected) {
      matched += Math.min(count, actual.get(word) ?? 0);
    }
    let total = 0;
    for (const count of expected.values()) total += count;
    return { score: Math.round((matched / total) * maxScore), maxScore };
  }

  // Written: one point per matched keyword, capped at maxScore.
  const text = response.toLowerCase();
  const matched = item.keywords.filter((kw) => {
    const lower = kw.toLowerCase();
    if (lower.includes(' ')) return text.includes(lower);
    return new RegExp(`\\b${lower}\\b`, 'i').test(text);
  }).length;
  return { score: Math.min(maxScore, matched), maxScore };
}

/** Lowercase words with punctuation stripped, apostrophes kept, as a word → count map. */
function wordMultiset(text: string): Map<string, number> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const map = new Map<string, number>();
  for (const w of words) map.set(w, (map.get(w) ?? 0) + 1);
  return map;
}

export function scoreAnswers(items: Item[], answers: TestResponseInput[]): ScoredResponse[] {
  return items.map((item) => {
    const answer = answers.find((a) => a.itemId === item.id);
    const response = answer?.response ?? '';
    const { score, maxScore } = scoreResponse(item, response);
    return {
      itemId: item.id,
      itemLevel: item.level,
      itemSkill: item.skill,
      itemType: item.type,
      response,
      score,
      maxScore,
    };
  });
}

/** Highest CEFR level where this level and every level below it meet the mastery threshold. */
export function calculateLevel(responses: ScoredResponse[], threshold = MASTERY_THRESHOLD): CEFRLevel {
  let current: CEFRLevel = 'A1';
  for (const level of LEVEL_ORDER) {
    const levelResponses = responses.filter((r) => r.itemLevel === level);
    const score = levelResponses.reduce((sum, r) => sum + r.score, 0);
    const max = levelResponses.reduce((sum, r) => sum + r.maxScore, 0);
    if (max > 0 && score / max >= threshold) {
      current = level;
    } else {
      break;
    }
  }
  return current;
}

export function totalScore(responses: ScoredResponse[]): { score: number; max: number } {
  return {
    score: responses.reduce((sum, r) => sum + r.score, 0),
    max: responses.reduce((sum, r) => sum + r.maxScore, 0),
  };
}

export function ieltsBandForLevel(level: CEFRLevel): string {
  switch (level) {
    case 'C2':
      return '8.5–9.0';
    case 'C1':
      return '7.0–8.0';
    case 'B2':
      return '5.5–6.5';
    case 'B1':
      return '4.0–5.0';
    case 'A2':
      return '≈ 3.0–3.5';
    case 'A1':
      return 'not classified';
  }
}

export function findItem(id: string): Item | undefined {
  return ITEMS_BY_ID[id];
}

/** Seconds a test has overrun its time limit (0 when still within time). */
export function overTimeSeconds(startedAt: string, limitSeconds: number, now = Date.now()): number {
  return Math.max(0, elapsedSeconds(startedAt, now) - limitSeconds);
}

export function elapsedSeconds(startedAt: string, now = Date.now()): number {
  return Math.floor((now - new Date(startedAt).getTime()) / 1000);
}
