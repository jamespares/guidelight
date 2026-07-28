import type { Env, TaskContent } from './types'
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
  generatePracticeOrFlashcards,
  generateReport,
  generateStudentSummary,
  generateTaskContent,
  describePastPaperImage,
  markAttempt,
} from './lib/ai'
import { getSession, handleAuth, requireRole } from './lib/session'

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

async function hasDiagnostic(env: Env, classId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM tasks WHERE class_id = ? AND subtype = 'diagnostic' AND status = 'published' LIMIT 1`,
  )
    .bind(classId)
    .first()
  return !!row
}

async function recomputeWeakspots(env: Env, studentId: string) {
  const attempts = await env.DB.prepare(
    `SELECT feedback_json FROM attempts WHERE student_id = ? AND status = 'submitted'`,
  )
    .bind(studentId)
    .all<{ feedback_json: string }>()

  const topicErrors: Record<string, number> = {}
  for (const a of attempts.results ?? []) {
    try {
      const fb = JSON.parse(a.feedback_json) as Record<string, { correct?: boolean; topic?: string }>
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

async function hwCompletionRate(env: Env, studentId: string, classId: string): Promise<number | null> {
  const assigned = await env.DB.prepare(
    `SELECT COUNT(DISTINCT t.id) as c FROM tasks t
     LEFT JOIN task_assignments a ON a.task_id = t.id
     WHERE t.class_id = ? AND t.type = 'homework' AND t.status = 'published'
       AND (a.student_id IS NULL OR a.student_id = ?)`,
  )
    .bind(classId, studentId)
    .first<{ c: number }>()

  const submitted = await env.DB.prepare(
    `SELECT COUNT(DISTINCT att.task_id) as c FROM attempts att
     JOIN tasks t ON t.id = att.task_id
     WHERE att.student_id = ? AND t.type = 'homework' AND att.status = 'submitted'`,
  )
    .bind(studentId)
    .first<{ c: number }>()

  const total = assigned?.c ?? 0
  if (total === 0) return null
  return Math.round(((submitted?.c ?? 0) / total) * 1000) / 10
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': url.origin,
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Credentials': 'true',
        },
      })
    }

    try {
      if (path.startsWith('/api/auth')) {
        const res = await handleAuth(env, request, path)
        if (res) return res
      }

      // —— Classes ——
      if (path === '/api/classes' && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const { results } = await env.DB.prepare(
          `SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC`,
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
                  s.weakspots, s.username, s.ai_summary, s.created_at,
                  c.name as class_name, c.subject as class_subject
           FROM students s
           JOIN classes c ON c.id = s.class_id
           WHERE c.teacher_id = ?
           ORDER BY s.display_name`,
        )
          .bind(user.id)
          .all<{
            id: string
            class_id: string
            display_name: string
            interests: string
            career_ambitions: string
            weakspots: string
            username: string
            ai_summary: string
            class_name: string
            class_subject: string
          }>()

        const students = []
        for (const s of results ?? []) {
          const rate = await hwCompletionRate(env, s.id, s.class_id)
          students.push({
            ...s,
            weakspots: JSON.parse(s.weakspots || '[]'),
            hw_completion_rate: rate,
          })
        }
        return json({ students })
      }

      const studentMatch = path.match(/^\/api\/students\/([^/]+)$/)
      if (studentMatch && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const studentId = studentMatch[1]
        const s = await env.DB.prepare(
          `SELECT s.id, s.class_id, s.display_name, s.interests, s.career_ambitions,
                  s.weakspots, s.username, s.ai_summary, s.created_at,
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
            username: string
            ai_summary: string
            class_name: string
            class_subject: string
            teacher_id: string
          }>()
        if (!s || s.teacher_id !== user.id) return error('Not found', 404)

        const attempts = await env.DB.prepare(
          `SELECT a.*, t.title, t.type, t.subtype FROM attempts a
           JOIN tasks t ON t.id = a.task_id
           WHERE a.student_id = ? ORDER BY a.started_at DESC`,
        )
          .bind(studentId)
          .all()

        const rate = await hwCompletionRate(env, s.id, s.class_id)
        const { teacher_id: _teacherId, ...safe } = s
        void _teacherId
        return json({
          student: {
            ...safe,
            weakspots: JSON.parse(s.weakspots || '[]'),
            hw_completion_rate: rate,
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
        }
        await env.DB.prepare(
          `UPDATE students SET interests = COALESCE(?, interests),
           career_ambitions = COALESCE(?, career_ambitions) WHERE id = ?`,
        )
          .bind(body.interests ?? null, body.career_ambitions ?? null, studentId)
          .run()
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

      // —— Tasks (homework + assessments) ——
      if (path === '/api/tasks' && request.method === 'GET') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const type = url.searchParams.get('type')
        let query = `SELECT t.*, c.name as class_name FROM tasks t
          JOIN classes c ON c.id = t.class_id WHERE c.teacher_id = ?`
        const binds: string[] = [user.id]
        if (type) {
          query += ` AND t.type = ?`
          binds.push(type)
        }
        query += ` ORDER BY t.created_at DESC`
        const stmt = env.DB.prepare(query)
        const { results } = await stmt.bind(...binds).all()
        return json({ tasks: results })
      }

      if (path === '/api/tasks' && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
        const body = (await request.json()) as {
          type: 'homework' | 'assessment'
          subtype?: 'diagnostic' | 'formative' | 'summative' | null
          class_id: string
          subject?: string
          description: string
          difficulty: 'easy' | 'medium' | 'hard'
          question_count: number
          reading_text?: string
          past_paper_text?: string
          past_paper_image?: string
          time_limit_seconds?: number | null
          use_all_question_types?: boolean
        }

        const cls = await classOwned(env, body.class_id, user.id)
        if (!cls) return error('Class not found', 404)

        const isDiagnostic = body.subtype === 'diagnostic'
        if (!isDiagnostic && !(await hasDiagnostic(env, body.class_id))) {
          return error(
            'Set a diagnostic assessment before creating homework or other assessments.',
            400,
          )
        }

        const subject = (body.subject || (cls as { subject: string }).subject).trim()
        const students = await env.DB.prepare(
          `SELECT display_name, interests, weakspots FROM students WHERE class_id = ? LIMIT 12`,
        )
          .bind(body.class_id)
          .all<{ display_name: string; interests: string; weakspots: string }>()

        const questionTypes = body.use_all_question_types || body.type === 'assessment'
          ? ALL_TYPES
          : PHASE2_TYPES

        let pastPaperText = body.past_paper_text ?? ''
        if (body.past_paper_image) {
          const visionNotes = await describePastPaperImage(env, body.past_paper_image)
          pastPaperText = [pastPaperText, visionNotes].filter(Boolean).join('\n\n')
        }

        const content = await generateTaskContent(env, {
          subject,
          curriculum: (cls as { curriculum: string }).curriculum,
          description: body.description,
          difficulty: body.difficulty,
          questionCount: body.question_count || 8,
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
        })

        const id = generateId()
        await env.DB.prepare(
          `INSERT INTO tasks (
            id, type, subtype, class_id, subject, title, description, difficulty,
            status, time_limit_seconds, content_json, reading_text, past_paper_text, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
        )
          .bind(
            id,
            body.type,
            body.subtype ?? null,
            body.class_id,
            subject,
            content.title || body.description.slice(0, 80),
            body.description,
            body.difficulty,
            body.time_limit_seconds ?? null,
            JSON.stringify(content),
            body.reading_text ?? '',
            pastPaperText,
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

        // Strip correct answers for students
        let content = JSON.parse(task.content_json || '{}') as TaskContent
        if (user.role === 'student') {
          content = {
            ...content,
            questions: (content.questions ?? []).map((q) => ({
              ...q,
              correctAnswer: undefined,
              blanks: undefined,
            })),
          }
        }
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

        const body = (await request.json()) as {
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

        if (task.subtype !== 'diagnostic' && !(await hasDiagnostic(env, task.class_id))) {
          return error('Publish a diagnostic assessment first.', 400)
        }

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
        const student = await env.DB.prepare(`SELECT class_id FROM students WHERE id = ?`)
          .bind(user.id)
          .first<{ class_id: string }>()
        if (!student) return error('Not found', 404)

        const { results } = await env.DB.prepare(
          `SELECT t.id, t.type, t.subtype, t.title, t.subject, t.difficulty,
                  t.time_limit_seconds, t.published_at,
                  (SELECT score_pct FROM attempts WHERE task_id = t.id AND student_id = ? AND status = 'submitted' ORDER BY submitted_at DESC LIMIT 1) as last_score,
                  (SELECT status FROM attempts WHERE task_id = t.id AND student_id = ? ORDER BY started_at DESC LIMIT 1) as attempt_status
           FROM tasks t
           JOIN task_assignments a ON a.task_id = t.id
           WHERE t.class_id = ? AND t.status = 'published'
             AND (a.student_id IS NULL OR a.student_id = ?)
           ORDER BY t.published_at DESC`,
        )
          .bind(user.id, user.id, student.class_id, user.id)
          .all()
        return json({ tasks: results })
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
          .first<{ subject: string; content_json: string; time_limit_seconds: number | null }>()
        if (!task) return error('Task missing', 404)

        const content = JSON.parse(task.content_json) as TaskContent
        const marked = await markAttempt(env, {
          subject: task.subject,
          content,
          answers: body.answers ?? {},
        })

        const duration =
          body.duration_ms ??
          Math.max(0, Date.now() - new Date(attempt.started_at + 'Z').getTime())

        await env.DB.prepare(
          `UPDATE attempts SET
            submitted_at = datetime('now'),
            duration_ms = ?,
            answers_json = ?,
            score_pct = ?,
            feedback_json = ?,
            topic_tags_json = ?,
            status = 'submitted'
           WHERE id = ?`,
        )
          .bind(
            duration,
            JSON.stringify(body.answers ?? {}),
            marked.score_pct,
            JSON.stringify(marked.feedback),
            JSON.stringify(marked.topic_tags),
            attemptId,
          )
          .run()

        await recomputeWeakspots(env, user.id)

        return json({
          score_pct: marked.score_pct,
          feedback: marked.feedback,
        })
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
             WHERE s.class_id = ? AND a.status = 'submitted'
             ORDER BY a.submitted_at ASC`,
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
          const weakspots = Object.entries(topicErrors)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([topic, count]) => ({ topic, count }))

          // Submission rate series: one point per submitted homework
          const hwSeries = (attempts.results ?? [])
            .filter((a) => a.type === 'homework')
            .map((a, i, arr) => ({
              date: a.submitted_at,
              value: Math.round(((i + 1) / Math.max(arr.length, 1)) * 1000) / 10,
            }))

          return json({
            avgScore,
            scoreSeries: scores,
            hwRate,
            hwSeries,
            weakspots,
          })
        }

        // student scope
        const s = await env.DB.prepare(
          `SELECT s.*, c.teacher_id FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
        )
          .bind(id)
          .first<{ id: string; teacher_id: string; weakspots: string; class_id: string }>()
        if (!s || s.teacher_id !== user.id) return error('Not found', 404)

        const attempts = await env.DB.prepare(
          `SELECT a.score_pct, a.submitted_at, a.feedback_json, t.type
           FROM attempts a JOIN tasks t ON t.id = a.task_id
           WHERE a.student_id = ? AND a.status = 'submitted'
           ORDER BY a.submitted_at ASC`,
        )
          .bind(id)
          .all<{ score_pct: number; submitted_at: string; feedback_json: string; type: string }>()

        const scores = (attempts.results ?? []).map((a) => ({
          date: a.submitted_at,
          value: a.score_pct,
        }))
        const avgScore =
          scores.length > 0
            ? Math.round((scores.reduce((sum, x) => sum + x.value, 0) / scores.length) * 10) / 10
            : null
        const hwRate = await hwCompletionRate(env, id, s.class_id)
        const hwSeries = (attempts.results ?? [])
          .filter((a) => a.type === 'homework')
          .map((a, i, arr) => ({
            date: a.submitted_at,
            value: Math.round(((i + 1) / Math.max(arr.length, 1)) * hwRate!) || 0,
          }))

        return json({
          avgScore,
          scoreSeries: scores,
          hwRate,
          hwSeries,
          weakspots: JSON.parse(s.weakspots || '[]'),
        })
      }

      // —— Reports ——
      if (path === '/api/reports' && request.method === 'POST') {
        const user = await requireRole(env, request, 'teacher')
        if (user instanceof Response) return user
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

        const weakspots = JSON.parse(s.weakspots || '[]') as Array<{ topic: string }>
        const recent = await env.DB.prepare(
          `SELECT feedback_json FROM attempts WHERE student_id = ? AND status = 'submitted'
           ORDER BY submitted_at DESC LIMIT 5`,
        )
          .bind(user.id)
          .all()

        const result = await generatePracticeOrFlashcards(env, body.mode, {
          subject: s.subject,
          weakspots: weakspots.map((w) => w.topic),
          recentErrors: recent.results ?? [],
        })
        return json({ result })
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
          `SELECT a.*, s.display_name FROM attempts a
           JOIN students s ON s.id = a.student_id
           WHERE a.task_id = ? ORDER BY a.submitted_at DESC`,
        )
          .bind(taskId)
          .all()
        return json({ attempts: results })
      }

      if (path.startsWith('/api/')) {
        return error('Not found', 404)
      }

      // Static assets / SPA
      return env.ASSETS.fetch(request)
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : 'Server error'
      return error(message, 500)
    }
  },
} satisfies ExportedHandler<Env>
