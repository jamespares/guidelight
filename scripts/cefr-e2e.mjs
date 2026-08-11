#!/usr/bin/env node
/**
 * End-to-end test of the CEFR English level test and the reading speed test
 * against a running worker (default: local dev on :5173).
 *
 * Covers, for the English level test: special-task creation, individual
 * assignment scoping, the phase machine (start/resume/test/result), item
 * sanitisation (no answers/transcripts leak mid-test), audio availability,
 * a full 72-item submission with a known answer pattern, per-item scoring vs
 * the shared engine, level estimation, double-submit rejection, teacher-side
 * visibility, and written-marking (AI) verification when the AI binding is
 * reachable.
 *
 * Covers, for reading speed: creation + assignment, the phase machine
 * (start/reading/checks/result), WPM bound rejection, spot-check failure and
 * success, latest_wpm updates, teacher visibility, and reading materials /
 * machine-session / story-event persistence.
 *
 * Expectations are computed from the real shared engines (bundled with esbuild
 * at startup), so this script always tests against production logic.
 *
 * Prereqs:
 *   1. npm run db:demo:seed:local
 *   2. npm run dev   (or: npx wrangler dev, then pass --base http://localhost:8787)
 *
 * Usage:
 *   npm run test:cefr
 *   node scripts/cefr-e2e.mjs --base http://localhost:5173
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const baseIdx = args.indexOf('--base')
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : 'http://localhost:5173'

const TEACHER = { email: 'demo@guidelight.test', password: 'demo1234' }
const RUI = { username: 'demo.rui', password: 'demo1234' } // IELTS class, no CEFR test seeded
const JIN = { username: 'demo.jin', password: 'demo1234' } // IELTS class, no speed test seeded
const IELTS_CLASS = 'demo-class-ielts'
const RUI_ID = 'demo-stu-rui'
const JIN_ID = 'demo-stu-jin'

const FETCH_TIMEOUT_MS = 60_000
const results = []
const cookies = {}

// —— Shared-engine bundle (built from source at startup) ——
let engines = null
function bundleEngines() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gl-cefr-e2e-'))
  const esbuild = path.resolve('node_modules/.bin/esbuild')
  execFileSync(esbuild, [
    'shared/cefr/test-engine.ts',
    'shared/cefr/items.ts',
    'shared/cefr/reading-checks.ts',
    'shared/cefr/rsvp.ts',
    '--bundle',
    '--format=esm',
    '--out-extension:.js=.mjs',
    `--outdir=${dir}`,
  ])
  return {
    items: path.join(dir, 'items.mjs'),
    engine: path.join(dir, 'test-engine.mjs'),
    checks: path.join(dir, 'reading-checks.mjs'),
    rsvp: path.join(dir, 'rsvp.mjs'),
  }
}

// FNV-1a 32-bit — must match worker/lib/cefr.ts hashSeed (spot-check seed per task)
function hashSeed(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function cookieFrom(res) {
  const raw = res.headers.get('set-cookie') || ''
  const m = raw.match(/session=([^;]+)/)
  return m ? `session=${m[1]}` : ''
}

async function call(method, path, { body, cookie, raw } = {}) {
  // The worker IP-rate-limits /api/* to 60 req per fixed 60 s window (429s do
  // not consume budget). On 429, wait for the window to roll over and retry.
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
        const waitMs = 61_000 - (Date.now() % 60_000)
        await sleep(waitMs)
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function login(who, key) {
  const url = who.email ? '/api/auth/teacher/login' : '/api/auth/student/login'
  const res = await call('POST', url, { body: who, raw: true })
  assert(res.status === 200, `login status ${res.status} — is demo data seeded?`)
  cookies[key] = cookieFrom(res)
  assert(cookies[key], 'no session cookie returned')
}

/** A short reading passage (53 words → minimal sleeps while staying in WPM bounds). */
const SPEED_PASSAGE =
  'Maya opened the small bakery before sunrise every morning. She mixed flour, water, ' +
  'and salt, then shaped the dough into round loaves. Customers came from every corner ' +
  'of the town for her bread. Some said the secret was the old stone oven. Maya only ' +
  'smiled and said the secret was waking up early.' // 48 words

