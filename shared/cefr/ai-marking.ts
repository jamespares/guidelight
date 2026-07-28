import { WRITING_RUBRICS } from './rubrics'
import { calculateLevel, findItem } from './test-engine'
import type { CEFRLevel } from './items'

export const MARKING_MODEL = '@cf/moonshotai/kimi-k2.6'
const AI_TIMEOUT_MS = 45_000

export interface MarkTarget {
  responseId: string
  itemId: string
  level: CEFRLevel
  prompt: string
  answer: string
  maxScore: number
  keywordScore: number
}

export interface AiMark {
  responseId: string
  itemId: string
  score: number
  maxScore: number
  feedback: string
  keywordScore: number
}

/** One batched prompt covering every written response in the test. */
export function buildBatchPrompt(targets: MarkTarget[]): string {
  const parts = targets
    .map(
      (t, i) => `### Response ${i + 1} — id "${t.itemId}" (target level ${t.level})
CEFR ${t.level} writing expectation: "${WRITING_RUBRICS[t.level]}"
Task given to the student: "${t.prompt}"
Student's answer:
"""
${t.answer || '(no answer)'}
"""`,
    )
    .join('\n\n')

  return `You are a strict but encouraging CEFR examiner marking short written answers from an English diagnostic test.

For EACH response below, score the answer 0–3 against the stated CEFR level expectation:
- 3 = fully meets the level expectation (task completed; errors do not impede meaning)
- 2 = mostly meets it (minor breakdowns in grammar/vocabulary/coherence)
- 1 = partially meets it (frequent errors; task only partly completed)
- 0 = does not meet it / no answer / off-topic

Judge against the CEFR band descriptor quoted for each response — do not expect more than that band requires.
Give feedback in at most 40 words: student-friendly, specific, CEFR-referenced, one improvement tip.

Return STRICT JSON only — an array with one object per response, in order:
[{"item_id": "...", "score": 0, "feedback": "..."}]

${parts}`
}

/** Extract and validate the JSON array from model output; invalid entries are dropped. */
export function parseBatchOutput(
  text: string,
  targets: MarkTarget[],
): { itemId: string; score: number; feedback: string }[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const valid = new Map(targets.map((t) => [t.itemId, t]))
  const out: { itemId: string; score: number; feedback: string }[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const target = valid.get(String(e.item_id ?? ''))
    if (!target) continue
    const score = Number(e.score)
    if (!Number.isFinite(score)) continue
    out.push({
      itemId: target.itemId,
      score: Math.max(0, Math.min(target.maxScore, Math.round(score))),
      feedback: String(e.feedback ?? '').slice(0, 500),
    })
  }
  return out
}

export type AiRunner = (prompt: string) => Promise<string>

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ])
}

/** Real runner: Kimi K2.6 via the Workers AI binding, with a hard timeout. */
export function kimiRunner(ai: Ai): AiRunner {
  return async (prompt) => {
    const out = (await withTimeout(
      ai.run(MARKING_MODEL, {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048,
        chat_template_kwargs: { thinking: false },
      } as never),
      AI_TIMEOUT_MS,
      'Kimi marking call',
    )) as { choices?: { message?: { content?: string } }[] }
    const content = out?.choices?.[0]?.message?.content
    if (!content) throw new Error('Empty response from marking model')
    return content
  }
}

export interface MarkingResult {
  marked: number
  failed: number
}

/**
 * AI-mark written responses, persist marks, and recompute CEFR totals/level.
 */
export async function markWrittenResponses(
  db: D1Database,
  testId: string,
  run: AiRunner,
  { refresh = false }: { refresh?: boolean } = {},
): Promise<MarkingResult> {
  const { results: rows } = await db
    .prepare(
      `SELECT r.id, r.item_id, r.item_level, r.response, r.score, r.max_score,
              (SELECT COUNT(*) FROM cefr_written_marks m WHERE m.response_id = r.id) AS already_marked
       FROM cefr_test_responses r WHERE r.test_id = ? AND r.item_type = 'written' ORDER BY r.id`,
    )
    .bind(testId)
    .all<{
      id: string
      item_id: string
      item_level: CEFRLevel
      response: string
      score: number
      max_score: number
      already_marked: number
    }>()

  const targets: MarkTarget[] = rows
    .filter((r) => refresh || r.already_marked === 0)
    .map((r) => {
      const item = findItem(r.item_id)
      return {
        responseId: r.id,
        itemId: r.item_id,
        level: r.item_level,
        prompt: item?.prompt ?? r.item_id,
        answer: r.response,
        maxScore: r.max_score,
        keywordScore: r.score,
      }
    })

  if (targets.length === 0) return { marked: 0, failed: 0 }

  let marks: ReturnType<typeof parseBatchOutput> = []
  let callFailed = false
  try {
    const text = await run(buildBatchPrompt(targets))
    marks = parseBatchOutput(text, targets)
  } catch {
    callFailed = true
  }

  let marked = 0
  const byItem = new Map(targets.map((t) => [t.itemId, t]))
  for (const mark of marks) {
    const target = byItem.get(mark.itemId)
    if (!target) continue
    await db
      .prepare(
        `INSERT INTO cefr_written_marks (id, response_id, ai_score, ai_max, feedback, keyword_score, model)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (response_id) DO UPDATE SET
           ai_score = excluded.ai_score, ai_max = excluded.ai_max, feedback = excluded.feedback,
           keyword_score = excluded.keyword_score, model = excluded.model, marked_at = datetime('now')`,
      )
      .bind(
        crypto.randomUUID(),
        target.responseId,
        mark.score,
        target.maxScore,
        mark.feedback,
        target.keywordScore,
        MARKING_MODEL,
      )
      .run()
    await db
      .prepare('UPDATE cefr_test_responses SET score = ? WHERE id = ?')
      .bind(mark.score, target.responseId)
      .run()
    marked += 1
  }

  if (marked > 0) {
    const { results: all } = await db
      .prepare('SELECT item_level, score, max_score FROM cefr_test_responses WHERE test_id = ?')
      .bind(testId)
      .all<{ item_level: CEFRLevel; score: number; max_score: number }>()
    const total = all.reduce((s, r) => s + r.score, 0)
    const max = all.reduce((s, r) => s + r.max_score, 0)
    const level = calculateLevel(
      all.map((r) => ({
        itemId: '',
        itemLevel: r.item_level,
        itemSkill: 'writing' as const,
        itemType: 'written' as const,
        response: '',
        score: r.score,
        maxScore: r.max_score,
      })),
    )
    await db
      .prepare('UPDATE cefr_tests SET total_score = ?, max_score = ?, cefr_level = ? WHERE id = ?')
      .bind(total, max, level, testId)
      .run()
  }

  return { marked, failed: callFailed ? targets.length : targets.length - marked }
}

export async function getWrittenMarks(
  db: D1Database,
  testId: string,
): Promise<Map<string, { score: number; max: number; feedback: string; keywordScore: number }>> {
  const { results } = await db
    .prepare(
      `SELECT r.item_id, m.ai_score, m.ai_max, m.feedback, m.keyword_score
       FROM cefr_written_marks m JOIN cefr_test_responses r ON r.id = m.response_id
       WHERE r.test_id = ?`,
    )
    .bind(testId)
    .all<{
      item_id: string
      ai_score: number
      ai_max: number
      feedback: string
      keyword_score: number
    }>()
  return new Map(
    results.map((r) => [
      r.item_id,
      {
        score: r.ai_score,
        max: r.ai_max,
        feedback: r.feedback,
        keywordScore: r.keyword_score,
      },
    ]),
  )
}
