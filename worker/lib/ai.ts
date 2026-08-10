import type { Env, GeneratedLesson, LessonPlan, LessonStage, Question, TaskContent } from '../types'
import {
  type ExamFormat,
  type ExamRubric,
  type GradeBoundary,
  formatProfileContext,
} from '../../shared/exams/readiness'
import {
  estimateTokens,
  extractUsageTokens,
  recordAiUsage,
  type AiMeterContext,
} from './billing'
import { fallbackGeneratedLessons, type ScheduledSlot } from './lessonSchedule'

/**
 * Models used across the app — all served by Cloudflare Workers AI, so no
 * data leaves the Cloudflare network and everything works in mainland China.
 * chat: Kimi K2.6 (top-tier open model on Workers AI) for generation/marking.
 * tts: MiniMax Speech 2.8 Turbo for listening-question audio (worker/lib/tts.ts).
 */
const MODELS = {
  chat: '@cf/moonshotai/kimi-k2.6',
} as const

const MODEL = MODELS.chat

export type { AiMeterContext }

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1].trim() : trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object in model response')
  return JSON.parse(candidate.slice(start, end + 1))
}

function asText(result: unknown): string {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return JSON.stringify(result)
  const r = result as Record<string, unknown>
  if (typeof r.response === 'string') return r.response
  if (typeof r.result === 'string') return r.result
  if (typeof r.reasoning === 'string' && typeof r.response === 'string') return r.response
  // OpenAI-compatible shape
  const choices = r.choices as Array<{ message?: { content?: string } }> | undefined
  if (choices?.[0]?.message?.content) return choices[0].message.content
  return JSON.stringify(result)
}

function promptCharLength(system: string, user: string | Array<Record<string, unknown>>): number {
  if (typeof user === 'string') return system.length + user.length
  let n = system.length
  for (const part of user) {
    if (typeof part.text === 'string') n += part.text.length
    else n += 500 // image / multimodal stub
  }
  return n
}

async function runChat(
  env: Env,
  system: string,
  user: string | Array<Record<string, unknown>>,
  opts?: { timeoutMs?: number; maxTokens?: number; meter?: AiMeterContext },
): Promise<string> {
  const userContent =
    typeof user === 'string'
      ? user
      : user

  const call = env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    max_completion_tokens: opts?.maxTokens ?? 4096,
    temperature: 0.4,
    chat_template_kwargs: { thinking: false },
  })

  // Avoid hanging classroom workflows when Workers AI is slow/unavailable
  const timeoutMs = opts?.timeoutMs ?? 20_000
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('AI request timed out')), timeoutMs)
  })

  const result = await Promise.race([call, timeout])
  const text = asText(result)

  // Bill only successful AI calls (timeouts/errors never reach here)
  if (opts?.meter) {
    const fromApi = extractUsageTokens(result)
    const inputTokens =
      fromApi && fromApi.inputTokens > 0
        ? fromApi.inputTokens
        : estimateTokens('x'.repeat(promptCharLength(system, user)))
    const outputTokens =
      fromApi && fromApi.outputTokens > 0 ? fromApi.outputTokens : estimateTokens(text)
    try {
      await recordAiUsage(env, opts.meter, {
        model: MODEL,
        inputTokens,
        outputTokens,
      })
    } catch (err) {
      console.error('recordAiUsage failed', err)
    }
  }

  return text
}

/** Use vision to summarise a past-paper image into style notes for generation. */
export async function describePastPaperImage(
  env: Env,
  imageDataUrl: string,
  meter?: AiMeterContext,
): Promise<string> {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid image data')

  const system =
    'You analyse exam past papers. Describe the question style, structure, topics, mark schemes cues, and wording patterns so another model can mimic them. Return plain text notes only.'

  try {
    const raw = await runChat(
      env,
      system,
      [
        {
          type: 'text',
          text: 'Extract past-paper style notes from this image for generating a similar assessment.',
        },
        {
          type: 'image_url',
          image_url: { url: imageDataUrl },
        },
      ],
      meter
        ? { meter: { ...meter, feature: meter.feature || 'past_paper_vision' } }
        : undefined,
    )
    return raw.slice(0, 8000)
  } catch (err) {
    console.error('describePastPaperImage failed', err)
    return 'Past paper image uploaded — mimic a formal exam layout with clear numbered questions, mark allocations, and subject-appropriate wording.'
  }
}

