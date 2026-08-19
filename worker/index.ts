import type { Env, LessonPlan, TaskContent } from './types'
import {
  error,
  generateId,
  hashPassword,
  json,
  parseNameBlock,
  randomPassword,
  slugify,
} from './lib/auth'
import {
  generateLessonPlans,
  generateModelEssay,
  generatePracticeOrFlashcards,
  generateReport,
  generateStudentSummary,
  generateTaskContent,
  describePastPaperImage,
  markAttempt,
  pinpointWeakspotsFromArchives,
} from './lib/ai'
import { normalizeDaysOfWeek, scheduleLessonSlots } from './lib/lessonSchedule'
import { synthesizeSpeech, TTS_VOICES } from './lib/tts'
import { buildAttemptArchiveMd, truncateArchives } from './lib/attemptArchive'
import { getSession, handleAuth, requireRole } from './lib/session'
import {
  AiBudgetExceededError,
  aiBudgetExceededResponse,
  assertAiBudget,
  teacherIdForStudent,
} from './lib/billing'
import { handleBillingApi, runMonthlyBilling } from './lib/billingApi'
import {
  checkBodySize,
  corsPreflight,
  withSecurityHeaders,
} from './lib/security'
import { rateLimitIp } from './lib/rateLimit'
import { parseJsonBody } from './lib/validation'
import {
  createSpecialTask,
  handleCefrApi,
} from './lib/cefr'
import {
  handleExamsApi,
  getExamProfileRow,
  generateMockFromProfile,
  getMockExamMarkingContext,
  examReadinessForStudents,
} from './lib/exams'

const PHASE2_TYPES = ['mcq', 'cloze', 'short_written', 'reading_comprehension']
const ALL_TYPES = [
  ...PHASE2_TYPES,
  'bloom',
  'frayer',
  'image_analysis',
  'extended_written',
  'listen_respond',
]

async function classOwned(env: Env, classId: string, teacherId: string) {
  return env.DB.prepare(`SELECT * FROM classes WHERE id = ? AND teacher_id = ?`)
    .bind(classId, teacherId)
    .first()
}

// Remove correct answers so students (and teacher previews) never receive them
function stripTaskAnswers(content: TaskContent): TaskContent {
  return {
    ...content,
    questions: (content.questions ?? []).map((q) => ({
      ...q,
      correctAnswer: undefined,
      blanks: undefined,
    })),
  }
}

async function fetchStudentTasks(env: Env, studentId: string) {
  const student = await env.DB.prepare(`SELECT class_id FROM students WHERE id = ?`)
    .bind(studentId)
    .first<{ class_id: string }>()
  if (!student) return []

  const { results } = await env.DB.prepare(
    `SELECT t.id, t.type, t.subtype, t.title, t.subject, t.difficulty,
            t.time_limit_seconds, t.published_at,
            (t.model_essay <> '') AS is_essay,
            (SELECT score_pct FROM attempts WHERE task_id = t.id AND student_id = ? AND status = 'submitted' ORDER BY submitted_at DESC LIMIT 1) as last_score,
            (SELECT status FROM attempts WHERE task_id = t.id AND student_id = ? ORDER BY started_at DESC LIMIT 1) as attempt_status
     FROM tasks t
     JOIN task_assignments a ON a.task_id = t.id
     WHERE t.class_id = ? AND t.status = 'published'
       AND (a.student_id IS NULL OR a.student_id = ?)
     ORDER BY t.published_at DESC`,
  )
    .bind(studentId, studentId, student.class_id, studentId)
    .all()
  return results ?? []
}

type InsightEventRow = {
  id: string
  name: string
  event_date: string
  description: string
  class_id: string | null
  student_id: string | null
}

function mapInsightEvents(rows: InsightEventRow[]) {
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    event_date: e.event_date,
    description: e.description,
    scope: e.class_id ? ('class' as const) : ('student' as const),
  }))
}

/** Class events for a class, or class+student events for a student (privacy: no other students). */
async function loadInsightEvents(
  env: Env,
  opts: { classId: string } | { studentId: string; classId: string },
) {
  if ('studentId' in opts) {
    const rows = await env.DB.prepare(
      `SELECT id, name, event_date, description, class_id, student_id
       FROM insight_events
       WHERE class_id = ? OR student_id = ?
       ORDER BY event_date ASC, created_at ASC`,
    )
      .bind(opts.classId, opts.studentId)
      .all<InsightEventRow>()
    return mapInsightEvents(rows.results ?? [])
  }
  const rows = await env.DB.prepare(
    `SELECT id, name, event_date, description, class_id, student_id
     FROM insight_events
     WHERE class_id = ?
     ORDER BY event_date ASC, created_at ASC`,
  )
    .bind(opts.classId)
    .all<InsightEventRow>()
  return mapInsightEvents(rows.results ?? [])
}

