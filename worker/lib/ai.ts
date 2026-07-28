import type { Env, Question, TaskContent } from '../types'

const MODEL = '@cf/moonshotai/kimi-k2.6'

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

async function runChat(
  env: Env,
  system: string,
  user: string | Array<Record<string, unknown>>,
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
    max_completion_tokens: 4096,
    temperature: 0.4,
    chat_template_kwargs: { thinking: false },
  })

  // Avoid hanging classroom workflows when Workers AI is slow/unavailable
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('AI request timed out')), 20_000)
  })

  const result = await Promise.race([call, timeout])
  return asText(result)
}

/** Use vision to summarise a past-paper image into style notes for generation. */
export async function describePastPaperImage(
  env: Env,
  imageDataUrl: string,
): Promise<string> {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid image data')

  const system =
    'You analyse exam past papers. Describe the question style, structure, topics, mark schemes cues, and wording patterns so another model can mimic them. Return plain text notes only.'

  try {
    const raw = await runChat(env, system, [
      {
        type: 'text',
        text: 'Extract past-paper style notes from this image for generating a similar assessment.',
      },
      {
        type: 'image_url',
        image_url: { url: imageDataUrl },
      },
    ])
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
  },
): Promise<TaskContent> {
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
Every question MUST have a topic tag for analytics. Mark objective questions with correctAnswer.`

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
Student personalisation hints: ${JSON.stringify(input.studentProfiles ?? []).slice(0, 1500)}`

  try {
    const raw = await runChat(env, system, user)
    const parsed = extractJson(raw) as TaskContent
    if (!parsed.questions?.length) throw new Error('Model returned no questions')
    parsed.questions = parsed.questions.map((q, i) => ({
      ...q,
      id: q.id || `q${i + 1}`,
      marks: q.marks ?? 1,
      topic: q.topic || input.subject,
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
  },
): Promise<{
  score_pct: number
  feedback: Record<
    string,
    { correct: boolean; feedback: string; topic: string; marksAwarded: number; marksPossible: number }
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
      "marksAwarded": number,
      "marksPossible": number
    }
  ]
}
Be fair on open responses. Award partial credit where appropriate.`

  const user = `Subject: ${input.subject}
Questions: ${JSON.stringify(input.content.questions)}
Student answers: ${JSON.stringify(input.answers)}`

  try {
    const raw = await runChat(env, system, user)
    const parsed = extractJson(raw) as {
      items: Array<{
        questionId: string
        correct: boolean
        feedback: string
        topic: string
        marksAwarded: number
        marksPossible: number
      }>
    }

    const feedback: Record<
      string,
      { correct: boolean; feedback: string; topic: string; marksAwarded: number; marksPossible: number }
    > = {}
    let awarded = 0
    let possible = 0
    const topic_tags: string[] = []

    for (const item of parsed.items ?? []) {
      feedback[item.questionId] = item
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
    { correct: boolean; feedback: string; topic: string; marksAwarded: number; marksPossible: number }
  >
  topic_tags: string[]
} {
  const feedback: Record<
    string,
    { correct: boolean; feedback: string; topic: string; marksAwarded: number; marksPossible: number }
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
  },
): Promise<string> {
  const system =
    'You are Guidelight. Write a concise 2-3 paragraph teacher-facing introduction to this student based on their data. Warm, specific, actionable. Return plain text only.'
  try {
    return await runChat(env, system, JSON.stringify(input))
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
  },
): Promise<string> {
  const system = `You are Guidelight. Produce a professional parent-facing progress report in markdown.
Include: overview, strengths, areas to improve, homework engagement, recommended next steps.
Tone: constructive and encouraging.`
  try {
    return await runChat(env, system, JSON.stringify(input))
  } catch {
    return `# Progress report — ${input.name}\n\n## Overview\nThis report summarises recent learning activity on Guidelight.\n\n## Teacher notes\n${input.teacherNotes || 'None provided.'}\n\n## Next steps\nContinue regular practice on weakspot topics and review marked feedback after each task.\n`
  }
}

export async function generatePracticeOrFlashcards(
  env: Env,
  mode: 'flashcards' | 'practice',
  input: { subject: string; weakspots: string[]; recentErrors: unknown[] },
): Promise<unknown> {
  const system =
    mode === 'flashcards'
      ? 'Return ONLY JSON: { "cards": [{ "front": string, "back": string, "topic": string }] } (8-12 cards).'
      : 'Return ONLY JSON: { "title": string, "questions": [{ "id": string, "type": "mcq", "prompt": string, "options": string[], "correctAnswer": string, "topic": string, "marks": 1 }] } (6 questions).'
  try {
    const raw = await runChat(env, system, JSON.stringify(input))
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
