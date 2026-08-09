import type { Env, SessionUser, TaskContent } from '../types'
import { error, generateId, json } from './auth'
import { parseJsonBody } from './validation'
import {
  describePastPaperImage,
  generateTaskContent,
  reconstructPastPaper,
} from './ai'
import {
  computeExamReadiness,
  type ExamFormat,
  type ExamRubric,
  type GradeBoundary,
  questionCountFromFormat,
  questionTypesFromFormat,
} from '../../shared/exams/readiness'
import {
  AiBudgetExceededError,
  aiBudgetExceededResponse,
  assertAiBudget,
} from './billing'

export type ExamProfileRow = {
  id: string
  class_id: string
  created_by: string
  title: string
  subject: string
  curriculum: string
  syllabus_code: string
  duration_seconds: number | null
  exam_format_json: string
  grade_boundaries_json: string
  rubric_json: string
  reference_past_paper_text: string
  source_file_name: string
  pass_grade: string
  target_grade: string
  status: string
  created_at: string
  updated_at: string
}

const ALL_MOCK_TYPES = [
  'mcq',
  'cloze',
  'short_written',
  'reading_comprehension',
  'bloom',
  'extended_written',
  'image_analysis',
]

export const DEFAULT_GRADE_BOUNDARIES: GradeBoundary[] = [
  { grade: '9', minPct: 90 },
  { grade: '8', minPct: 80 },
  { grade: '7', minPct: 70 },
  { grade: '6', minPct: 60 },
  { grade: '5', minPct: 50 },
  { grade: '4', minPct: 40, pass: true },
  { grade: '3', minPct: 30 },
]

export const DEFAULT_EXAM_FORMAT: ExamFormat = {
  sections: [
    {
      name: 'Section A — Short answer',
      questionTypes: ['mcq', 'cloze', 'short_written'],
      questionCount: 10,
      marks: 40,
    },
    {
      name: 'Section B — Extended response',
      questionTypes: ['extended_written', 'reading_comprehension'],
      questionCount: 4,
      marks: 60,
    },
  ],
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw || 'null') as T
  } catch {
    return fallback
  }
}

function publicProfile(row: ExamProfileRow, mockCount = 0) {
  return {
    id: row.id,
    class_id: row.class_id,
    title: row.title,
    subject: row.subject,
    curriculum: row.curriculum,
    syllabus_code: row.syllabus_code,
    duration_seconds: row.duration_seconds,
    exam_format: parseJson<ExamFormat>(row.exam_format_json, DEFAULT_EXAM_FORMAT),
    grade_boundaries: parseJson<GradeBoundary[]>(
      row.grade_boundaries_json,
      DEFAULT_GRADE_BOUNDARIES,
    ),
    rubric: parseJson<ExamRubric>(row.rubric_json, {}),
    reference_past_paper_text: row.reference_past_paper_text,
    source_file_name: row.source_file_name,
    pass_grade: row.pass_grade,
    target_grade: row.target_grade,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    mock_count: mockCount,
  }
}

async function classOwned(env: Env, classId: string, teacherId: string) {
  return env.DB.prepare(`SELECT * FROM classes WHERE id = ? AND teacher_id = ?`)
    .bind(classId, teacherId)
    .first<{ id: string; subject: string; curriculum: string; age_range: string }>()
}

export async function getExamProfileRow(
  env: Env,
  profileId: string,
): Promise<ExamProfileRow | null> {
  return env.DB.prepare(`SELECT * FROM exam_profiles WHERE id = ?`)
    .bind(profileId)
    .first<ExamProfileRow>()
}

