#!/usr/bin/env node
/**
 * End-to-end AI self-test: exercises every AI-backed API path against a
 * running worker (default: local `wrangler dev` on :8787) and asserts both
 * response shape AND content quality (rejects deterministic fallbacks).
 *
 * Prereqs:
 *   1. npm run db:demo:seed:local   (creates demo@guidelight.test / demo1234)
 *   2. npx wrangler dev             (in another terminal)
 *
 * Usage:
 *   npm run test:ai
 *   node scripts/ai-selftest.mjs --base https://getguidelight.com
 */

const args = process.argv.slice(2)
const baseIdx = args.indexOf('--base')
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : 'http://localhost:8787'

const TEACHER = { email: 'demo@guidelight.test', password: 'demo1234' }
const STUDENT = { username: 'demo.ava', password: 'demo1234' }

const FETCH_TIMEOUT_MS = 120_000

const results = []
let teacherCookie = ''
let studentCookie = ''

function cookieFrom(res) {
  const raw = res.headers.get('set-cookie') || ''
  const m = raw.match(/session=([^;]+)/)
  return m ? `session=${m[1]}` : ''
}

async function call(method, path, { body, cookie, raw } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (raw) return res
    const text = await res.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      data = { _raw: text }
    }
    return { status: res.status, data }
  } finally {
    clearTimeout(timer)
  }
}