/** Deterministic draft when Workers AI is unavailable — still editable by teacher. */
function fallbackTaskContent(input: {
  subject: string
  description: string
  difficulty: string
  questionCount: number
  readingText?: string
  questionTypes: string[]
}): TaskContent {
  const types = input.questionTypes.length ? input.questionTypes : ['mcq', 'short_written']
  const questions: Question[] = []
  for (let i = 0; i < input.questionCount; i++) {
    const type = types[i % types.length] as Question['type']
    const id = `q${i + 1}`
    const topic = `${input.subject} · core`
    const base: Question = {
      id,
      type,
      topic,
      learningObjective: `Demonstrate understanding of ${input.subject} related to: ${input.description.slice(0, 80)}`,
      prompt: `(${input.difficulty}) ${input.description} — question ${i + 1}`,
      marks: type === 'extended_written' ? 6 : 1,
    }
    if (type === 'mcq' || type === 'bloom') {
      base.options = ['Option A', 'Option B', 'Option C', 'Option D']
      base.correctAnswer = 'Option A'
      if (type === 'bloom') base.bloomLevel = 'understand'
    } else if (type === 'cloze') {
      base.prompt = `Complete: The key idea in ${input.subject} is _____.`
      base.blanks = ['understanding']
      base.correctAnswer = ['understanding']
    } else if (type === 'frayer') {
      base.frayer = { term: input.subject }
      base.prompt = `Complete a Frayer model for: ${input.subject}`
    } else if (type === 'listen_respond') {
      base.audioScript = `Listen carefully. In ${input.subject}, ${input.description}. What is the main idea?`
      base.prompt = 'Listen to the clip, then write your response.'
    } else if (type === 'image_analysis') {
      base.imageUrl = `Describe a diagram related to: ${input.description}`
      base.prompt = 'Analyse the stimulus and explain what it shows.'
    } else if (type === 'reading_comprehension') {
      base.prompt = input.readingText
        ? `Based on the reading text, answer: What is the main point?`
        : `Reading comprehension on ${input.subject}: summarise the key idea in your own words.`
    }
    questions.push(base)
  }

  return {
    title: `${input.subject}: ${input.description.slice(0, 48)}`,
    instructions:
      'Read each question carefully. Show your thinking. Copy and paste are disabled.',
    questions,
  }
}

export async function generateTaskContent(
  env: Env,
  input: {
    subject: string
    curriculum: string
    description: string
    difficulty: string
    questionCount: number
    ageRange: string
    readingText?: string
    pastPaperText?: string
    subtype?: string | null
    questionTypes: string[]
    studentProfiles?: Array<{ name: string; interests: string; weakspots: string }>
    meter?: AiMeterContext
    examFormat?: ExamFormat
    gradeBoundaries?: GradeBoundary[]
    rubric?: ExamRubric
  },
): Promise<TaskContent> {
  const profileContext = formatProfileContext({
    examFormat: input.examFormat,
    gradeBoundaries: input.gradeBoundaries,
    rubric: input.rubric,
  })
  const system = `You are Guidelight, an expert education content generator.
Return ONLY valid JSON matching this schema:
{
  "title": string,
  "instructions": string,
  "questions": [
    {
      "id": string,
      "type": one of ${JSON.stringify(input.questionTypes)},
      "prompt": string,
      "topic": string,
      "learningObjective": string,
      "options": string[] (for mcq/bloom),
      "correctAnswer": string | string[],
      "blanks": string[] (for cloze - answers in order),
      "frayer": { "term": string } (for frayer),
      "bloomLevel": string (for bloom: remember|understand|apply|analyze|evaluate|create),
      "audioScript": string (for listen_respond - text the student hears),
      "imageUrl": string (optional descriptive placeholder for image_analysis),
      "marks": number
    }
  ]
}
Every question MUST have:
- topic: a short skill tag (e.g. "relative clauses", "fractions")
- learningObjective: one clear sentence stating what the question assesses
Mark objective questions with correctAnswer.
Return ONLY a single JSON object. No markdown fences, no commentary.`

  const user = `Create a ${input.subtype ?? 'homework'} task.
Subject: ${input.subject}
Age range: ${input.ageRange}
Difficulty: ${input.difficulty}
Number of questions: ${input.questionCount}
Allowed question types: ${input.questionTypes.join(', ')}
Task description: ${input.description}
Curriculum notes: ${input.curriculum || 'n/a'}
Reading text (if any): ${input.readingText || 'n/a'}
Past paper style reference (if any): ${input.pastPaperText?.slice(0, 6000) || 'n/a'}
Student personalisation hints: ${JSON.stringify(input.studentProfiles ?? []).slice(0, 1500)}
${profileContext ? `\nExam profile:\n${profileContext}` : ''}`

  try {
    const raw = await runChat(env, system, user, {
      // Mixed-type generation of 8+ questions regularly exceeds 20s.
      timeoutMs: 55_000,
      maxTokens: 8192,
      meter: input.meter ? { ...input.meter, feature: 'task_gen' } : undefined,
    })
    const parsed = extractJson(raw) as TaskContent
    if (!parsed.questions?.length) throw new Error('Model returned no questions')
    parsed.questions = parsed.questions.map((q, i) => ({
      ...q,
      id: q.id || `q${i + 1}`,
      marks: q.marks ?? 1,
      topic: q.topic || input.subject,
      learningObjective:
        q.learningObjective ||
        `Assess understanding of ${q.topic || input.subject} in this ${input.subtype ?? 'task'}.`,
    }))
    return parsed
  } catch (err) {
    console.error('generateTaskContent falling back', err)
    return fallbackTaskContent(input)
  }
}

