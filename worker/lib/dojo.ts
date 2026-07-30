import type { Env, SessionUser, TaskContent } from '../types'
import { error, generateId, json } from './auth'
import { reconstructPastPaper, markDojoAttempt } from './ai'
import { buildDojoAttemptArchiveMd } from './attemptArchive'
import { computeDojoStats } from '../../shared/dojo/stats'
import {
  AiBudgetExceededError,
  aiBudgetExceededResponse,
  assertAiBudget,
  teacherIdForClass,
  teacherIdForStudent,
} from './billing'

const RECONSTRUCTION_LABEL = 'ai_reconstructed_practice'

export type DojoPaperRow = {
  id: string
  class_id: string
  created_by_role: string
  created_by_id: string
  owner_student_id: string | null
  title: string
  subject: string
  curriculum: string
  syllabus_code: string
  source_file_name: string
  content_fingerprint: string
  extracted_text: string
  content_json: string
  reconstruction_label: string
  reconstructed_at: string | null
  status: string
  duration_seconds: number | null
  pass_threshold: number
  top_threshold: number
  fail_reason: string
  created_at: string
  published_at: string | null
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function fingerprintPaper(input: {
  extractedText?: string
  imageDataUrls?: string[]
  subject: string
  curriculum: string
  syllabusCode: string
}): Promise<string> {
  const imageHint = (input.imageDataUrls || [])
    .map((u) => u.slice(0, 64) + String(u.length))
    .join('|')
  const raw = [
    input.subject.trim().toLowerCase(),
    input.curriculum.trim().toLowerCase(),
    input.syllabusCode.trim().toLowerCase(),
    (input.extractedText || '').slice(0, 8000),
    imageHint,
  ].join('\n---\n')
  return sha256Hex(raw)
}

function publicPaper(row: DojoPaperRow, includeContent = false) {
  const base = {
    id: row.id,
    class_id: row.class_id,
    owner_student_id: row.owner_student_id,
    title: row.title,
    subject: row.subject,
    curriculum: row.curriculum,
    syllabus_code: row.syllabus_code,
    source_file_name: row.source_file_name,
    reconstruction_label: row.reconstruction_label,
    reconstructed_at: row.reconstructed_at,
    status: row.status,
    duration_seconds: row.duration_seconds,
    pass_threshold: row.pass_threshold,
    top_threshold: row.top_threshold,
    fail_reason: row.fail_reason,
    created_at: row.created_at,
    published_at: row.published_at,
    created_by_role: row.created_by_role,
  }
  if (!includeContent) return base
  let content: TaskContent = { title: '', instructions: '', questions: [] }
  try {
    content = JSON.parse(row.content_json || '{}') as TaskContent
  } catch {
    /* ignore */
  }
  return { ...base, content }
}

async function classOwned(env: Env, classId: string, teacherId: string) {
  return env.DB.prepare(`SELECT * FROM classes WHERE id = ? AND teacher_id = ?`)
    .bind(classId, teacherId)
    .first()
}

async function studentRow(env: Env, studentId: string) {
  return env.DB.prepare(
    `SELECT s.*, c.subject as class_subject, c.curriculum as class_curriculum, c.teacher_id
     FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
  )
    .bind(studentId)
    .first<{
      id: string
      class_id: string
      display_name: string
      class_subject: string
      class_curriculum: string
      teacher_id: string
    }>()
}

async function paperAccessibleToStudent(
  env: Env,
  paperId: string,
  studentId: string,
  classId: string,
): Promise<DojoPaperRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM dojo_papers WHERE id = ?`)
    .bind(paperId)
    .first<DojoPaperRow>()
  if (!row || row.class_id !== classId) return null
  if (row.owner_student_id === studentId && ['ready', 'published', 'draft'].includes(row.status)) {
    return row
  }
  if (!row.owner_student_id && row.status === 'published') return row
  // Student personal ready papers
  if (row.owner_student_id === studentId && row.status === 'ready') return row
  return null
}

async function findCachedByFingerprint(
  env: Env,
  fingerprint: string,
  classId: string,
): Promise<DojoPaperRow | null> {
  return env.DB.prepare(
    `SELECT * FROM dojo_papers
     WHERE content_fingerprint = ? AND class_id = ?
       AND reconstructed_at IS NOT NULL
       AND content_json != '{}' AND content_json != ''
       AND status IN ('draft', 'ready', 'published')
     ORDER BY reconstructed_at DESC LIMIT 1`,
  )
    .bind(fingerprint, classId)
    .first<DojoPaperRow>()
}

async function runReconstruction(
  env: Env,
  paperId: string,
  input: {
    extractedText?: string
    imageDataUrls?: string[]
    subject: string
    curriculum: string
    syllabusCode: string
    title?: string
    teacherId?: string
    classId?: string
  },
  nextStatus: 'draft' | 'ready',
): Promise<DojoPaperRow> {
  try {
    const content = await reconstructPastPaper(env, {
      ...input,
      meter: input.teacherId
        ? {
            teacherId: input.teacherId,
            classId: input.classId,
            feature: 'dojo_reconstruct',
          }
        : undefined,
    })
    await env.DB.prepare(
      `UPDATE dojo_papers SET
         content_json = ?, title = COALESCE(NULLIF(?, ''), title),
         status = ?, reconstructed_at = datetime('now'), fail_reason = ''
       WHERE id = ? AND reconstructed_at IS NULL`,
    )
      .bind(JSON.stringify(content), content.title, nextStatus, paperId)
      .run()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Reconstruction failed'
    await env.DB.prepare(
      `UPDATE dojo_papers SET status = 'failed', fail_reason = ? WHERE id = ? AND reconstructed_at IS NULL`,
    )
      .bind(msg.slice(0, 500), paperId)
      .run()
  }

  const row = await env.DB.prepare(`SELECT * FROM dojo_papers WHERE id = ?`)
    .bind(paperId)
    .first<DojoPaperRow>()
  if (!row) throw new Error('Paper missing after reconstruct')
  return row
}

/**
 * Recompute weakspots from homework attempts + Exam Dojo attempts.
 */
export async function recomputeWeakspotsWithDojo(env: Env, studentId: string) {
  const [taskAttempts, dojoAttempts] = await Promise.all([
    env.DB.prepare(
      `SELECT feedback_json FROM attempts WHERE student_id = ? AND status = 'submitted'`,
    )
      .bind(studentId)
      .all<{ feedback_json: string }>(),
    env.DB.prepare(
      `SELECT feedback_json FROM dojo_attempts WHERE student_id = ? AND status = 'submitted'`,
    )
      .bind(studentId)
      .all<{ feedback_json: string }>(),
  ])

  const topicErrors: Record<string, number> = {}
  for (const a of [...(taskAttempts.results ?? []), ...(dojoAttempts.results ?? [])]) {
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

export async function listDojoArchivesForStudent(
  env: Env,
  studentId: string,
): Promise<Array<{ label: string; md: string; submitted_at: string | null }>> {
  const { results } = await env.DB.prepare(
    `SELECT a.attempt_archive_md, a.submitted_at, a.score_pct, p.title, p.subject
     FROM dojo_attempts a
     JOIN dojo_papers p ON p.id = a.paper_id
     WHERE a.student_id = ? AND a.status = 'submitted' AND a.attempt_archive_md != ''
     ORDER BY a.submitted_at DESC`,
  )
    .bind(studentId)
    .all<{
      attempt_archive_md: string
      submitted_at: string | null
      score_pct: number | null
      title: string
      subject: string
    }>()

  return (results ?? []).map((r) => ({
    label: `Exam Dojo · ${r.title || r.subject} · ${r.submitted_at || ''}`,
    md: r.attempt_archive_md,
    submitted_at: r.submitted_at,
  }))
}

export async function listDojoArchivesForClass(
  env: Env,
  classId: string,
): Promise<
  Array<{ label: string; md: string; submitted_at: string | null; student_id: string; display_name: string }>
> {
  const { results } = await env.DB.prepare(
    `SELECT a.attempt_archive_md, a.submitted_at, a.student_id, s.display_name, p.title, p.subject
     FROM dojo_attempts a
     JOIN dojo_papers p ON p.id = a.paper_id
     JOIN students s ON s.id = a.student_id
     WHERE s.class_id = ? AND a.status = 'submitted' AND a.attempt_archive_md != ''
     ORDER BY a.submitted_at DESC`,
  )
    .bind(classId)
    .all<{
      attempt_archive_md: string
      submitted_at: string | null
      student_id: string
      display_name: string
      title: string
      subject: string
    }>()

  return (results ?? []).map((r) => ({
    label: `Exam Dojo · ${r.display_name} · ${r.title || r.subject} · ${r.submitted_at || ''}`,
    md: r.attempt_archive_md,
    submitted_at: r.submitted_at,
    student_id: r.student_id,
    display_name: r.display_name,
  }))
}

export async function listDojoScoresForStudent(env: Env, studentId: string) {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.score_pct, a.submitted_at, p.title, p.subject, p.curriculum, p.syllabus_code
     FROM dojo_attempts a
     JOIN dojo_papers p ON p.id = a.paper_id
     WHERE a.student_id = ? AND a.status = 'submitted'
     ORDER BY a.submitted_at DESC
     LIMIT 40`,
  )
    .bind(studentId)
    .all()
  return results ?? []
}

export async function handleDojoApi(
  request: Request,
  env: Env,
  path: string,
  user: SessionUser,
): Promise<Response | null> {
  // —— Teacher: list papers for a class ——
  if (path === '/api/dojo/papers' && request.method === 'GET') {
    if (user.role !== 'teacher') return error('Forbidden', 403)
    const url = new URL(request.url)
    const classId = url.searchParams.get('classId') || ''
    if (!classId) return error('classId required', 400)
    const owned = await classOwned(env, classId, user.id)
    if (!owned) return error('Not found', 404)
    const { results } = await env.DB.prepare(
      `SELECT * FROM dojo_papers
       WHERE class_id = ? AND owner_student_id IS NULL
       ORDER BY created_at DESC`,
    )
      .bind(classId)
      .all<DojoPaperRow>()
    return json({ papers: (results ?? []).map((r) => publicPaper(r)) })
  }

  // —— Teacher: create / reconstruct ——
  if (path === '/api/dojo/papers' && request.method === 'POST') {
    if (user.role !== 'teacher') return error('Forbidden', 403)
    const body = (await request.json()) as {
      class_id?: string
      subject?: string
      curriculum?: string
      syllabus_code?: string
      title?: string
      source_file_name?: string
      extracted_text?: string
      past_paper_image?: string
      image_data_urls?: string[]
      duration_seconds?: number | null
      pass_threshold?: number
      top_threshold?: number
    }
    if (!body.class_id || !body.subject?.trim() || !body.curriculum?.trim() || !body.syllabus_code?.trim()) {
      return error('class_id, subject, curriculum, and syllabus_code are required', 400)
    }
    const owned = await classOwned(env, body.class_id, user.id)
    if (!owned) return error('Not found', 404)

    const images =
      body.image_data_urls?.length
        ? body.image_data_urls
        : body.past_paper_image
          ? [body.past_paper_image]
          : []
    const extracted = (body.extracted_text || '').trim()
    if (!extracted && !images.length) {
      return error('Upload a PDF (with text) or an image of the past paper', 400)
    }

    const fp = await fingerprintPaper({
      extractedText: extracted,
      imageDataUrls: images,
      subject: body.subject,
      curriculum: body.curriculum,
      syllabusCode: body.syllabus_code,
    })

    const cached = await findCachedByFingerprint(env, fp, body.class_id)
    if (cached) {
      // Reuse saved reconstruction — never regenerate (even if original was a student upload)
      if (cached.owner_student_id == null) {
        return json({ paper: publicPaper(cached, true), reused: true })
      }
      let content: TaskContent = { title: '', instructions: '', questions: [] }
      try {
        content = JSON.parse(cached.content_json) as TaskContent
      } catch {
        /* ignore */
      }
      const id = generateId()
      await env.DB.prepare(
        `INSERT INTO dojo_papers (
           id, class_id, created_by_role, created_by_id, owner_student_id,
           title, subject, curriculum, syllabus_code, source_file_name,
           content_fingerprint, extracted_text, content_json, reconstruction_label,
           reconstructed_at, status, duration_seconds, pass_threshold, top_threshold
         ) VALUES (?, ?, 'teacher', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      )
        .bind(
          id,
          body.class_id,
          user.id,
          body.title || cached.title,
          body.subject.trim(),
          body.curriculum.trim(),
          body.syllabus_code.trim(),
          body.source_file_name || '',
          fp,
          extracted.slice(0, 40_000),
          JSON.stringify(content),
          RECONSTRUCTION_LABEL,
          cached.reconstructed_at,
          body.duration_seconds ?? cached.duration_seconds,
          body.pass_threshold ?? cached.pass_threshold,
          body.top_threshold ?? cached.top_threshold,
        )
        .run()
      const row = await env.DB.prepare(`SELECT * FROM dojo_papers WHERE id = ?`)
        .bind(id)
        .first<DojoPaperRow>()
      return json({ paper: publicPaper(row!, true), reused: true })
    }

    const id = generateId()
    await env.DB.prepare(
      `INSERT INTO dojo_papers (
         id, class_id, created_by_role, created_by_id, owner_student_id,
         title, subject, curriculum, syllabus_code, source_file_name,
         content_fingerprint, extracted_text, content_json, reconstruction_label,
         status, duration_seconds, pass_threshold, top_threshold
       ) VALUES (?, ?, 'teacher', ?, NULL, ?, ?, ?, ?, ?, ?, ?, '{}', ?, 'processing', ?, ?, ?)`,
    )
      .bind(
        id,
        body.class_id,
        user.id,
        body.title || `${body.subject} practice paper`,
        body.subject.trim(),
        body.curriculum.trim(),
        body.syllabus_code.trim(),
        body.source_file_name || '',
        fp,
        extracted.slice(0, 40_000),
        RECONSTRUCTION_LABEL,
        body.duration_seconds ?? null,
        body.pass_threshold ?? 50,
        body.top_threshold ?? 80,
      )
      .run()

    try {
      await assertAiBudget(env, user.id)
    } catch (err) {
      if (err instanceof AiBudgetExceededError) {
        await env.DB.prepare(`DELETE FROM dojo_papers WHERE id = ?`).bind(id).run()
        return aiBudgetExceededResponse(err.usedCents, err.capCents)
      }
      throw err
    }

    const row = await runReconstruction(
      env,
      id,
      {
        extractedText: extracted,
        imageDataUrls: images,
        subject: body.subject.trim(),
        curriculum: body.curriculum.trim(),
        syllabusCode: body.syllabus_code.trim(),
        title: body.title,
        teacherId: user.id,
        classId: body.class_id,
      },
      'draft',
    )
    return json({ paper: publicPaper(row, true), reused: false })
  }

  const teacherPaperMatch = path.match(/^\/api\/dojo\/papers\/([^/]+)$/)
  if (teacherPaperMatch && request.method === 'GET') {
    const paperId = teacherPaperMatch[1]
    if (user.role === 'teacher') {
      const row = await env.DB.prepare(
        `SELECT p.* FROM dojo_papers p
         JOIN classes c ON c.id = p.class_id
         WHERE p.id = ? AND c.teacher_id = ?`,
      )
        .bind(paperId, user.id)
        .first<DojoPaperRow>()
      if (!row) return error('Not found', 404)
      return json({ paper: publicPaper(row, true) })
    }
    if (user.role === 'student') {
      const s = await studentRow(env, user.id)
      if (!s) return error('Not found', 404)
      const row = await paperAccessibleToStudent(env, paperId, user.id, s.class_id)
      if (!row || row.status === 'failed' || row.status === 'processing') {
        return error('Not found', 404)
      }
      // Students sit published/ready; draft only if own
      if (row.status === 'draft' && row.owner_student_id !== user.id) {
        return error('Not found', 404)
      }
      return json({ paper: publicPaper(row, true) })
    }
    return error('Forbidden', 403)
  }

  if (teacherPaperMatch && request.method === 'PATCH') {
    if (user.role !== 'teacher') return error('Forbidden', 403)
    const paperId = teacherPaperMatch[1]
    const row = await env.DB.prepare(
      `SELECT p.* FROM dojo_papers p
       JOIN classes c ON c.id = p.class_id
       WHERE p.id = ? AND c.teacher_id = ?`,
    )
      .bind(paperId, user.id)
      .first<DojoPaperRow>()
    if (!row) return error('Not found', 404)
    if (row.reconstructed_at == null && row.status === 'failed') {
      return error('Cannot edit a failed reconstruction', 400)
    }

    const body = (await request.json()) as {
      title?: string
      content?: TaskContent
      duration_seconds?: number | null
      pass_threshold?: number
      top_threshold?: number
    }

    const title = body.title ?? row.title
    const contentJson = body.content ? JSON.stringify(body.content) : row.content_json
    await env.DB.prepare(
      `UPDATE dojo_papers SET
         title = ?, content_json = ?,
         duration_seconds = COALESCE(?, duration_seconds),
         pass_threshold = COALESCE(?, pass_threshold),
         top_threshold = COALESCE(?, top_threshold)
       WHERE id = ?`,
    )
      .bind(
        title,
        contentJson,
        body.duration_seconds === undefined ? null : body.duration_seconds,
        body.pass_threshold ?? null,
        body.top_threshold ?? null,
        paperId,
      )
      .run()

    const updated = await env.DB.prepare(`SELECT * FROM dojo_papers WHERE id = ?`)
      .bind(paperId)
      .first<DojoPaperRow>()
    return json({ paper: publicPaper(updated!, true) })
  }

  const publishMatch = path.match(/^\/api\/dojo\/papers\/([^/]+)\/publish$/)
  if (publishMatch && request.method === 'POST') {
    if (user.role !== 'teacher') return error('Forbidden', 403)
    const paperId = publishMatch[1]
    const row = await env.DB.prepare(
      `SELECT p.* FROM dojo_papers p
       JOIN classes c ON c.id = p.class_id
       WHERE p.id = ? AND c.teacher_id = ?`,
    )
      .bind(paperId, user.id)
      .first<DojoPaperRow>()
    if (!row) return error('Not found', 404)
    if (!row.reconstructed_at || row.status === 'failed') {
      return error('Paper is not ready to publish', 400)
    }
    let content: TaskContent
    try {
      content = JSON.parse(row.content_json) as TaskContent
    } catch {
      return error('Invalid paper content', 400)
    }
    if (!content.questions?.length) return error('Paper has no questions', 400)

    await env.DB.prepare(
      `UPDATE dojo_papers SET status = 'published', published_at = datetime('now') WHERE id = ?`,
    )
      .bind(paperId)
      .run()
    return json({ ok: true })
  }

  // —— Student library ——
  if (path === '/api/student/dojo/papers' && request.method === 'GET') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const s = await studentRow(env, user.id)
    if (!s) return error('Not found', 404)

    const shared = await env.DB.prepare(
      `SELECT * FROM dojo_papers
       WHERE class_id = ? AND owner_student_id IS NULL AND status = 'published'
       ORDER BY published_at DESC`,
    )
      .bind(s.class_id)
      .all<DojoPaperRow>()

    const mine = await env.DB.prepare(
      `SELECT * FROM dojo_papers
       WHERE owner_student_id = ? AND status IN ('ready', 'processing', 'failed')
       ORDER BY created_at DESC`,
    )
      .bind(user.id)
      .all<DojoPaperRow>()

    return json({
      shared: (shared.results ?? []).map((r) => publicPaper(r)),
      mine: (mine.results ?? []).map((r) => publicPaper(r)),
    })
  }

  // —— Student upload ——
  if (path === '/api/student/dojo/papers' && request.method === 'POST') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const s = await studentRow(env, user.id)
    if (!s) return error('Not found', 404)

    const body = (await request.json()) as {
      subject?: string
      curriculum?: string
      syllabus_code?: string
      title?: string
      source_file_name?: string
      extracted_text?: string
      past_paper_image?: string
      image_data_urls?: string[]
    }
    if (!body.subject?.trim() || !body.curriculum?.trim() || !body.syllabus_code?.trim()) {
      return error('subject, curriculum, and syllabus_code are required', 400)
    }

    const images =
      body.image_data_urls?.length
        ? body.image_data_urls
        : body.past_paper_image
          ? [body.past_paper_image]
          : []
    const extracted = (body.extracted_text || '').trim()
    if (!extracted && !images.length) {
      return error('Upload a PDF (with text) or an image of the past paper', 400)
    }

    const fp = await fingerprintPaper({
      extractedText: extracted,
      imageDataUrls: images,
      subject: body.subject,
      curriculum: body.curriculum,
      syllabusCode: body.syllabus_code,
    })

    // Reuse any reconstructed paper in this class with same fingerprint (no new AI call)
    const cached = await findCachedByFingerprint(env, fp, s.class_id)
    if (cached) {
      let content: TaskContent = { title: '', instructions: '', questions: [] }
      try {
        content = JSON.parse(cached.content_json) as TaskContent
      } catch {
        /* ignore */
      }
      const id = generateId()
      await env.DB.prepare(
        `INSERT INTO dojo_papers (
           id, class_id, created_by_role, created_by_id, owner_student_id,
           title, subject, curriculum, syllabus_code, source_file_name,
           content_fingerprint, extracted_text, content_json, reconstruction_label,
           reconstructed_at, status, duration_seconds, pass_threshold, top_threshold
         ) VALUES (?, ?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)`,
      )
        .bind(
          id,
          s.class_id,
          user.id,
          user.id,
          body.title || cached.title,
          body.subject.trim(),
          body.curriculum.trim(),
          body.syllabus_code.trim(),
          body.source_file_name || '',
          fp,
          extracted.slice(0, 40_000),
          JSON.stringify(content),
          RECONSTRUCTION_LABEL,
          cached.reconstructed_at,
          cached.duration_seconds,
          cached.pass_threshold,
          cached.top_threshold,
        )
        .run()
      const row = await env.DB.prepare(`SELECT * FROM dojo_papers WHERE id = ?`)
        .bind(id)
        .first<DojoPaperRow>()
      return json({ paper: publicPaper(row!, true), reused: true })
    }

    const id = generateId()
    await env.DB.prepare(
      `INSERT INTO dojo_papers (
         id, class_id, created_by_role, created_by_id, owner_student_id,
         title, subject, curriculum, syllabus_code, source_file_name,
         content_fingerprint, extracted_text, content_json, reconstruction_label,
         status, pass_threshold, top_threshold
       ) VALUES (?, ?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, 'processing', 50, 80)`,
    )
      .bind(
        id,
        s.class_id,
        user.id,
        user.id,
        body.title || `${body.subject} practice paper`,
        body.subject.trim(),
        body.curriculum.trim(),
        body.syllabus_code.trim(),
        body.source_file_name || '',
        fp,
        extracted.slice(0, 40_000),
        RECONSTRUCTION_LABEL,
      )
      .run()

    const billingTeacherId = await teacherIdForClass(env, s.class_id)
    if (billingTeacherId) {
      try {
        await assertAiBudget(env, billingTeacherId)
      } catch (err) {
        if (err instanceof AiBudgetExceededError) {
          await env.DB.prepare(`DELETE FROM dojo_papers WHERE id = ?`).bind(id).run()
          return aiBudgetExceededResponse(err.usedCents, err.capCents)
        }
        throw err
      }
    }

    const row = await runReconstruction(
      env,
      id,
      {
        extractedText: extracted,
        imageDataUrls: images,
        subject: body.subject.trim(),
        curriculum: body.curriculum.trim(),
        syllabusCode: body.syllabus_code.trim(),
        title: body.title,
        teacherId: billingTeacherId ?? undefined,
        classId: s.class_id,
      },
      'ready',
    )
    return json({ paper: publicPaper(row, true), reused: false })
  }

  const startMatch = path.match(/^\/api\/student\/dojo\/papers\/([^/]+)\/start$/)
  if (startMatch && request.method === 'POST') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const s = await studentRow(env, user.id)
    if (!s) return error('Not found', 404)
    const paperId = startMatch[1]
    const row = await paperAccessibleToStudent(env, paperId, user.id, s.class_id)
    if (!row || !['ready', 'published'].includes(row.status)) {
      return error('Paper not available', 404)
    }

    const existing = await env.DB.prepare(
      `SELECT id FROM dojo_attempts
       WHERE paper_id = ? AND student_id = ? AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1`,
    )
      .bind(paperId, user.id)
      .first<{ id: string }>()
    if (existing) {
      return json({
        attemptId: existing.id,
        time_limit_seconds: row.duration_seconds,
        resumed: true,
      })
    }

    const attemptId = generateId()
    await env.DB.prepare(
      `INSERT INTO dojo_attempts (id, paper_id, student_id, started_at, status)
       VALUES (?, ?, ?, datetime('now'), 'in_progress')`,
    )
      .bind(attemptId, paperId, user.id)
      .run()
    return json({
      attemptId,
      time_limit_seconds: row.duration_seconds,
      resumed: false,
    })
  }

  const submitMatch = path.match(/^\/api\/student\/dojo\/attempts\/([^/]+)\/submit$/)
  if (submitMatch && request.method === 'POST') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const attemptId = submitMatch[1]
    const attempt = await env.DB.prepare(
      `SELECT a.*, p.content_json, p.title, p.subject, p.curriculum, p.syllabus_code,
              p.pass_threshold, p.top_threshold, s.display_name
       FROM dojo_attempts a
       JOIN dojo_papers p ON p.id = a.paper_id
       JOIN students s ON s.id = a.student_id
       WHERE a.id = ? AND a.student_id = ?`,
    )
      .bind(attemptId, user.id)
      .first<{
        id: string
        status: string
        content_json: string
        title: string
        subject: string
        curriculum: string
        syllabus_code: string
        pass_threshold: number
        top_threshold: number
        display_name: string
      }>()
    if (!attempt) return error('Not found', 404)
    if (attempt.status === 'submitted') return error('Already submitted', 400)

    const body = (await request.json()) as {
      answers?: Record<string, unknown>
      duration_ms?: number
    }
    let content: TaskContent
    try {
      content = JSON.parse(attempt.content_json) as TaskContent
    } catch {
      return error('Invalid paper content', 500)
    }

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

    const marked = await markDojoAttempt(env, {
      subject: attempt.subject,
      content,
      answers: body.answers ?? {},
      meter: billingTeacherId
        ? { teacherId: billingTeacherId, feature: 'dojo_mark' }
        : undefined,
    })

    const submittedAt = new Date().toISOString()
    const archive = buildDojoAttemptArchiveMd({
      studentName: attempt.display_name,
      paperTitle: attempt.title || content.title,
      subject: attempt.subject,
      curriculum: attempt.curriculum,
      syllabusCode: attempt.syllabus_code,
      submittedAt,
      scorePct: marked.score_pct,
      content,
      answers: body.answers ?? {},
      feedback: marked.feedback,
    })

    await env.DB.prepare(
      `UPDATE dojo_attempts SET
         status = 'submitted', submitted_at = ?, duration_ms = ?,
         answers_json = ?, score_pct = ?, feedback_json = ?,
         topic_tags_json = ?, attempt_archive_md = ?
       WHERE id = ?`,
    )
      .bind(
        submittedAt,
        body.duration_ms ?? null,
        JSON.stringify(body.answers ?? {}),
        marked.score_pct,
        JSON.stringify(marked.feedback),
        JSON.stringify(marked.topic_tags),
        archive,
        attemptId,
      )
      .run()

    await recomputeWeakspotsWithDojo(env, user.id)

    const scoreRows = await env.DB.prepare(
      `SELECT score_pct FROM dojo_attempts
       WHERE student_id = ? AND status = 'submitted' AND score_pct IS NOT NULL
       ORDER BY submitted_at DESC LIMIT 20`,
    )
      .bind(user.id)
      .all<{ score_pct: number }>()

    const stats = computeDojoStats({
      scores: (scoreRows.results ?? []).map((r) => r.score_pct).reverse(),
      passThreshold: attempt.pass_threshold,
      topThreshold: attempt.top_threshold,
      idealLabel: `${attempt.top_threshold}%`,
    })

    return json({
      score_pct: marked.score_pct,
      feedback: marked.feedback,
      stats,
      pass_threshold: attempt.pass_threshold,
      top_threshold: attempt.top_threshold,
    })
  }

  if (path === '/api/student/dojo/stats' && request.method === 'GET') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const url = new URL(request.url)
    const pass = Number(url.searchParams.get('pass') || 50)
    const top = Number(url.searchParams.get('top') || 80)
    const subject = url.searchParams.get('subject') || ''

    let query = `SELECT a.score_pct FROM dojo_attempts a
      JOIN dojo_papers p ON p.id = a.paper_id
      WHERE a.student_id = ? AND a.status = 'submitted' AND a.score_pct IS NOT NULL`
    const binds: (string | number)[] = [user.id]
    if (subject) {
      query += ` AND p.subject = ?`
      binds.push(subject)
    }
    query += ` ORDER BY a.submitted_at ASC`

    const { results } = await env.DB.prepare(query)
      .bind(...binds)
      .all<{ score_pct: number }>()

    const stats = computeDojoStats({
      scores: (results ?? []).map((r) => r.score_pct),
      passThreshold: pass,
      topThreshold: top,
      idealLabel: `${top}%`,
    })
    return json({ stats, scores: results ?? [] })
  }

  return null
}