function record(name, pass, note, ms) {
  results.push({ name, pass, note, ms })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (${(ms / 1000).toFixed(1)}s)${note ? ` — ${note}` : ''}`)
}

async function check(name, fn) {
  const start = Date.now()
  try {
    const note = await fn()
    record(name, true, note || '', Date.now() - start)
    return true
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err), Date.now() - start)
    return false
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// Known deterministic-fallback markers — if these appear, the AI call silently degraded.
const FALLBACK_MARKERS = {
  task: [/— question \d+$/m, /Option A/],
  mark: ['Recorded for teacher review (AI marker unavailable)'],
  summary: ['is developing steadily'],
  weakspots: ['AI analysis unavailable'],
  lessons: ['Exit ticket: one thing learned, one question remaining.', 'Junior consultant advising a small business'],
  flashcards: ['What is a key idea in'],
}

async function main() {
  console.log(`Guidelight AI self-test against ${BASE}\n`)

  // —— Auth ——
  await check('teacher login', async () => {
    const res = await fetch(`${BASE}/api/auth/teacher/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEACHER),
    })
    assert(res.status === 200, `login status ${res.status} — is demo data seeded?`)
    teacherCookie = cookieFrom(res)
    assert(teacherCookie, 'no session cookie returned')
  })
  if (!teacherCookie) return finish()

  await check('student login', async () => {
    const res = await fetch(`${BASE}/api/auth/student/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(STUDENT),
    })
    assert(res.status === 200, `login status ${res.status}`)
    studentCookie = cookieFrom(res)
    assert(studentCookie, 'no session cookie returned')
  })

  // —— Class + student discovery ——
  let classId = ''
  let studentId = ''
  await check('discover demo class + student', async () => {
    const { data } = await call('GET', '/api/classes', { cookie: teacherCookie })
    const cls = (data.classes ?? [])[0]
    assert(cls, 'no classes found for demo teacher')
    classId = cls.id
    const s = await call('GET', '/api/students', { cookie: teacherCookie })
    const stu = (s.data.students ?? []).find((x) => x.class_id === classId)
    assert(stu, 'no students in demo class')
    studentId = stu.id
    return `${cls.name} / ${stu.display_name}`
  })
  if (!classId) return finish()

  // —— TTS direct + R2 cache ——
  const ttsText = 'Listen carefully. The water cycle has four main stages. What happens during condensation?'
  await check('TTS generate (MiniMax via Workers AI)', async () => {
    const { status, data } = await call('POST', '/api/tts', {
      cookie: teacherCookie,
      body: { text: ttsText, class_id: classId },
    })
    assert(status === 200, `status ${status}: ${data.error || 'unknown'}`)
    assert(data.url, 'no url in response')
    const audio = await call('GET', data.url, { cookie: teacherCookie, raw: true })
    assert(audio.status === 200, `audio fetch status ${audio.status}`)
    assert((audio.headers.get('content-type') || '').includes('audio/mpeg'), 'wrong content-type')
    const buf = await audio.arrayBuffer()
    assert(buf.byteLength > 5_000, `audio too small (${buf.byteLength} bytes)`)
    return `${(buf.byteLength / 1024).toFixed(0)} KB mp3, cached=${data.cached}`
  })

  await check('TTS R2 cache hit on repeat', async () => {
    const { data } = await call('POST', '/api/tts', {
      cookie: teacherCookie,
      body: { text: ttsText, class_id: classId },
    })
    assert(data.cached === true, 'second identical request was not served from cache')
  })

  // —— Diagnostic gate, then task generation with listening questions ——
  await check('diagnostic gate satisfied', async () => {
    const { data } = await call('GET', `/api/classes/diagnostic-status?classId=${classId}`, {
      cookie: teacherCookie,
    })
    if (!data.hasDiagnostic) {
      const created = await call('POST', '/api/tasks', {
        cookie: teacherCookie,
        body: {
          type: 'assessment',
          subtype: 'diagnostic',
          class_id: classId,
          description: 'Baseline diagnostic: core reading and grammar knowledge.',
          difficulty: 'medium',
          question_count: 5,
        },
      })
      assert(created.status === 201, `diagnostic creation failed: ${created.data.error}`)
    }
  })

  let taskContent = null
  await check('task generation quality (incl. listen_respond)', async () => {
    const { status, data } = await call('POST', '/api/tasks', {
      cookie: teacherCookie,
      body: {
        type: 'homework',
        class_id: classId,
        description:
          'Listening and comprehension practice: a short talk about how animals adapt to extreme environments, with mixed question types.',
        difficulty: 'medium',
        question_count: 8,
        use_all_question_types: true,
      },
    })
    assert(status === 201, `status ${status}: ${data.error || 'unknown'}`)
    const content = data.task?.content
    assert(content?.questions?.length >= 5, `only ${content?.questions?.length ?? 0} questions`)
    const blob = JSON.stringify(content)
    for (const marker of FALLBACK_MARKERS.task) {
      assert(!marker.test(blob), `deterministic fallback detected (${marker})`)
    }
    for (const q of content.questions) {
      assert(q.topic && q.learningObjective, `question ${q.id} missing topic/objective`)
      assert(q.prompt && q.prompt.length > 15, `question ${q.id} prompt too thin`)
    }
    const listens = content.questions.filter((q) => q.type === 'listen_respond')
    for (const q of listens) {
      assert(q.audioScript, `listen question ${q.id} missing audioScript`)
      assert(q.audioUrl, `listen question ${q.id} missing audioUrl (TTS wiring broken)`)
      const audio = await call('GET', q.audioUrl, { cookie: teacherCookie, raw: true })
      assert(audio.status === 200, `audio ${audio.status} for ${q.id}`)
      const buf = await audio.arrayBuffer()
      assert(buf.byteLength > 5_000, `audio too small for ${q.id}`)
    }
    taskContent = { id: data.task.id, content }
    return `${content.questions.length} questions, ${listens.length} listening (audio ok)`
  })

  // —— Publish, attempt, AI marking ——
  await check('AI marking quality', async () => {
    assert(taskContent, 'skipped — task creation failed')
    const pub = await call('POST', `/api/tasks/${taskContent.id}/publish`, {
      cookie: teacherCookie,
      body: { assign_all: true },
    })
    assert(pub.status === 200, `publish failed: ${pub.data.error}`)
    const start = await call('POST', '/api/attempts/start', {
      cookie: studentCookie,
      body: { task_id: taskContent.id },
    })
    assert(start.status === 200 || start.status === 201, `start failed: ${start.data.error}`)
    const attemptId = start.data.attemptId
    const answers = {}
    for (const q of taskContent.content.questions) {
      if (q.type === 'mcq' || q.type === 'bloom') answers[q.id] = q.options?.[1] ?? 'Not sure'
      else if (q.type === 'cloze') answers[q.id] = ['evaporation']
      else answers[q.id] = 'Animals adapt by changing their bodies and behaviour over time.'
    }
    const sub = await call('POST', `/api/attempts/${attemptId}/submit`, {
      cookie: studentCookie,
      body: { answers, duration_ms: 240_000 },
    })
    assert(sub.status === 200, `submit failed: ${sub.data.error}`)
    assert(typeof sub.data.score_pct === 'number', 'no score_pct')
    assert(sub.data.score_pct >= 0 && sub.data.score_pct <= 100, `score out of range: ${sub.data.score_pct}`)
    const feedback = Object.values(sub.data.feedback ?? {})
    assert(feedback.length > 0, 'no per-question feedback')
    for (const f of feedback) {
      assert(f.feedback && f.feedback.length > 5, 'thin feedback')
      assert(!FALLBACK_MARKERS.mark.some((m) => f.feedback.includes(m)), 'local marker fallback used')
    }
    return `score ${sub.data.score_pct}% across ${feedback.length} questions`
  })

  // —— Lesson planning ——
  await check('lesson plan generation quality', async () => {
    const monday = new Date()
    monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7))
    const { status, data } = await call('POST', '/api/lesson-batches', {
      cookie: teacherCookie,
      body: {
        class_id: classId,
        weeks: 1,
        days_of_week: ['Mon'],
        weekly_frequency: 1,
        duration_minutes: 45,
        start_date: monday.toISOString().slice(0, 10),
        resources: ['projector', 'worksheets'],
      },
    })
    assert(status === 201, `status ${status}: ${data.error || 'unknown'}`)
    const detail = await call('GET', `/api/lesson-batches/${data.batch.id}`, { cookie: teacherCookie })
    const lessons = detail.data.lessons ?? []
    assert(lessons.length === 1, `expected 1 lesson, got ${lessons.length}`)
    const plan = lessons[0].plan
    const blob = JSON.stringify(plan)
    for (const marker of FALLBACK_MARKERS.lessons) {
      assert(!blob.includes(marker), 'deterministic lesson fallback detected')
    }
    for (const stage of ['presentation', 'practice', 'production']) {
      assert(plan[stage]?.steps?.length > 0, `${stage} stage has no steps`)
    }
    const total =
      (plan.presentation?.durationMins ?? 0) + (plan.practice?.durationMins ?? 0) + (plan.production?.durationMins ?? 0)
    assert(Math.abs(total - 45) <= 10, `stage durations sum to ${total}, not ~45`)
    return `"${lessons[0].title}" (${total} min across PPP)`
  })

  // —— Student summary ——
  await check('student summary quality', async () => {
    const { data } = await call('POST', `/api/students/${studentId}/summary`, {
      cookie: teacherCookie,
      body: {},
    })
    assert(data.summary && data.summary.length > 120, 'summary too short')
    assert(!FALLBACK_MARKERS.summary.some((m) => data.summary.includes(m)), 'summary fallback used')
  })

  // —— Report generation ——
  await check('report generation quality', async () => {
    const { status, data } = await call('POST', '/api/reports', {
      cookie: teacherCookie,
      body: { student_id: studentId, teacher_notes: 'Self-test report.' },
    })
    assert(status === 201, `status ${status}: ${data.error || 'unknown'}`)
    const content = data.report?.content ?? ''
    assert(content.length > 300, `report too short (${content.length} chars)`)
    assert(/strength|improv|next step/i.test(content), 'report missing expected sections')
  })

  // —— Student practice tools ——
  await check('flashcards generation quality', async () => {
    const { data } = await call('POST', '/api/student/tools/generate', {
      cookie: studentCookie,
      body: { mode: 'flashcards' },
    })
    const cards = data.result?.cards ?? []
    assert(cards.length >= 6, `only ${cards.length} cards`)
    assert(
      !cards.some((c) => FALLBACK_MARKERS.flashcards.some((m) => String(c.front).includes(m))),
      'flashcard fallback used',
    )
    return `${cards.length} cards`
  })

  // —— Weakspot pinpoint ——
  await check('weakspot analysis quality', async () => {
    const { status, data } = await call('POST', `/api/students/${studentId}/pinpoint-weakspots`, {
      cookie: teacherCookie,
      body: {},
    })
    assert(status === 200, `status ${status}: ${data.error || 'unknown'}`)
    assert(!FALLBACK_MARKERS.weakspots.some((m) => (data.summary || '').includes(m)), 'weakspot fallback used')
    assert((data.weakspots ?? []).length > 0, 'no weakspots returned')
    return `${data.weakspots.length} weakspots`
  })

  finish()
}

function finish() {
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('Failed:')
    for (const f of failed) console.log(`  - ${f.name}: ${f.note}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('self-test crashed:', err)
  process.exit(1)
})