export async function markAttempt(
  env: Env,
  input: {
    subject: string
    content: TaskContent
    answers: Record<string, unknown>
    meter?: AiMeterContext
    /** Override feature tag. Defaults to mark_attempt. */
    feature?: AiMeterContext['feature']
    rubric?: ExamRubric
    gradeBoundaries?: GradeBoundary[]
  },
): Promise<{
  score_pct: number
  feedback: Record<
    string,
    {
      correct: boolean
      feedback: string
      topic: string
      learningObjective?: string
      marksAwarded: number
      marksPossible: number
    }
  >
  topic_tags: string[]
}> {
  const system = `You are Guidelight, an expert exam marker.
Return ONLY valid JSON:
{
  "items": [
    {
      "questionId": string,
      "correct": boolean,
      "feedback": string,
      "topic": string,
      "learningObjective": string,
      "marksAwarded": number,
      "marksPossible": number
    }
  ]
}
Be fair on open responses. Award partial credit where appropriate.
Echo each question's topic and learningObjective in the feedback item so archives stay scannable.`

  const rubricContext = formatProfileContext({
    gradeBoundaries: input.gradeBoundaries,
    rubric: input.rubric,
  })
  const systemWithRubric = rubricContext
    ? `${system}\n\nApply this marking guidance:\n${rubricContext}`
    : system

  const user = `Subject: ${input.subject}
Questions: ${JSON.stringify(
    input.content.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      topic: q.topic,
      learningObjective: q.learningObjective,
      options: q.options,
      correctAnswer: q.correctAnswer,
      marks: q.marks,
    })),
  )}
Student answers: ${JSON.stringify(input.answers)}`

  try {
    const raw = await runChat(env, systemWithRubric, user, {
      timeoutMs: 45_000,
      meter: input.meter
        ? { ...input.meter, feature: input.feature ?? 'mark_attempt' }
        : undefined,
    })
    const parsed = extractJson(raw) as {
      items: Array<{
        questionId: string
        correct: boolean
        feedback: string
        topic: string
        learningObjective?: string
        marksAwarded: number
        marksPossible: number
      }>
    }

    const feedback: Record<
      string,
      {
        correct: boolean
        feedback: string
        topic: string
        learningObjective?: string
        marksAwarded: number
        marksPossible: number
      }
    > = {}
    let awarded = 0
    let possible = 0
    const topic_tags: string[] = []

    for (const item of parsed.items ?? []) {
      const q = input.content.questions.find((x) => x.id === item.questionId)
      feedback[item.questionId] = {
        ...item,
        topic: item.topic || q?.topic || input.subject,
        learningObjective: item.learningObjective || q?.learningObjective,
      }
      awarded += item.marksAwarded ?? 0
      possible += item.marksPossible ?? 1
      if (item.topic) topic_tags.push(item.topic)
    }

    for (const q of input.content.questions) {
      if (!feedback[q.id]) {
        feedback[q.id] = {
          correct: false,
          feedback: 'Not marked — please review.',
          topic: q.topic,
          learningObjective: q.learningObjective,
          marksAwarded: 0,
          marksPossible: q.marks ?? 1,
        }
        possible += q.marks ?? 1
      }
    }

    const score_pct = possible > 0 ? Math.round((awarded / possible) * 1000) / 10 : 0
    return { score_pct, feedback, topic_tags: [...new Set(topic_tags)] }
  } catch (err) {
    console.error('markAttempt falling back', err)
    return localMark(input)
  }
}

