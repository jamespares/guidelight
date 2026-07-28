export interface Env {
  DB: D1Database
  AI: Ai
  ASSETS: Fetcher
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