export async function mockScoresForStudent(
  env: Env,
  studentId: string,
  examProfileId: string,
): Promise<number[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.score_pct FROM attempts a
     JOIN tasks t ON t.id = a.task_id
     WHERE a.student_id = ? AND t.exam_profile_id = ? AND t.subtype = 'mock_exam'
       AND a.status = 'submitted' AND a.score_pct IS NOT NULL
     ORDER BY a.submitted_at ASC`,
  )
    .bind(studentId, examProfileId)
    .all<{ score_pct: number }>()
  return (results ?? []).map((r) => r.score_pct)
}

export async function readinessForProfile(
  env: Env,
  studentId: string,
  profile: ExamProfileRow,
) {
  const scores = await mockScoresForStudent(env, studentId, profile.id)
  const gradeBoundaries = parseJson<GradeBoundary[]>(
    profile.grade_boundaries_json,
    DEFAULT_GRADE_BOUNDARIES,
  )
  return computeExamReadiness({
    scores,
    gradeBoundaries,
    passGrade: profile.pass_grade || undefined,
    targetGrade: profile.target_grade || undefined,
    examTitle: profile.title,
  })
}

export async function generateMockFromProfile(
  env: Env,
  profile: ExamProfileRow,
  teacherId: string,
  pastPaperImage?: string,
): Promise<{ taskId: string; content: TaskContent }> {
  const examFormat = parseJson<ExamFormat>(profile.exam_format_json, DEFAULT_EXAM_FORMAT)
  const gradeBoundaries = parseJson<GradeBoundary[]>(
    profile.grade_boundaries_json,
    DEFAULT_GRADE_BOUNDARIES,
  )
  const rubric = parseJson<ExamRubric>(profile.rubric_json, {})

  const cls = await env.DB.prepare(`SELECT * FROM classes WHERE id = ?`)
    .bind(profile.class_id)
    .first<{ subject: string; curriculum: string; age_range: string }>()
  if (!cls) throw new Error('Class not found')

  const mockCountRow = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM tasks WHERE exam_profile_id = ?`,
  )
    .bind(profile.id)
    .first<{ c: number }>()
  const mockIndex = (mockCountRow?.c ?? 0) + 1

  const meter = { teacherId, classId: profile.class_id, feature: 'task_gen' as const }

  let pastPaperText = profile.reference_past_paper_text || ''
  if (pastPaperImage) {
    const visionNotes = await describePastPaperImage(env, pastPaperImage, {
      ...meter,
      feature: 'past_paper_vision',
    })
    pastPaperText = [pastPaperText, visionNotes].filter(Boolean).join('\n\n')
  }

  const formatTypes = questionTypesFromFormat(examFormat)
  const questionTypes = formatTypes.length ? formatTypes : ALL_MOCK_TYPES
  const questionCount = questionCountFromFormat(examFormat) || 12

  let content: TaskContent
  if (pastPaperText.trim() || pastPaperImage) {
    content = await reconstructPastPaper(env, {
      extractedText: pastPaperText,
      imageDataUrls: pastPaperImage ? [pastPaperImage] : undefined,
      subject: profile.subject || cls.subject,
      curriculum: profile.curriculum || cls.curriculum,
      syllabusCode: profile.syllabus_code,
      title: `${profile.title} — Mock ${mockIndex}`,
      meter,
      examFormat,
      gradeBoundaries,
      rubric,
    })
  } else {
    content = await generateTaskContent(env, {
      subject: profile.subject || cls.subject,
      curriculum: profile.curriculum || cls.curriculum,
      description: `Timed mock exam for ${profile.title} (${profile.curriculum} ${profile.syllabus_code}). Mock paper ${mockIndex}.`,
      difficulty: 'medium',
      questionCount,
      ageRange: cls.age_range,
      pastPaperText: '',
      subtype: 'mock_exam',
      questionTypes,
      meter,
      examFormat,
      gradeBoundaries,
      rubric,
    })
  }

  if (!content.title) {
    content.title = `${profile.title} — Mock ${mockIndex}`
  }

  const taskId = generateId()
  await env.DB.prepare(
    `INSERT INTO tasks (
      id, type, subtype, class_id, subject, title, description, difficulty,
      status, time_limit_seconds, content_json, reading_text, past_paper_text,
      exam_profile_id, created_by
    ) VALUES (?, 'assessment', 'mock_exam', ?, ?, ?, ?, 'medium', 'draft', ?, ?, '', ?, ?, ?)`,
  )
    .bind(
      taskId,
      profile.class_id,
      profile.subject || cls.subject,
      content.title,
      `Mock exam for ${profile.title}`,
      profile.duration_seconds,
      JSON.stringify(content),
      pastPaperText.slice(0, 40_000),
      profile.id,
      teacherId,
    )
    .run()

  return { taskId, content }
}