function localMark(input: {
  content: TaskContent
  answers: Record<string, unknown>
}): {
  score_pct: number
  feedback: Record<
    string,
    {
      correct: boolean
      feedback: string
      topic: string
      learningObjective?: string
      marksAwarded: number
      marksPossible: number
    }
  >
  topic_tags: string[]
} {
  const feedback: Record<
    string,
    {
      correct: boolean
      feedback: string
      topic: string
      learningObjective?: string
      marksAwarded: number
      marksPossible: number
    }
  > = {}
  let awarded = 0
  let possible = 0
  const topic_tags: string[] = []

  for (const q of input.content.questions) {
    const marksPossible = q.marks ?? 1
    possible += marksPossible
    topic_tags.push(q.topic)
    const ans = input.answers[q.id]
    let correct = false
    if (q.correctAnswer != null && ans != null) {
      const expected = Array.isArray(q.correctAnswer)
        ? q.correctAnswer.join('|').toLowerCase()
        : String(q.correctAnswer).toLowerCase()
      const got = typeof ans === 'string' ? ans.toLowerCase() : JSON.stringify(ans).toLowerCase()
      correct = got.includes(expected) || expected.includes(got)
    } else if (ans != null && String(ans).trim().length > 0) {
      // Open response: award half if non-empty when AI unavailable
      correct = false
      feedback[q.id] = {
        correct: false,
        feedback: 'Recorded for teacher review (AI marker unavailable). Partial credit applied.',
        topic: q.topic,
        learningObjective: q.learningObjective,
        marksAwarded: Math.ceil(marksPossible / 2),
        marksPossible,
      }
      awarded += Math.ceil(marksPossible / 2)
      continue
    }
    feedback[q.id] = {
      correct,
      feedback: correct ? 'Correct.' : 'Incorrect or incomplete.',
      topic: q.topic,
      learningObjective: q.learningObjective,
      marksAwarded: correct ? marksPossible : 0,
      marksPossible,
    }
    if (correct) awarded += marksPossible
  }

  const score_pct = possible > 0 ? Math.round((awarded / possible) * 1000) / 10 : 0
  return { score_pct, feedback, topic_tags: [...new Set(topic_tags)] }
}

export async function generateStudentSummary(
  env: Env,
  input: {
    name: string
    interests: string
    career_ambitions: string
    weakspots: string
    attempts: unknown[]
    meter?: AiMeterContext
  },
): Promise<string> {
  const system =
    'You are Guidelight. Write a concise 2-3 paragraph teacher-facing introduction to this student based on their data. Warm, specific, actionable. Return plain text only.'
  try {
    return await runChat(env, system, JSON.stringify(input), {
      timeoutMs: 30_000,
      meter: input.meter ? { ...input.meter, feature: 'summary' } : undefined,
    })
  } catch {
    return `${input.name} is developing steadily. Interests: ${input.interests || 'not yet recorded'}. Career ambitions: ${input.career_ambitions || 'not yet recorded'}. Weakspots to watch: ${input.weakspots || 'none recorded yet'}. Complete more diagnostic and homework tasks to enrich this profile.`
  }
}