async function hasDiagnostic(env: Env, classId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM tasks WHERE class_id = ? AND type = 'assessment' AND subtype = 'diagnostic' AND status = 'published' LIMIT 1`,
  )
    .bind(classId)
    .first()
  return !!row
}

async function recomputeWeakspots(env: Env, studentId: string) {
  const { results } = await env.DB.prepare(
    `SELECT feedback_json FROM attempts WHERE student_id = ? AND status = 'submitted'`,
  )
    .bind(studentId)
    .all<{ feedback_json: string }>()

  const topicErrors: Record<string, number> = {}
  for (const a of results ?? []) {
    try {
      const fb = JSON.parse(a.feedback_json) as Record<
        string,
        { correct?: boolean; topic?: string }
      >
      for (const item of Object.values(fb)) {
        if (item.correct === false && item.topic) {
          topicErrors[item.topic] = (topicErrors[item.topic] ?? 0) + 1
        }
      }
    } catch {
      /* ignore */
    }
  }

  const weakspots = Object.entries(topicErrors)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, count]) => ({ topic, count }))

  await env.DB.prepare(`UPDATE students SET weakspots = ? WHERE id = ?`)
    .bind(JSON.stringify(weakspots), studentId)
    .run()
}

/** Rebuild attempt_archive_md when empty (idempotent). */
async function ensureAttemptArchive(
  env: Env,
  row: {
    id: string
    attempt_archive_md: string | null
    answers_json: string
    feedback_json: string
    score_pct: number | null
    submitted_at: string | null
    display_name: string
    title: string
    type: string
    subtype: string | null
    subject: string
    content_json: string
  },
): Promise<string> {
  if (row.attempt_archive_md && row.attempt_archive_md.trim()) {
    return row.attempt_archive_md
  }
  let content: TaskContent = { title: '', instructions: '', questions: [] }
  let answers: Record<string, unknown> = {}
  let feedback: Record<string, unknown> = {}
  try {
    content = JSON.parse(row.content_json || '{}') as TaskContent
  } catch {
    /* ignore */
  }
  try {
    answers = JSON.parse(row.answers_json || '{}') as Record<string, unknown>
  } catch {
    /* ignore */
  }
  try {
    feedback = JSON.parse(row.feedback_json || '{}') as Record<string, unknown>
  } catch {
    /* ignore */
  }

  const md = buildAttemptArchiveMd({
    studentName: row.display_name,
    taskTitle: row.title || content.title || 'Untitled',
    taskType: row.type,
    subtype: row.subtype,
    subject: row.subject,
    submittedAt: row.submitted_at || '',
    scorePct: row.score_pct,
    content,
    answers,
    feedback: feedback as Parameters<typeof buildAttemptArchiveMd>[0]['feedback'],
  })

  await env.DB.prepare(`UPDATE attempts SET attempt_archive_md = ? WHERE id = ?`)
    .bind(md, row.id)
    .run()
  return md
}

function weakspotLabel(w: { skill?: string; topic?: string }): string {
  return w.skill || w.topic || 'Unknown'
}

/** Batch homework completion rates for every student across multiple classes. */
async function hwCompletionRatesForClass(
  env: Env,
  classIds: string[],
  studentIds: string[],
): Promise<Map<string, number | null>> {
  if (studentIds.length === 0 || classIds.length === 0) return new Map()
  const studentPlaceholders = studentIds.map(() => '?').join(',')
  const classPlaceholders = classIds.map(() => '?').join(',')

  const [{ results: assignedRows }, { results: submittedRows }] = await Promise.all([
    env.DB.prepare(
      `SELECT a.student_id, COUNT(DISTINCT t.id) as c
       FROM tasks t
       JOIN task_assignments a ON a.task_id = t.id
       WHERE t.class_id IN (${classPlaceholders}) AND t.type = 'homework' AND t.status = 'published'
         AND (a.student_id IS NULL OR a.student_id IN (${studentPlaceholders}))
       GROUP BY a.student_id`,
    )
      .bind(...classIds, ...studentIds)
      .all<{ student_id: string | null; c: number }>(),
    env.DB.prepare(
      `SELECT att.student_id, COUNT(DISTINCT att.task_id) as c
       FROM attempts att
       JOIN tasks t ON t.id = att.task_id
       WHERE att.student_id IN (${studentPlaceholders}) AND t.type = 'homework'
         AND att.status = 'submitted'
       GROUP BY att.student_id`,
    )
      .bind(...studentIds)
      .all<{ student_id: string; c: number }>(),
  ])

  const wholeClassAssigned =
    (assignedRows ?? []).find((r) => r.student_id === null)?.c ?? 0
  const specificAssigned = new Map<string, number>()
  for (const row of assignedRows ?? []) {
    if (row.student_id) specificAssigned.set(row.student_id, row.c)
  }
  const submitted = new Map<string, number>()
  for (const row of submittedRows ?? []) {
    submitted.set(row.student_id, row.c)
  }

  const result = new Map<string, number | null>()
  for (const studentId of studentIds) {
    const total = wholeClassAssigned + (specificAssigned.get(studentId) ?? 0)
    result.set(
      studentId,
      total === 0 ? null : Math.round(((submitted.get(studentId) ?? 0) / total) * 1000) / 10,
    )
  }
  return result
}

/** Batch average homework scores for every student across multiple classes. */
async function avgTaskScoresForClass(
  env: Env,
  classIds: string[],
  studentIds: string[],
): Promise<Map<string, number | null>> {
  if (studentIds.length === 0 || classIds.length === 0) return new Map()
  const studentPlaceholders = studentIds.map(() => '?').join(',')
  const classPlaceholders = classIds.map(() => '?').join(',')

  const { results } = await env.DB.prepare(
    `WITH ranked AS (
       SELECT a.student_id, a.score_pct,
         ROW_NUMBER() OVER (PARTITION BY a.student_id, a.task_id ORDER BY a.submitted_at DESC) AS rn
       FROM attempts a
       JOIN tasks t ON t.id = a.task_id
       JOIN task_assignments ta ON ta.task_id = t.id
       WHERE t.class_id IN (${classPlaceholders}) AND t.type = 'homework' AND t.status = 'published'
         AND a.student_id IN (${studentPlaceholders})
         AND a.status = 'submitted' AND a.score_pct IS NOT NULL
         AND (ta.student_id IS NULL OR ta.student_id = a.student_id)
     )
     SELECT student_id, ROUND(AVG(score_pct) * 10) / 10 AS avg_score
     FROM ranked
     WHERE rn = 1
     GROUP BY student_id`,
  )
    .bind(...classIds, ...studentIds)
    .all<{ student_id: string; avg_score: number }>()

  const result = new Map<string, number | null>()
  for (const studentId of studentIds) {
    result.set(studentId, null)
  }
  for (const row of results ?? []) {
    result.set(row.student_id, row.avg_score)
  }
  return result
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname

  try {
    // —— Health ——
    if (path === '/health' && request.method === 'GET') {
      await env.DB.prepare('SELECT 1').first()
      const forwardedProto = request.headers.get('X-Forwarded-Proto')
      let cfScheme: string | undefined
      try {
        const cfVisitor = request.headers.get('CF-Visitor')
        if (cfVisitor) cfScheme = (JSON.parse(cfVisitor) as { scheme?: string }).scheme
      } catch {
        /* ignore malformed header */
      }
      const isHttps =
        new URL(request.url).protocol === 'https:' ||
        forwardedProto === 'https' ||
        cfScheme === 'https'
      return json({
        ok: true,
        timestamp: new Date().toISOString(),
        security: {
          https: isHttps,
          hsts: 'max-age=63072000; includeSubDomains; preload',
        },
      })
    }

    // —— GDPR account export / deletion ——
    if (path === '/api/account/export' && request.method === 'GET') {
      const user = await requireRole(env, request, 'teacher')
      if (user instanceof Response) return user
      const exportData = await exportTeacherAccount(env, user.id)
      return json({ export: exportData })
    }

    if (path === '/api/account/delete' && request.method === 'POST') {
      const user = await requireRole(env, request, 'teacher')
      if (user instanceof Response) return user
      await deleteTeacherAccount(env, user.id)
      return json({ ok: true })
    }

      if (path.startsWith('/api/auth')) {
        const res = await handleAuth(env, request, path)
        if (res) return res
      }

      if (path.startsWith('/api/billing')) {
        if (path === '/api/billing/webhook' && request.method === 'POST') {
          return (
            (await handleBillingApi(
              request,
              env,
              path,
              { id: '', role: 'teacher', name: '' },
            )) ?? error('Not found', 404)
          )
        }
        const user = await getSession(env, request)
        if (!user) return error('Unauthorized', 401)
        const res = await handleBillingApi(request, env, path, user)
        if (res) return res
        return error('Not found', 404)
      }

      // —— CEFR / reading / stories APIs ——
      if (
        path.startsWith('/api/reading/') ||
        path.startsWith('/api/cefr/') ||
        path.startsWith('/api/stories/')
      ) {
        const user = await getSession(env, request)
        if (!user) return error('Unauthorized', 401)
        const cefrRes = await handleCefrApi(request, env, path, user)
        if (cefrRes) return cefrRes
        return error('Not found', 404)
      }

      // —— Exam profiles & mock exams ——
      if (
        path.startsWith('/api/exam-profiles') ||
        path.startsWith('/api/student/exam-') ||
        (path.startsWith('/api/students/') && path.endsWith('/exam-readiness'))
      ) {
        const user = await getSession(env, request)
        if (!user) return error('Unauthorized', 401)
        const examsRes = await handleExamsApi(request, env, path, user)
        if (examsRes) return examsRes
        return error('Not found', 404)
      }

      // —— Classes ——
      if (path === '/api/classes' && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const { results } = await env.DB.prepare(
          `SELECT id, teacher_id, name, subject, curriculum, age_range,
                  student_count, created_at
           FROM classes
           WHERE teacher_id = ?
           ORDER BY created_at DESC`,
        )
          .bind(user.id)
          .all()
        return json({ classes: results })
      }

      if (path === '/api/classes' && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const body = (await request.json()) as {
          name?: string
          subject?: string
          curriculum?: string
          age_range?: string
          names_text?: string
          student_count?: number
        }
        if (!body.name || !body.subject || !body.names_text) {
          return error('Name, subject, and student names are required')
        }

        const names = parseNameBlock(body.names_text)
        if (names.length === 0) return error('No student names found in paste')

        const classId = generateId()
        await env.DB.prepare(
          `INSERT INTO classes (id, teacher_id, name, subject, curriculum, age_range, student_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            classId,
            user.id,
            body.name.trim(),
            body.subject.trim(),
            body.curriculum?.trim() ?? '',
            body.age_range?.trim() ?? '',
            names.length,
          )
          .run()

        const credentials: Array<{
          id: string
          display_name: string
          username: string
          password: string
        }> = []

        for (const display_name of names) {
          const id = generateId()
          const base = slugify(display_name) || 'student'
          let username = `${base}${Math.floor(Math.random() * 900 + 100)}`
          // Ensure uniqueness
          for (let i = 0; i < 5; i++) {
            const clash = await env.DB.prepare(`SELECT id FROM students WHERE username = ?`)
              .bind(username)
              .first()
            if (!clash) break
            username = `${base}${Math.floor(Math.random() * 9000 + 1000)}`
          }
          const password = randomPassword(8)
          const password_hash = await hashPassword(password)
          await env.DB.prepare(
            `INSERT INTO students (id, class_id, display_name, username, password_hash)
             VALUES (?, ?, ?, ?, ?)`,
          )
            .bind(id, classId, display_name, username, password_hash)
            .run()
          credentials.push({ id, display_name, username, password })
        }

        return json({ classId, credentials }, 201)
      }

      // —— Students list (spreadsheet) ——
      if (path === '/api/students' && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const { results } = await env.DB.prepare(
          `SELECT s.id, s.class_id, s.display_name, s.interests, s.career_ambitions,
                  s.weakspots, s.weakspots_summary, s.weakspots_updated_at, s.username, s.created_at,
                  s.cefr_level, s.latest_wpm,
                  c.name as class_name, c.subject as class_subject
           FROM students s
           JOIN classes c ON c.id = s.class_id
           WHERE c.teacher_id = ?
           ORDER BY s.display_name
           LIMIT 1000`,
        )
          .bind(user.id)
          .all<{
            id: string
            class_id: string
            display_name: string
            interests: string
            career_ambitions: string
            weakspots: string
            weakspots_summary: string
            weakspots_updated_at: string | null
            username: string
            cefr_level: string | null
            latest_wpm: number | null
            class_name: string
            class_subject: string
          }>()

        const rows = results ?? []
        const classIds = [...new Set(rows.map((r) => r.class_id))]
        const studentIds = rows.map((r) => r.id)

        const [hwRates, avgScores, readinessByClass] = await Promise.all([
          hwCompletionRatesForClass(env, classIds, studentIds),
          avgTaskScoresForClass(env, classIds, studentIds),
          Promise.all(
            classIds.map(async (classId) => ({
              classId,
              readiness: await examReadinessForStudents(
                env,
                classId,
                rows.filter((r) => r.class_id === classId).map((r) => r.id),
              ),
            })),
          ),
        ])
        const readinessByStudent = new Map<string, number | null>()
        for (const { readiness } of readinessByClass) {
          for (const [studentId, value] of readiness) {
            readinessByStudent.set(studentId, value)
          }
        }

        const students = rows.map((s) => ({
          ...s,
          weakspots: JSON.parse(s.weakspots || '[]'),
          hw_completion_rate: hwRates.get(s.id) ?? null,
          avg_score: avgScores.get(s.id) ?? null,
          exam_readiness: readinessByStudent.get(s.id) ?? null,
        }))
        return json({ students })
      }

      const studentMatch = path.match(/^\/api\/students\/([^/]+)$/)
      if (studentMatch && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const studentId = studentMatch[1]
        const s = await env.DB.prepare(
          `SELECT s.id, s.class_id, s.display_name, s.interests, s.career_ambitions,
                  s.weakspots, s.weakspots_summary, s.weakspots_updated_at, s.username, s.parent_username, s.ai_summary, s.created_at,
                  s.cefr_level, s.latest_wpm,
                  c.name as class_name, c.subject as class_subject, c.teacher_id
           FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
        )
          .bind(studentId)
          .first<{
            id: string
            class_id: string
            display_name: string
            interests: string
            career_ambitions: string
            weakspots: string
            weakspots_summary: string
            weakspots_updated_at: string | null
            username: string
            parent_username: string | null
            ai_summary: string
            cefr_level: string | null
            latest_wpm: number | null
            class_name: string
            class_subject: string
            teacher_id: string
          }>()
        if (!s || s.teacher_id !== user.id) return error('Not found', 404)

        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '100')))
        const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'))

        const [attempts, [rate], [avgScore], [examReadiness]] = await Promise.all([
          env.DB.prepare(
            `SELECT a.id, a.task_id, a.student_id, a.started_at, a.submitted_at, a.duration_ms,
                    a.score_pct, a.focus_leave_count, a.flagged, a.status,
                    t.title, t.type, t.subtype
             FROM attempts a
             JOIN tasks t ON t.id = a.task_id
             WHERE a.student_id = ?
             ORDER BY a.started_at DESC
             LIMIT ? OFFSET ?`,
          )
            .bind(studentId, limit, offset)
            .all(),
          hwCompletionRatesForClass(env, [s.class_id], [s.id]).then((m) => [m.get(s.id) ?? null]),
          avgTaskScoresForClass(env, [s.class_id], [s.id]).then((m) => [m.get(s.id) ?? null]),
          examReadinessForStudents(env, s.class_id, [s.id]).then((m) => [m.get(s.id) ?? null]),
        ])
        const { teacher_id: _teacherId, ...safe } = s
        void _teacherId
        return json({
          student: {
            ...safe,
            weakspots: JSON.parse(s.weakspots || '[]'),
            hw_completion_rate: rate,
            avg_score: avgScore,
            exam_readiness: examReadiness,
          },
          attempts: attempts.results,
        })
      }

      if (studentMatch && request.method === 'PATCH') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const studentId = studentMatch[1]
        const owned = await env.DB.prepare(
          `SELECT s.id FROM students s JOIN classes c ON c.id = s.class_id
           WHERE s.id = ? AND c.teacher_id = ?`,
        )
          .bind(studentId, user.id)
          .first()
        if (!owned) return error('Not found', 404)

        const body = (await request.json()) as {
          interests?: string
          career_ambitions?: string
          username?: string
        }

        if (body.username !== undefined) {
          const username = body.username.trim().toLowerCase()
          if (!/^[a-z0-9]{3,32}$/.test(username)) {
            return error('Username must be 3–32 letters or numbers', 400)
          }
          const clash = await env.DB.prepare(
            `SELECT id FROM students WHERE username = ? AND id != ?`,
          )
            .bind(username, studentId)
            .first()
          if (clash) return error('Username already taken', 409)
          await env.DB.prepare(`UPDATE students SET username = ? WHERE id = ?`)
            .bind(username, studentId)
            .run()
        }

        if (body.interests !== undefined || body.career_ambitions !== undefined) {
          await env.DB.prepare(
            `UPDATE students SET interests = COALESCE(?, interests),
             career_ambitions = COALESCE(?, career_ambitions) WHERE id = ?`,
          )
            .bind(body.interests ?? null, body.career_ambitions ?? null, studentId)
            .run()
        }
        return json({ ok: true })
      }

      if (path.match(/^\/api\/students\/[^/]+\/reset-password$/) && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const studentId = path.split('/')[3]
        const owned = await env.DB.prepare(
          `SELECT s.id FROM students s JOIN classes c ON c.id = s.class_id
           WHERE s.id = ? AND c.teacher_id = ?`,
        )
          .bind(studentId, user.id)
          .first()
        if (!owned) return error('Not found', 404)

        const parsed = await parseJsonBody(request)
        if (parsed instanceof Response) return parsed
        const body = parsed as { password?: string }
        let password = body.password?.trim() ?? ''
        if (password) {
          if (password.length < 8 || password.length > 64) {
            return error('Password must be 8–64 characters', 400)
          }
        } else {
          password = randomPassword(8)
        }
        const password_hash = await hashPassword(password)
        await env.DB.prepare(`UPDATE students SET password_hash = ? WHERE id = ?`)
          .bind(password_hash, studentId)
          .run()
        return json({ password })
      }

      // —— Parent credentials management (teacher only) ——
      if (path.match(/^\/api\/students\/[^/]+\/parent-credentials$/) && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const studentId = path.split('/')[3]
        const s = await env.DB.prepare(
          `SELECT s.id, s.username, s.display_name FROM students s
           JOIN classes c ON c.id = s.class_id
           WHERE s.id = ? AND c.teacher_id = ?`,
        )
          .bind(studentId, user.id)
          .first<{ id: string; username: string; display_name: string }>()
        if (!s) return error('Not found', 404)

        const parsed = await parseJsonBody(request)
        if (parsed instanceof Response) return parsed
        const body = parsed as { username?: string; password?: string }

        let parentUsername = body.username?.trim().toLowerCase() ?? ''
        if (parentUsername) {
          if (!/^[a-z0-9._-]{3,40}$/.test(parentUsername)) {
            return error('Username must be 3–40 letters, numbers, dots, hyphens or underscores', 400)
          }
        } else {
          const base = `${s.username}.parent`
          parentUsername = base
          for (let i = 0; i < 5; i++) {
            const clash = await env.DB.prepare(`SELECT id FROM students WHERE parent_username = ?`)
              .bind(parentUsername)
              .first()
            if (!clash) break
            parentUsername = `${base}${Math.floor(Math.random() * 900 + 100)}`
          }
        }

        const existing = await env.DB.prepare(`SELECT id FROM students WHERE parent_username = ? AND id != ?`)
          .bind(parentUsername, studentId)
          .first()
        if (existing) return error('Parent username already taken', 409)

        let password = body.password?.trim() ?? ''
        if (password) {
          if (password.length < 8 || password.length > 64) {
            return error('Password must be 8–64 characters', 400)
          }
        } else {
          password = randomPassword(8)
        }
        const password_hash = await hashPassword(password)

        await env.DB.prepare(
          `UPDATE students SET parent_username = ?, parent_password_hash = ? WHERE id = ?`,
        )
          .bind(parentUsername, password_hash, studentId)
          .run()

        // Invalidate any existing parent sessions so the old password stops working immediately.
        await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND role = 'parent'`)
          .bind(parentUsername)
          .run()

        return json({ username: parentUsername, password }, 201)
      }

      if (path.match(/^\/api\/students\/[^/]+\/parent-credentials$/) && request.method === 'DELETE') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const studentId = path.split('/')[3]
        const owned = await env.DB.prepare(
          `SELECT s.id FROM students s JOIN classes c ON c.id = s.class_id
           WHERE s.id = ? AND c.teacher_id = ?`,
        )
          .bind(studentId, user.id)
          .first()
        if (!owned) return error('Not found', 404)

        const s = await env.DB.prepare(`SELECT parent_username FROM students WHERE id = ?`)
          .bind(studentId)
          .first<{ parent_username: string | null }>()
        await env.DB.prepare(
          `UPDATE students SET parent_username = NULL, parent_password_hash = NULL WHERE id = ?`,
        )
          .bind(studentId)
          .run()
        if (s?.parent_username) {
          await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND role = 'parent'`)
            .bind(s.parent_username)
            .run()
        }
        return json({ ok: true })
      }

      if (path.match(/^\/api\/students\/[^/]+\/summary$/) && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const studentId = path.split('/')[3]
        const s = await env.DB.prepare(
          `SELECT s.*, c.teacher_id FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
        )
          .bind(studentId)
          .first<{
            id: string
            display_name: string
            interests: string
            career_ambitions: string
            weakspots: string
            teacher_id: string
          }>()
        if (!s || s.teacher_id !== user.id) return error('Not found', 404)

        try {
          await assertAiBudget(env, user.id)
        } catch (err) {
          if (err instanceof AiBudgetExceededError) {
            return aiBudgetExceededResponse(err.usedCents, err.capCents)
          }
          throw err
        }

        const attempts = await env.DB.prepare(
          `SELECT score_pct, feedback_json, topic_tags_json, submitted_at FROM attempts
           WHERE student_id = ? AND status = 'submitted'`,
        )
          .bind(studentId)
          .all()

        const summary = await generateStudentSummary(env, {
          name: s.display_name,
          interests: s.interests,
          career_ambitions: s.career_ambitions,
          weakspots: s.weakspots,
          attempts: attempts.results ?? [],
          meter: { teacherId: user.id, feature: 'summary' },
        })
        await env.DB.prepare(`UPDATE students SET ai_summary = ? WHERE id = ?`)
          .bind(summary, studentId)
          .run()
        return json({ summary })
      }

      // —— Diagnostic gate check ——
      if (path === '/api/classes/diagnostic-status' && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const classId = url.searchParams.get('classId')
        if (!classId) return error('classId required')
        const cls = await classOwned(env, classId, user.id)
        if (!cls) return error('Not found', 404)
        return json({ hasDiagnostic: await hasDiagnostic(env, classId) })
      }

      // —— Lesson batches ——
      if (path === '/api/lesson-batches' && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const { results } = await env.DB.prepare(
          `SELECT b.id, b.teacher_id, b.class_id, b.subject, b.curriculum, b.age_range,
                  b.duration_minutes, b.weekly_frequency, b.days_of_week, b.resources_json,
                  b.weeks, b.start_date, b.title, b.created_at,
                  c.name as class_name
           FROM lesson_batches b
           JOIN classes c ON c.id = b.class_id
           WHERE b.teacher_id = ?
           ORDER BY b.created_at DESC`,
        )
          .bind(user.id)
          .all()
        return json({
          batches: (results ?? []).map((row) => {
            const r = row as Record<string, unknown>
            return {
              ...r,
              days_of_week: JSON.parse(String(r.days_of_week || '[]')),
              resources: JSON.parse(String(r.resources_json || '[]')),
              resources_json: undefined,
            }
          }),
        })
      }

      if (path === '/api/lesson-batches' && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const body = (await request.json()) as {
          class_id?: string
          subject?: string
          curriculum?: string
          duration_minutes?: number
          weekly_frequency?: number
          days_of_week?: string[]
          resources?: string[]
          weeks?: number
          start_date?: string
        }

        if (!body.class_id || !body.start_date) {
          return error('class_id and start_date are required')
        }
        const weeks = Number(body.weeks ?? 0)
        if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) {
          return error('weeks must be an integer from 1 to 12')
        }

        const days = normalizeDaysOfWeek(body.days_of_week ?? [])
        if (!days.length) return error('Select at least one day of the week (Mon–Sun)')

        const frequency = Number(body.weekly_frequency ?? days.length)
        if (frequency !== days.length) {
          return error('weekly_frequency must match the number of selected days')
        }

        const duration = Number(body.duration_minutes ?? 45)
        if (!Number.isFinite(duration) || duration < 15 || duration > 180) {
          return error('duration_minutes must be between 15 and 180')
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
          return error('start_date must be YYYY-MM-DD')
        }

        const cls = await classOwned(env, body.class_id, user.id)
        if (!cls) return error('Class not found', 404)

        const classRow = cls as {
          subject: string
          curriculum: string
          age_range: string
        }
        const subject = (body.subject || classRow.subject).trim()
        const curriculum =
          body.curriculum !== undefined ? body.curriculum.trim() : classRow.curriculum
        const ageRange = classRow.age_range
        const resources = Array.isArray(body.resources)
          ? body.resources.map(String).filter(Boolean)
          : []

        const slots = scheduleLessonSlots(body.start_date, days, weeks)
        if (!slots.length) return error('Could not schedule lessons for those days')

        try {
          await assertAiBudget(env, user.id)
        } catch (err) {
          if (err instanceof AiBudgetExceededError) {
            return aiBudgetExceededResponse(err.usedCents, err.capCents)
          }
          throw err
        }

        const students = await env.DB.prepare(
          `SELECT display_name, interests, career_ambitions FROM students WHERE class_id = ? LIMIT 16`,
        )
          .bind(body.class_id)
          .all<{ display_name: string; interests: string; career_ambitions: string }>()

        const generated = await generateLessonPlans(env, {
          subject,
          curriculum,
          ageRange,
          durationMinutes: duration,
          weeks,
          daysOfWeek: days,
          resources,
          slots,
          studentProfiles: (students.results ?? []).map((s) => ({
            name: s.display_name,
            interests: s.interests,
            careerAmbitions: s.career_ambitions,
          })),
          meter: { teacherId: user.id, classId: body.class_id, feature: 'lesson_plans' },
        })

        const batchId = generateId()
        await env.DB.prepare(
          `INSERT INTO lesson_batches (
            id, teacher_id, class_id, subject, curriculum, age_range,
            duration_minutes, weekly_frequency, days_of_week, resources_json,
            weeks, start_date, title
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            batchId,
            user.id,
            body.class_id,
            subject,
            curriculum,
            ageRange,
            duration,
            frequency,
            JSON.stringify(days),
            JSON.stringify(resources),
            weeks,
            body.start_date,
            generated.title || `${subject} · ${weeks}-week plan`,
          )
          .run()

        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i]
          const lesson = generated.lessons[i]
          await env.DB.prepare(
            `INSERT INTO lessons (
              id, batch_id, week_index, sequence_index, scheduled_date, day_of_week, title, plan_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(
              generateId(),
              batchId,
              slot.week_index,
              slot.sequence_index,
              slot.scheduled_date,
              slot.day_of_week,
              lesson?.title ?? `${subject}: week ${slot.week_index}`,
              JSON.stringify(lesson?.plan ?? {}),
            )
            .run()
        }

        return json({ batch: { id: batchId, title: generated.title } }, 201)
      }

      const batchMatch = path.match(/^\/api\/lesson-batches\/([^/]+)$/)
      if (batchMatch && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const batchId = batchMatch[1]
        const batch = await env.DB.prepare(
          `SELECT b.id, b.teacher_id, b.class_id, b.subject, b.curriculum, b.age_range,
                  b.duration_minutes, b.weekly_frequency, b.days_of_week, b.resources_json,
                  b.weeks, b.start_date, b.title, b.created_at,
                  c.name as class_name
           FROM lesson_batches b
           JOIN classes c ON c.id = b.class_id
           WHERE b.id = ? AND b.teacher_id = ?`,
        )
          .bind(batchId, user.id)
          .first<Record<string, unknown>>()
        if (!batch) return error('Not found', 404)

        const { results } = await env.DB.prepare(
          `SELECT id, batch_id, week_index, sequence_index, scheduled_date,
                  day_of_week, title, plan_json
           FROM lessons
           WHERE batch_id = ?
           ORDER BY sequence_index ASC`,
        )
          .bind(batchId)
          .all()

        return json({
          batch: {
            ...batch,
            days_of_week: JSON.parse(String(batch.days_of_week || '[]')),
            resources: JSON.parse(String(batch.resources_json || '[]')),
            resources_json: undefined,
          },
          lessons: (results ?? []).map((row) => {
            const r = row as Record<string, unknown>
            return {
              ...r,
              plan: JSON.parse(String(r.plan_json || '{}')),
              plan_json: undefined,
            }
          }),
        })
      }

      if (batchMatch && request.method === 'DELETE') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const batchId = batchMatch[1]
        const batch = await env.DB.prepare(
          `SELECT id FROM lesson_batches WHERE id = ? AND teacher_id = ?`,
        )
          .bind(batchId, user.id)
          .first()
        if (!batch) return error('Not found', 404)
        await env.DB.prepare(`DELETE FROM lesson_batches WHERE id = ?`).bind(batchId).run()
        return json({ ok: true })
      }

      const lessonMatch = path.match(/^\/api\/lessons\/([^/]+)$/)
      if (lessonMatch && request.method === 'PATCH') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const lessonId = lessonMatch[1]
        const owned = await env.DB.prepare(
          `SELECT l.id FROM lessons l
           JOIN lesson_batches b ON b.id = l.batch_id
           WHERE l.id = ? AND b.teacher_id = ?`,
        )
          .bind(lessonId, user.id)
          .first()
        if (!owned) return error('Not found', 404)

        const body = (await request.json()) as {
          title?: string
          plan?: LessonPlan
          scheduled_date?: string
        }

        if (body.title !== undefined) {
          await env.DB.prepare(`UPDATE lessons SET title = ? WHERE id = ?`)
            .bind(body.title.trim(), lessonId)
            .run()
        }
        if (body.plan !== undefined) {
          await env.DB.prepare(`UPDATE lessons SET plan_json = ? WHERE id = ?`)
            .bind(JSON.stringify(body.plan), lessonId)
            .run()
        }
        if (body.scheduled_date !== undefined) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(body.scheduled_date)) {
            return error('scheduled_date must be YYYY-MM-DD')
          }
          await env.DB.prepare(`UPDATE lessons SET scheduled_date = ? WHERE id = ?`)
            .bind(body.scheduled_date, lessonId)
            .run()
        }

        return json({ ok: true })
      }

      // —— Tasks (homework + assessments) ——
      if (path === '/api/tasks' && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const type = url.searchParams.get('type')
        let query = `SELECT t.id, t.type, t.subtype, t.class_id, t.subject, t.title,
                            t.description, t.difficulty, t.status, t.time_limit_seconds,
                            t.created_by, t.created_at, t.published_at, t.exam_profile_id,
                            c.name as class_name
                     FROM tasks t
                     JOIN classes c ON c.id = t.class_id
                     WHERE c.teacher_id = ?`
        const binds: string[] = [user.id]
        if (type) {
          query += ` AND t.type = ?`
          binds.push(type)
        }
        query += ` ORDER BY t.created_at DESC
                   LIMIT 500`
        const stmt = env.DB.prepare(query)
        const { results } = await stmt.bind(...binds).all()
        return json({ tasks: results })
      }

      if (path === '/api/tasks' && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const parsed = await parseJsonBody(request)
        if (parsed instanceof Response) return parsed
        const body = parsed as {
          type: 'homework' | 'assessment'
          subtype?: 'diagnostic' | 'formative' | 'summative' | 'english_level' | 'reading_speed' | 'mock_exam' | null
          class_id: string
          subject?: string
          description?: string
          difficulty?: 'easy' | 'medium' | 'hard'
          question_count?: number
          reading_text?: string
          past_paper_text?: string
          past_paper_image?: string
          time_limit_seconds?: number | null
          use_all_question_types?: boolean
          question_types?: string[]
          rubric_text?: string
          exam_profile_id?: string
        }

        if (body.subtype === 'english_level' || body.subtype === 'reading_speed') {
          return createSpecialTask(env, user, {
            type: body.type,
            subtype: body.subtype,
            class_id: body.class_id,
            subject: body.subject,
            description: body.description ?? '',
            difficulty: body.difficulty ?? 'medium',
            reading_text: body.reading_text,
            time_limit_seconds: body.time_limit_seconds,
          })
        }

        if (body.subtype === 'mock_exam') {
          if (!body.exam_profile_id) {
            return error('exam_profile_id is required for mock exams', 400)
          }
          const profile = await getExamProfileRow(env, body.exam_profile_id)
          if (!profile || profile.class_id !== body.class_id) {
            return error('Exam profile not found', 404)
          }
          const owned = await classOwned(env, profile.class_id, user.id)
          if (!owned) return error('Class not found', 404)

          try {
            await assertAiBudget(env, user.id)
          } catch (err) {
            if (err instanceof AiBudgetExceededError) {
              return aiBudgetExceededResponse(err.usedCents, err.capCents)
            }
            throw err
          }

          const { taskId, content } = await generateMockFromProfile(
            env,
            profile,
            user.id,
            body.past_paper_image,
          )
          return json({ task: { id: taskId, content, status: 'draft' } }, 201)
        }

        const cls = await classOwned(env, body.class_id, user.id)
        if (!cls) return error('Class not found', 404)

        const subject = (body.subject || (cls as { subject: string }).subject).trim()
        const students = await env.DB.prepare(
          `SELECT display_name, interests, weakspots FROM students WHERE class_id = ? LIMIT 12`,
        )
          .bind(body.class_id)
          .all<{ display_name: string; interests: string; weakspots: string }>()

        const requestedTypes = (body.question_types ?? []).filter((t) => ALL_TYPES.includes(t))
        const questionTypes = requestedTypes.length
          ? requestedTypes
          : body.use_all_question_types || body.type === 'assessment'
            ? ALL_TYPES
            : PHASE2_TYPES

        try {
          await assertAiBudget(env, user.id)
        } catch (err) {
          if (err instanceof AiBudgetExceededError) {
            return aiBudgetExceededResponse(err.usedCents, err.capCents)
          }
          throw err
        }

        const meter = { teacherId: user.id, classId: body.class_id, feature: 'task_gen' as const }

        let pastPaperText = body.past_paper_text ?? ''
        if (body.past_paper_image) {
          const visionNotes = await describePastPaperImage(env, body.past_paper_image, {
            ...meter,
            feature: 'past_paper_vision',
          })
          pastPaperText = [pastPaperText, visionNotes].filter(Boolean).join('\n\n')
        }

        const description = body.description ?? ''
        const difficulty = body.difficulty ?? 'medium'
        const content = await generateTaskContent(env, {
          subject,
          curriculum: (cls as { curriculum: string }).curriculum,
          description,
          difficulty,
          // Single-question essay tasks: the model essay + rubric cover exactly one
          // extended_written question, so never let a caller ask for more.
          questionCount:
            questionTypes.length === 1 && questionTypes[0] === 'extended_written'
              ? 1
              : body.question_count || 8,
          ageRange: (cls as { age_range: string }).age_range,
          readingText: body.reading_text,
          pastPaperText,
          subtype: body.subtype,
          questionTypes,
          studentProfiles: (students.results ?? []).map((s) => ({
            name: s.display_name,
            interests: s.interests,
            weakspots: s.weakspots,
          })),
          meter,
        })

        // Generate TTS audio for listening questions (Aura-2 via Workers AI).
        // Per-question failure leaves audioUrl unset — the student's browser
        // speechSynthesis fallback still covers playback.
        for (const q of content.questions ?? []) {
          if (q.type !== 'listen_respond' || !q.audioScript) continue
          const audio = await synthesizeSpeech(env, {
            text: q.audioScript,
            meter: { ...meter, feature: 'tts' },
          })
          if ('key' in audio) q.audioUrl = `/api/tts/${audio.key}`
        }

        // Essay tasks: write a model essay aligned to the uploaded rubric.
        // Stored on the task row (never inside content_json) so students only
        // see it after submitting. Failure leaves it empty — creation still succeeds.
        let modelEssay = ''
        const essayQuestion =
          requestedTypes.length === 1 && requestedTypes[0] === 'extended_written'
            ? (content.questions ?? [])[0]
            : undefined
        if (essayQuestion) {
          try {
            modelEssay = await generateModelEssay(env, {
              prompt: essayQuestion.prompt,
              subject,
              difficulty,
              ageRange: (cls as { age_range: string }).age_range,
              rubricText: body.rubric_text,
              meter,
            })
          } catch (err) {
            console.error('generateModelEssay failed', err)
          }
        }

        const id = generateId()
        await env.DB.prepare(
          `INSERT INTO tasks (
            id, type, subtype, class_id, subject, title, description, difficulty,
            status, time_limit_seconds, content_json, reading_text, past_paper_text,
            rubric_text, model_essay, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            id,
            body.type,
            body.subtype ?? null,
            body.class_id,
            subject,
            content.title || description.slice(0, 80),
            description,
            difficulty,
            body.time_limit_seconds ?? null,
            JSON.stringify(content),
            body.reading_text ?? '',
            pastPaperText,
            body.rubric_text ?? '',
            modelEssay,
            user.id,
          )
          .run()

        return json({ task: { id, content, status: 'draft' } }, 201)
      }

      const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/)
      if (taskMatch && request.method === 'GET') {
        const user = await getSession(env, request)
        if (!user) return error('Unauthorized', 401)
        const taskId = taskMatch[1]
        const task = await env.DB.prepare(
          `SELECT t.*, c.teacher_id, c.name as class_name FROM tasks t
           JOIN classes c ON c.id = t.class_id WHERE t.id = ?`,
        )
          .bind(taskId)
          .first<{
            id: string
            teacher_id: string
            content_json: string
            status: string
            type: string
            [key: string]: unknown
          }>()
        if (!task) return error('Not found', 404)

        if (user.role === 'teacher' && task.teacher_id !== user.id) return error('Forbidden', 403)
        if (user.role === 'student' && task.status !== 'published') return error('Not found', 404)

        // Strip correct answers and the model essay for students (revealed after submit)
        let content = JSON.parse(task.content_json || '{}') as TaskContent
        let modelEssay: unknown = task.model_essay
        if (user.role === 'student') {
          content = stripTaskAnswers(content)
          modelEssay = undefined
        }
        return json({ task: { ...task, model_essay: modelEssay, content, content_json: undefined } })
      }

      // Teacher preview: student-shaped content (answers stripped) for drafts or published tasks
      const taskPreviewMatch = path.match(/^\/api\/tasks\/([^/]+)\/preview$/)
      if (taskPreviewMatch && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const taskId = taskPreviewMatch[1]
        const task = await env.DB.prepare(
          `SELECT t.*, c.teacher_id, c.name as class_name FROM tasks t
           JOIN classes c ON c.id = t.class_id WHERE t.id = ?`,
        )
          .bind(taskId)
          .first<{
            id: string
            teacher_id: string
            content_json: string
            [key: string]: unknown
          }>()
        if (!task || task.teacher_id !== user.id) return error('Not found', 404)

        const content = stripTaskAnswers(JSON.parse(task.content_json || '{}') as TaskContent)
        return json({ task: { ...task, content, content_json: undefined } })
      }

      if (taskMatch && request.method === 'PATCH') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const taskId = taskMatch[1]
        const task = await env.DB.prepare(
          `SELECT t.*, c.teacher_id FROM tasks t JOIN classes c ON c.id = t.class_id WHERE t.id = ?`,
        )
          .bind(taskId)
          .first<{ id: string; teacher_id: string; status: string }>()
        if (!task || task.teacher_id !== user.id) return error('Not found', 404)

        const parsed = await parseJsonBody(request)
        if (parsed instanceof Response) return parsed
        const body = parsed as {
          content?: TaskContent
          title?: string
          description?: string
          time_limit_seconds?: number | null
        }
        if (body.content) {
          await env.DB.prepare(
            `UPDATE tasks SET content_json = ?, title = COALESCE(?, title),
             description = COALESCE(?, description),
             time_limit_seconds = COALESCE(?, time_limit_seconds) WHERE id = ?`,
          )
            .bind(
              JSON.stringify(body.content),
              body.title ?? body.content.title ?? null,
              body.description ?? null,
              body.time_limit_seconds ?? null,
              taskId,
            )
            .run()
        } else {
          await env.DB.prepare(
            `UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description),
             time_limit_seconds = COALESCE(?, time_limit_seconds) WHERE id = ?`,
          )
            .bind(body.title ?? null, body.description ?? null, body.time_limit_seconds ?? null, taskId)
            .run()
        }
        return json({ ok: true })
      }

      // Delete a draft task. Published tasks are refused: they carry student
      // assignment/attempt data that must stay intact for reports and insights.
      if (taskMatch && request.method === 'DELETE') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const taskId = taskMatch[1]
        const task = await env.DB.prepare(
          `SELECT t.id, t.status, c.teacher_id FROM tasks t
           JOIN classes c ON c.id = t.class_id WHERE t.id = ?`,
        )
          .bind(taskId)
          .first<{ id: string; status: string; teacher_id: string }>()
        if (!task || task.teacher_id !== user.id) return error('Not found', 404)
        if (task.status !== 'draft') {
          return error('Only draft tasks can be deleted', 400)
        }
        // FK cascades cover these, but delete explicitly so the cleanup does
        // not depend on D1 foreign-key enforcement being enabled.
        await env.DB.prepare(`DELETE FROM task_assignments WHERE task_id = ?`).bind(taskId).run()
        await env.DB.prepare(`DELETE FROM attempts WHERE task_id = ?`).bind(taskId).run()
        await env.DB.prepare(`DELETE FROM reading_speed_attempts WHERE task_id = ?`).bind(taskId).run()
        await env.DB.prepare(`DELETE FROM tasks WHERE id = ?`).bind(taskId).run()
        return json({ ok: true })
      }

      if (path.match(/^\/api\/tasks\/[^/]+\/publish$/) && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const taskId = path.split('/')[3]
        const task = await env.DB.prepare(
          `SELECT t.*, c.teacher_id FROM tasks t JOIN classes c ON c.id = t.class_id WHERE t.id = ?`,
        )
          .bind(taskId)
          .first<{
            id: string
            teacher_id: string
            class_id: string
            subtype: string | null
            status: string
          }>()
        if (!task || task.teacher_id !== user.id) return error('Not found', 404)

        const body = (await request.json().catch(() => ({}))) as {
          assign_all?: boolean
          student_ids?: string[]
        }

        await env.DB.prepare(
          `UPDATE tasks SET status = 'published', published_at = datetime('now') WHERE id = ?`,
        )
          .bind(taskId)
          .run()

        await env.DB.prepare(`DELETE FROM task_assignments WHERE task_id = ?`).bind(taskId).run()

        if (body.student_ids?.length) {
          for (const sid of body.student_ids) {
            await env.DB.prepare(
              `INSERT INTO task_assignments (id, task_id, student_id) VALUES (?, ?, ?)`,
            )
              .bind(generateId(), taskId, sid)
              .run()
          }
        } else {
          // Whole class
          await env.DB.prepare(
            `INSERT INTO task_assignments (id, task_id, student_id) VALUES (?, ?, NULL)`,
          )
            .bind(generateId(), taskId)
            .run()
        }

        return json({ ok: true })
      }

      // —— Student tasks ——
      if (path === '/api/student/tasks' && request.method === 'GET') {
        const user = await requireRole(env, request, 'student')
        if (user instanceof Response) return user
        const tasks = await fetchStudentTasks(env, user.id)
        return json({ tasks })
      }

      // —— Parent tasks (read-only view of linked child's tasks) ——
      if (path === '/api/parent/tasks' && request.method === 'GET') {
        const user = await requireRole(env, request, 'parent')
        if (user instanceof Response) return user
        if (!user.student_id) return error('Not found', 404)
        const tasks = await fetchStudentTasks(env, user.student_id)
        return json({ tasks })
      }

      // —— Attempts ——
      if (path === '/api/attempts/start' && request.method === 'POST') {
        const user = await requireRole(env, request, 'student')
        if (user instanceof Response) return user
        const body = (await request.json()) as { task_id: string }
        const task = await env.DB.prepare(
          `SELECT t.* FROM tasks t
           JOIN task_assignments a ON a.task_id = t.id
           WHERE t.id = ? AND t.status = 'published'
             AND (a.student_id IS NULL OR a.student_id = ?)`,
        )
          .bind(body.task_id, user.id)
          .first<{ id: string; content_json: string; time_limit_seconds: number | null; type: string }>()
        if (!task) return error('Task not found', 404)

        const existing = await env.DB.prepare(
          `SELECT id FROM attempts WHERE task_id = ? AND student_id = ? AND status = 'in_progress'`,
        )
          .bind(body.task_id, user.id)
          .first<{ id: string }>()
        if (existing) {
          return json({ attemptId: existing.id, resumed: true })
        }

        const id = generateId()
        await env.DB.prepare(
          `INSERT INTO attempts (id, task_id, student_id, started_at) VALUES (?, ?, ?, datetime('now'))`,
        )
          .bind(id, body.task_id, user.id)
          .run()
        return json({ attemptId: id, time_limit_seconds: task.time_limit_seconds })
      }

      const attemptMatch = path.match(/^\/api\/attempts\/([^/]+)$/)
      if (attemptMatch && request.method === 'GET') {
        const user = await getSession(env, request)
        if (!user) return error('Unauthorized', 401)
        const attempt = await env.DB.prepare(`SELECT * FROM attempts WHERE id = ?`)
          .bind(attemptMatch[1])
          .first<{
            id: string
            student_id: string
            task_id: string
            [key: string]: unknown
          }>()
        if (!attempt) return error('Not found', 404)
        if (user.role === 'student' && attempt.student_id !== user.id) return error('Forbidden', 403)
        if (user.role === 'teacher') {
          const owned = await env.DB.prepare(
            `SELECT t.id FROM tasks t JOIN classes c ON c.id = t.class_id
             WHERE t.id = ? AND c.teacher_id = ?`,
          )
            .bind(attempt.task_id, user.id)
            .first()
          if (!owned) return error('Forbidden', 403)
        }
        return json({ attempt })
      }

      if (path.match(/^\/api\/attempts\/[^/]+\/flag$/) && request.method === 'POST') {
        const user = await requireRole(env, request, 'student')
        if (user instanceof Response) return user
        const attemptId = path.split('/')[3]
        const attempt = await env.DB.prepare(
          `SELECT id, student_id, status FROM attempts WHERE id = ?`,
        )
          .bind(attemptId)
          .first<{ id: string; student_id: string; status: string }>()
        if (!attempt || attempt.student_id !== user.id) return error('Not found', 404)
        if (attempt.status !== 'in_progress') return error('Attempt already submitted')

        await env.DB.prepare(
          `UPDATE attempts SET focus_leave_count = focus_leave_count + 1, flagged = 1 WHERE id = ?`,
        )
          .bind(attemptId)
          .run()
        return json({ ok: true })
      }

      if (path.match(/^\/api\/attempts\/[^/]+\/submit$/) && request.method === 'POST') {
        const user = await requireRole(env, request, 'student')
        if (user instanceof Response) return user
        const attemptId = path.split('/')[3]
        const body = (await request.json()) as {
          answers: Record<string, unknown>
          duration_ms?: number
        }

        const attempt = await env.DB.prepare(`SELECT * FROM attempts WHERE id = ?`)
          .bind(attemptId)
          .first<{
            id: string
            student_id: string
            task_id: string
            status: string
            started_at: string
          }>()
        if (!attempt || attempt.student_id !== user.id) return error('Not found', 404)
        if (attempt.status === 'submitted') return error('Already submitted')

        const task = await env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`)
          .bind(attempt.task_id)
          .first<{
            subject: string
            content_json: string
            time_limit_seconds: number | null
            title: string
            type: string
            subtype: string | null
            exam_profile_id: string | null
            rubric_text: string
            model_essay: string
          }>()
        if (!task) return error('Task missing', 404)

        const student = await env.DB.prepare(`SELECT display_name FROM students WHERE id = ?`)
          .bind(user.id)
          .first<{ display_name: string }>()

        const content = JSON.parse(task.content_json) as TaskContent

        const billingTeacherId = await teacherIdForStudent(env, user.id)
        if (billingTeacherId) {
          try {
            await assertAiBudget(env, billingTeacherId)
          } catch (err) {
            if (err instanceof AiBudgetExceededError) {
              return aiBudgetExceededResponse(err.usedCents, err.capCents)
            }
            throw err
          }
        }

        const markingContext = await getMockExamMarkingContext(env, task.exam_profile_id)

        const marked = await markAttempt(env, {
          subject: task.subject,
          content,
          answers: body.answers ?? {},
          meter: billingTeacherId
            ? { teacherId: billingTeacherId, feature: 'mark_attempt' }
            : undefined,
          rubric: task.rubric_text ? { general: task.rubric_text } : markingContext.rubric,
          gradeBoundaries: markingContext.gradeBoundaries,
          modelAnswer: task.model_essay || undefined,
        })

        const duration =
          body.duration_ms ??
          Math.max(0, Date.now() - new Date(attempt.started_at + 'Z').getTime())

        const submittedAt = new Date().toISOString()
        const archiveMd = buildAttemptArchiveMd({
          studentName: student?.display_name ?? user.name,
          taskTitle: task.title || content.title || 'Untitled',
          taskType: task.type,
          subtype: task.subtype,
          subject: task.subject,
          submittedAt,
          scorePct: marked.score_pct,
          content,
          answers: body.answers ?? {},
          feedback: marked.feedback,
          extraMeta:
            task.subtype === 'mock_exam' && task.exam_profile_id
              ? [['Exam profile', task.exam_profile_id]]
              : undefined,
        })

        await env.DB.prepare(
          `UPDATE attempts SET
            submitted_at = datetime('now'),
            duration_ms = ?,
            answers_json = ?,
            score_pct = ?,
            feedback_json = ?,
            topic_tags_json = ?,
            attempt_archive_md = ?,
            status = 'submitted'
           WHERE id = ?`,
        )
          .bind(
            duration,
            JSON.stringify(body.answers ?? {}),
            marked.score_pct,
            JSON.stringify(marked.feedback),
            JSON.stringify(marked.topic_tags),
            archiveMd,
            attemptId,
          )
          .run()

        await recomputeWeakspots(env, user.id)

        return json({
          score_pct: marked.score_pct,
          feedback: marked.feedback,
          model_essay: task.model_essay || null,
        })
      }

      async function aggregateExamReadiness(
        env: Env,
        classId: string,
        studentIds: string[],
      ): Promise<number | null> {
        const readinessByStudent = await examReadinessForStudents(env, classId, studentIds)
        const values: number[] = []
        for (const readiness of readinessByStudent.values()) {
          if (readiness != null) values.push(readiness)
        }
        if (values.length === 0) return null
        return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
      }

      // —— Insights ——
      if (path === '/api/insights' && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const scope = url.searchParams.get('scope') // class | student
        const id = url.searchParams.get('id')
        if (!scope || !id) return error('scope and id required')

        if (scope === 'class') {
          const cls = await classOwned(env, id, user.id)
          if (!cls) return error('Not found', 404)
          const students = await env.DB.prepare(`SELECT id FROM students WHERE class_id = ?`)
            .bind(id)
            .all<{ id: string }>()
          const studentIds = (students.results ?? []).map((s) => s.id)

          const attempts = await env.DB.prepare(
            `SELECT a.score_pct, a.submitted_at, a.student_id, a.feedback_json, t.type
             FROM attempts a JOIN tasks t ON t.id = a.task_id
             JOIN students s ON s.id = a.student_id
             WHERE s.class_id = ? AND a.status = 'submitted' AND t.type = 'homework'
               AND a.submitted_at >= date('now', '-12 months')
             ORDER BY a.submitted_at ASC
             LIMIT 5000`,
          )
            .bind(id)
            .all<{
              score_pct: number
              submitted_at: string
              student_id: string
              feedback_json: string
              type: string
            }>()

          const scores = (attempts.results ?? [])
            .filter((a) => a.score_pct != null)
            .map((a) => ({ date: a.submitted_at, value: a.score_pct }))

          const avgScore =
            scores.length > 0
              ? Math.round((scores.reduce((s, x) => s + x.value, 0) / scores.length) * 10) / 10
              : null

          // HW submission rate over time (by week bucket simplified as cumulative)
          const hwTasks = await env.DB.prepare(
            `SELECT id FROM tasks WHERE class_id = ? AND type = 'homework' AND status = 'published'`,
          )
            .bind(id)
            .all<{ id: string }>()
          const hwTotal = (hwTasks.results ?? []).length * Math.max(studentIds.length, 1)
          const hwSubmitted = (attempts.results ?? []).filter((a) => a.type === 'homework').length
          const hwRate = hwTotal > 0 ? Math.round((hwSubmitted / hwTotal) * 1000) / 10 : null

          // Weakspots aggregate
          const topicErrors: Record<string, number> = {}
          for (const a of attempts.results ?? []) {
            try {
              const fb = JSON.parse(a.feedback_json) as Record<
                string,
                { correct?: boolean; topic?: string }
              >
              for (const item of Object.values(fb)) {
                if (item.correct === false && item.topic) {
                  topicErrors[item.topic] = (topicErrors[item.topic] ?? 0) + 1
                }
              }
            } catch {
              /* ignore */
            }
          }
          const weakspotsFallback = Object.entries(topicErrors)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([topic, count]) => ({ topic, count }))

          const classRow = cls as {
            weakspots_json?: string
            weakspots_summary?: string
            weakspots_updated_at?: string | null
          }
          let weakspots = weakspotsFallback
          let weakspotsSummary: string | null = null
          let weakspotsUpdatedAt: string | null = null
          try {
            const stored = JSON.parse(classRow.weakspots_json || '[]') as Array<{
              skill?: string
              topic?: string
              count?: number
              frequency?: number | string
            }>
            if (stored.length) {
              weakspots = stored.map((w) => ({
                topic: weakspotLabel(w),
                skill: w.skill || w.topic,
                count:
                  typeof w.count === 'number'
                    ? w.count
                    : typeof w.frequency === 'number'
                      ? w.frequency
                      : Number(w.frequency) || 1,
                ...w,
              })) as typeof weakspotsFallback
              weakspotsSummary = classRow.weakspots_summary || null
              weakspotsUpdatedAt = classRow.weakspots_updated_at ?? null
            }
          } catch {
            /* use fallback */
          }

          // Submission rate series: one point per submitted homework
          const hwSeries = (attempts.results ?? [])
            .filter((a) => a.type === 'homework')
            .map((a, i, arr) => ({
              date: a.submitted_at,
              value: Math.round(((i + 1) / Math.max(arr.length, 1)) * 1000) / 10,
            }))

          const events = await loadInsightEvents(env, { classId: id })
          const examReadiness = await aggregateExamReadiness(env, id, studentIds)

          return json({
            avgScore,
            scoreSeries: scores,
            hwRate,
            hwSeries,
            examReadiness,
            weakspots,
            weakspotsSummary,
            weakspotsUpdatedAt,
            events,
          })
        }

        // student scope
        const s = await env.DB.prepare(
          `SELECT s.*, c.teacher_id FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
        )
          .bind(id)
          .first<{
            id: string
            teacher_id: string
            weakspots: string
            class_id: string
            weakspots_summary?: string
            weakspots_updated_at?: string | null
          }>()
        if (!s || s.teacher_id !== user.id) return error('Not found', 404)

        const attempts = await env.DB.prepare(
          `SELECT a.score_pct, a.submitted_at, a.feedback_json, t.type
           FROM attempts a JOIN tasks t ON t.id = a.task_id
           WHERE a.student_id = ? AND a.status = 'submitted' AND t.type = 'homework'
             AND a.submitted_at >= date('now', '-12 months')
           ORDER BY a.submitted_at ASC
           LIMIT 1000`,
        )
          .bind(id)
          .all<{ score_pct: number; submitted_at: string; feedback_json: string; type: string }>()

        const scores = (attempts.results ?? [])
          .filter((a) => a.score_pct != null)
          .map((a) => ({
            date: a.submitted_at,
            value: a.score_pct,
          }))
        const avgScore =
          scores.length > 0
            ? Math.round((scores.reduce((sum, x) => sum + x.value, 0) / scores.length) * 10) / 10
            : null
        const hwRate = (await hwCompletionRatesForClass(env, [s.class_id], [id])).get(id) ?? null
        const hwSeries = (attempts.results ?? [])
          .filter((a) => a.type === 'homework')
          .map((a, i, arr) => ({
            date: a.submitted_at,
            value: Math.round(((i + 1) / Math.max(arr.length, 1)) * hwRate!) || 0,
          }))

        const events = await loadInsightEvents(env, {
          studentId: id,
          classId: s.class_id,
        })
        const examReadiness = await aggregateExamReadiness(env, s.class_id, [id])

        return json({
          avgScore,
          scoreSeries: scores,
          hwRate,
          hwSeries,
          examReadiness,
          weakspots: JSON.parse(s.weakspots || '[]'),
          weakspotsSummary: s.weakspots_summary || null,
          weakspotsUpdatedAt: s.weakspots_updated_at ?? null,
          events,
        })
      }

      // —— Parent insights (read-only view of linked child) ——
      if (path === '/api/parent/insights' && request.method === 'GET') {
        const user = await requireRole(env, request, 'parent')
        if (user instanceof Response) return user
        const studentId = user.student_id
        if (!studentId) return error('Not found', 404)

        const s = await env.DB.prepare(
          `SELECT s.*, c.teacher_id FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
        )
          .bind(studentId)
          .first<{
            id: string
            teacher_id: string
            weakspots: string
            class_id: string
            weakspots_summary?: string
            weakspots_updated_at?: string | null
          }>()
        if (!s) return error('Not found', 404)

        const attempts = await env.DB.prepare(
          `SELECT a.score_pct, a.submitted_at, a.feedback_json, t.type
           FROM attempts a JOIN tasks t ON t.id = a.task_id
           WHERE a.student_id = ? AND a.status = 'submitted' AND t.type = 'homework'
             AND a.submitted_at >= date('now', '-12 months')
           ORDER BY a.submitted_at ASC
           LIMIT 1000`,
        )
          .bind(studentId)
          .all<{ score_pct: number; submitted_at: string; feedback_json: string; type: string }>()

        const scores = (attempts.results ?? [])
          .filter((a) => a.score_pct != null)
          .map((a) => ({
            date: a.submitted_at,
            value: a.score_pct,
          }))
        const avgScore =
          scores.length > 0
            ? Math.round((scores.reduce((sum, x) => sum + x.value, 0) / scores.length) * 10) / 10
            : null
        const hwRate = (await hwCompletionRatesForClass(env, [s.class_id], [studentId])).get(studentId) ?? null
        const hwSeries = (attempts.results ?? [])
          .filter((a) => a.type === 'homework')
          .map((a, i, arr) => ({
            date: a.submitted_at,
            value: Math.round(((i + 1) / Math.max(arr.length, 1)) * hwRate!) || 0,
          }))

        const events = await loadInsightEvents(env, {
          studentId,
          classId: s.class_id,
        })
        const examReadiness = await aggregateExamReadiness(env, s.class_id, [studentId])

        return json({
          avgScore,
          scoreSeries: scores,
          hwRate,
          hwSeries,
          examReadiness,
          weakspots: JSON.parse(s.weakspots || '[]'),
          weakspotsSummary: s.weakspots_summary || null,
          weakspotsUpdatedAt: s.weakspots_updated_at ?? null,
          events,
        })
      }

      // —— Insight events ——
      if (path === '/api/insight-events' && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const body = (await request.json()) as {
          class_id?: string
          student_id?: string
          name?: string
          event_date?: string
          description?: string
        }
        const name = (body.name ?? '').trim()
        const eventDate = (body.event_date ?? '').trim()
        const description = (body.description ?? '').trim()
        if (!name) return error('name required')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return error('event_date must be YYYY-MM-DD')

        const hasClass = !!body.class_id
        const hasStudent = !!body.student_id
        if (hasClass === hasStudent) return error('Provide exactly one of class_id or student_id')

        let classId: string | null = null
        let studentId: string | null = null

        if (body.class_id) {
          const cls = await classOwned(env, body.class_id, user.id)
          if (!cls) return error('Not found', 404)
          classId = body.class_id
        } else {
          const student = await env.DB.prepare(
            `SELECT s.id FROM students s JOIN classes c ON c.id = s.class_id
             WHERE s.id = ? AND c.teacher_id = ?`,
          )
            .bind(body.student_id, user.id)
            .first()
          if (!student) return error('Not found', 404)
          studentId = body.student_id!
        }

        const id = generateId()
        await env.DB.prepare(
          `INSERT INTO insight_events (id, teacher_id, class_id, student_id, name, event_date, description)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(id, user.id, classId, studentId, name, eventDate, description)
          .run()

        return json({
          event: {
            id,
            name,
            event_date: eventDate,
            description,
            scope: classId ? 'class' : 'student',
          },
        })
      }

      const insightEventMatch = path.match(/^\/api\/insight-events\/([^/]+)$/)
      if (insightEventMatch && request.method === 'DELETE') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const eventId = insightEventMatch[1]
        const row = await env.DB.prepare(
          `SELECT id FROM insight_events WHERE id = ? AND teacher_id = ?`,
        )
          .bind(eventId, user.id)
          .first()
        if (!row) return error('Not found', 404)
        await env.DB.prepare(`DELETE FROM insight_events WHERE id = ?`).bind(eventId).run()
        return json({ ok: true })
      }

      // —— Reports ——
      if (path === '/api/reports' && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        try {
          await assertAiBudget(env, user.id)
        } catch (err) {
          if (err instanceof AiBudgetExceededError) {
            return aiBudgetExceededResponse(err.usedCents, err.capCents)
          }
          throw err
        }
        const body = (await request.json()) as {
          student_id?: string
          class_id?: string
          teacher_notes?: string
        }

        let name = ''
        let data: unknown = {}
        let scope: 'student' | 'class' = 'student'

        if (body.student_id) {
          scope = 'student'
          const s = await env.DB.prepare(
            `SELECT s.*, c.teacher_id, c.name as class_name, c.subject
             FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
          )
            .bind(body.student_id)
            .first<{
              display_name: string
              interests: string
              career_ambitions: string
              weakspots: string
              ai_summary: string
              teacher_id: string
              class_name: string
              subject: string
            }>()
          if (!s || s.teacher_id !== user.id) return error('Not found', 404)
          name = s.display_name
          const attempts = await env.DB.prepare(
            `SELECT score_pct, feedback_json, submitted_at, duration_ms FROM attempts
             WHERE student_id = ? AND status = 'submitted'`,
          )
            .bind(body.student_id)
            .all()
          data = { student: s, attempts: attempts.results }
        } else if (body.class_id) {
          scope = 'class'
          const cls = await classOwned(env, body.class_id, user.id)
          if (!cls) return error('Not found', 404)
          name = (cls as { name: string }).name
          const students = await env.DB.prepare(`SELECT * FROM students WHERE class_id = ?`)
            .bind(body.class_id)
            .all()
          data = { class: cls, students: students.results }
        } else {
          return error('student_id or class_id required')
        }

        const content = await generateReport(env, {
          scope,
          name,
          teacherNotes: body.teacher_notes ?? '',
          data,
          meter: {
            teacherId: user.id,
            classId: body.class_id,
            feature: 'report',
          },
        })

        const id = generateId()
        await env.DB.prepare(
          `INSERT INTO reports (id, teacher_id, student_id, class_id, content, teacher_notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            id,
            user.id,
            body.student_id ?? null,
            body.class_id ?? null,
            content,
            body.teacher_notes ?? '',
          )
          .run()

        return json({ report: { id, content } }, 201)
      }

      const reportMatch = path.match(/^\/api\/reports\/([^/]+)$/)
      if (reportMatch && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const report = await env.DB.prepare(`SELECT * FROM reports WHERE id = ? AND teacher_id = ?`)
          .bind(reportMatch[1], user.id)
          .first()
        if (!report) return error('Not found', 404)
        return json({ report })
      }

      if (reportMatch && request.method === 'PATCH') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const body = (await request.json()) as { content?: string }
        await env.DB.prepare(
          `UPDATE reports SET content = ?, updated_at = datetime('now') WHERE id = ? AND teacher_id = ?`,
        )
          .bind(body.content ?? '', reportMatch[1], user.id)
          .run()
        return json({ ok: true })
      }

      // —— Student tools ——
      if (path === '/api/student/tools/generate' && request.method === 'POST') {
        const user = await requireRole(env, request, 'student')
        if (user instanceof Response) return user
        const body = (await request.json()) as { mode: 'flashcards' | 'practice' }
        const s = await env.DB.prepare(
          `SELECT s.weakspots, c.subject FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
        )
          .bind(user.id)
          .first<{ weakspots: string; subject: string }>()
        if (!s) return error('Not found', 404)

        const weakspots = JSON.parse(s.weakspots || '[]') as Array<{
          topic?: string
          skill?: string
        }>
        const recent = await env.DB.prepare(
          `SELECT feedback_json FROM attempts WHERE student_id = ? AND status = 'submitted'
           ORDER BY submitted_at DESC LIMIT 5`,
        )
          .bind(user.id)
          .all()

        const billingTeacherId = await teacherIdForStudent(env, user.id)
        if (billingTeacherId) {
          try {
            await assertAiBudget(env, billingTeacherId)
          } catch (err) {
            if (err instanceof AiBudgetExceededError) {
              return aiBudgetExceededResponse(err.usedCents, err.capCents)
            }
            throw err
          }
        }

        const result = await generatePracticeOrFlashcards(env, body.mode, {
          subject: s.subject,
          weakspots: weakspots.map((w) => w.skill || w.topic || s.subject).filter(Boolean),
          recentErrors: recent.results ?? [],
          meter: billingTeacherId
            ? { teacherId: billingTeacherId, feature: 'practice_tools' }
            : undefined,
        })
        return json({ result })
      }

      // —— Pinpoint weakspots ——
      if (path.match(/^\/api\/students\/[^/]+\/pinpoint-weakspots$/) && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const studentId = path.split('/')[3]
        const s = await env.DB.prepare(
          `SELECT s.id, s.display_name, c.teacher_id FROM students s
           JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
        )
          .bind(studentId)
          .first<{ id: string; display_name: string; teacher_id: string }>()
        if (!s || s.teacher_id !== user.id) return error('Not found', 404)

        try {
          await assertAiBudget(env, user.id)
        } catch (err) {
          if (err instanceof AiBudgetExceededError) {
            return aiBudgetExceededResponse(err.usedCents, err.capCents)
          }
          throw err
        }

        const attempts = await env.DB.prepare(
          `SELECT a.id, a.attempt_archive_md, a.answers_json, a.feedback_json, a.score_pct,
                  a.submitted_at, s.display_name, t.title, t.type, t.subtype, t.subject, t.content_json
           FROM attempts a
           JOIN students s ON s.id = a.student_id
           JOIN tasks t ON t.id = a.task_id
           WHERE a.student_id = ? AND a.status = 'submitted'
           ORDER BY a.submitted_at DESC`,
        )
          .bind(studentId)
          .all<{
            id: string
            attempt_archive_md: string | null
            answers_json: string
            feedback_json: string
            score_pct: number | null
            submitted_at: string | null
            display_name: string
            title: string
            type: string
            subtype: string | null
            subject: string
            content_json: string
          }>()

        const chunks: Array<{ label: string; md: string }> = []
        for (const row of attempts.results ?? []) {
          try {
            const md = await ensureAttemptArchive(env, row)
            if (md?.trim()) {
              chunks.push({
                label: `${row.title || 'Task'} · ${row.submitted_at || ''}`,
                md,
              })
            }
          } catch (err) {
            console.error('ensureAttemptArchive failed for attempt', row.id, err)
          }
        }

        if (!chunks.length) {
          return error('No submitted attempts to analyse yet', 400)
        }

        const corpus = truncateArchives(chunks, 90_000)
        const analysis = await pinpointWeakspotsFromArchives(env, {
          scope: 'student',
          name: s.display_name,
          archivesMarkdown: corpus,
          meter: { teacherId: user.id, feature: 'weakspots' },
        })

        await env.DB.prepare(
          `UPDATE students SET weakspots = ?, weakspots_summary = ?, weakspots_updated_at = datetime('now')
           WHERE id = ?`,
        )
          .bind(JSON.stringify(analysis.weakspots), analysis.summary, studentId)
          .run()

        return json({
          weakspots: analysis.weakspots,
          summary: analysis.summary,
          weakspotsUpdatedAt: new Date().toISOString(),
        })
      }

      if (path.match(/^\/api\/classes\/[^/]+\/pinpoint-weakspots$/) && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const classId = path.split('/')[3]
        const cls = await classOwned(env, classId, user.id)
        if (!cls) return error('Not found', 404)

        try {
          await assertAiBudget(env, user.id)
        } catch (err) {
          if (err instanceof AiBudgetExceededError) {
            return aiBudgetExceededResponse(err.usedCents, err.capCents)
          }
          throw err
        }

        const className = (cls as { name?: string }).name || 'Class'

        const attempts = await env.DB.prepare(
          `SELECT a.id, a.attempt_archive_md, a.answers_json, a.feedback_json, a.score_pct,
                  a.submitted_at, s.display_name, s.id as student_id, t.title, t.type, t.subtype,
                  t.subject, t.content_json
           FROM attempts a
           JOIN students s ON s.id = a.student_id
           JOIN tasks t ON t.id = a.task_id
           WHERE s.class_id = ? AND a.status = 'submitted'
           ORDER BY a.submitted_at DESC`,
        )
          .bind(classId)
          .all<{
            id: string
            attempt_archive_md: string | null
            answers_json: string
            feedback_json: string
            score_pct: number | null
            submitted_at: string | null
            display_name: string
            student_id: string
            title: string
            type: string
            subtype: string | null
            subject: string
            content_json: string
          }>()

        // Fair sample: round-robin by student so one learner cannot dominate
        const byStudent = new Map<string, typeof attempts.results>()
        for (const row of attempts.results ?? []) {
          const list = byStudent.get(row.student_id) ?? []
          list.push(row)
          byStudent.set(row.student_id, list)
        }
        const interleaved: NonNullable<typeof attempts.results> = []
        let idx = 0
        let added = true
        while (added && interleaved.length < 120) {
          added = false
          for (const list of byStudent.values()) {
            if (idx < list.length) {
              interleaved.push(list[idx])
              added = true
            }
          }
          idx += 1
        }

        const chunks: Array<{ label: string; md: string }> = []
        for (const row of interleaved) {
          try {
            const md = await ensureAttemptArchive(env, row)
            if (md?.trim()) {
              chunks.push({
                label: `${row.display_name} · ${row.title || 'Task'} · ${row.submitted_at || ''}`,
                md,
              })
            }
          } catch (err) {
            console.error('ensureAttemptArchive failed for attempt', row.id, err)
          }
        }

        if (!chunks.length) {
          return error('No submitted attempts in this class yet', 400)
        }

        const corpus = truncateArchives(chunks, 100_000)
        const analysis = await pinpointWeakspotsFromArchives(env, {
          scope: 'class',
          name: className,
          archivesMarkdown: corpus,
          meter: { teacherId: user.id, classId, feature: 'weakspots' },
        })

        await env.DB.prepare(
          `UPDATE classes SET weakspots_json = ?, weakspots_summary = ?, weakspots_updated_at = datetime('now')
           WHERE id = ?`,
        )
          .bind(JSON.stringify(analysis.weakspots), analysis.summary, classId)
          .run()

        return json({
          weakspots: analysis.weakspots,
          summary: analysis.summary,
          weakspotsUpdatedAt: new Date().toISOString(),
        })
      }

      // —— Task attempts for teacher (flags) ——
      if (path.match(/^\/api\/tasks\/[^/]+\/attempts$/) && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const taskId = path.split('/')[3]
        const owned = await env.DB.prepare(
          `SELECT t.id FROM tasks t JOIN classes c ON c.id = t.class_id
           WHERE t.id = ? AND c.teacher_id = ?`,
        )
          .bind(taskId, user.id)
          .first()
        if (!owned) return error('Not found', 404)

        const { results } = await env.DB.prepare(
          `SELECT a.id, a.student_id, a.task_id, a.started_at, a.submitted_at, a.duration_ms,
                  a.score_pct, a.focus_leave_count, a.flagged, a.status,
                  s.display_name
           FROM attempts a
           JOIN students s ON s.id = a.student_id
           WHERE a.task_id = ?
           ORDER BY a.submitted_at DESC
           LIMIT 200`,
        )
          .bind(taskId)
          .all()
        return json({ attempts: results })
      }

      // —— Text-to-speech (Aura-2 via Workers AI, cached in R2) ——
      if (path === '/api/tts/voices' && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        return json({ voices: TTS_VOICES })
      }

      if (path === '/api/tts' && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const parsed = await parseJsonBody(request)
        if (parsed instanceof Response) return parsed
        const body = parsed as { text?: string; voice?: string; speed?: number; class_id?: string }
        const text = (body.text ?? '').trim()
        if (!text) return error('text is required', 400)
        if (text.length > 10_000) return error('text too long (max 10,000 characters)', 400)

        try {
          await assertAiBudget(env, user.id)
        } catch (err) {
          if (err instanceof AiBudgetExceededError) {
            return aiBudgetExceededResponse(err.usedCents, err.capCents)
          }
          throw err
        }

        const result = await synthesizeSpeech(env, {
          text,
          voice: body.voice,
          speed: body.speed,
          meter: { teacherId: user.id, classId: body.class_id ?? null, feature: 'tts' },
        })
        if ('error' in result) {
          return json({ error: 'Audio generation unavailable right now — try again.', detail: result.error }, 502)
        }
        return json({ key: result.key, url: `/api/tts/${result.key}`, cached: result.cached })
      }

      const ttsMatch = path.match(/^\/api\/tts\/(tts\/[a-f0-9]{64}\.mp3)$/)
      if (ttsMatch && request.method === 'GET') {
        // Any signed-in user may play cached audio (students need it mid-attempt).
        const session = await getSession(env, request)
        if (!session) return error('Unauthorized', 401)
        if (!env.AUDIO) return error('Not found', 404)
        const object = await env.AUDIO.get(ttsMatch[1])
        if (!object) return error('Not found', 404)
        return new Response(object.body, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }

      if (path.startsWith('/api/')) {
        return error('Not found', 404)
      }

      // Static assets / SPA
      return env.ASSETS.fetch(request)
    } catch (err) {
      if (err instanceof AiBudgetExceededError) {
        return aiBudgetExceededResponse(err.usedCents, err.capCents)
      }
      console.error(err)
      return error('Internal server error', 500)
    }
  }

async function exportTeacherAccount(env: Env, teacherId: string): Promise<Record<string, unknown>> {
  const teacher = await env.DB.prepare(`SELECT id, email, name, created_at FROM teachers WHERE id = ?`)
    .bind(teacherId)
    .first()

  const { results: classes } = await env.DB.prepare(
    `SELECT * FROM classes WHERE teacher_id = ?`,
  )
    .bind(teacherId)
    .all()

  const classIds = (classes ?? []).map((c: Record<string, unknown>) => c.id as string)

  let students: unknown[] = []
  let tasks: unknown[] = []
  let attempts: unknown[] = []
  let examProfiles: unknown[] = []
  let insightEvents: unknown[] = []
  let billingAccount: unknown = null
  let billingPeriods: unknown[] = []
  let usageEvents: unknown[] = []

  if (classIds.length) {
    const placeholders = classIds.map(() => '?').join(',')
    const studentRes = await env.DB.prepare(
      `SELECT * FROM students WHERE class_id IN (${placeholders})`,
    )
      .bind(...classIds)
      .all()
    students = studentRes.results ?? []

    const taskRes = await env.DB.prepare(
      `SELECT * FROM tasks WHERE class_id IN (${placeholders})`,
    )
      .bind(...classIds)
      .all()
    tasks = taskRes.results ?? []

    const attemptRes = await env.DB.prepare(
      `SELECT a.* FROM attempts a
       JOIN students s ON s.id = a.student_id
       WHERE s.class_id IN (${placeholders})`,
    )
      .bind(...classIds)
      .all()
    attempts = attemptRes.results ?? []

    const profileRes = await env.DB.prepare(
      `SELECT * FROM exam_profiles WHERE class_id IN (${placeholders})`,
    )
      .bind(...classIds)
      .all()
    examProfiles = profileRes.results ?? []

    const eventRes = await env.DB.prepare(
      `SELECT * FROM insight_events WHERE class_id IN (${placeholders}) OR teacher_id = ?`,
    )
      .bind(...classIds, teacherId)
      .all()
    insightEvents = eventRes.results ?? []
  }

  const account = await env.DB.prepare(
    `SELECT * FROM billing_accounts WHERE teacher_id = ?`,
  )
    .bind(teacherId)
    .first()
  if (account) {
    billingAccount = account
    const { results: periods } = await env.DB.prepare(
      `SELECT * FROM billing_periods WHERE teacher_id = ?`,
    )
      .bind(teacherId)
      .all()
    billingPeriods = periods ?? []

    const { results: usage } = await env.DB.prepare(
      `SELECT * FROM ai_usage_events WHERE teacher_id = ?`,
    )
      .bind(teacherId)
      .all()
    usageEvents = usage ?? []
  }

  return {
    teacher,
    classes: classes ?? [],
    students,
    tasks,
    attempts,
    examProfiles,
    insightEvents,
    billingAccount,
    billingPeriods,
    usageEvents,
  }
}

async function deleteTeacherAccount(env: Env, teacherId: string): Promise<void> {
  // D1 does not support multi-statement transactions across prepared statements,
  // so we delete in an order that respects foreign-key cascades and avoids
  // leaving orphaned rows. audit_events for this actor are removed last.
  const { results: classes } = await env.DB.prepare(
    `SELECT id FROM classes WHERE teacher_id = ?`,
  )
    .bind(teacherId)
    .all<{ id: string }>()
  const classIds = (classes ?? []).map((c) => c.id)

  if (classIds.length) {
    const placeholders = classIds.map(() => '?').join(',')
    // Attempts cascade from tasks/students; delete tasks first.
    await env.DB.prepare(`DELETE FROM tasks WHERE class_id IN (${placeholders})`)
      .bind(...classIds)
      .run()
    // Students cascade from classes, but explicit deletion clears any residual links.
    await env.DB.prepare(`DELETE FROM students WHERE class_id IN (${placeholders})`)
      .bind(...classIds)
      .run()
    await env.DB.prepare(`DELETE FROM classes WHERE id IN (${placeholders})`)
      .bind(...classIds)
      .run()
  }

  await env.DB.prepare(`DELETE FROM reports WHERE teacher_id = ?`).bind(teacherId).run()
  await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND role = 'teacher'`)
    .bind(teacherId)
    .run()
  await env.DB.prepare(`DELETE FROM billing_periods WHERE teacher_id = ?`).bind(teacherId).run()
  await env.DB.prepare(`DELETE FROM ai_usage_events WHERE teacher_id = ?`).bind(teacherId).run()
  await env.DB.prepare(`DELETE FROM billing_accounts WHERE teacher_id = ?`).bind(teacherId).run()
  await env.DB.prepare(`DELETE FROM audit_events WHERE actor_id = ?`).bind(teacherId).run()
  await env.DB.prepare(`DELETE FROM teachers WHERE id = ?`).bind(teacherId).run()
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Canonical host: fold www into the apex so link equity isn't split
    if (url.hostname === 'www.getguidelight.com') {
      url.hostname = 'getguidelight.com'
      return withSecurityHeaders(Response.redirect(url.toString(), 301), env)
    }

    const preflight = corsPreflight(request, env)
    if (preflight) return withSecurityHeaders(preflight, env)

    const tooLarge = checkBodySize(request)
    if (tooLarge) return withSecurityHeaders(tooLarge, env)

    if (path !== '/health') {
      const allowed = await rateLimitIp(request, env, 60, 60)
      if (!allowed) return withSecurityHeaders(error('Rate limit exceeded', 429), env)
    }

    try {
      const response = await handleFetch(request, env)
      return withSecurityHeaders(response, env)
    } catch (err) {
      if (err instanceof AiBudgetExceededError) {
        return withSecurityHeaders(aiBudgetExceededResponse(err.usedCents, err.capCents), env)
      }
      console.error(err)
      return withSecurityHeaders(error('Internal server error', 500), env)
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    try {
      const result = await runMonthlyBilling(env)
      console.log('Monthly billing processed', result)
    } catch (err) {
      console.error('Monthly billing failed', err)
    }
  },
} satisfies ExportedHandler<Env>
