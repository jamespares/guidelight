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
let noahCookie = ''

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function cookieFrom(res) {
  const raw = res.headers.get('set-cookie') || ''
  const m = raw.match(/session=([^;]+)/)
  return m ? `session=${m[1]}` : ''
}

async function call(method, path, { body, cookie, raw } = {}) {
  // /api/* is IP-rate-limited to 60 req per fixed 60 s window; 429s do not
  // consume budget. On 429, wait for the window to roll and retry.
  for (let attempt = 0; attempt < 3; attempt++) {
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
      if (res.status === 429 && attempt < 2) {
        await sleep(61_000 - (Date.now() % 60_000))
        continue
      }
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
  throw new Error('rate limited repeatedly')
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
    const res = await call('POST', '/api/auth/teacher/login', { body: TEACHER, raw: true })
    assert(res.status === 200, `login status ${res.status} — is demo data seeded?`)
    teacherCookie = cookieFrom(res)
    assert(teacherCookie, 'no session cookie returned')
  })
  if (!teacherCookie) return finish()

  await check('student login', async () => {
    const res = await call('POST', '/api/auth/student/login', { body: STUDENT, raw: true })
    assert(res.status === 200, `login status ${res.status}`)
    studentCookie = cookieFrom(res)
    assert(studentCookie, 'no session cookie returned')
    const noah = await call('POST', '/api/auth/student/login', {
      body: { username: 'demo.noah', password: 'demo1234' },
      raw: true,
    })
    noahCookie = cookieFrom(noah)
    assert(noahCookie, 'noah login failed')
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
  await check('TTS generate (Aura-2 via Workers AI)', async () => {
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
    taskContent = { id: data.task.id, content }
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
    return `${content.questions.length} questions, ${listens.length} listening (audio ok)`
  })

  // —— Review flow: teacher edits persist; previews never leak answers ——
  const SENTINEL = 'photosynthesis sentinel zebra'
  let sentinelQid = ''
  await check('review edit persists; preview strips answers', async () => {
    assert(taskContent, 'skipped — task creation failed')
    const content = JSON.parse(JSON.stringify(taskContent.content))
    const q = content.questions.find((x) => x.type === 'mcq') ?? content.questions[0]
    sentinelQid = q.id
    q.correctAnswer = SENTINEL
    const patch = await call('PATCH', `/api/tasks/${taskContent.id}`, {
      cookie: teacherCookie,
      body: { content },
    })
    assert(patch.status === 200, `patch status ${patch.status}`)

    const got = await call('GET', `/api/tasks/${taskContent.id}`, { cookie: teacherCookie })
    const gq = (got.data.task?.content?.questions ?? []).find((x) => x.id === sentinelQid)
    assert(gq?.correctAnswer === SENTINEL, 'edited correctAnswer did not persist')

    const prev = await call('GET', `/api/tasks/${taskContent.id}/preview`, { cookie: teacherCookie })
    const blob = JSON.stringify(prev.data.task?.content ?? {})
    assert(!blob.includes('correctAnswer'), 'preview leaks correctAnswer key')
    assert(!blob.includes(SENTINEL), 'preview leaks answer content')
    assert(!blob.includes('"blanks"'), 'preview leaks cloze blanks')
    return `sentinel on ${sentinelQid}`
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
      if (q.id === sentinelQid) answers[q.id] = SENTINEL
      else if (q.type === 'mcq' || q.type === 'bloom') answers[q.id] = q.options?.[1] ?? 'Not sure'
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
    // The marker must honour the teacher-edited correctAnswer (sentinel answer == sentinel key)
    const sf = sub.data.feedback?.[sentinelQid]
    assert(sf, `no feedback for sentinel question ${sentinelQid}`)
    assert(sf.correct === true, 'marker ignored the programmed correctAnswer')
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

  // —— Essay task: rubric → model essay → rubric-aware marking → rewrite loop ——
  await check('essay task with rubric: model essay, marking, rewrite loop', async () => {
    const rubric =
      'Band 5: clear position, logically developed ideas, cohesive paragraphing. ' +
      'Band 3: position present but development uneven. Band 1: off-topic or incomprehensible.'
    const created = await call('POST', '/api/tasks', {
      cookie: teacherCookie,
      body: {
        type: 'homework',
        class_id: classId,
        description: 'Opinion essay: should schools ban smartphones in classrooms?',
        difficulty: 'medium',
        question_types: ['extended_written'],
        rubric_text: rubric,
      },
    })
    assert(created.status === 201, `create status ${created.status}: ${created.data.error}`)
    const essayTask = created.data.task
    const essayQid = essayTask.content?.questions?.[0]?.id
    assert(essayQid, 'no essay question generated')

    const detail = await call('GET', `/api/tasks/${essayTask.id}`, { cookie: teacherCookie })
    const modelEssay = detail.data.task?.model_essay ?? ''
    // The silent failure mode is an EMPTY model essay; length varies with the model.
    assert(modelEssay.length > 200, `model essay too short (${modelEssay.length} chars) — AI fallback?`)
    assert(detail.data.task?.rubric_text === rubric, 'rubric_text not stored')

    // Publish to the main demo student only — individual assignment scoping
    const pub = await call('POST', `/api/tasks/${essayTask.id}/publish`, {
      cookie: teacherCookie,
      body: { student_ids: [studentId] },
    })
    assert(pub.status === 200, `publish status ${pub.status}`)
    const mine = await call('GET', '/api/student/tasks', { cookie: studentCookie })
    assert((mine.data.tasks ?? []).some((t) => t.id === essayTask.id), 'assigned student cannot see task')
    const others = await call('GET', '/api/student/tasks', { cookie: noahCookie })
    assert(!(others.data.tasks ?? []).some((t) => t.id === essayTask.id), 'unassigned student sees task')

    // Student view: rubric visible, model essay withheld pre-submit
    const preTask = await call('GET', `/api/tasks/${essayTask.id}`, { cookie: studentCookie })
    assert(!preTask.data.task?.model_essay, 'model essay leaked before submit')
    assert(preTask.data.task?.rubric_text === rubric, 'rubric not visible to student pre-writing')

    const essayAnswer =
      'Smartphones have become a constant presence in classrooms, and I believe schools should ban them ' +
      'during lessons. Firstly, phones fragment attention: even a silent notification pulls a student out ' +
      'of deep thought, and studies show it can take several minutes to refocus. Secondly, banning phones ' +
      'encourages real conversation during group work, which builds the communication skills employers ' +
      'actually ask for. Admittedly, phones can be useful research tools, but schools already provide ' +
      'laptops for that purpose, so the argument for phones is weak. In conclusion, a classroom ban on ' +
      'smartphones would protect attention and improve discussion, with little genuine loss.'
    const start = await call('POST', '/api/attempts/start', {
      cookie: studentCookie,
      body: { task_id: essayTask.id },
    })
    assert(start.status === 200, `attempt start ${start.status}`)
    const sub = await call('POST', `/api/attempts/${start.data.attemptId}/submit`, {
      cookie: studentCookie,
      body: { answers: { [essayQid]: essayAnswer }, duration_ms: 420_000 },
    })
    assert(sub.status === 200, `submit status ${sub.status}: ${sub.data.error}`)
    assert((sub.data.model_essay ?? '').length > 200, 'model essay not revealed after submit')
    const fb = sub.data.feedback?.[essayQid]
    assert(fb && String(fb.feedback ?? '').length > 20, 'no essay feedback returned')
    assert(!FALLBACK_MARKERS.mark.some((m) => String(fb.feedback).includes(m)), 'essay local fallback used')

    // Rewrite loop: a fresh attempt on the same task
    const re = await call('POST', '/api/attempts/start', {
      cookie: studentCookie,
      body: { task_id: essayTask.id },
    })
    assert(re.status === 200 && re.data.attemptId !== start.data.attemptId, 'rewrite did not start a new attempt')
    const sub2 = await call('POST', `/api/attempts/${re.data.attemptId}/submit`, {
      cookie: studentCookie,
      body: { answers: { [essayQid]: `${essayAnswer} (Revised with a sharper thesis.)` }, duration_ms: 300_000 },
    })
    assert(sub2.status === 200, `rewrite submit status ${sub2.status}`)
    return `model essay ${modelEssay.length} chars; rubric-marked; rewrite ok`
  })

  // —— Assessment from an uploaded past-paper image (vision path) ——
  await check('assessment creation with past-paper image upload', async () => {
    // 1×1 png — enough to exercise the upload + vision wiring end to end
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const { status, data } = await call('POST', '/api/tasks', {
      cookie: teacherCookie,
      body: {
        type: 'assessment',
        subtype: 'formative',
        class_id: classId,
        description: 'Reading comprehension in the style of the uploaded past paper image.',
        difficulty: 'medium',
        question_count: 4,
        past_paper_image: png,
      },
    })
    assert(status === 201, `status ${status}: ${data.error || 'unknown'}`)
    const detail = await call('GET', `/api/tasks/${data.task.id}`, { cookie: teacherCookie })
    const notes = detail.data.task?.past_paper_text ?? ''
    assert(notes.length > 0, 'no past_paper_text stored from image')
    assert(
      !notes.includes('mimic a formal exam layout'),
      'canned vision fallback notes — the AI image path did not run',
    )
    return `vision notes ${notes.length} chars`
  })

  // —— Insights aggregate the new submissions ——
  await check('student insights reflect submissions', async () => {
    const { status, data } = await call('GET', `/api/insights?scope=student&id=${studentId}`, {
      cookie: teacherCookie,
    })
    assert(status === 200, `status ${status}`)
    assert(Array.isArray(data.scoreSeries), 'scoreSeries missing')
    assert(data.scoreSeries.length > 0, 'scoreSeries empty after submissions')
    assert(Array.isArray(data.weakspots), 'weakspots missing')
    assert(typeof data.hwRate === 'number', 'hwRate missing')
    return `${data.scoreSeries.length} scores, ${data.weakspots.length} weakspots`
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