export async function generateReport(
  env: Env,
  input: {
    scope: 'student' | 'class'
    name: string
    teacherNotes: string
    data: unknown
    meter?: AiMeterContext
  },
): Promise<string> {
  const system = `You are Guidelight. Produce a professional parent-facing progress report in markdown.
Include: overview, strengths, areas to improve, homework engagement, recommended next steps.
Tone: constructive and encouraging.`
  try {
    return await runChat(env, system, JSON.stringify(input), {
      timeoutMs: 45_000,
      meter: input.meter ? { ...input.meter, feature: 'report' } : undefined,
    })
  } catch {
    return `# Progress report — ${input.name}\n\n## Overview\nThis report summarises recent learning activity on Guidelight.\n\n## Teacher notes\n${input.teacherNotes || 'None provided.'}\n\n## Next steps\nContinue regular practice on weakspot topics and review marked feedback after each task.\n`
  }
}

export async function generatePracticeOrFlashcards(
  env: Env,
  mode: 'flashcards' | 'practice',
  input: {
    subject: string
    weakspots: string[]
    recentErrors: unknown[]
    meter?: AiMeterContext
  },
): Promise<unknown> {
  const system =
    mode === 'flashcards'
      ? 'Return ONLY JSON (no markdown fences, no commentary): { "cards": [{ "front": string, "back": string, "topic": string }] } (8-12 cards).'
      : 'Return ONLY JSON (no markdown fences, no commentary): { "title": string, "questions": [{ "id": string, "type": "mcq", "prompt": string, "options": string[], "correctAnswer": string, "topic": string, "marks": 1 }] } (6 questions).'
  try {
    const raw = await runChat(env, system, JSON.stringify(input), {
      timeoutMs: 30_000,
      meter: input.meter ? { ...input.meter, feature: 'practice_tools' } : undefined,
    })
    return extractJson(raw)
  } catch {
    const topics = input.weakspots.length ? input.weakspots : [input.subject]
    if (mode === 'flashcards') {
      return {
        cards: topics.flatMap((t) => [
          { front: `What is a key idea in ${t}?`, back: `Review your notes on ${t}.`, topic: t },
          { front: `Common mistake in ${t}?`, back: `Revisit marked feedback for ${t}.`, topic: t },
        ]),
      }
    }
    return {
      title: `Practice: ${input.subject}`,
      questions: topics.slice(0, 6).map((t, i) => ({
        id: `p${i + 1}`,
        type: 'mcq',
        prompt: `Which statement best relates to ${t}?`,
        options: ['Statement A', 'Statement B', 'Statement C', 'Statement D'],
        correctAnswer: 'Statement A',
        topic: t,
        marks: 1,
      })),
    }
  }
}

export type PinpointWeakspot = {
  skill: string
  objective: string
  evidence: string
  frequency: number | string
  severity: 'low' | 'medium' | 'high' | string
  remediation: string
  /** Legacy-compatible alias for flashcards / tools */
  topic?: string
  count?: number
}

export async function pinpointWeakspotsFromArchives(
  env: Env,
  input: {
    scope: 'student' | 'class'
    name: string
    archivesMarkdown: string
    meter?: AiMeterContext
  },
): Promise<{ weakspots: PinpointWeakspot[]; summary: string }> {
  const system = `You are Guidelight, an expert learning diagnostican.
Analyse the attempt archives and return ONLY valid JSON:
{
  "summary": string,
  "weakspots": [
    {
      "skill": string,
      "objective": string,
      "evidence": string,
      "frequency": number | string,
      "severity": "low" | "medium" | "high",
      "remediation": string
    }
  ]
}
Focus on recurring skill gaps backed by incorrect answers and feedback.
For class scope, prioritise shared / recurring gaps across students and note who is most affected in evidence.
Return at most 8 weakspots, most important first.`

  const user = `Scope: ${input.scope}
Name: ${input.name}
Attempt archives:
${input.archivesMarkdown.slice(0, 95_000)}`

  try {
    const raw = await runChat(env, system, user, {
      timeoutMs: 55_000,
      maxTokens: 4096,
      meter: input.meter ? { ...input.meter, feature: 'weakspots' } : undefined,
    })
    const parsed = extractJson(raw) as {
      summary?: string
      weakspots?: PinpointWeakspot[]
    }
    const weakspots = (parsed.weakspots ?? []).slice(0, 8).map((w) => ({
      ...w,
      skill: w.skill || 'General',
      topic: w.skill || w.topic || 'General',
      objective: w.objective || '',
      evidence: w.evidence || '',
      frequency: w.frequency ?? 1,
      severity: w.severity || 'medium',
      remediation: w.remediation || '',
      count: typeof w.frequency === 'number' ? w.frequency : Number(w.frequency) || 1,
    }))
    return {
      summary: parsed.summary || 'Analysis complete.',
      weakspots,
    }
  } catch (err) {
    console.error('pinpointWeakspotsFromArchives falling back', err)
    return {
      summary: 'AI analysis unavailable — showing a basic fallback from archive keywords.',
      weakspots: [
        {
          skill: 'Review marked feedback',
          topic: 'Review marked feedback',
          objective: 'Revisit incorrect responses in recent attempts',
          evidence: 'Automated fallback when the model was unavailable',
          frequency: 1,
          count: 1,
          severity: 'medium',
          remediation: 'Ask the student to rework incorrect questions with teacher support.',
        },
      ],
    }
  }
}

