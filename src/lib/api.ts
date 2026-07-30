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

export interface Weakspot {
  topic?: string
  skill?: string
  count?: number
  objective?: string
  evidence?: string
  frequency?: number | string
  severity?: string
  remediation?: string
}

export interface StudentRow {
  id: string
  class_id: string
  display_name: string
  interests: string
  career_ambitions: string
  weakspots: Weakspot[]
  weakspots_updated_at?: string | null
  weakspots_summary?: string | null
  username: string
  ai_summary: string
  class_name: string
  class_subject: string
  hw_completion_rate: number | null
  avg_score?: number | null
  cefr_level?: string | null
  latest_wpm?: number | null
}

export type TaskSubtype =
  | 'diagnostic'
  | 'formative'
  | 'summative'
  | 'english_level'
  | 'reading_speed'
  | null

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
  /** One clear sentence: what this question assesses */
  learningObjective?: string
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
  kind?: 'english_level' | 'reading_speed'
  material_id?: string
}

export interface TaskRow {
  id: string
  type: 'homework' | 'assessment'
  subtype: TaskSubtype
  class_id: string
  subject: string
  title: string
  description: string
  difficulty: string
  status: 'draft' | 'published'
  time_limit_seconds: number | null
  reading_text?: string
  class_name?: string
  published_at?: string
  last_score?: number | null
  attempt_status?: string | null
}

export type LessonActivityStyle = 'traditional' | 'communicative'

export interface LessonStage {
  durationMins: number
  steps: string[]
  teacherNotes?: string
}

export interface LessonPlan {
  learningObjective: string
  materials: string[]
  /** Quiet work (traditional) or Interactive (communicative) */
  activityStyle: LessonActivityStyle
  /** Set when the lesson includes a career-framed Interactive activity */
  careerContext?: string
  presentation: LessonStage
  practice: LessonStage
  production: LessonStage
  differentiation?: string
  plenary?: string
  homeworkOptional?: string
}

export interface LessonBatchRow {
  id: string
  teacher_id: string
  class_id: string
  class_name?: string
  subject: string
  curriculum: string
  age_range: string
  duration_minutes: number
  weekly_frequency: number
  days_of_week: string[]
  resources: string[]
  weeks: number
  start_date: string
  title: string
  created_at: string
}

export interface LessonRow {
  id: string
  batch_id: string
  week_index: number
  sequence_index: number
  scheduled_date: string
  day_of_week: string
  title: string
  plan: LessonPlan
}

export interface DojoPaper {
  id: string
  class_id: string
  owner_student_id?: string | null
  title: string
  subject: string
  curriculum: string
  syllabus_code: string
  source_file_name?: string
  reconstruction_label: string
  reconstructed_at: string | null
  status: 'processing' | 'draft' | 'ready' | 'published' | 'failed'
  duration_seconds: number | null
  pass_threshold: number
  top_threshold: number
  fail_reason?: string
  created_at: string
  published_at?: string | null
  created_by_role?: string
  content?: TaskContent
}

export interface DojoStats {
  papersCompleted: number
  averageScore: number | null
  passProbability: number | null
  topProbability: number | null
  unlockMessage?: string
  recommendation?: string
}

export interface DojoAttemptScore {
  id: string
  score_pct: number | null
  submitted_at: string | null
  title: string
  subject: string
  curriculum: string
  syllabus_code: string
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
    const err = data as {
      error?: string
      code?: string
      message?: string
      used_cents?: number
      cap_cents?: number
      settings_path?: string
    }
    const message = err.message || err.error || `Request failed (${res.status})`
    const e = new Error(message) as Error & {
      code?: string
      status?: number
      used_cents?: number
      cap_cents?: number
      settings_path?: string
    }
    e.code = err.code
    e.status = res.status
    e.used_cents = err.used_cents
    e.cap_cents = err.cap_cents
    e.settings_path = err.settings_path
    if (err.code === 'ai_budget_exceeded' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('guidelight:ai-budget-exceeded', { detail: e }))
    }
    throw e
  }
  return data as T
}

export type BillingUsage = {
  used_cents: number
  cap_cents: number
  capped: boolean
  starter_credit_remaining_cents: number
  period_start: string
  period_end: string
  payment_status: string
  has_payment_method: boolean
  has_stripe_customer?: boolean
  school_name: string
  billing_email: string
  purchase_order: string
  settings_path: string
  stripe_configured: boolean
  stripe_publishable_key?: string | null
  portal_login_url?: string | null
  by_feature: Array<{ feature: string; calls: number; cost_cents: number }>
}

export type BillingInvoice = {
  id: string
  status: string
  amount_due: number
  amount_paid: number
  currency: string
  created: number
  invoice_pdf: string | null
  hosted_invoice_url: string | null
  number: string | null
  kind: string | null
  period_start: string | null
}

export function isAiBudgetError(err: unknown): err is Error & {
  code: 'ai_budget_exceeded'
  settings_path?: string
} {
  if (!err || typeof err !== 'object') return false
  return (err as { code?: string }).code === 'ai_budget_exceeded'
}