export async function handleExamsApi(
  request: Request,
  env: Env,
  path: string,
  user: SessionUser,
): Promise<Response | null> {
  if (path === '/api/exam-profiles' && request.method === 'GET') {
    if (user.role !== 'teacher') return error('Forbidden', 403)
    const classId = new URL(request.url).searchParams.get('classId') || ''
    if (!classId) return error('classId required', 400)
    const owned = await classOwned(env, classId, user.id)
    if (!owned) return error('Not found', 404)

    const { results } = await env.DB.prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.exam_profile_id = p.id) as mock_count
       FROM exam_profiles p
       WHERE p.class_id = ? AND p.status = 'active'
       ORDER BY p.created_at DESC`,
    )
      .bind(classId)
      .all<ExamProfileRow & { mock_count: number }>()

    return json({
      profiles: (results ?? []).map((r) =>
        publicProfile(r, Number(r.mock_count ?? 0)),
      ),
    })
  }

  if (path === '/api/exam-profiles' && request.method === 'POST') {
    if (user.role !== 'teacher') return error('Forbidden', 403)
    const parsed = await parseJsonBody(request)
    if (parsed instanceof Response) return parsed
    const body = parsed as {
      class_id?: string
      title?: string
      subject?: string
      curriculum?: string
      syllabus_code?: string
      duration_seconds?: number | null
      exam_format?: ExamFormat
      grade_boundaries?: GradeBoundary[]
      rubric?: ExamRubric
      reference_past_paper_text?: string
      source_file_name?: string
      past_paper_image?: string
      pass_grade?: string
      target_grade?: string
    }
    if (!body.class_id || !body.title?.trim() || !body.curriculum?.trim()) {
      return error('class_id, title, and curriculum are required', 400)
    }
    const owned = await classOwned(env, body.class_id, user.id)
    if (!owned) return error('Not found', 404)

    let pastPaperText = (body.reference_past_paper_text || '').trim()
    if (body.past_paper_image) {
      try {
        await assertAiBudget(env, user.id)
        const notes = await describePastPaperImage(env, body.past_paper_image, {
          teacherId: user.id,
          classId: body.class_id,
          feature: 'past_paper_vision',
        })
        pastPaperText = [pastPaperText, notes].filter(Boolean).join('\n\n')
      } catch (err) {
        if (err instanceof AiBudgetExceededError) {
          return aiBudgetExceededResponse(err.usedCents, err.capCents)
        }
        throw err
      }
    }

    const gradeBoundaries = body.grade_boundaries?.length
      ? body.grade_boundaries
      : DEFAULT_GRADE_BOUNDARIES
    const passGrade =
      body.pass_grade ||
      gradeBoundaries.find((b) => b.pass)?.grade ||
      gradeBoundaries[gradeBoundaries.length - 2]?.grade ||
      '4'
    const targetGrade =
      body.target_grade ||
      [...gradeBoundaries].sort((a, b) => b.minPct - a.minPct)[0]?.grade ||
      '8'

    const id = generateId()
    await env.DB.prepare(
      `INSERT INTO exam_profiles (
        id, class_id, created_by, title, subject, curriculum, syllabus_code,
        duration_seconds, exam_format_json, grade_boundaries_json, rubric_json,
        reference_past_paper_text, source_file_name, pass_grade, target_grade, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    )
      .bind(
        id,
        body.class_id,
        user.id,
        body.title.trim(),
        (body.subject || owned.subject).trim(),
        body.curriculum.trim(),
        (body.syllabus_code || '').trim(),
        body.duration_seconds ?? 2700,
        JSON.stringify(body.exam_format || DEFAULT_EXAM_FORMAT),
        JSON.stringify(gradeBoundaries),
        JSON.stringify(body.rubric || {}),
        pastPaperText.slice(0, 40_000),
        body.source_file_name || '',
        passGrade,
        targetGrade,
      )
      .run()

    const row = await getExamProfileRow(env, id)
    return json({ profile: publicProfile(row!) }, 201)
  }

  const profileMatch = path.match(/^\/api\/exam-profiles\/([^/]+)$/)
  if (profileMatch && request.method === 'GET') {
    const profileId = profileMatch[1]
    const row = await getExamProfileRow(env, profileId)
    if (!row) return error('Not found', 404)

    if (user.role === 'teacher') {
      const owned = await classOwned(env, row.class_id, user.id)
      if (!owned) return error('Not found', 404)
    } else if (user.role === 'student') {
      const s = await env.DB.prepare(`SELECT class_id FROM students WHERE id = ?`)
        .bind(user.id)
        .first<{ class_id: string }>()
      if (!s || s.class_id !== row.class_id) return error('Not found', 404)
    } else {
      return error('Forbidden', 403)
    }

    const mockCount = await env.DB.prepare(
      `SELECT COUNT(*) as c FROM tasks WHERE exam_profile_id = ?`,
    )
      .bind(profileId)
      .first<{ c: number }>()

    return json({ profile: publicProfile(row, mockCount?.c ?? 0) })
  }

  if (profileMatch && request.method === 'PATCH') {
    if (user.role !== 'teacher') return error('Forbidden', 403)
    const profileId = profileMatch[1]
    const row = await getExamProfileRow(env, profileId)
    if (!row) return error('Not found', 404)
    const owned = await classOwned(env, row.class_id, user.id)
    if (!owned) return error('Not found', 404)

    const parsed = await parseJsonBody(request)
    if (parsed instanceof Response) return parsed
    const body = parsed as {
      title?: string
      subject?: string
      curriculum?: string
      syllabus_code?: string
      duration_seconds?: number | null
      exam_format?: ExamFormat
      grade_boundaries?: GradeBoundary[]
      rubric?: ExamRubric
      reference_past_paper_text?: string
      source_file_name?: string
      pass_grade?: string
      target_grade?: string
      status?: 'active' | 'archived'
    }

    await env.DB.prepare(
      `UPDATE exam_profiles SET
         title = COALESCE(?, title),
         subject = COALESCE(?, subject),
         curriculum = COALESCE(?, curriculum),
         syllabus_code = COALESCE(?, syllabus_code),
         duration_seconds = COALESCE(?, duration_seconds),
         exam_format_json = COALESCE(?, exam_format_json),
         grade_boundaries_json = COALESCE(?, grade_boundaries_json),
         rubric_json = COALESCE(?, rubric_json),
         reference_past_paper_text = COALESCE(?, reference_past_paper_text),
         source_file_name = COALESCE(?, source_file_name),
         pass_grade = COALESCE(?, pass_grade),
         target_grade = COALESCE(?, target_grade),
         status = COALESCE(?, status),
         updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(
        body.title?.trim() ?? null,
        body.subject?.trim() ?? null,
        body.curriculum?.trim() ?? null,
        body.syllabus_code?.trim() ?? null,
        body.duration_seconds === undefined ? null : body.duration_seconds,
        body.exam_format ? JSON.stringify(body.exam_format) : null,
        body.grade_boundaries ? JSON.stringify(body.grade_boundaries) : null,
        body.rubric ? JSON.stringify(body.rubric) : null,
        body.reference_past_paper_text ?? null,
        body.source_file_name ?? null,
        body.pass_grade ?? null,
        body.target_grade ?? null,
        body.status ?? null,
        profileId,
      )
      .run()

    const updated = await getExamProfileRow(env, profileId)
    return json({ profile: publicProfile(updated!) })
  }

  const generateMatch = path.match(/^\/api\/exam-profiles\/([^/]+)\/generate-mock$/)
  if (generateMatch && request.method === 'POST') {
    if (user.role !== 'teacher') return error('Forbidden', 403)
    const profileId = generateMatch[1]
    const row = await getExamProfileRow(env, profileId)
    if (!row) return error('Not found', 404)
    const owned = await classOwned(env, row.class_id, user.id)
    if (!owned) return error('Not found', 404)

    const body = (await request.json().catch(() => ({}))) as {
      past_paper_image?: string
    }

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
      row,
      user.id,
      body.past_paper_image,
    )
    return json({ task: { id: taskId, content, status: 'draft' } }, 201)
  }

  const mocksMatch = path.match(/^\/api\/exam-profiles\/([^/]+)\/mocks$/)
  if (mocksMatch && request.method === 'GET') {
    const profileId = mocksMatch[1]
    const row = await getExamProfileRow(env, profileId)
    if (!row) return error('Not found', 404)

    if (user.role === 'teacher') {
      const owned = await classOwned(env, row.class_id, user.id)
      if (!owned) return error('Not found', 404)
    } else if (user.role === 'student') {
      const s = await env.DB.prepare(`SELECT class_id FROM students WHERE id = ?`)
        .bind(user.id)
        .first<{ class_id: string }>()
      if (!s || s.class_id !== row.class_id) return error('Not found', 404)
    } else {
      return error('Forbidden', 403)
    }

    const { results } = await env.DB.prepare(
      `SELECT id, title, status, time_limit_seconds, created_at, published_at
       FROM tasks WHERE exam_profile_id = ? AND subtype = 'mock_exam'
       ORDER BY created_at DESC`,
    )
      .bind(profileId)
      .all()
    return json({ mocks: results ?? [] })
  }

  if (path === '/api/student/exam-readiness' && request.method === 'GET') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const examProfileId = new URL(request.url).searchParams.get('examProfileId') || ''
    if (!examProfileId) return error('examProfileId required', 400)

    const s = await env.DB.prepare(`SELECT class_id FROM students WHERE id = ?`)
      .bind(user.id)
      .first<{ class_id: string }>()
    if (!s) return error('Not found', 404)

    const profile = await getExamProfileRow(env, examProfileId)
    if (!profile || profile.class_id !== s.class_id) return error('Not found', 404)

    const readiness = await readinessForProfile(env, user.id, profile)
    return json({ readiness, profile: publicProfile(profile) })
  }

  const studentReadinessMatch = path.match(/^\/api\/students\/([^/]+)\/exam-readiness$/)
  if (studentReadinessMatch && request.method === 'GET') {
    if (user.role !== 'teacher') return error('Forbidden', 403)
    const studentId = studentReadinessMatch[1]
    const s = await env.DB.prepare(
      `SELECT s.*, c.teacher_id FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
    )
      .bind(studentId)
      .first<{ class_id: string; teacher_id: string; display_name: string }>()
    if (!s || s.teacher_id !== user.id) return error('Not found', 404)

    const { results } = await env.DB.prepare(
      `SELECT * FROM exam_profiles WHERE class_id = ? AND status = 'active' ORDER BY created_at DESC`,
    )
      .bind(s.class_id)
      .all<ExamProfileRow>()

    const profiles = await Promise.all(
      (results ?? []).map(async (p) => ({
        profile: publicProfile(p),
        readiness: await readinessForProfile(env, studentId, p),
        attempts: await env.DB.prepare(
          `SELECT a.id, a.score_pct, a.submitted_at, t.title
           FROM attempts a JOIN tasks t ON t.id = a.task_id
           WHERE a.student_id = ? AND t.exam_profile_id = ? AND a.status = 'submitted'
           ORDER BY a.submitted_at DESC LIMIT 20`,
        )
          .bind(studentId, p.id)
          .all(),
      })),
    )

    return json({ profiles })
  }

  if (path === '/api/student/exam-profiles' && request.method === 'GET') {
    if (user.role !== 'student') return error('Forbidden', 403)
    const s = await env.DB.prepare(`SELECT class_id FROM students WHERE id = ?`)
      .bind(user.id)
      .first<{ class_id: string }>()
    if (!s) return error('Not found', 404)

    const { results } = await env.DB.prepare(
      `SELECT * FROM exam_profiles WHERE class_id = ? AND status = 'active' ORDER BY created_at DESC`,
    )
      .bind(s.class_id)
      .all<ExamProfileRow>()

    const profiles = await Promise.all(
      (results ?? []).map(async (p) => ({
        profile: publicProfile(p),
        readiness: await readinessForProfile(env, user.id, p),
      })),
    )
    return json({ profiles })
  }

  return null
}

export async function getMockExamMarkingContext(
  env: Env,
  examProfileId: string | null | undefined,
): Promise<{ rubric?: ExamRubric; gradeBoundaries?: GradeBoundary[] }> {
  if (!examProfileId) return {}
  const row = await getExamProfileRow(env, examProfileId)
  if (!row) return {}
  return {
    rubric: parseJson<ExamRubric>(row.rubric_json, {}),
    gradeBoundaries: parseJson<GradeBoundary[]>(
      row.grade_boundaries_json,
      DEFAULT_GRADE_BOUNDARIES,
    ),
  }
}