function normalizeStage(raw: unknown, fallbackMins: number): LessonStage {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<LessonStage>
  const steps = Array.isArray(s.steps)
    ? s.steps.map(String).filter(Boolean)
    : ['Teacher-led step (edit me).']
  return {
    durationMins: typeof s.durationMins === 'number' && s.durationMins > 0 ? s.durationMins : fallbackMins,
    steps,
    teacherNotes: typeof s.teacherNotes === 'string' ? s.teacherNotes : '',
  }
}

function normalizeLessonPlan(raw: unknown, durationMinutes: number): LessonPlan {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const present = Math.max(8, Math.round(durationMinutes * 0.35))
  const practice = Math.max(8, Math.round(durationMinutes * 0.35))
  const production = Math.max(5, durationMinutes - present - practice)
  const style = p.activityStyle === 'communicative' ? 'communicative' : 'traditional'
  return {
    learningObjective:
      typeof p.learningObjective === 'string' && p.learningObjective
        ? p.learningObjective
        : 'Meet the lesson learning objective.',
    materials: Array.isArray(p.materials) ? p.materials.map(String) : [],
    activityStyle: style,
    careerContext:
      typeof p.careerContext === 'string' && p.careerContext.trim()
        ? p.careerContext.trim()
        : undefined,
    presentation: normalizeStage(p.presentation, present),
    practice: normalizeStage(p.practice, practice),
    production: normalizeStage(p.production, production),
    differentiation: typeof p.differentiation === 'string' ? p.differentiation : '',
    plenary: typeof p.plenary === 'string' ? p.plenary : '',
    homeworkOptional: typeof p.homeworkOptional === 'string' ? p.homeworkOptional : '',
  }
}

/**
 * Generate PPP lesson plans in week chunks. Majority Quiet work (traditional);
 * occasional Interactive (communicative) lessons use fun career-framed activities.
 */