export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  teacherRegister: (body: { email: string; password: string; name: string }) =>
    request<{ ok: true; needsVerification: boolean; message: string }>(
      '/api/auth/teacher/register',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
  teacherLogin: (body: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/teacher/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  teacherResendVerification: (body: { email: string }) =>
    request<{ ok: true; message: string }>('/api/auth/teacher/resend-verification', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  teacherVerifyEmail: (body: { token: string }) =>
    request<{ user: User }>('/api/auth/teacher/verify-email', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  teacherMagicLink: (body: { email: string }) =>
    request<{ ok: true; message: string }>('/api/auth/teacher/magic-link', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  teacherConsumeMagicLink: (body: { token: string }) =>
    request<{ user: User }>('/api/auth/teacher/magic-link/consume', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  teacherForgotPassword: (body: { email: string }) =>
    request<{ ok: true; message: string }>('/api/auth/teacher/forgot-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  teacherResetPassword: (body: { token: string; password: string }) =>
    request<{ user?: User; ok?: boolean; message?: string }>(
      '/api/auth/teacher/reset-password',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
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
    request<{ student: StudentRow; attempts: unknown[]; dojoAttempts?: DojoAttemptScore[] }>(
      `/api/students/${id}`,
    ),
  updateStudent: (
    id: string,
    body: { interests?: string; career_ambitions?: string; username?: string },
  ) => request(`/api/students/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resetStudentPassword: (id: string, body?: { password?: string }) =>
    request<{ password: string }>(`/api/students/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
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
  lessonBatches: () => request<{ batches: LessonBatchRow[] }>('/api/lesson-batches'),
  createLessonBatch: (body: Record<string, unknown>) =>
    request<{ batch: { id: string; title: string } }>('/api/lesson-batches', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  lessonBatch: (id: string) =>
    request<{ batch: LessonBatchRow; lessons: LessonRow[] }>(`/api/lesson-batches/${id}`),
  deleteLessonBatch: (id: string) =>
    request<{ ok: boolean }>(`/api/lesson-batches/${id}`, { method: 'DELETE' }),
  updateLesson: (
    id: string,
    body: { title?: string; plan?: LessonPlan; scheduled_date?: string },
  ) => request<{ ok: boolean }>(`/api/lessons/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
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
      weakspots: Weakspot[]
      weakspotsSummary?: string | null
      weakspotsUpdatedAt?: string | null
    }>(`/api/insights?scope=${scope}&id=${encodeURIComponent(id)}`),
  pinpointStudentWeakspots: (studentId: string) =>
    request<{
      weakspots: Weakspot[]
      summary: string
      weakspotsUpdatedAt: string
    }>(`/api/students/${studentId}/pinpoint-weakspots`, { method: 'POST', body: '{}' }),
  pinpointClassWeakspots: (classId: string) =>
    request<{
      weakspots: Weakspot[]
      summary: string
      weakspotsUpdatedAt: string
    }>(`/api/classes/${classId}/pinpoint-weakspots`, { method: 'POST', body: '{}' }),
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

  // Reading speed
  readingSpeedStatus: (taskId: string) =>
    request<{
      phase: 'start' | 'reading' | 'checks' | 'result'
      title: string
      wordCount?: number
      body?: string
      attemptId?: string
      attempt?: { wpm: number; flagged: number; checks_correct: number; checks_total: number }
      checks?: Array<{ id: string; prompt: string; options: string[] }>
      passNeed?: number
    }>(`/api/reading/speed/${taskId}`),
  readingSpeedStart: (taskId: string) =>
    request<{ attemptId: string; body: string; wordCount: number }>(
      `/api/reading/speed/${taskId}/start`,
      { method: 'POST', body: '{}' },
    ),
  readingSpeedFinish: (taskId: string) =>
    request<{ ok: boolean; next: string; wpm?: number }>(`/api/reading/speed/${taskId}/finish`, {
      method: 'POST',
      body: '{}',
    }),
  readingSpeedChecks: (taskId: string, answers: Record<string, string>) =>
    request<{ ok: boolean; wpm: number }>(`/api/reading/speed/${taskId}/checks`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  // English level (CEFR)
  cefrTaskStatus: (taskId: string) =>
    request<{
      phase: 'start' | 'test' | 'result'
      title?: string
      timeLimitSeconds?: number
      testId?: string
      startedAt?: string
      secondsLeft?: number
      items?: Array<Record<string, unknown>>
      passages?: Record<string, string>
      test?: {
        cefr_level: string | null
        total_score: number | null
        max_score: number | null
        over_time_seconds?: number | null
      }
      ieltsBand?: string | null
    }>(`/api/cefr/tests/task/${taskId}`),
  cefrStart: (taskId: string) =>
    request<{ testId: string; resumed?: boolean }>(`/api/cefr/tests/task/${taskId}/start`, {
      method: 'POST',
      body: '{}',
    }),
  cefrGetTest: (testId: string) =>
    request<{
      phase: string
      testId?: string
      secondsLeft?: number
      items?: Array<Record<string, unknown>>
      passages?: Record<string, string>
      test?: Record<string, unknown>
      ieltsBand?: string | null
    }>(`/api/cefr/tests/${testId}`),
  cefrSubmit: (testId: string, answers: Record<string, string>) =>
    request<{
      cefr_level: string
      total_score: number
      max_score: number
      ieltsBand: string
      over_time_seconds: number
    }>(`/api/cefr/tests/${testId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  // Reading machine
  readingMaterials: () =>
    request<{
      classTexts: Array<{ id: string; title: string; word_count: number }>
      myTexts: Array<{ id: string; title: string; word_count: number }>
      latestWpm: number | null
    }>('/api/reading/materials'),
  readingMaterial: (id: string) =>
    request<{
      material: { id: string; title: string; body: string; word_count: number }
      latestWpm: number | null
    }>(`/api/reading/materials/${id}`),
  createReadingMaterial: (body: { title: string; body: string }) =>
    request<{ id: string }>('/api/reading/materials', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteReadingMaterial: (id: string) =>
    request(`/api/reading/materials/${id}`, { method: 'DELETE' }),
  readingMachineSession: (body: {
    material_id: string
    wpm_setting: number
    words_read: number
    word_count: number
    duration_seconds: number
    completed?: boolean
  }) =>
    request<{ id: string }>('/api/reading/machine/session', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  storyEvent: (slug: string, event_type: 'open' | 'play') =>
    request('/api/stories/event', {
      method: 'POST',
      body: JSON.stringify({ slug, event_type }),
    }),

  // Exam Dojo
  dojoPapers: (classId: string) =>
    request<{ papers: DojoPaper[] }>(
      `/api/dojo/papers?classId=${encodeURIComponent(classId)}`,
    ),
  createDojoPaper: (body: Record<string, unknown>) =>
    request<{ paper: DojoPaper; reused: boolean }>('/api/dojo/papers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  dojoPaper: (id: string) => request<{ paper: DojoPaper }>(`/api/dojo/papers/${id}`),
  updateDojoPaper: (id: string, body: Record<string, unknown>) =>
    request<{ paper: DojoPaper }>(`/api/dojo/papers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  publishDojoPaper: (id: string) =>
    request<{ ok: boolean }>(`/api/dojo/papers/${id}/publish`, {
      method: 'POST',
      body: '{}',
    }),
  studentDojoPapers: () =>
    request<{ shared: DojoPaper[]; mine: DojoPaper[] }>('/api/student/dojo/papers'),
  createStudentDojoPaper: (body: Record<string, unknown>) =>
    request<{ paper: DojoPaper; reused: boolean }>('/api/student/dojo/papers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  startDojoAttempt: (paperId: string) =>
    request<{ attemptId: string; time_limit_seconds?: number | null; resumed?: boolean }>(
      `/api/student/dojo/papers/${paperId}/start`,
      { method: 'POST', body: '{}' },
    ),
  submitDojoAttempt: (
    attemptId: string,
    body: { answers: Record<string, unknown>; duration_ms: number },
  ) =>
    request<{
      score_pct: number
      feedback: Record<
        string,
        {
          correct: boolean
          feedback: string
          topic: string
          marksAwarded: number
          marksPossible: number
        }
      >
      stats: DojoStats
      pass_threshold: number
      top_threshold: number
    }>(`/api/student/dojo/attempts/${attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  studentDojoStats: (opts?: { pass?: number; top?: number; subject?: string }) => {
    const params = new URLSearchParams()
    if (opts?.pass != null) params.set('pass', String(opts.pass))
    if (opts?.top != null) params.set('top', String(opts.top))
    if (opts?.subject) params.set('subject', opts.subject)
    const q = params.toString()
    return request<{ stats: DojoStats; scores: Array<{ score_pct: number }> }>(
      `/api/student/dojo/stats${q ? `?${q}` : ''}`,
    )
  },

  billingUsage: () => request<BillingUsage>('/api/billing/usage'),
  billingSetCap: (monthly_cap_cents: number) =>
    request<BillingUsage>('/api/billing/cap', {
      method: 'PATCH',
      body: JSON.stringify({ monthly_cap_cents }),
    }),
  billingUpdateProfile: (body: {
    school_name?: string
    billing_email?: string
    purchase_order?: string
  }) =>
    request<BillingUsage>('/api/billing/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  billingSetup: () =>
    request<{ url: string | null }>('/api/billing/setup', { method: 'POST' }),
  billingPortal: () =>
    request<{ url: string }>('/api/billing/portal', { method: 'POST' }),
  billingInvoices: () =>
    request<{ invoices: BillingInvoice[]; stripe_configured: boolean }>(
      '/api/billing/invoices',
    ),
  billingInvoicePreview: () =>
    request<{
      statement: {
        period_start: string
        period_end: string
        usage_cents: number
        credit_applied_cents: number
        amount_due_cents: number
        school_name: string
        purchase_order: string
        teacher_name: string
        teacher_email?: string
      }
      invoice: {
        id: string
        status: string
        invoice_pdf: string | null
        hosted_invoice_url: string | null
        amount_due: number
      } | null
      message?: string
    }>('/api/billing/invoices/preview', { method: 'POST' }),
}
