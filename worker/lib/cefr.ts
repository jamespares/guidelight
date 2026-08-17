import type { Env, SessionUser } from '../types'
import { error, generateId, json } from './auth'
import { countWords } from '../../shared/cefr/rsvp'
import {
  buildSpotChecks,
  computeWpm,
  scoreSpotChecks,
  SPOT_CHECK_PASS,
  wpmBoundError,
} from '../../shared/cefr/reading-checks'
import {
  calculateLevel,
  elapsedSeconds,
  findItem,
  ieltsBandForLevel,
  overTimeSeconds,
  PARALLEL_FORM_COUNT,
  scoreAnswers,
  selectItems,
  TEST_TIME_LIMIT_SECONDS,
  totalScore,
  type TestResponseInput,
} from '../../shared/cefr/test-engine'
import { PASSAGES, type Item } from '../../shared/cefr/items'
import {
  kimiRunner,
  markWrittenResponses,
  getWrittenMarks,
  MARKING_MODEL,
} from '../../shared/cefr/ai-marking'
import {
  AiBudgetExceededError,
  aiBudgetExceededResponse,
  assertAiBudget,
  estimateTokens,
  recordAiUsage,
  teacherIdForStudent,
} from './billing'

export type AssessmentSubtype =
  | 'diagnostic'
  | 'formative'
  | 'summative'
  | 'english_level'
  | 'reading_speed'
  | null

export function isSpecialAssessment(subtype: string | null | undefined): boolean {
  return subtype === 'english_level' || subtype === 'reading_speed'
}

export function audioPublicUrl(audioKey: string): string {
  const file = audioKey.replace(/^audio\//, '')
  return `/cefr-audio/${file}`
}

function sanitizeItemForStudent(item: Item): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: item.id,
    level: item.level,
    skill: item.skill,
    type: item.type,
    prompt: item.prompt,
    maxScore: item.maxScore,
  }
  if (item.type === 'mcq' || item.type === 'cloze' || item.type === 'reading' || item.type === 'listening') {
    base.options = item.options
    if (item.type === 'reading') {
      base.passageId = item.passageId
      base.gapIndex = item.gapIndex
    }
    if (item.type === 'listening') {
      base.passageId = item.passageId
      base.audioKey = item.audioKey
      base.audioUrl = audioPublicUrl(item.audioKey)
    }
  } else if (item.type === 'dictation') {
    base.audioKey = item.audioKey
    base.audioUrl = audioPublicUrl(item.audioKey)
  } else if (item.type === 'written') {
    // prompt only
  }
  return base
}

async function studentClass(env: Env, studentId: string) {
  return env.DB.prepare(`SELECT id, class_id, display_name, interests FROM students WHERE id = ?`)
    .bind(studentId)
    .first<{ id: string; class_id: string; display_name: string; interests: string }>()
}

async function assertTaskAssigned(env: Env, taskId: string, studentId: string) {
  return env.DB.prepare(
    `SELECT t.* FROM tasks t
     JOIN task_assignments a ON a.task_id = t.id
     WHERE t.id = ? AND t.status = 'published'
       AND (a.student_id IS NULL OR a.student_id = ?)`,
  )
    .bind(taskId, studentId)
    .first<{
      id: string
      subtype: string | null
      class_id: string
      reading_text: string
      title: string
      time_limit_seconds: number | null
      content_json: string
    }>()
}