export async function generateLessonPlans(
  env: Env,
  input: {
    subject: string
    curriculum: string
    ageRange: string
    durationMinutes: number
    weeks: number
    daysOfWeek: string[]
    resources: string[]
    studentProfiles?: Array<{
      name: string
      interests: string
      careerAmbitions: string
    }>
    slots: ScheduledSlot[]
    meter?: AiMeterContext
  },
): Promise<{ title: string; lessons: GeneratedLesson[] }> {
  const total = input.slots.length
  if (!total) {
    return { title: `${input.subject} syllabus`, lessons: [] }
  }

  const lessonsPerWeek = Math.max(1, input.daysOfWeek.length)
  const chunkWeeks = 3
  const all: GeneratedLesson[] = []

  for (let weekStart = 1; weekStart <= input.weeks; weekStart += chunkWeeks) {
    const weekEnd = Math.min(input.weeks, weekStart + chunkWeeks - 1)
    const chunkSlots = input.slots.filter(
      (s) => s.week_index >= weekStart && s.week_index <= weekEnd,
    )
    const count = chunkSlots.length

    const system = `You are Guidelight, an expert lesson planner for teachers.
Return ONLY valid JSON matching this schema:
{
  "lessons": [
    {
      "title": string,
      "weekIndex": number,
      "plan": {
        "learningObjective": string,
        "materials": string[],
        "activityStyle": "traditional" | "communicative",
        "careerContext": string (optional — only for communicative/Interactive lessons),
        "presentation": { "durationMins": number, "steps": string[], "teacherNotes": string },
        "practice": { "durationMins": number, "steps": string[], "teacherNotes": string },
        "production": { "durationMins": number, "steps": string[], "teacherNotes": string },
        "differentiation": string,
        "plenary": string,
        "homeworkOptional": string
      }
    }
  ]
}
Rules:
- Presentation → Practice → Production (PPP). Stage durations should roughly sum to ${input.durationMinutes} minutes.
- MOST lessons must be traditional = Quiet work (PPT/input → worksheet/practice → short essay or output if time). Teacher circulates and can mark while students work independently.
- Only OCCASIONAL lessons should be communicative = Interactive (about 1 in 4): roleplay, debate, project, or career-framed activity. The teacher facilitates; little marking time. Ground these in a fun career-related scenario (e.g. planning a marketing campaign, picking a stock, courtroom argument, writing to a local politician, speech as PM, advising a struggling business). Set careerContext for those only.
- Do NOT career-theme every worksheet or input stage.
- Vary topics across weeks for the subject and curriculum.
- Return exactly ${count} lessons in chronological order for weeks ${weekStart}–${weekEnd}.`

    const user = `Plan lessons for weeks ${weekStart}–${weekEnd} of a ${input.weeks}-week syllabus.
Subject: ${input.subject}
Curriculum: ${input.curriculum || 'n/a'}
Age range: ${input.ageRange || 'n/a'}
Lesson duration: ${input.durationMinutes} minutes
Lessons per week: ${lessonsPerWeek} on ${input.daysOfWeek.join(', ')}
Resources available: ${input.resources.join(', ') || 'standard classroom'}
Student hints: ${JSON.stringify(input.studentProfiles ?? []).slice(0, 1800)}
Slots (in order): ${JSON.stringify(
      chunkSlots.map((s) => ({
        week: s.week_index,
        day: s.day_of_week,
        date: s.scheduled_date,
      })),
    )}`

    try {
      const raw = await runChat(env, system, user, {
        timeoutMs: 55_000,
        maxTokens: 8192,
        meter: input.meter ? { ...input.meter, feature: 'lesson_plans' } : undefined,
      })
      const parsed = extractJson(raw) as { lessons?: Array<Record<string, unknown>> }
      const chunkLessons = Array.isArray(parsed.lessons) ? parsed.lessons : []
      if (!chunkLessons.length) throw new Error('No lessons in model response')

      for (let i = 0; i < chunkSlots.length; i++) {
        const slot = chunkSlots[i]
        const rawLesson = chunkLessons[i] ?? chunkLessons[chunkLessons.length - 1] ?? {}
        const plan = normalizeLessonPlan(rawLesson.plan, input.durationMinutes)
        const title =
          typeof rawLesson.title === 'string' && rawLesson.title.trim()
            ? rawLesson.title.trim()
            : `${input.subject}: week ${slot.week_index}`
        all.push({
          title,
          weekIndex: slot.week_index,
          plan,
        })
      }
    } catch (err) {
      console.error(`generateLessonPlans chunk weeks ${weekStart}-${weekEnd} falling back`, err)
      const fallback = fallbackGeneratedLessons(chunkSlots, input.subject, input.durationMinutes)
      all.push(...fallback)
    }
  }

  return {
    title: `${input.subject} · ${input.weeks}-week plan`,
    lessons: all,
  }
}

function normalizeReconstructedContent(
  parsed: TaskContent,
  fallbackTitle: string,
  subject: string,
): TaskContent {
  const questions = (parsed.questions ?? [])
    .filter((q) => q && typeof q.prompt === 'string' && q.prompt.trim())
    .map((q, i) => ({
      ...q,
      id: q.id || `dq${i + 1}`,
      type: q.type || 'short_written',
      topic: q.topic || subject || 'general',
      learningObjective:
        q.learningObjective ||
        `Assess understanding of ${q.topic || subject || 'the topic'} for this question.`,
      marks: typeof q.marks === 'number' && q.marks > 0 ? q.marks : 1,
    }))

  return {
    title: (parsed.title || fallbackTitle || `${subject} practice paper`).slice(0, 120),
    instructions:
      parsed.instructions ||
      'This is an AI-generated mock exam — not an official exam copy. Answer carefully.',
    questions,
  }
}

