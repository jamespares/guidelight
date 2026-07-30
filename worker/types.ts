/** Cloudflare Email Sending binding (Email Service). */
export interface SendEmailBinding {
  send(message: {
    to: string | string[]
    from: string
    subject: string
    html?: string
    text?: string
  }): Promise<{ messageId: string }>
}

export interface Env {
  DB: D1Database
  AI: Ai
  ASSETS: Fetcher
  EMAIL: SendEmailBinding
  APP_URL?: string
  AUTH_FROM_EMAIL?: string
}

export type Role = 'teacher' | 'student'

export interface SessionUser {
  id: string
  role: Role
  name: string
  email?: string
  username?: string
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
  activityStyle: LessonActivityStyle
  /** Set when the lesson includes a career-framed communicative activity */
  careerContext?: string
  presentation: LessonStage
  practice: LessonStage
  production: LessonStage
  differentiation?: string
  plenary?: string
  homeworkOptional?: string
}

export interface GeneratedLesson {
  title: string
  weekIndex: number
  plan: LessonPlan
}

export const LESSON_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export type LessonDay = (typeof LESSON_DAYS)[number]