async function main() {
  console.log(`Guidelight CEFR + reading-speed E2E against ${BASE}\n`)

  await check('bundle shared engines from source', async () => {
    const paths = bundleEngines()
    const [items, engine, checks, rsvp] = await Promise.all([
      import(pathToFileURL(paths.items).href),
      import(pathToFileURL(paths.engine).href),
      import(pathToFileURL(paths.checks).href),
      import(pathToFileURL(paths.rsvp).href),
    ])
    engines = { ...items, ...engine, ...checks, ...rsvp }
    return `${engines.ITEMS.length} bank items`
  })
  if (!engines) return finish()

  await check('logins (teacher, demo.rui, demo.jin)', async () => {
    await login(TEACHER, 'teacher')
    await login(RUI, 'rui')
    await login(JIN, 'jin')
  })
  if (!cookies.teacher || !cookies.rui || !cookies.jin) return finish()

  let aiUp = false
  await check('AI binding probe (TTS)', async () => {
    const { status, data } = await call('POST', '/api/tts', {
      cookie: cookies.teacher,
      body: { text: 'Connectivity probe for the reading test audio pipeline.' },
    })
    aiUp = status === 200
    return aiUp ? `AI reachable (${data.url})` : 'AI unreachable — AI-dependent checks will verify fallback paths'
  })

  // ═══════════════════════ ENGLISH LEVEL TEST (demo.rui) ═══════════════════════
  let cefrTaskId = ''
  await check('cefr: teacher creates english_level task', async () => {
    const { status, data } = await call('POST', '/api/tasks', {
      cookie: cookies.teacher,
      body: {
        type: 'assessment',
        subtype: 'english_level',
        class_id: IELTS_CLASS,
        description: 'E2E CEFR diagnostic run',
        difficulty: 'medium',
      },
    })
    assert(status === 201, `status ${status}: ${JSON.stringify(data)}`)
    assert(data.task?.status === 'draft', 'task not created as draft')
    cefrTaskId = data.task.id
  })
  if (!cefrTaskId) return finish()

  await check('cefr: publish to demo.rui only; assignment scoping holds', async () => {
    const pub = await call('POST', `/api/tasks/${cefrTaskId}/publish`, {
      cookie: cookies.teacher,
      body: { student_ids: [RUI_ID] },
    })
    assert(pub.status === 200, `publish status ${pub.status}: ${JSON.stringify(pub.data)}`)
    const ruiTasks = await call('GET', '/api/student/tasks', { cookie: cookies.rui })
    assert(
      (ruiTasks.data.tasks ?? []).some((t) => t.id === cefrTaskId),
      'rui does not see the task',
    )
    const jinTasks = await call('GET', '/api/student/tasks', { cookie: cookies.jin })
    assert(
      !(jinTasks.data.tasks ?? []).some((t) => t.id === cefrTaskId),
      'jin sees a task assigned only to rui',
    )
  })

  let testId = ''
  let testItems = []
  await check('cefr: phase machine start → test with 72 sanitised items', async () => {
    const s = await call('GET', `/api/cefr/tests/task/${cefrTaskId}`, { cookie: cookies.rui })
    assert(s.data.phase === 'start', `expected phase start, got ${s.data.phase}`)
    assert(s.data.timeLimitSeconds === 3600, `time limit ${s.data.timeLimitSeconds}`)

    const st = await call('POST', `/api/cefr/tests/task/${cefrTaskId}/start`, { cookie: cookies.rui })
    assert(st.status === 200 && st.data.testId, `start failed: ${JSON.stringify(st.data)}`)
    testId = st.data.testId

    const t = await call('GET', `/api/cefr/tests/${testId}`, { cookie: cookies.rui })
    assert(t.data.phase === 'test', `expected phase test, got ${t.data.phase}`)
    testItems = t.data.items
    assert(testItems.length === 72, `expected 72 items, got ${testItems.length}`)
    assert(t.data.passages && Object.keys(t.data.passages).length >= 6, 'passages missing')

    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
    for (const level of levels) {
      const at = testItems.filter((i) => i.level === level)
      assert(at.length === 12, `${level}: expected 12 items, got ${at.length}`)
      const seq = at.map((i) => i.type).join(',')
      assert(
        seq === 'mcq,dictation,listening,listening,reading,reading,reading,reading,reading,cloze,cloze,written',
        `${level}: unexpected type sequence ${seq}`,
      )
    }

    // No answers or transcripts may leak mid-test
    const leaked = ['"correct"', '"transcript"', '"audioText"', '"keywords"'].filter((k) =>
      JSON.stringify(testItems).includes(k),
    )
    assert(leaked.length === 0, `sanitisation leak: ${leaked.join(', ')}`)

    const audioItems = testItems.filter((i) => i.type === 'dictation' || i.type === 'listening')
    assert(audioItems.length === 18, `expected 18 audio items (6 dictation + 12 listening), got ${audioItems.length}`)
    for (const i of audioItems) {
      assert(/^\/cefr-audio\/.+\.mp3$/.test(i.audioUrl ?? ''), `${i.id}: bad audioUrl ${i.audioUrl}`)
    }
    return `testId ${testId}`
  })
  if (!testId) return finish()

  await check('cefr: all referenced audio files are served', async () => {
    const urls = [...new Set(testItems.map((i) => i.audioUrl).filter(Boolean))]
    assert(urls.length === 12, `expected 12 unique audio urls, got ${urls.length}`)
    for (const u of urls) {
      const res = await call('GET', u, { cookie: cookies.rui, raw: true })
      const buf = await res.arrayBuffer()
      assert(res.status === 200, `${u}: status ${res.status}`)
      assert((res.headers.get('content-type') ?? '').includes('audio/mpeg'), `${u}: not mp3`)
      assert(buf.byteLength > 1000, `${u}: only ${buf.byteLength} bytes`)
    }
    return '12/12 mp3 served'
  })

  await check('cefr: start is idempotent (resume in-progress)', async () => {
    const st = await call('POST', `/api/cefr/tests/task/${cefrTaskId}/start`, { cookie: cookies.rui })
    assert(st.data.resumed === true && st.data.testId === testId, `got ${JSON.stringify(st.data)}`)
  })

  // Known answer pattern: A1–B2 fully correct; C1 wrong; C2 wrong except a partial dictation.
  const { findItem, scoreAnswers, calculateLevel, totalScore } = engines
  const answers = {}
  let expectedLevel = 'A1'
  let expectedTotals = { score: 0, max: 0 }
  await check('cefr: full 72-item submission scores as simulated (level B2)', async () => {
    const c2dictation = testItems.find((i) => i.level === 'C2' && i.type === 'dictation')
    for (const item of testItems) {
      const bank = findItem(item.id)
      assert(bank, `item ${item.id} not in bank`)
      const ace = ['A1', 'A2', 'B1', 'B2'].includes(item.level)
      if (ace) {
        if (bank.type === 'dictation') answers[item.id] = bank.transcript
        else if (bank.type === 'written') {
          answers[item.id] =
            `Here is my answer. ${bank.keywords.map((k) => `I think ${k} matters here`).join('. ')}. ` +
            'That is my honest view on this topic.'
        } else answers[item.id] = bank.correct
      } else if (item.id === c2dictation.id) {
        const words = bank.transcript.split(' ')
        answers[item.id] = words.slice(0, Math.ceil(words.length * 0.6)).join(' ')
      } else {
        answers[item.id] = 'I really do not know this one at all.'
      }
    }

    const simulated = scoreAnswers(
      testItems.map((i) => findItem(i.id)),
      testItems.map((i) => ({ itemId: i.id, response: answers[i.id] })),
    )
    expectedTotals = totalScore(simulated)
    expectedLevel = calculateLevel(simulated)
    assert(expectedLevel === 'B2', `simulation says ${expectedLevel}, expected B2 — answer pattern broken`)

    const res = await call('POST', `/api/cefr/tests/${testId}/submit`, {
      cookie: cookies.rui,
      body: { answers },
    })
    assert(res.status === 200, `submit status ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`)
    assert(res.data.cefr_level === 'B2', `cefr_level ${res.data.cefr_level}, expected B2`)
    assert(res.data.max_score === expectedTotals.max, `max_score ${res.data.max_score} ≠ ${expectedTotals.max}`)
    if (!aiUp) {
      assert(
        res.data.total_score === expectedTotals.score,
        `total_score ${res.data.total_score} ≠ simulated ${expectedTotals.score}`,
      )
    }
    assert(res.data.ieltsBand === '5.5–6.5', `ielts band ${res.data.ieltsBand}`)
    assert(res.data.over_time_seconds === 0, `overtime ${res.data.over_time_seconds}`)
    return `level ${res.data.cefr_level}, score ${res.data.total_score}/${res.data.max_score}${aiUp ? ' (AI re-marked)' : ''}`
  })

  await check('cefr: double submit rejected', async () => {
    const res = await call('POST', `/api/cefr/tests/${testId}/submit`, {
      cookie: cookies.rui,
      body: { answers },
    })
    assert(res.status === 400, `expected 400, got ${res.status}`)
  })

  await check('cefr: result phase reveals answers, transcripts and per-item scores', async () => {
    const r = await call('GET', `/api/cefr/tests/task/${cefrTaskId}`, { cookie: cookies.rui })
    assert(r.data.phase === 'result', `phase ${r.data.phase}`)
    const responses = r.data.responses
    assert(responses.length === 72, `expected 72 responses, got ${responses.length}`)
    let checked = 0
    for (const resp of responses) {
      const bank = findItem(resp.itemId)
      assert(bank, `${resp.itemId} not in bank`)
      if (['mcq', 'cloze', 'reading', 'listening'].includes(bank.type)) {
        assert(resp.correct === bank.correct, `${resp.itemId}: correct not revealed`)
        assert(Array.isArray(resp.options), `${resp.itemId}: options missing`)
        const sim = ['A1', 'A2', 'B1', 'B2'].includes(bank.level)
          ? bank.maxScore
          : 0
        assert(resp.score === sim, `${resp.itemId}: score ${resp.score} ≠ ${sim}`)
        checked++
      }
      if (bank.type === 'dictation') {
        assert(resp.transcript === bank.transcript, `${resp.itemId}: transcript not revealed`)
        if (bank.level === 'C2') {
          assert(resp.score > 0 && resp.score < bank.maxScore, `C2 dictation partial score ${resp.score}`)
          checked++
        }
      }
      assert(resp.response === answers[resp.itemId], `${resp.itemId}: stored response mismatch`)
    }
    assert(checked === 61, `objective score assertions ran on ${checked} items, expected 61`)
    return `${responses.length} responses verified`
  })

  await check('cefr: written marking (AI or keyword fallback)', async () => {
    const r = await call('GET', `/api/cefr/tests/task/${cefrTaskId}`, { cookie: cookies.rui })
    const marks = r.data.writtenMarks ?? {}
    const writtenCount = testItems.filter((i) => i.type === 'written').length
    assert(writtenCount === 6, `expected 6 written items, got ${writtenCount}`)
    if (aiUp) {
      const ids = Object.keys(marks)
      assert(ids.length === 6, `expected 6 written marks, got ${ids.length}`)
      for (const m of Object.values(marks)) {
        assert(m.feedback && m.feedback.length > 3, 'written mark missing AI feedback')
        assert(typeof m.score === 'number' && typeof m.max === 'number', 'written mark missing score')
      }
      return '6/6 AI-marked'
    }
    assert(Object.keys(marks).length === 0, 'AI down but written marks exist?')
    // keyword fallback still scored the responses
    const writtenResponses = r.data.responses.filter((x) => x.type === 'written')
    assert(
      writtenResponses.every((x) => typeof x.score === 'number'),
      'written responses unscored under fallback',
    )
    return 'AI down — keyword fallback scores verified'
  })

  await check('cefr: teacher sees attempt, archive and updated student level', async () => {
    const list = await call('GET', `/api/tasks/${cefrTaskId}/attempts`, { cookie: cookies.teacher })
    const row = (list.data.attempts ?? []).find((a) => a.student_id === RUI_ID)
    assert(row, 'rui attempt missing from task attempts')
    assert(row.status === 'submitted', `attempt status ${row.status}`)
    assert(row.score_pct > 0, `score_pct ${row.score_pct}`)

    const att = await call('GET', `/api/attempts/${row.id}`, { cookie: cookies.teacher })
    const attempt = att.data.attempt ?? att.data
    const answersJson = typeof attempt.answers_json === 'string' ? JSON.parse(attempt.answers_json) : attempt.answers_json
    assert(Object.keys(answersJson ?? {}).length === 72, 'answers_json does not hold 72 answers')
    const feedback = typeof attempt.feedback_json === 'string' ? JSON.parse(attempt.feedback_json) : attempt.feedback_json
    assert(feedback?.cefr_level === 'B2', `feedback level ${feedback?.cefr_level}`)
    assert((attempt.attempt_archive_md ?? '').includes('CEFR'), 'archive markdown missing')

    const stu = await call('GET', `/api/students/${RUI_ID}`, { cookie: cookies.teacher })
    const student = stu.data.student ?? stu.data
    assert(student.cefr_level === 'B2', `student cefr_level ${student.cefr_level}`)
  })

  // ═══════════════════════ READING SPEED TEST (demo.jin) ═══════════════════════
  let speedTaskId = ''
  await check('speed: teacher creates reading_speed task', async () => {
    const { status, data } = await call('POST', '/api/tasks', {
      cookie: cookies.teacher,
      body: {
        type: 'assessment',
        subtype: 'reading_speed',
        class_id: IELTS_CLASS,
        description: 'E2E reading speed run',
        difficulty: 'medium',
        reading_text: SPEED_PASSAGE,
      },
    })
    assert(status === 201, `status ${status}: ${JSON.stringify(data)}`)
    speedTaskId = data.task.id
    assert(data.task.content?.material_id, 'no reading material created')

    const pub = await call('POST', `/api/tasks/${speedTaskId}/publish`, {
      cookie: cookies.teacher,
      body: { student_ids: [JIN_ID] },
    })
    assert(pub.status === 200, `publish status ${pub.status}`)
    const jinTasks = await call('GET', '/api/student/tasks', { cookie: cookies.jin })
    assert((jinTasks.data.tasks ?? []).some((t) => t.id === speedTaskId), 'jin does not see the task')
    const ruiTasks = await call('GET', '/api/student/tasks', { cookie: cookies.rui })
    assert(!(ruiTasks.data.tasks ?? []).some((t) => t.id === speedTaskId), 'rui sees jin-only task')
  })
  if (!speedTaskId) return finish()

  await check('speed: unrealistically fast finish is rejected + flagged', async () => {
    const s = await call('GET', `/api/reading/speed/${speedTaskId}`, { cookie: cookies.jin })
    assert(s.data.phase === 'start', `phase ${s.data.phase}`)
    const expectedWords = engines.countWords(SPEED_PASSAGE)
    assert(s.data.wordCount === expectedWords, `wordCount ${s.data.wordCount} ≠ ${expectedWords}`)
    const st = await call('POST', `/api/reading/speed/${speedTaskId}/start`, { cookie: cookies.jin })
    assert(st.status === 200 && st.data.body === SPEED_PASSAGE, 'start did not return the passage')
    const fin = await call('POST', `/api/reading/speed/${speedTaskId}/finish`, { cookie: cookies.jin })
    assert(fin.status === 400, `expected 400, got ${fin.status}`)
    assert(/fast/.test(fin.data.error ?? ''), `unexpected error: ${fin.data.error}`)
    const again = await call('GET', `/api/reading/speed/${speedTaskId}`, { cookie: cookies.jin })
    assert(again.data.phase === 'start', `phase after rejection: ${again.data.phase}`)
  })

  let checksFromServer = []
  await check('speed: realistic pace passes WPM bounds and unlocks spot-checks', async () => {
    await call('POST', `/api/reading/speed/${speedTaskId}/start`, { cookie: cookies.jin })
    await sleep(10_500)
    const fin = await call('POST', `/api/reading/speed/${speedTaskId}/finish`, { cookie: cookies.jin })
    assert(fin.status === 200, `finish status ${fin.status}: ${JSON.stringify(fin.data)}`)
    assert(fin.data.next === 'checks', `next ${fin.data.next}`)
    assert(fin.data.wpm >= 80 && fin.data.wpm <= 500, `wpm ${fin.data.wpm} out of bounds`)
    const st = await call('GET', `/api/reading/speed/${speedTaskId}`, { cookie: cookies.jin })
    assert(st.data.phase === 'checks', `phase ${st.data.phase}`)
    checksFromServer = st.data.checks
    assert(checksFromServer.length === 3, `expected 3 checks, got ${checksFromServer.length}`)
    for (const c of checksFromServer) assert(c.options.length === 4, 'check without 4 options')
    assert(st.data.passNeed === 2, `passNeed ${st.data.passNeed}`)
    return `wpm ${fin.data.wpm}`
  })

  await check('speed: failing spot-checks rejects the attempt', async () => {
    const expected = engines.buildSpotChecks(SPEED_PASSAGE, hashSeed(speedTaskId))
    const wrong = {}
    for (const c of expected) {
      wrong[c.id] = c.options.find((o) => o !== c.answer)
    }
    const res = await call('POST', `/api/reading/speed/${speedTaskId}/checks`, {
      cookie: cookies.jin,
      body: { answers: wrong },
    })
    assert(res.status === 400, `expected 400, got ${res.status}: ${JSON.stringify(res.data)}`)
    assert(/need 2/.test(res.data.error ?? ''), `unexpected error: ${res.data.error}`)
  })

  let finalWpm = 0
  await check('speed: correct spot-checks complete the attempt and set latest_wpm', async () => {
    await call('POST', `/api/reading/speed/${speedTaskId}/start`, { cookie: cookies.jin })
    await sleep(10_500)
    const fin = await call('POST', `/api/reading/speed/${speedTaskId}/finish`, { cookie: cookies.jin })
    assert(fin.status === 200, `finish status ${fin.status}`)
    finalWpm = fin.data.wpm
    const expected = engines.buildSpotChecks(SPEED_PASSAGE, hashSeed(speedTaskId))
    const right = Object.fromEntries(expected.map((c) => [c.id, c.answer]))
    const res = await call('POST', `/api/reading/speed/${speedTaskId}/checks`, {
      cookie: cookies.jin,
      body: { answers: right },
    })
    assert(res.status === 200, `checks status ${res.status}: ${JSON.stringify(res.data)}`)
    assert(res.data.checks?.correct === 3 && res.data.checks?.passed === true, JSON.stringify(res.data))

    const st = await call('GET', `/api/reading/speed/${speedTaskId}`, { cookie: cookies.jin })
    assert(st.data.phase === 'result', `phase ${st.data.phase}`)
    assert(st.data.attempt.wpm === finalWpm, `result wpm ${st.data.attempt.wpm} ≠ ${finalWpm}`)
    assert(st.data.attempt.checks_correct === 3, `checks_correct ${st.data.attempt.checks_correct}`)
    assert(st.data.attempt.flagged === 0, 'completed attempt still flagged')

    const stu = await call('GET', `/api/students/${JIN_ID}`, { cookie: cookies.teacher })
    const student = stu.data.student ?? stu.data
    assert(student.latest_wpm === finalWpm, `latest_wpm ${student.latest_wpm} ≠ ${finalWpm}`)
    return `${finalWpm} wpm recorded`
  })

  await check('speed: teacher attempts list shows derived score; rejected attempts reported', async () => {
    const list = await call('GET', `/api/tasks/${speedTaskId}/attempts`, { cookie: cookies.teacher })
    const rows = (list.data.attempts ?? []).filter((a) => a.student_id === JIN_ID)
    assert(rows.length === 1, `expected exactly 1 clean attempt row, got ${rows.length} (stale mirrors?)`)
    const done = rows.find((a) => a.status === 'submitted')
    assert(done, 'no submitted attempt for jin')
    const expectedPct = Math.min(100, Math.round((finalWpm / 300) * 100))
    assert(done.score_pct === expectedPct, `score_pct ${done.score_pct} ≠ ${expectedPct}`)
    return `1 clean row, score_pct ${done.score_pct}`
  })

  await check('reading library: materials, machine session and story events persist', async () => {
    const mats = await call('GET', '/api/reading/materials', { cookie: cookies.jin })
    assert(
      (mats.data.classTexts ?? []).some((m) => m.title?.includes('E2E reading speed')),
      'class material from task creation missing',
    )
    assert(typeof mats.data.latestWpm === 'number', 'latestWpm missing from materials payload')

    const up = await call('POST', '/api/reading/materials', {
      cookie: cookies.jin,
      body: { title: 'E2E upload', body: 'A short personal text for the reading machine.' },
    })
    assert(up.status === 201 && up.data.id, `upload status ${up.status}`)
    const got = await call('GET', `/api/reading/materials/${up.data.id}`, { cookie: cookies.jin })
    assert(got.data.material?.body?.includes('reading machine'), 'material body round-trip failed')
    const del = await call('DELETE', `/api/reading/materials/${up.data.id}`, { cookie: cookies.jin })
    assert(del.status === 200, `delete status ${del.status}`)

    const sess = await call('POST', '/api/reading/machine/session', {
      cookie: cookies.jin,
      body: {
        material_id: mats.data.classTexts[0].id,
        wpm_setting: 260,
        words_read: 53,
        word_count: 53,
        duration_seconds: 11,
        completed: true,
      },
    })
    assert(sess.status === 201, `machine session status ${sess.status}`)

    const ev = await call('POST', '/api/stories/event', {
      cookie: cookies.jin,
      body: { slug: 'a1-the-new-flat', event_type: 'play' },
    })
    assert(ev.status === 200 && ev.data.ok, `story event status ${ev.status}`)
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
  console.error('E2E crashed:', err)
  process.exit(1)
})