/**
 * Best-effort reconstruction of a past paper into a completable practice TaskContent.
 * Prefer a passable paper over failing when the source is messy.
 */
export async function reconstructPastPaper(
  env: Env,
  input: {
    extractedText?: string
    imageDataUrls?: string[]
    subject: string
    curriculum: string
    syllabusCode: string
    title?: string
    meter?: AiMeterContext
    examFormat?: ExamFormat
    gradeBoundaries?: GradeBoundary[]
    rubric?: ExamRubric
  },
): Promise<TaskContent> {
  const profileContext = formatProfileContext({
    examFormat: input.examFormat,
    gradeBoundaries: input.gradeBoundaries,
    rubric: input.rubric,
  })
  const system = `You are Guidelight. Turn a past-paper upload into a usable timed MOCK EXAM in JSON.

Philosophy:
- Goal: a completable practice paper students can sit in the browser — NOT a perfect archival facsimile.
- Follow the source when clear. When text is garbled, marks missing, or structure ambiguous, infer sensible questions using the subject, curriculum, and syllabus code.
- Skip or paraphrase unreadable fragments. Never leave empty prompts.
- Prefer a slightly imperfect but passable paper over aborting.

Return ONLY valid JSON matching:
{
  "title": string,
  "instructions": string,
  "questions": [
    {
      "id": string,
      "type": "mcq" | "cloze" | "short_written" | "extended_written" | "reading_comprehension" | "bloom",
      "prompt": string,
      "topic": string,
      "learningObjective": string,
      "options": string[] (mcq/bloom),
      "correctAnswer": string | string[],
      "blanks": string[] (cloze),
      "marks": number
    }
  ]
}
Include at least 3 questions whenever any usable content exists.
Pull answer keys when present; otherwise invent provisional answers suitable for practice marking.`

  const meta = `Subject: ${input.subject}
Curriculum: ${input.curriculum || 'n/a'}
Syllabus code: ${input.syllabusCode || 'n/a'}
Preferred title: ${input.title || 'n/a'}
${profileContext ? `\nExam profile:\n${profileContext}` : ''}`

  const text = (input.extractedText || '').trim().slice(0, 12_000)
  const images = (input.imageDataUrls || []).slice(0, 4)

  async function once(strict: boolean): Promise<TaskContent> {
    const strictNote = strict
      ? '\nReturn ONLY a single JSON object. No markdown fences, no commentary.'
      : ''

    let raw: string
    if (text) {
      raw = await runChat(
        env,
        system + strictNote,
        `${meta}\n\nPast paper text:\n${text}`,
        {
          timeoutMs: 55_000,
          maxTokens: 8192,
          meter: input.meter
            ? { ...input.meter, feature: 'task_gen' }
            : undefined,
        },
      )
    } else if (images.length) {
      const parts: Array<Record<string, unknown>> = [
        {
          type: 'text',
          text: `${meta}\n\nReconstruct a passable practice paper from these past-paper page image(s).${strictNote}`,
        },
      ]
      for (const url of images) {
        parts.push({ type: 'image_url', image_url: { url } })
      }
      raw = await runChat(env, system, parts, {
        timeoutMs: 55_000,
        maxTokens: 8192,
        meter: input.meter
          ? { ...input.meter, feature: 'task_gen' }
          : undefined,
      })
    } else {
      throw new Error('No past paper text or images to reconstruct')
    }

    const parsed = extractJson(raw) as TaskContent
    const normalized = normalizeReconstructedContent(
      parsed,
      input.title || `${input.subject} practice paper`,
      input.subject,
    )
    if (normalized.questions.length < 3) {
      throw new Error('Reconstruction produced fewer than 3 questions')
    }
    return normalized
  }

  try {
    return await once(false)
  } catch (err) {
    console.error('reconstructPastPaper first pass failed, retrying strict', err)
    try {
      return await once(true)
    } catch (err2) {
      console.error('reconstructPastPaper failed', err2)
      throw err2 instanceof Error ? err2 : new Error('Could not reconstruct practice paper')
    }
  }
}

