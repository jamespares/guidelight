export type Role = 'teacher' | 'student'

export interface User {
  id: string
  role: Role
  name: string
  email?: string
  username?: string
}

export interface ClassRow {
  id: string
  name: string
  subject: string
  curriculum: string
  age_range: string
  student_count: number
}

export interface StudentRow {
  id: string
  class_id: string
  display_name: string
  interests: string
  career_ambitions: string
  weakspots: Array<{ topic: string; count: number }>
  username: string
  ai_summary: string
  class_name: string
  class_subject: string
  hw_completion_rate: number | null
}

export type QuestionType =
  | 'mcq'
  | 'cloze'
  | 'bloom'
  | 'frayer'
  | 'image_analysis'
  | 'short_written'
  | 'extended_written'
  | 'listen_respond'
  | 'reading_comprehension'

export interface Question {
  id: string
  type: QuestionType
  prompt: string
  topic: string
  options?: string[]
  correctAnswer?: string | string[]
  blanks?: string[]
  imageUrl?: string
  audioUrl?: string
  audioScript?: string
  frayer?: {
    term: string
    definition?: string
    characteristics?: string
    examples?: string
    nonExamples?: string
  }
  bloomLevel?: string
  marks?: number
}

export interface TaskContent {
  title: string
  instructions: string
  questions: Question[]
}

export interface TaskRow {
  id: string
  type: 'homework' | 'assessment'
  subtype: 'diagnostic' | 'formative' | 'summative' | null
  class_id: string
  subject: string
  title: string
  description: string
  difficulty: string
  status: 'draft' | 'published'
  time_limit_seconds: number | null
  class_name?: string
  published_at?: string
  last_score?: number | null
  attempt_status?: string | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  }
  return data as T
}

export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  teacherRegister: (body: { email: string; password: string; name: string }) =>
    request<{ user: User }>('/api/auth/teacher/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  teacherLogin: (body: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/teacher/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  studentLogin: (body: { username: string; password: string }) =>
    request<{ user: User }>('/api/auth/student/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  classes: () => request<{ classes: ClassRow[] }>('/api/classes'),
  createClass: (body: Record<string, unknown>) =>
    request<{
      classId: string
      credentials: Array<{ id: string; display_name: string; username: string; password: string }>
    }>('/api/classes', { method: 'POST', body: JSON.stringify(body) }),
  students: () => request<{ students: StudentRow[] }>('/api/students'),
  student: (id: string) =>
    request<{ student: StudentRow; attempts: unknown[] }>(`/api/students/${id}`),
  updateStudent: (id: string, body: { interests?: string; career_ambitions?: string }) =>
    request(`/api/students/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  refreshSummary: (id: string) =>
    request<{ summary: string }>(`/api/students/${id}/summary`, { method: 'POST' }),
  diagnosticStatus: (classId: string) =>
    request<{ hasDiagnostic: boolean }>(
      `/api/classes/diagnostic-status?classId=${encodeURIComponent(classId)}`,
    ),
  tasks: (type?: string) =>
    request<{ tasks: TaskRow[] }>(`/api/tasks${type ? `?type=${type}` : ''}`),
  createTask: (body: Record<string, unknown>) =>
    request<{ task: { id: string; content: TaskContent; status: string } }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  task: (id: string) =>
    request<{ task: TaskRow & { content: TaskContent } }>(`/api/tasks/${id}`),
  updateTask: (id: string, body: Record<string, unknown>) =>
    request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  publishTask: (id: string, body?: { assign_all?: boolean; student_ids?: string[] }) =>
    request(`/api/tasks/${id}/publish`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  taskAttempts: (id: string) =>
    request<{ attempts: Array<Record<string, unknown>> }>(`/api/tasks/${id}/attempts`),
  studentTasks: () => request<{ tasks: TaskRow[] }>('/api/student/tasks'),
  startAttempt: (task_id: string) =>
    request<{ attemptId: string; time_limit_seconds?: number | null; resumed?: boolean }>(
      '/api/attempts/start',
      { method: 'POST', body: JSON.stringify({ task_id }) },
    ),
  flagAttempt: (id: string) =>
    request(`/api/attempts/${id}/flag`, { method: 'POST', body: '{}' }),
  submitAttempt: (id: string, body: { answers: Record<string, unknown>; duration_ms: number }) =>
    request<{
      score_pct: number
      feedback: Record<
        string,
        { correct: boolean; feedback: string; topic: string; marksAwarded: number; marksPossible: number }
      >
    }>(`/api/attempts/${id}/submit`, { method: 'POST', body: JSON.stringify(body) }),
  insights: (scope: 'class' | 'student', id: string) =>
    request<{
      avgScore: number | null
      scoreSeries: Array<{ date: string; value: number }>
      hwRate: number | null
      hwSeries: Array<{ date: string; value: number }>
      weakspots: Array<{ topic: string; count: number }>
    }>(`/api/insights?scope=${scope}&id=${encodeURIComponent(id)}`),
  createReport: (body: {
    student_id?: string
    class_id?: string
    teacher_notes?: string
  }) =>
    request<{ report: { id: string; content: string } }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateReport: (id: string, content: string) =>
    request(`/api/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ content }) }),
  getReport: (id: string) =>
    request<{ report: { id: string; content: string } }>(`/api/reports/${id}`),
  studentTools: (mode: 'flashcards' | 'practice') =>
    request<{ result: unknown }>('/api/student/tools/generate', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
}