/** Handle /api/reading/* and /api/cefr/* and /api/stories/* — return null if not matched. */
export async function handleCefrApi(
  request: Request,
  env: Env,
  path: string,
  user: SessionUser,
): Promise<Response | null> {
  // —— Reading materials (RSVP library) ——
  if (path === '/api/reading/materials' && request.method === 'GET') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const me = await studentClass(env, user.id)
    if (!me) return error('Not found', 404)
    const { results: classTexts } = await env.DB.prepare(
      `SELECT id, title, word_count, created_at FROM reading_materials
       WHERE class_id = ? AND student_id IS NULL ORDER BY created_at DESC`,
    )
      .bind(me.class_id)
      .all()
    const { results: myTexts } = await env.DB.prepare(
      `SELECT id, title, word_count, created_at FROM reading_materials
       WHERE class_id = ? AND student_id = ? ORDER BY created_at DESC`,
    )
      .bind(me.class_id, user.id)
      .all()
    const latestSpeed = await env.DB.prepare(
      `SELECT wpm FROM reading_speed_attempts
       WHERE student_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`,
    )
      .bind(user.id)
      .first<{ wpm: number }>()
    return json({
      classTexts: classTexts ?? [],
      myTexts: myTexts ?? [],
      latestWpm: latestSpeed?.wpm ?? null,
    })
  }

  if (path === '/api/reading/materials' && request.method === 'POST') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const me = await studentClass(env, user.id)
    if (!me) return error('Not found', 404)
    const body = (await request.json()) as { title?: string; body?: string }
    const title = String(body.title ?? '').trim()
    const text = String(body.body ?? '').trim()
    if (!title) return error('Enter a title.')
    if (!text) return error('Paste some text.')
    const wordCount = countWords(text)
    if (wordCount < 1) return error('Could not find any words in that text.')
    const id = generateId()
    await env.DB.prepare(
      `INSERT INTO reading_materials (id, teacher_id, class_id, student_id, title, body, word_count)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    )
      .bind(id, me.class_id, user.id, title, text, wordCount)
      .run()
    return json({ id }, 201)
  }

  const materialDelete = path.match(/^\/api\/reading\/materials\/([^/]+)$/)
  if (materialDelete && request.method === 'DELETE') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const materialId = materialDelete[1]
    const row = await env.DB.prepare(
      `SELECT id FROM reading_materials WHERE id = ? AND student_id = ?`,
    )
      .bind(materialId, user.id)
      .first()
    if (!row) return error('Not found', 404)
    await env.DB.prepare(`DELETE FROM reading_materials WHERE id = ?`).bind(materialId).run()
    return json({ ok: true })
  }

  const materialGet = path.match(/^\/api\/reading\/materials\/([^/]+)$/)
  if (materialGet && request.method === 'GET') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const me = await studentClass(env, user.id)
    if (!me) return error('Not found', 404)
    const material = await env.DB.prepare(
      `SELECT id, title, body, word_count, student_id FROM reading_materials
       WHERE id = ? AND class_id = ? AND (student_id IS NULL OR student_id = ?)`,
    )
      .bind(materialGet[1], me.class_id, user.id)
      .first<{ id: string; title: string; body: string; word_count: number; student_id: string | null }>()
    if (!material) return error('Not found', 404)
    const latestSpeed = await env.DB.prepare(
      `SELECT wpm FROM reading_speed_attempts
       WHERE student_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`,
    )
      .bind(user.id)
      .first<{ wpm: number }>()
    return json({ material, latestWpm: latestSpeed?.wpm ?? null })
  }

  if (path === '/api/reading/machine/session' && request.method === 'POST') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const body = (await request.json()) as {
      material_id: string
      wpm_setting: number
      words_read: number
      word_count: number
      duration_seconds: number
      completed?: boolean
    }
    const id = generateId()
    await env.DB.prepare(
      `INSERT INTO reading_machine_sessions
       (id, student_id, material_id, wpm_setting, words_read, word_count, duration_seconds, completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        user.id,
        body.material_id,
        Math.round(body.wpm_setting),
        Math.round(body.words_read),
        Math.round(body.word_count),
        Math.round(body.duration_seconds),
        body.completed ? 1 : 0,
      )
      .run()
    return json({ id }, 201)
  }

  // —— Reading speed assessment ——
  // Teacher preview: passage + spot-checks read-only — no attempt rows, no
  // timing, works on drafts and published tasks.
  const speedPreview = path.match(/^\/api\/reading\/speed\/task\/([^/]+)\/preview$/)
  if (speedPreview && request.method === 'GET') {
    if (user.role !== 'teacher') return error('Forbidden', 403)
    const taskId = speedPreview[1]
    const task = await env.DB.prepare(
      `SELECT t.id, t.subtype, t.title, t.reading_text, c.teacher_id
       FROM tasks t JOIN classes c ON c.id = t.class_id WHERE t.id = ?`,
    )
      .bind(taskId)
      .first<{
        id: string
        subtype: string | null
        title: string
        reading_text: string
        teacher_id: string
      }>()
    if (!task || task.teacher_id !== user.id) return error('Not found', 404)
    if (task.subtype !== 'reading_speed') return error('Not a reading speed task', 400)
    const checks = buildSpotChecks(task.reading_text, hashSeed(taskId))
    return json({
      title: task.title,
      body: task.reading_text,
      wordCount: countWords(task.reading_text),
      passNeed: SPOT_CHECK_PASS,
      // Students receive only { id, prompt, options }; teachers also see the
      // answer so they can sanity-check each spot-check before assigning.
      checks: checks.map((c) => ({ id: c.id, prompt: c.prompt, options: c.options, answer: c.answer })),
    })
  }

  const speedStatus = path.match(/^\/api\/reading\/speed\/([^/]+)$/)
  if (speedStatus && request.method === 'GET') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const taskId = speedStatus[1]
    const task = await assertTaskAssigned(env, taskId, user.id)
    if (!task || task.subtype !== 'reading_speed') return error('Not found', 404)

    const completed = await env.DB.prepare(
      `SELECT id, wpm, flagged, checks_correct, checks_total, status FROM reading_speed_attempts
       WHERE student_id = ? AND task_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`,
    )
      .bind(user.id, taskId)
      .first()

    if (completed) {
      return json({
        phase: 'result',
        title: task.title,
        attempt: completed,
      })
    }

    const inProgress = await env.DB.prepare(
      `SELECT id, started_at, duration_seconds, status, wpm FROM reading_speed_attempts
       WHERE student_id = ? AND task_id = ? AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1`,
    )
      .bind(user.id, taskId)
      .first<{
        id: string
        started_at: string
        duration_seconds: number | null
        status: string
        wpm: number
      }>()

    if (inProgress && inProgress.duration_seconds != null) {
      const checks = buildSpotChecks(task.reading_text, hashSeed(taskId))
      return json({
        phase: 'checks',
        title: task.title,
        attemptId: inProgress.id,
        checks: checks.map((c) => ({ id: c.id, prompt: c.prompt, options: c.options })),
        passNeed: SPOT_CHECK_PASS,
      })
    }

    if (inProgress) {
      return json({
        phase: 'reading',
        title: task.title,
        attemptId: inProgress.id,
        body: task.reading_text,
        wordCount: countWords(task.reading_text),
      })
    }

    return json({
      phase: 'start',
      title: task.title,
      wordCount: countWords(task.reading_text),
    })
  }

  if (path.match(/^\/api\/reading\/speed\/[^/]+\/start$/) && request.method === 'POST') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const taskId = path.split('/')[4]
    const task = await assertTaskAssigned(env, taskId, user.id)
    if (!task || task.subtype !== 'reading_speed') return error('Not found', 404)

    const existingDone = await env.DB.prepare(
      `SELECT id FROM reading_speed_attempts WHERE student_id = ? AND task_id = ? AND status = 'completed'`,
    )
      .bind(user.id, taskId)
      .first()
    if (existingDone) return error('Already completed', 400)

    // Clear rejected / abandoned in-progress
    const abandoned = await env.DB.prepare(
      `SELECT attempt_id FROM reading_speed_attempts WHERE student_id = ? AND task_id = ? AND status = 'in_progress'`,
    )
      .bind(user.id, taskId)
      .all<{ attempt_id: string | null }>()
    await env.DB.prepare(
      `UPDATE reading_speed_attempts SET status = 'rejected' WHERE student_id = ? AND task_id = ? AND status = 'in_progress'`,
    )
      .bind(user.id, taskId)
      .run()
    // Drop their mirror rows so the teacher review list isn't left with
    // permanently "in_progress" attempts (the rejected rows remain in
    // reading_speed_attempts, flagged, as the audit trail).
    for (const row of abandoned.results ?? []) {
      if (row.attempt_id) {
        await env.DB.prepare(`DELETE FROM attempts WHERE id = ?`).bind(row.attempt_id).run()
      }
    }

    const id = generateId()
    const wordCount = countWords(task.reading_text)
    await env.DB.prepare(
      `INSERT INTO reading_speed_attempts
       (id, student_id, task_id, wpm, word_count, status, started_at)
       VALUES (?, ?, ?, 0, ?, 'in_progress', datetime('now'))`,
    )
      .bind(id, user.id, taskId, wordCount)
      .run()

    // Mirror a Guidelight attempt for teacher review list
    const attemptId = generateId()
    await env.DB.prepare(
      `INSERT INTO attempts (id, task_id, student_id, started_at) VALUES (?, ?, ?, datetime('now'))`,
    )
      .bind(attemptId, taskId, user.id)
      .run()
    await env.DB.prepare(`UPDATE reading_speed_attempts SET attempt_id = ? WHERE id = ?`)
      .bind(attemptId, id)
      .run()

    return json({ attemptId: id, body: task.reading_text, wordCount })
  }

  if (path.match(/^\/api\/reading\/speed\/[^/]+\/finish$/) && request.method === 'POST') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const taskId = path.split('/')[4]
    const task = await assertTaskAssigned(env, taskId, user.id)
    if (!task || task.subtype !== 'reading_speed') return error('Not found', 404)

    const attempt = await env.DB.prepare(
      `SELECT * FROM reading_speed_attempts
       WHERE student_id = ? AND task_id = ? AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1`,
    )
      .bind(user.id, taskId)
      .first<{
        id: string
        started_at: string
        word_count: number
        duration_seconds: number | null
        attempt_id: string | null
      }>()
    if (!attempt) return error('No active attempt', 400)
    if (attempt.duration_seconds != null) {
      return json({ ok: true, next: 'checks' })
    }

    const durationSeconds = Math.min(7200, Math.max(1, elapsedSeconds(attempt.started_at)))
    const wpm = computeWpm(attempt.word_count, durationSeconds)
    const boundErr = wpmBoundError(wpm)
    if (boundErr) {
      await env.DB.prepare(
        `UPDATE reading_speed_attempts
         SET status = 'rejected', duration_seconds = ?, wpm = ?, flagged = 1, completed_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(durationSeconds, wpm, attempt.id)
        .run()
      if (attempt.attempt_id) {
        await env.DB.prepare(`DELETE FROM attempts WHERE id = ?`).bind(attempt.attempt_id).run()
      }
      return error(boundErr, 400)
    }

    await env.DB.prepare(
      `UPDATE reading_speed_attempts SET duration_seconds = ?, wpm = ? WHERE id = ?`,
    )
      .bind(durationSeconds, wpm, attempt.id)
      .run()

    return json({ ok: true, next: 'checks', wpm })
  }

  if (path.match(/^\/api\/reading\/speed\/[^/]+\/checks$/) && request.method === 'POST') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const taskId = path.split('/')[4]
    const task = await assertTaskAssigned(env, taskId, user.id)
    if (!task || task.subtype !== 'reading_speed') return error('Not found', 404)

    const attempt = await env.DB.prepare(
      `SELECT * FROM reading_speed_attempts
       WHERE student_id = ? AND task_id = ? AND status = 'in_progress'
         AND duration_seconds IS NOT NULL
       ORDER BY started_at DESC LIMIT 1`,
    )
      .bind(user.id, taskId)
      .first<{
        id: string
        wpm: number
        attempt_id: string | null
        duration_seconds: number
      }>()
    if (!attempt) return error('No active attempt', 400)

    const body = (await request.json()) as { answers: Record<string, string> }
    const checks = buildSpotChecks(task.reading_text, hashSeed(taskId))
    const scored = scoreSpotChecks(checks, body.answers ?? {})

    if (!scored.passed) {
      await env.DB.prepare(
        `UPDATE reading_speed_attempts
         SET status = 'rejected', checks_correct = ?, checks_total = ?, flagged = 1,
             completed_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(scored.correct, scored.total, attempt.id)
        .run()
      if (attempt.attempt_id) {
        await env.DB.prepare(`DELETE FROM attempts WHERE id = ?`).bind(attempt.attempt_id).run()
      }
      return error(
        `You got ${scored.correct}/${scored.total} spot-checks right (need ${SPOT_CHECK_PASS}). Start again and read carefully.`,
        400,
      )
    }

    await env.DB.prepare(
      `UPDATE reading_speed_attempts
       SET status = 'completed', checks_correct = ?, checks_total = ?, flagged = 0,
           completed_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(scored.correct, scored.total, attempt.id)
      .run()

    await env.DB.prepare(`UPDATE students SET latest_wpm = ? WHERE id = ?`)
      .bind(attempt.wpm, user.id)
      .run()

    if (attempt.attempt_id) {
      const archiveMd = [
        '# Attempt archive',
        `- Student: ${user.name}`,
        `- Task type: assessment`,
        `- Subtype: reading_speed`,
        `- Submitted: ${new Date().toISOString()}`,
        `- WPM: ${attempt.wpm}`,
        `- Spot checks: ${scored.correct}/${scored.total}`,
        '',
        '## Reading speed result',
        `- Learning objective: Measure reading fluency (words per minute) with comprehension checks`,
        `- Topic: reading_speed`,
        `- Correct?: yes (passed spot checks)`,
        `- Feedback: Recorded ${attempt.wpm} wpm with ${scored.correct}/${scored.total} checks correct`,
        '',
      ].join('\n')

      await env.DB.prepare(
        `UPDATE attempts SET
          submitted_at = datetime('now'),
          duration_ms = ?,
          score_pct = ?,
          answers_json = ?,
          feedback_json = ?,
          attempt_archive_md = ?,
          status = 'submitted'
         WHERE id = ?`,
      )
        .bind(
          attempt.duration_seconds * 1000,
          Math.min(100, Math.round((attempt.wpm / 300) * 100)),
          JSON.stringify({ wpm: attempt.wpm, checks: scored }),
          JSON.stringify({
            wpm: {
              correct: true,
              feedback: `${attempt.wpm} wpm`,
              topic: 'reading_speed',
              learningObjective: 'Measure reading fluency with comprehension checks',
              marksAwarded: attempt.wpm,
              marksPossible: attempt.wpm,
            },
          }),
          archiveMd,
          attempt.attempt_id,
        )
        .run()
    }

    return json({ ok: true, wpm: attempt.wpm, checks: scored })
  }

  // —— English level (CEFR diagnostic) ——
  // Teacher preview: return one full form of the diagnostic read-only —
  // no cefr_tests/attempts rows, no billing, works on drafts and published tasks.
  const cefrPreview = path.match(/^\/api\/cefr\/tests\/task\/([^/]+)\/preview$/)
  if (cefrPreview && request.method === 'GET') {
    if (user.role !== 'teacher') return error('Forbidden', 403)
    const taskId = cefrPreview[1]
    const task = await env.DB.prepare(
      `SELECT t.id, t.subtype, t.title, t.time_limit_seconds, c.teacher_id
       FROM tasks t JOIN classes c ON c.id = t.class_id WHERE t.id = ?`,
    )
      .bind(taskId)
      .first<{
        id: string
        subtype: string | null
        title: string
        time_limit_seconds: number | null
        teacher_id: string
      }>()
    if (!task || task.teacher_id !== user.id) return error('Not found', 404)
    if (task.subtype !== 'english_level') return error('Not an English level task', 400)

    // Students get a random parallel form; teachers can preview any of them
    // (?form=N, clamped by selectItems' own modulo) — default form 0.
    const requested = Number(new URL(request.url).searchParams.get('form'))
    const formIndex = Number.isInteger(requested) && requested >= 0 ? requested : 0
    const items = selectItems({ formIndex })
    return json({
      title: task.title,
      timeLimitSeconds: task.time_limit_seconds ?? TEST_TIME_LIMIT_SECONDS,
      formIndex: formIndex % PARALLEL_FORM_COUNT,
      formCount: PARALLEL_FORM_COUNT,
      items: items.map(sanitizeItemForStudent),
      passages: PASSAGES,
    })
  }

  const cefrStatus = path.match(/^\/api\/cefr\/tests\/task\/([^/]+)$/)
  if (cefrStatus && request.method === 'GET') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const taskId = cefrStatus[1]
    const task = await assertTaskAssigned(env, taskId, user.id)
    if (!task || task.subtype !== 'english_level') return error('Not found', 404)

    const completed = await env.DB.prepare(
      `SELECT * FROM cefr_tests WHERE student_id = ? AND task_id = ? AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
    )
      .bind(user.id, taskId)
      .first<{
        id: string
        cefr_level: string | null
        total_score: number | null
        max_score: number | null
        over_time_seconds: number | null
      }>()

    if (completed) {
      const marks = await getWrittenMarks(env.DB, completed.id)
      const { results: responseRows } = await env.DB.prepare(
        `SELECT item_id, item_level, item_skill, item_type, response, score, max_score
         FROM cefr_test_responses WHERE test_id = ? ORDER BY id`,
      )
        .bind(completed.id)
        .all<{
          item_id: string
          item_level: string
          item_skill: string
          item_type: string
          response: string
          score: number
          max_score: number
        }>()

      const responses = (responseRows ?? []).map((r) => {
        const item = findItem(r.item_id)
        const base = {
          itemId: r.item_id,
          level: r.item_level,
          skill: r.item_skill,
          type: r.item_type,
          prompt: item?.prompt ?? r.item_id,
          response: r.response,
          score: r.score,
          maxScore: r.max_score,
          feedback: marks.get(r.item_id)?.feedback ?? '',
        }
        if (item && (item.type === 'mcq' || item.type === 'cloze' || item.type === 'reading' || item.type === 'listening')) {
          return { ...base, options: item.options, correct: item.correct }
        }
        if (item && item.type === 'dictation') {
          return { ...base, transcript: item.transcript }
        }
        return base
      })

      return json({
        phase: 'result',
        title: task.title,
        test: completed,
        ieltsBand: completed.cefr_level ? ieltsBandForLevel(completed.cefr_level as never) : null,
        writtenMarks: Object.fromEntries(marks),
        responses,
      })
    }

    const inProgress = await env.DB.prepare(
      `SELECT * FROM cefr_tests WHERE student_id = ? AND task_id = ? AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1`,
    )
      .bind(user.id, taskId)
      .first<{
        id: string
        item_ids: string
        started_at: string
        time_limit_seconds: number
      }>()

    if (inProgress) {
      const itemIds = JSON.parse(inProgress.item_ids) as string[]
      const items = itemIds.map((id) => findItem(id)).filter(Boolean) as Item[]
      const elapsed = elapsedSeconds(inProgress.started_at)
      const secondsLeft = Math.max(0, inProgress.time_limit_seconds - elapsed)
      return json({
        phase: 'test',
        title: task.title,
        testId: inProgress.id,
        startedAt: inProgress.started_at,
        timeLimitSeconds: inProgress.time_limit_seconds,
        secondsLeft,
        items: items.map(sanitizeItemForStudent),
        passages: PASSAGES,
      })
    }

    return json({ phase: 'start', title: task.title, timeLimitSeconds: TEST_TIME_LIMIT_SECONDS })
  }

  if (path.match(/^\/api\/cefr\/tests\/task\/[^/]+\/start$/) && request.method === 'POST') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const taskId = path.split('/')[5]
    const task = await assertTaskAssigned(env, taskId, user.id)
    if (!task || task.subtype !== 'english_level') return error('Not found', 404)

    const existing = await env.DB.prepare(
      `SELECT id, status FROM cefr_tests WHERE student_id = ? AND task_id = ?
       ORDER BY started_at DESC LIMIT 1`,
    )
      .bind(user.id, taskId)
      .first<{ id: string; status: string }>()
    if (existing?.status === 'completed') return error('Already completed', 400)
    if (existing?.status === 'in_progress') return json({ testId: existing.id, resumed: true })

    const me = await studentClass(env, user.id)
    const formIndex = Math.floor(Math.random() * PARALLEL_FORM_COUNT)
    const items = selectItems({
      formIndex,
      interestSeed: me?.interests || undefined,
    })
    const testId = generateId()
    const attemptId = generateId()

    await env.DB.prepare(
      `INSERT INTO attempts (id, task_id, student_id, started_at) VALUES (?, ?, ?, datetime('now'))`,
    )
      .bind(attemptId, taskId, user.id)
      .run()

    await env.DB.prepare(
      `INSERT INTO cefr_tests
       (id, student_id, task_id, attempt_id, status, item_ids, form_index, time_limit_seconds)
       VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?)`,
    )
      .bind(
        testId,
        user.id,
        taskId,
        attemptId,
        JSON.stringify(items.map((i) => i.id)),
        formIndex,
        task.time_limit_seconds ?? TEST_TIME_LIMIT_SECONDS,
      )
      .run()

    return json({ testId })
  }

  const cefrSubmit = path.match(/^\/api\/cefr\/tests\/([^/]+)\/submit$/)
  if (cefrSubmit && request.method === 'POST') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const testId = cefrSubmit[1]
    const test = await env.DB.prepare(`SELECT * FROM cefr_tests WHERE id = ? AND student_id = ?`)
      .bind(testId, user.id)
      .first<{
        id: string
        status: string
        item_ids: string
        started_at: string
        time_limit_seconds: number
        attempt_id: string | null
        task_id: string | null
      }>()
    if (!test) return error('Not found', 404)
    if (test.status !== 'in_progress') return error('Test already submitted', 400)

    const body = (await request.json()) as { answers: Record<string, string> }
    const itemIds = JSON.parse(test.item_ids) as string[]
    const items = itemIds.map((id) => findItem(id)).filter(Boolean) as Item[]
    const answers: TestResponseInput[] = itemIds.map((itemId) => ({
      itemId,
      response: String(body.answers?.[itemId] ?? '').trim(),
    }))
    const scored = scoreAnswers(items, answers)
    const totals = totalScore(scored)
    const level = calculateLevel(scored)
    const overtime = overTimeSeconds(test.started_at, test.time_limit_seconds)

    for (const r of scored) {
      await env.DB.prepare(
        `INSERT INTO cefr_test_responses
         (id, test_id, item_id, item_level, item_skill, item_type, response, score, max_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          generateId(),
          testId,
          r.itemId,
          r.itemLevel,
          r.itemSkill,
          r.itemType,
          r.response,
          r.score,
          r.maxScore,
        )
        .run()
    }

    await env.DB.prepare(
      `UPDATE cefr_tests SET
        status = 'completed', completed_at = datetime('now'),
        total_score = ?, max_score = ?, cefr_level = ?, over_time_seconds = ?
       WHERE id = ?`,
    )
      .bind(totals.score, totals.max, level, overtime, testId)
      .run()

    // AI re-mark written answers (best-effort) — bill to class teacher
    try {
      const billingTeacherId = await teacherIdForStudent(env, user.id)
      if (billingTeacherId) {
        await assertAiBudget(env, billingTeacherId)
        const run = kimiRunner(env.AI)
        await markWrittenResponses(env.DB, testId, async (prompt) => {
          const text = await run(prompt)
          try {
            await recordAiUsage(
              env,
              { teacherId: billingTeacherId, feature: 'cefr_mark' },
              {
                model: MARKING_MODEL,
                inputTokens: estimateTokens(prompt),
                outputTokens: estimateTokens(text),
              },
            )
          } catch (err) {
            console.error('cefr mark usage record failed', err)
          }
          return text
        })
      } else {
        await markWrittenResponses(env.DB, testId, kimiRunner(env.AI))
      }
    } catch (err) {
      if (err instanceof AiBudgetExceededError) {
        return aiBudgetExceededResponse(err.usedCents, err.capCents)
      }
      /* keep keyword scores on other AI failures */
    }

    const refreshed = await env.DB.prepare(
      `SELECT cefr_level, total_score, max_score FROM cefr_tests WHERE id = ?`,
    )
      .bind(testId)
      .first<{ cefr_level: string; total_score: number; max_score: number }>()

    const finalLevel = refreshed?.cefr_level ?? level
    await env.DB.prepare(`UPDATE students SET cefr_level = ? WHERE id = ?`)
      .bind(finalLevel, user.id)
      .run()

    if (test.attempt_id) {
      const pct =
        refreshed && refreshed.max_score > 0
          ? Math.round((100 * refreshed.total_score) / refreshed.max_score)
          : 0
      const archiveMd = [
        '# Attempt archive',
        `- Student: ${user.name}`,
        `- Task type: assessment`,
        `- Subtype: english_level`,
        `- Submitted: ${new Date().toISOString()}`,
        `- Score: ${pct}%`,
        `- CEFR level: ${finalLevel}`,
        `- Total: ${refreshed?.total_score ?? totals.score}/${refreshed?.max_score ?? totals.max}`,
        `- Overtime seconds: ${overtime}`,
        '',
        '## English level result',
        `- Learning objective: Indicate overall English proficiency (CEFR) across skills`,
        `- Topic: english_level`,
        `- Feedback: Indicative CEFR ${finalLevel}; IELTS band ${ieltsBandForLevel(finalLevel as never)}`,
        '',
      ].join('\n')

      await env.DB.prepare(
        `UPDATE attempts SET
          submitted_at = datetime('now'),
          duration_ms = ?,
          score_pct = ?,
          answers_json = ?,
          feedback_json = ?,
          attempt_archive_md = ?,
          status = 'submitted'
         WHERE id = ?`,
      )
        .bind(
          elapsedSeconds(test.started_at) * 1000,
          pct,
          JSON.stringify(body.answers ?? {}),
          JSON.stringify({
            cefr_level: finalLevel,
            total: refreshed?.total_score,
            max: refreshed?.max_score,
            overtime,
            topic: 'english_level',
            learningObjective: 'Indicate overall English proficiency (CEFR) across skills',
          }),
          archiveMd,
          test.attempt_id,
        )
        .run()
    }

    return json({
      cefr_level: finalLevel,
      total_score: refreshed?.total_score ?? totals.score,
      max_score: refreshed?.max_score ?? totals.max,
      ieltsBand: ieltsBandForLevel(finalLevel as never),
      over_time_seconds: overtime,
    })
  }

  // Enrich GET test with passages from items module
  const cefrGet = path.match(/^\/api\/cefr\/tests\/([^/]+)$/)
  if (cefrGet && request.method === 'GET') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const test = await env.DB.prepare(`SELECT * FROM cefr_tests WHERE id = ? AND student_id = ?`)
      .bind(cefrGet[1], user.id)
      .first<{
        id: string
        status: string
        item_ids: string
        started_at: string
        time_limit_seconds: number
        cefr_level: string | null
        total_score: number | null
        max_score: number | null
      }>()
    if (!test) return error('Not found', 404)

    if (test.status === 'completed') {
      return json({
        phase: 'result',
        test,
        ieltsBand: test.cefr_level ? ieltsBandForLevel(test.cefr_level as never) : null,
      })
    }

    const itemIds = JSON.parse(test.item_ids) as string[]
    const items = itemIds.map((id) => findItem(id)).filter(Boolean) as Item[]
    const elapsed = elapsedSeconds(test.started_at)
    return json({
      phase: 'test',
      testId: test.id,
      startedAt: test.started_at,
      timeLimitSeconds: test.time_limit_seconds,
      secondsLeft: Math.max(0, test.time_limit_seconds - elapsed),
      items: items.map(sanitizeItemForStudent),
      passages: PASSAGES,
    })
  }

  if (path === '/api/stories/event' && request.method === 'POST') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const body = (await request.json()) as { slug: string; event_type: 'open' | 'play' }
    await env.DB.prepare(
      `INSERT INTO story_events (id, student_id, story_slug, event_type) VALUES (?, ?, ?, ?)`,
    )
      .bind(generateId(), user.id, body.slug, body.event_type)
      .run()
    return json({ ok: true })
  }

  return null
}

function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Create specialised assessment tasks without AI generation. */
export async function createSpecialTask(
  env: Env,
  user: SessionUser,
  body: {
    type: 'homework' | 'assessment'
    subtype: 'english_level' | 'reading_speed'
    class_id: string
    subject?: string
    description: string
    difficulty: 'easy' | 'medium' | 'hard'
    reading_text?: string
    time_limit_seconds?: number | null
  },
): Promise<Response> {
  const cls = await env.DB.prepare(`SELECT * FROM classes WHERE id = ? AND teacher_id = ?`)
    .bind(body.class_id, user.id)
    .first<{ id: string; subject: string; teacher_id: string }>()
  if (!cls) return error('Class not found', 404)

  const subject = (body.subject || cls.subject).trim()
  const id = generateId()

  if (body.subtype === 'reading_speed') {
    const text = String(body.reading_text ?? '').trim()
    if (!text) return error('Reading passage is required for a reading speed assessment.', 400)
    const wordCount = countWords(text)
    if (wordCount < 40) return error('Passage needs at least ~40 words for a meaningful speed test.', 400)

    const materialId = generateId()
    const title =
      body.description.trim().slice(0, 80) || `Reading speed — ${wordCount} words`
    await env.DB.prepare(
      `INSERT INTO reading_materials (id, teacher_id, class_id, student_id, title, body, word_count)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    )
      .bind(materialId, user.id, body.class_id, title, text, wordCount)
      .run()

    const content = {
      kind: 'reading_speed',
      title,
      instructions: 'Read the passage at your natural pace, then answer three spot-check questions.',
      questions: [],
      material_id: materialId,
    }
    await env.DB.prepare(
      `INSERT INTO tasks (
        id, type, subtype, class_id, subject, title, description, difficulty,
        status, time_limit_seconds, content_json, reading_text, past_paper_text, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, '', ?)`,
    )
      .bind(
        id,
        body.type,
        'reading_speed',
        body.class_id,
        subject,
        title,
        body.description || 'Reading speed assessment',
        body.difficulty,
        body.time_limit_seconds ?? null,
        JSON.stringify(content),
        text,
        user.id,
      )
      .run()

    return json({ task: { id, content, status: 'draft' } }, 201)
  }

  // english_level
  const title = body.description.trim().slice(0, 80) || 'English level assessment'
  const content = {
    kind: 'english_level',
    title,
    instructions:
      'Full CEFR diagnostic (~72 questions, about one hour). Covers vocabulary, listening, reading, grammar and writing from A1 to C2.',
    questions: [],
  }
  await env.DB.prepare(
    `INSERT INTO tasks (
      id, type, subtype, class_id, subject, title, description, difficulty,
      status, time_limit_seconds, content_json, reading_text, past_paper_text, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, '', '', ?)`,
  )
    .bind(
      id,
      body.type,
      'english_level',
      body.class_id,
      subject,
      title,
      body.description || 'English level (CEFR) diagnostic',
      body.difficulty,
      body.time_limit_seconds ?? TEST_TIME_LIMIT_SECONDS,
      JSON.stringify(content),
      user.id,
    )
    .run()

  return json({ task: { id, content, status: 'draft' } }, 201)
}
