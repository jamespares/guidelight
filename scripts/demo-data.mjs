#!/usr/bin/env node
/**
 * Seed / wipe Guidelight demo data.
 *
 * All demo rows use ids (and usernames/emails) prefixed with `demo-` / `demo.`
 * so wipe is a single safe cleanup.
 *
 * Usage:
 *   npm run db:demo:seed          # remote (production) D1
 *   npm run db:demo:seed:local    # local D1
 *   npm run db:demo:wipe          # remote
 *   npm run db:demo:wipe:local    # local
 *
 * Logins (password for all: demo1234)
 *   Teacher  demo@guidelight.test
 *   Students demo.ava, demo.noah, demo.mia, demo.leo, demo.zoe,
 *            demo.kai, demo.iris, demo.sam  (Year 10 English)
 *            demo.rui, demo.jin               (IELTS prep)
 */

import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const PASSWORD = 'demo1234'
const PBKDF2_ITERATIONS = 100_000

const args = process.argv.slice(2)
const cmd = args.find((a) => a === 'seed' || a === 'wipe') || 'seed'
const remote = !args.includes('--local')

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`
}

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

function wipeSql() {
  // Delete in dependency-safe order. All demo entities use demo- ids.
  return `
-- Guidelight demo wipe (safe: only demo-* rows)
DELETE FROM sessions WHERE user_id LIKE 'demo-%';
DELETE FROM cefr_written_marks WHERE id LIKE 'demo-%'
  OR response_id IN (SELECT id FROM cefr_test_responses WHERE test_id LIKE 'demo-%' OR id LIKE 'demo-%');
DELETE FROM cefr_test_responses WHERE id LIKE 'demo-%' OR test_id LIKE 'demo-%';
DELETE FROM cefr_tests WHERE id LIKE 'demo-%' OR student_id LIKE 'demo-%' OR task_id LIKE 'demo-%';
DELETE FROM reading_machine_sessions WHERE id LIKE 'demo-%' OR student_id LIKE 'demo-%' OR material_id LIKE 'demo-%';
DELETE FROM reading_speed_attempts WHERE id LIKE 'demo-%' OR student_id LIKE 'demo-%' OR task_id LIKE 'demo-%';
DELETE FROM story_events WHERE id LIKE 'demo-%' OR student_id LIKE 'demo-%';
DELETE FROM insight_events WHERE id LIKE 'demo-%' OR teacher_id LIKE 'demo-%' OR class_id LIKE 'demo-%' OR student_id LIKE 'demo-%';
DELETE FROM lessons WHERE id LIKE 'demo-%' OR batch_id LIKE 'demo-%';
DELETE FROM lesson_batches WHERE id LIKE 'demo-%' OR teacher_id LIKE 'demo-%' OR class_id LIKE 'demo-%';
DELETE FROM attempts WHERE id LIKE 'demo-%' OR student_id LIKE 'demo-%' OR task_id LIKE 'demo-%';
DELETE FROM task_assignments WHERE id LIKE 'demo-%' OR task_id LIKE 'demo-%' OR student_id LIKE 'demo-%';
DELETE FROM reports WHERE id LIKE 'demo-%' OR teacher_id LIKE 'demo-%';
DELETE FROM reading_materials WHERE id LIKE 'demo-%' OR class_id LIKE 'demo-%' OR teacher_id LIKE 'demo-%';
DELETE FROM tasks WHERE id LIKE 'demo-%' OR created_by LIKE 'demo-%' OR class_id LIKE 'demo-%';
DELETE FROM exam_profiles WHERE id LIKE 'demo-%' OR class_id LIKE 'demo-%' OR created_by LIKE 'demo-%';
DELETE FROM students WHERE id LIKE 'demo-%' OR class_id LIKE 'demo-%' OR username LIKE 'demo.%';
DELETE FROM classes WHERE id LIKE 'demo-%' OR teacher_id LIKE 'demo-%';
DELETE FROM teachers WHERE id LIKE 'demo-%' OR email LIKE 'demo@%';
`
}

function mcq(id, prompt, topic, options, correct, bloom) {
  return {
    id,
    type: bloom ? 'bloom' : 'mcq',
    prompt,
    topic,
    options,
    correctAnswer: correct,
    bloomLevel: bloom || undefined,
    marks: 1,
  }
}

function cloze(id, prompt, topic, blanks) {
  return {
    id,
    type: 'cloze',
    prompt,
    topic,
    blanks,
    correctAnswer: blanks,
    marks: blanks.length,
  }
}

function shortWritten(id, prompt, topic) {
  return {
    id,
    type: 'short_written',
    prompt,
    topic,
    marks: 3,
  }
}

function readingComp(id, prompt, topic) {
  return {
    id,
    type: 'reading_comprehension',
    prompt,
    topic,
    marks: 4,
  }
}

/** Pinpoint-style weakspot for roster / detail / insights panels. */
function ws(topic, opts = {}) {
  return {
    topic,
    skill: opts.skill || topic,
    count: opts.count ?? 3,
    severity: opts.severity || 'medium',
    evidence: opts.evidence || `Missed ${opts.count ?? 3} related items across recent attempts.`,
    remediation: opts.remediation || `Targeted practice on ${topic} with model answers.`,
    frequency: opts.frequency || opts.count || 3,
  }
}

function lessonPlan(overrides = {}) {
  return {
    learningObjective:
      overrides.learningObjective ||
      'Students can identify and use relative clauses accurately in short writing.',
    materials: overrides.materials || ['Whiteboard', 'Worksheet pack', 'Model paragraph'],
    activityStyle: overrides.activityStyle || 'communicative',
    careerContext: overrides.careerContext,
    presentation: overrides.presentation || {
      durationMins: 10,
      steps: [
        'Warm-up: board examples of who/which/that.',
        'Elicit form and meaning from two model sentences.',
      ],
      teacherNotes: 'Keep examples short; check pronunciation of that.',
    },
    practice: overrides.practice || {
      durationMins: 15,
      steps: [
        'Pair gap-fill: combine sentences with relative pronouns.',
        'Peer-check answers against answer key.',
      ],
      teacherNotes: 'Circulate; note article + relative clause double errors.',
    },
    production: overrides.production || {
      durationMins: 15,
      steps: [
        'Write 4–5 sentences about a hobby using at least two relative clauses.',
        'Swap and highlight partner’s relative clauses.',
      ],
    },
    differentiation:
      overrides.differentiation ||
      'Support: sentence starters. Challenge: reduce clauses and add non-defining commas.',
    plenary: overrides.plenary || 'Exit ticket: rewrite one incorrect sentence correctly.',
    homeworkOptional: overrides.homeworkOptional || 'Complete worksheet Q6–10.',
  }
}

/** ISO date string N days before today (local calendar). */
function dateDaysAgo(days) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Next weekday (Mon=1 … Sun=0) on or after startDateYmd. */
function nextWeekdayOnOrAfter(startYmd, weekday) {
  const d = new Date(startYmd + 'T12:00:00')
  const target = weekday === 0 ? 0 : weekday
  while (d.getDay() !== target) d.setDate(d.getDate() + 1)
  return d
}

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

function dayName(d) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]
}

async function seedSql() {
  const hash = await hashPassword(PASSWORD)

  const teacherId = 'demo-teacher'
  const classEn = 'demo-class-en'
  const classIelts = 'demo-class-ielts'

  const studentsEn = [
    {
      id: 'demo-stu-ava',
      name: 'Ava C.',
      user: 'demo.ava',
      interests: 'football, K-drama, baking',
      career: 'sports journalist',
      weakspots: [
        ws('relative clauses', {
          count: 4,
          severity: 'high',
          evidence: 'Diagnostic Q1 wrong; homework MCQ on relative clauses incorrect twice.',
          remediation: 'Guided sentence combining with who/which/that; football match reports.',
        }),
        ws('article usage', {
          count: 3,
          severity: 'medium',
          evidence: 'Missed a/an before vowel sounds in diagnostic and formative.',
          remediation: 'Article drills with career vocabulary (the pitch, an interview).',
        }),
      ],
      weakspotsSummary:
        'Ava’s main gaps are relative clauses and articles. Short sport-themed writing with models helps most.',
      cefr: 'B1',
      wpm: 168,
      summary:
        'Ava is an engaged B1 reader who thrives on topical texts about sport and media. Relative clauses and articles are the main gaps; short writing tasks with models help her most.',
    },
    {
      id: 'demo-stu-noah',
      name: 'Noah P.',
      user: 'demo.noah',
      interests: 'chess, coding, sci-fi',
      career: 'software engineer',
      weakspots: [
        ws('passive voice', {
          count: 5,
          severity: 'high',
          evidence: '5 passive items incorrect across diagnostic and Dojo paper 1.',
          remediation: 'Rewrite active sci-fi sentences into passive; check be + past participle.',
        }),
        ws('formal register', {
          count: 2,
          severity: 'low',
          evidence: 'Formative rewrite stayed slightly informal (“kinda”, contractions).',
          remediation: 'Side-by-side informal vs formal opinion-essay models.',
        }),
      ],
      weakspotsSummary: 'Strong MCQ scorer; stretch into formal extended writing and reliable passives.',
      cefr: 'B2',
      wpm: 214,
      summary:
        'Noah works quickly and scores well on grammar MCQs. Formal register in extended writing still feels stiff; peer models of opinion essays would help.',
    },
    {
      id: 'demo-stu-mia',
      name: 'Mia R.',
      user: 'demo.mia',
      interests: 'piano, travel blogs, photography',
      career: 'travel writer',
      weakspots: [
        ws('paragraph cohesion', {
          count: 3,
          severity: 'medium',
          evidence: 'Weekend writing jumped topics without clear linkers.',
          remediation: 'Travel-blog paragraph frames with firstly / however / as a result.',
        }),
        ws('phrasal verbs', {
          count: 4,
          severity: 'high',
          evidence: 'Formative phrasal-verb MCQ wrong; limited use in production.',
          remediation: 'Phrasal verb cards set in travel contexts (set off, check in, look around).',
        }),
      ],
      weakspotsSummary: 'Vivid writer who needs cohesion devices and high-frequency phrasal verbs.',
      cefr: 'B1',
      wpm: 155,
      summary:
        'Mia writes vividly but loses cohesion across paragraphs. Targeted practice on linking devices and phrasal verbs in travel contexts suits her interests.',
    },
    {
      id: 'demo-stu-leo',
      name: 'Leo K.',
      user: 'demo.leo',
      interests: 'basketball, hip-hop, memes',
      career: 'undecided',
      weakspots: [
        ws('tense consistency', {
          count: 6,
          severity: 'high',
          evidence: 'Diagnostic flagged; mixed past/present in short writing.',
          remediation: 'Short basketball narratives locked in past simple, then past continuous.',
        }),
        ws('spelling', {
          count: 3,
          severity: 'medium',
          evidence: 'Repeated misspellings in homework (friend, because, which).',
          remediation: 'Personal spelling list + look–cover–write–check.',
        }),
      ],
      weakspotsSummary: 'Priority is tense consistency; keep tasks short and high-energy.',
      cefr: 'A2',
      wpm: 132,
      summary:
        'Leo is motivated by short, high-energy tasks. Tense consistency is the priority; keep texts short and spoken-style to start, then stretch into narrative.',
    },
    {
      id: 'demo-stu-zoe',
      name: 'Zoe M.',
      user: 'demo.zoe',
      interests: 'debate club, climate activism',
      career: 'lawyer',
      weakspots: [
        ws('hedging language', {
          count: 2,
          severity: 'low',
          evidence: 'Argumentative Dojo responses overstated claims without modal hedges.',
          remediation: 'Practice may / might / it appears that in climate debate prompts.',
        }),
      ],
      weakspotsSummary: 'C1 communicator; refine hedging and counter-argument structures.',
      cefr: 'C1',
      wpm: 268,
      summary:
        'Zoe is a strong C1 communicator. Occasional overstatement in argumentative writing — practice hedging and counter-argument structures.',
    },
    {
      id: 'demo-stu-kai',
      name: 'Kai T.',
      user: 'demo.kai',
      interests: 'anime, game design',
      career: 'game narrative designer',
      weakspots: [
        ws('conditionals', {
          count: 4,
          severity: 'high',
          evidence: 'Diagnostic cloze on first conditional incorrect; Dojo paper 2 gaps.',
          remediation: 'Game-story “if players… then…” tree writing.',
        }),
        ws('listening detail', {
          count: 3,
          severity: 'medium',
          evidence: 'Teacher note: loses detail in multi-speaker classroom audio.',
          remediation: 'Short anime-trailer clips with note grids.',
        }),
      ],
      weakspotsSummary: 'Narrative strengths; next focus conditionals and careful listening.',
      cefr: 'B1',
      wpm: 178,
      summary:
        'Kai connects well with narrative prompts. Conditionals and careful listening for detail are the next focus areas.',
    },
    {
      id: 'demo-stu-iris',
      name: 'Iris L.',
      user: 'demo.iris',
      interests: 'biology, documentaries',
      career: 'doctor',
      weakspots: [
        ws('academic vocabulary', {
          count: 5,
          severity: 'medium',
          evidence: 'Science reading Dojo items show synonym gaps (hypothesis, evidence, sample).',
          remediation: 'Frayer cards for biology Tier-2 words from documentary clips.',
        }),
      ],
      weakspotsSummary: 'High-achieving; academic vocabulary unlocks the next reading band.',
      cefr: 'B2',
      wpm: 201,
      summary:
        'Iris is systematic and high-achieving. Academic vocabulary for science texts will unlock the next band of reading confidence.',
    },
    {
      id: 'demo-stu-sam',
      name: 'Sam W.',
      user: 'demo.sam',
      interests: 'football, cooking shows',
      career: 'chef',
      weakspots: [
        ws('word order', {
          count: 3,
          severity: 'medium',
          evidence: 'In-progress homework answers show adverb placement errors.',
          remediation: 'Recipe steps with subject–verb–object frames.',
        }),
        ws('prepositions', {
          count: 4,
          severity: 'high',
          evidence: 'Homework cloze on since/for; cooking-context in/on/at mix-ups.',
          remediation: 'Preposition drills inside recipe and kitchen instructions.',
        }),
      ],
      weakspotsSummary: 'Procedural texts work well; prepositions and word order need drills.',
      cefr: 'A2',
      wpm: 141,
      summary:
        'Sam benefits from recipe-style procedural texts. Prepositions and word order drills embedded in cooking contexts work well.',
    },
  ]

  const studentsIelts = [
    {
      id: 'demo-stu-rui',
      name: 'Rui H.',
      user: 'demo.rui',
      interests: 'economics podcasts',
      career: 'study abroad — UK',
      weakspots: [
        ws('IELTS Task 2 structure', {
          count: 3,
          severity: 'high',
          evidence: 'Outline homework missing clear thesis and topic sentences.',
          remediation: '4-paragraph opinion template with band-6.5 exemplars.',
        }),
        ws('paraphrasing', {
          count: 4,
          severity: 'high',
          evidence: 'Copied prompt wording in paraphrase question.',
          remediation: 'Synonym ladders + sentence restructuring drills.',
        }),
      ],
      weakspotsSummary: 'Aiming for 6.5 — Task 2 structure and paraphrasing are the levers.',
      cefr: 'B2',
      wpm: 198,
      summary:
        'Rui is aiming for IELTS 6.5. Paraphrasing and Task 2 essay structure are the main coaching levers.',
    },
    {
      id: 'demo-stu-jin',
      name: 'Jin S.',
      user: 'demo.jin',
      interests: 'architecture, sketching',
      career: 'architecture school',
      weakspots: [
        ws('IELTS Listening section 3', {
          count: 5,
          severity: 'high',
          evidence: 'Loses marks when two speakers discuss academic topics.',
          remediation: 'Multi-speaker practice with note grids; architecture seminar clips.',
        }),
        ws('academic vocabulary', {
          count: 2,
          severity: 'low',
          evidence: 'Reading solid; occasional synonym misses on design terms.',
          remediation: 'Word families for design / structure / materials.',
        }),
      ],
      weakspotsSummary: 'Reading solid; Listening section 3 discussions are the bottleneck.',
      cefr: 'B1',
      wpm: 172,
      summary:
        'Jin is solid on reading but loses marks in Listening section 3 discussions. Multi-speaker practice with note grids recommended.',
    },
  ]

  const allStudents = [...studentsEn, ...studentsIelts]

  const classEnWeakspots = [
    ws('relative clauses', {
      count: 12,
      severity: 'high',
      evidence: 'Appears in 6 of 8 students’ recent attempts.',
      remediation: 'Whole-class workshop week 3; peer mentoring by Zoe/Noah.',
    }),
    ws('article usage', {
      count: 8,
      severity: 'medium',
      evidence: 'Diagnostic cluster errors on a/an/the.',
      remediation: 'Daily 5-minute article warm-ups.',
    }),
    ws('prepositions', {
      count: 7,
      severity: 'medium',
      evidence: 'Homework cloze + Sam/Leo profiles.',
      remediation: 'Contextual preposition cards in writing lessons.',
    }),
  ]

  const readingPassage = `Maya moved to London last year. Her new flat has three rooms and a small kitchen. Every morning she walks to the park with her dog. On Saturdays she meets her friends at a cafe near the river. She says the city is busy but beautiful, and she is learning English quickly because she talks to people every day.`

  const climatePassage =
    'Cities around the world are planting trees along busy streets and turning empty lots into parks. Green space cools neighbourhoods, improves air quality, and gives people a place to rest. Studies show that children who play outside concentrate better in class. However, building parks costs money, and some developers prefer apartments. Communities that plan carefully can protect nature while still growing.'

  const footballPassage =
    'Match day started early at the academy. Players warmed up on the pitch while coaches checked the lineup. After kick-off, the midfielder who scored last week created two chances. The crowd that filled the stands cheered every tackle. By full time the score was 2–1, and the captain who lifted the trophy thanked the supporters.'

  const diagQuestions = [
    mcq(
      'demo-q-d1',
      'Choose the correct sentence.',
      'article usage',
      ['She is a engineer.', 'She is an engineer.', 'She is engineer.', 'She is the engineer always.'],
      'She is an engineer.',
    ),
    cloze('demo-q-d2', 'If it _____ (rain) tomorrow, we will stay inside.', 'conditionals', ['rains']),
    shortWritten(
      'demo-q-d3',
      'Write 3–4 sentences about a hobby you enjoy and why.',
      'extended response',
    ),
    readingComp(
      'demo-q-d4',
      'According to the passage, why is Maya learning English quickly?',
      'reading_comprehension',
    ),
    mcq(
      'demo-q-d5',
      'Which option uses the passive correctly?',
      'passive voice',
      [
        'The cake made by my mum.',
        'The cake was made by my mum.',
        'The cake was make by my mum.',
        'The cake making by my mum.',
      ],
      'The cake was made by my mum.',
      'Understand',
    ),
  ]

  const hwQuestions = [
    mcq(
      'demo-q-h1',
      'Select the sentence with a relative clause.',
      'relative clauses',
      [
        'The book is on the table.',
        'The book that I bought is excellent.',
        'I bought a book yesterday.',
        'Buying books is fun.',
      ],
      'The book that I bought is excellent.',
    ),
    cloze('demo-q-h2', 'She has lived here _____ 2019.', 'prepositions', ['since']),
    shortWritten(
      'demo-q-h3',
      'Describe your perfect weekend in 40–60 words.',
      'paragraph cohesion',
    ),
  ]

  const formativeQuestions = [
    mcq(
      'demo-q-f1',
      'Which word is a phrasal verb?',
      'phrasal verbs',
      ['beautiful', 'give up', 'quickly', 'although'],
      'give up',
    ),
    shortWritten(
      'demo-q-f2',
      'Rewrite this more formally: "The experiment was kinda cool but the results were messy."',
      'formal register',
    ),
  ]

  const cohesionQuestions = [
    mcq(
      'demo-q-c1',
      'Which linker best shows contrast?',
      'paragraph cohesion',
      ['Furthermore', 'However', 'For example', 'Firstly'],
      'However',
    ),
    cloze(
      'demo-q-c2',
      'I enjoy football. _____, I also like baking for my team.',
      'paragraph cohesion',
      ['Additionally'],
    ),
    shortWritten(
      'demo-q-c3',
      'Rewrite these two choppy sentences into one cohesive paragraph (3–4 sentences).',
      'paragraph cohesion',
    ),
  ]

  const summativeQuestions = [
    mcq(
      'demo-q-s1',
      'Choose the sentence with a non-defining relative clause.',
      'relative clauses',
      [
        'The player who scored left early.',
        'My brother, who lives in Madrid, is visiting.',
        'The book that is red is mine.',
        'People who exercise sleep better.',
      ],
      'My brother, who lives in Madrid, is visiting.',
    ),
    mcq(
      'demo-q-s2',
      'Which is the most formal option?',
      'formal register',
      [
        'The results were kinda messy.',
        'The results were a bit messy.',
        'The results were somewhat inconclusive.',
        'The results were messy lol.',
      ],
      'The results were somewhat inconclusive.',
    ),
    shortWritten(
      'demo-q-s3',
      'Write 80–100 words arguing whether school sports should be compulsory. Use at least one hedge.',
      'hedging language',
    ),
    readingComp(
      'demo-q-s4',
      'According to the climate passage, what trade-off do communities face?',
      'reading_comprehension',
    ),
  ]

  const lines = []
  lines.push('-- Guidelight demo seed (ids prefixed demo-)')
  lines.push(wipeSql())

  lines.push(`
INSERT INTO teachers (id, email, password_hash, name, email_verified, email_verified_at) VALUES (
  ${sqlStr(teacherId)},
  'demo@guidelight.test',
  ${sqlStr(hash)},
  'Demo Teacher',
  1,
  datetime('now', '-30 days')
);

INSERT INTO classes (
  id, teacher_id, name, subject, curriculum, age_range, student_count,
  weakspots_json, weakspots_summary, weakspots_updated_at
) VALUES
  (
    ${sqlStr(classEn)}, ${sqlStr(teacherId)}, 'Year 10 English', 'English', 'Cambridge Secondary', '14–15', ${studentsEn.length},
    ${sqlStr(JSON.stringify(classEnWeakspots))},
    ${sqlStr(
      'Whole-class priorities: relative clauses, articles, and prepositions. Stretch writers on formal register and hedging.',
    )},
    datetime('now', '-2 days')
  ),
  (
    ${sqlStr(classIelts)}, ${sqlStr(teacherId)}, 'IELTS Prep', 'English', 'IELTS Academic', '16–18', ${studentsIelts.length},
    ${sqlStr(
      JSON.stringify([
        ws('IELTS Task 2 structure', {
          count: 3,
          severity: 'high',
          evidence: 'Both students need clearer thesis-led outlines.',
          remediation: 'Shared band-descriptor checklist each week.',
        }),
        ws('paraphrasing', {
          count: 4,
          severity: 'medium',
          evidence: 'Prompt copying still common in homework.',
          remediation: 'Daily 5-minute paraphrase warm-ups.',
        }),
      ]),
    )},
    ${sqlStr('Focus on Task 2 structure, paraphrasing, and Listening section 3 note-taking.')},
    datetime('now', '-3 days')
  );
`)

  for (const s of allStudents) {
    const classId = studentsEn.some((x) => x.id === s.id) ? classEn : classIelts
    lines.push(`
INSERT INTO students (
  id, class_id, display_name, interests, career_ambitions, weakspots,
  weakspots_summary, weakspots_updated_at,
  username, password_hash, ai_summary, cefr_level, latest_wpm
) VALUES (
  ${sqlStr(s.id)},
  ${sqlStr(classId)},
  ${sqlStr(s.name)},
  ${sqlStr(s.interests)},
  ${sqlStr(s.career)},
  ${sqlStr(JSON.stringify(s.weakspots))},
  ${sqlStr(s.weakspotsSummary || '')},
  datetime('now', '-2 days'),
  ${sqlStr(s.user)},
  ${sqlStr(hash)},
  ${sqlStr(s.summary)},
  ${sqlStr(s.cefr)},
  ${s.wpm}
);`)
  }

  // Tasks
  const diagContent = {
    title: 'Term 1 Diagnostic',
    instructions: 'Complete all questions carefully. This helps personalise your homework.',
    questions: diagQuestions,
  }
  const hwContent = {
    title: 'Relative clauses & weekend writing',
    instructions: 'Practise relative clauses, then write a short paragraph.',
    questions: hwQuestions,
  }
  const formContent = {
    title: 'Phrasal verbs & formal tone',
    instructions: 'Short formative check — 15 minutes.',
    questions: formativeQuestions,
  }
  const cohesionContent = {
    title: 'Cohesion & linkers homework',
    instructions: 'Practise contrast and addition linkers, then rewrite for cohesion.',
    questions: cohesionQuestions,
  }
  const summativeContent = {
    title: 'Mid-term writing & grammar check',
    instructions: 'Summative check covering relative clauses, register, hedging, and reading.',
    questions: summativeQuestions,
  }
  const englishLevelContent = {
    kind: 'english_level',
    title: 'English level assessment',
    instructions: 'Full CEFR diagnostic (~66 questions, about one hour).',
    questions: [],
  }
  const readingSpeedContent = {
    kind: 'reading_speed',
    title: 'September reading speed',
    instructions: 'Read at your natural pace, then answer spot-checks.',
    questions: [],
    material_id: 'demo-mat-maya',
  }

  lines.push(`
INSERT INTO tasks (
  id, type, subtype, class_id, subject, title, description, difficulty,
  status, time_limit_seconds, content_json, reading_text, past_paper_text,
  created_by, published_at
) VALUES
(
  'demo-task-diag', 'assessment', 'diagnostic', ${sqlStr(classEn)}, 'English',
  'Term 1 Diagnostic', 'Baseline diagnostic for personalisation', 'medium',
  'published', 2700, ${sqlStr(JSON.stringify(diagContent))},
  ${sqlStr(readingPassage)}, '', ${sqlStr(teacherId)}, datetime('now', '-21 days')
),
(
  'demo-task-hw', 'homework', NULL, ${sqlStr(classEn)}, 'English',
  'Relative clauses & weekend writing', 'Homework on relative clauses', 'medium',
  'published', NULL, ${sqlStr(JSON.stringify(hwContent))},
  '', '', ${sqlStr(teacherId)}, datetime('now', '-10 days')
),
(
  'demo-task-hw2', 'homework', NULL, ${sqlStr(classEn)}, 'English',
  'Cohesion & linkers homework', 'Practise paragraph linkers', 'medium',
  'published', NULL, ${sqlStr(JSON.stringify(cohesionContent))},
  '', '', ${sqlStr(teacherId)}, datetime('now', '-3 days')
),
(
  'demo-task-form', 'assessment', 'formative', ${sqlStr(classEn)}, 'English',
  'Phrasal verbs & formal tone', 'Quick formative assessment', 'easy',
  'published', 900, ${sqlStr(JSON.stringify(formContent))},
  '', '', ${sqlStr(teacherId)}, datetime('now', '-5 days')
),
(
  'demo-task-sum', 'assessment', 'summative', ${sqlStr(classEn)}, 'English',
  'Mid-term writing & grammar check', 'Summative mid-term assessment', 'hard',
  'published', 2400, ${sqlStr(JSON.stringify(summativeContent))},
  ${sqlStr(climatePassage)}, '', ${sqlStr(teacherId)}, datetime('now', '-2 days')
),
(
  'demo-task-cefr', 'assessment', 'english_level', ${sqlStr(classEn)}, 'English',
  'English level assessment', 'CEFR diagnostic for the class', 'medium',
  'published', 3600, ${sqlStr(JSON.stringify(englishLevelContent))},
  '', '', ${sqlStr(teacherId)}, datetime('now', '-14 days')
),
(
  'demo-task-speed', 'assessment', 'reading_speed', ${sqlStr(classEn)}, 'English',
  'September reading speed', 'Natural-pace reading speed check', 'medium',
  'published', NULL, ${sqlStr(JSON.stringify(readingSpeedContent))},
  ${sqlStr(readingPassage)}, '', ${sqlStr(teacherId)}, datetime('now', '-7 days')
),
(
  'demo-task-ielts-hw', 'homework', NULL, ${sqlStr(classIelts)}, 'English',
  'IELTS Task 2 outline practice', 'Plan an opinion essay', 'hard',
  'published', NULL, ${sqlStr(
    JSON.stringify({
      title: 'IELTS Task 2 outline practice',
      instructions: 'Outline an opinion essay on whether university should be free.',
      questions: [
        shortWritten('demo-q-i1', 'Write a 4-paragraph outline with a clear thesis.', 'IELTS Task 2 structure'),
        shortWritten('demo-q-i2', 'Paraphrase this prompt in one sentence: "University education should be free for everyone."', 'paraphrasing'),
      ],
    }),
  )},
  '', 'Sample past-paper style: Discuss both views and give your opinion.',
  ${sqlStr(teacherId)}, datetime('now', '-3 days')
),
(
  'demo-task-draft', 'homework', NULL, ${sqlStr(classEn)}, 'English',
  'Draft: conditionals pack', 'Not yet published', 'medium',
  'draft', NULL, ${sqlStr(
    JSON.stringify({
      title: 'Draft: conditionals pack',
      instructions: 'Upcoming homework on conditionals.',
      questions: [cloze('demo-q-dr1', 'If I _____ (be) you, I would revise tonight.', 'conditionals', ['were'])],
    }),
  )},
  '', '', ${sqlStr(teacherId)}, NULL
);
`)

  // Assignments — whole class for most; individual for formative (half the class)
  const publishedTasks = [
    'demo-task-diag',
    'demo-task-hw',
    'demo-task-hw2',
    'demo-task-cefr',
    'demo-task-speed',
    'demo-task-sum',
    'demo-task-ielts-hw',
  ]
  for (const tid of publishedTasks) {
    lines.push(
      `INSERT INTO task_assignments (id, task_id, student_id) VALUES (${sqlStr('demo-asg-' + tid)}, ${sqlStr(tid)}, NULL);`,
    )
  }
  for (const s of studentsEn.slice(0, 4)) {
    lines.push(
      `INSERT INTO task_assignments (id, task_id, student_id) VALUES (${sqlStr('demo-asg-form-' + s.id)}, 'demo-task-form', ${sqlStr(s.id)});`,
    )
  }

  // Attempts with varied scores across ~3–4 weeks
  const attemptSpecs = [
    ...studentsEn.map((s, i) => ({
      id: `demo-att-diag-${s.id}`,
      task: 'demo-task-diag',
      student: s.id,
      score: [72, 88, 65, 48, 94, 70, 81, 55][i],
      daysAgo: 20 - (i % 3),
      flagged: i === 3 ? 1 : 0,
      focus: i === 3 ? 2 : 0,
      rich: s.id === 'demo-stu-ava',
    })),
    ...studentsEn.slice(0, 6).map((s, i) => ({
      id: `demo-att-hw-${s.id}`,
      task: 'demo-task-hw',
      student: s.id,
      score: [78, 91, 60, 52, 97, 74][i],
      daysAgo: 8,
      flagged: 0,
      focus: 0,
      rich: s.id === 'demo-stu-ava',
    })),
    ...studentsEn.slice(0, 5).map((s, i) => ({
      id: `demo-att-hw2-${s.id}`,
      task: 'demo-task-hw2',
      student: s.id,
      score: [82, 88, 68, 57, 95][i],
      daysAgo: 2,
      flagged: 0,
      focus: 0,
      rich: false,
    })),
    ...studentsEn.slice(0, 4).map((s, i) => ({
      id: `demo-att-form-${s.id}`,
      task: 'demo-task-form',
      student: s.id,
      score: [66, 85, 71, 58][i],
      daysAgo: 4,
      flagged: 0,
      focus: 0,
      rich: false,
    })),
    ...studentsEn.slice(0, 6).map((s, i) => ({
      id: `demo-att-sum-${s.id}`,
      task: 'demo-task-sum',
      student: s.id,
      score: [75, 90, 62, 50, 96, 71][i],
      daysAgo: 1,
      flagged: 0,
      focus: 0,
      rich: s.id === 'demo-stu-ava',
    })),
    ...studentsIelts.map((s, i) => ({
      id: `demo-att-ielts-${s.id}`,
      task: 'demo-task-ielts-hw',
      student: s.id,
      score: [73, 62][i],
      daysAgo: 2,
      flagged: 0,
      focus: 0,
      rich: false,
    })),
  ]

  function richDiagAnswers() {
    return {
      'demo-q-d1': 'She is an engineer.',
      'demo-q-d2': ['rains'],
      'demo-q-d3':
        'I enjoy football because it is exciting. The player who scored last week inspired me. I also like baking for my team after matches.',
      'demo-q-d4': 'Because she talks to people every day.',
      'demo-q-d5': 'The cake was made by my mum.',
    }
  }

  function richDiagFeedback(score) {
    return {
      'demo-q-d1': {
        correct: true,
        feedback: 'Correct — an before a vowel sound.',
        topic: 'article usage',
        marksAwarded: 1,
        marksPossible: 1,
      },
      'demo-q-d2': {
        correct: true,
        feedback: 'Good — first conditional uses present simple after if.',
        topic: 'conditionals',
        marksAwarded: 1,
        marksPossible: 1,
      },
      'demo-q-d3': {
        correct: score >= 70,
        feedback:
          'Clear hobby focus. Try one more relative clause and check article use before countable nouns.',
        topic: 'extended response',
        marksAwarded: score >= 70 ? 2 : 1,
        marksPossible: 3,
      },
      'demo-q-d4': {
        correct: true,
        feedback: 'Accurate — she learns quickly because she talks to people every day.',
        topic: 'reading_comprehension',
        marksAwarded: 4,
        marksPossible: 4,
      },
      'demo-q-d5': {
        correct: true,
        feedback: 'Passive form is correct.',
        topic: 'passive voice',
        marksAwarded: 1,
        marksPossible: 1,
      },
      overview: {
        correct: score >= 70,
        feedback:
          score >= 85
            ? 'Strong diagnostic — stretch into longer writing with relative clauses.'
            : score >= 70
              ? 'Solid baseline. Relative clauses and articles remain priorities.'
              : 'Review the marked topics carefully before the next homework.',
        topic: 'overall',
        marksAwarded: Math.round(score / 10),
        marksPossible: 10,
      },
    }
  }

  function richHwAnswers() {
    return {
      'demo-q-h1': 'The book that I bought is excellent.',
      'demo-q-h2': ['since'],
      'demo-q-h3':
        'My perfect weekend starts with a football match on Saturday morning. After that I bake cookies for my teammates who always ask for chocolate ones. On Sunday I watch a K-drama and write a short match report for the school blog.',
    }
  }

  function richHwFeedback(score) {
    return {
      'demo-q-h1': {
        correct: true,
        feedback: 'Correct identification of the relative clause.',
        topic: 'relative clauses',
        marksAwarded: 1,
        marksPossible: 1,
      },
      'demo-q-h2': {
        correct: true,
        feedback: 'since + point in time — well done.',
        topic: 'prepositions',
        marksAwarded: 1,
        marksPossible: 1,
      },
      'demo-q-h3': {
        correct: score >= 75,
        feedback:
          'Engaging and on-topic. Add one more linker between sentences for cohesion (e.g. Afterwards / Meanwhile).',
        topic: 'paragraph cohesion',
        marksAwarded: score >= 75 ? 3 : 2,
        marksPossible: 3,
      },
      overview: {
        correct: score >= 70,
        feedback: 'Strong homework. Keep building relative clauses into longer paragraphs.',
        topic: 'overall',
        marksAwarded: Math.round(score / 10),
        marksPossible: 10,
      },
    }
  }

  for (const a of attemptSpecs) {
    let answers = { note: 'demo answers' }
    let feedback = {
      overview: {
        correct: a.score >= 70,
        feedback:
          a.score >= 85
            ? 'Strong work overall.'
            : a.score >= 70
              ? 'Solid — keep practising weakspots.'
              : 'Review the marked topics carefully.',
        topic: 'overall',
        marksAwarded: Math.round(a.score / 10),
        marksPossible: 10,
      },
    }

    if (a.rich && a.task === 'demo-task-diag') {
      answers = richDiagAnswers()
      feedback = richDiagFeedback(a.score)
    } else if (a.rich && a.task === 'demo-task-hw') {
      answers = richHwAnswers()
      feedback = richHwFeedback(a.score)
    } else if (a.rich && a.task === 'demo-task-sum') {
      answers = {
        'demo-q-s1': 'My brother, who lives in Madrid, is visiting.',
        'demo-q-s2': 'The results were somewhat inconclusive.',
        'demo-q-s3':
          'School sports may help students stay healthy, although not everyone enjoys competition. It appears that optional clubs could work better for some learners. Schools might offer a mix of team sports and individual activities so more students participate.',
        'demo-q-s4': 'They must balance protecting nature with the cost of parks versus apartments.',
      }
      feedback = {
        'demo-q-s1': {
          correct: true,
          feedback: 'Correct non-defining relative clause.',
          topic: 'relative clauses',
          marksAwarded: 1,
          marksPossible: 1,
        },
        'demo-q-s2': {
          correct: true,
          feedback: 'Most formal option selected.',
          topic: 'formal register',
          marksAwarded: 1,
          marksPossible: 1,
        },
        'demo-q-s3': {
          correct: true,
          feedback: 'Good hedging (may / appears / might). Clear argument structure.',
          topic: 'hedging language',
          marksAwarded: 3,
          marksPossible: 3,
        },
        'demo-q-s4': {
          correct: true,
          feedback: 'Accurate reading of the trade-off.',
          topic: 'reading_comprehension',
          marksAwarded: 4,
          marksPossible: 4,
        },
        overview: {
          correct: true,
          feedback: 'Excellent mid-term performance — ready for stretch writing tasks.',
          topic: 'overall',
          marksAwarded: Math.round(a.score / 10),
          marksPossible: 10,
        },
      }
    }

    lines.push(`
INSERT INTO attempts (
  id, task_id, student_id, started_at, submitted_at, duration_ms,
  answers_json, score_pct, feedback_json, topic_tags_json,
  focus_leave_count, flagged, status
) VALUES (
  ${sqlStr(a.id)},
  ${sqlStr(a.task)},
  ${sqlStr(a.student)},
  datetime('now', '-${a.daysAgo} days', '-40 minutes'),
  datetime('now', '-${a.daysAgo} days'),
  ${20 * 60 * 1000 + a.score * 1000},
  ${sqlStr(JSON.stringify(answers))},
  ${a.score},
  ${sqlStr(JSON.stringify(feedback))},
  ${sqlStr(JSON.stringify(['grammar', 'writing']))},
  ${a.focus},
  ${a.flagged},
  'submitted'
);`)
  }

  // Sam: in-progress homework for Continue CTA
  lines.push(`
INSERT INTO attempts (
  id, task_id, student_id, started_at, answers_json, status
) VALUES (
  'demo-att-hw-open', 'demo-task-hw', 'demo-stu-sam',
  datetime('now', '-1 hours'),
  ${sqlStr(JSON.stringify({ 'demo-q-h1': 'The book that I bought is excellent.' }))},
  'in_progress'
);
`)

  // Reading materials
  lines.push(`
INSERT INTO reading_materials (id, teacher_id, class_id, student_id, title, body, word_count) VALUES
(
  'demo-mat-maya', ${sqlStr(teacherId)}, ${sqlStr(classEn)}, NULL,
  'Maya''s London flat', ${sqlStr(readingPassage)}, 78
),
(
  'demo-mat-climate', ${sqlStr(teacherId)}, ${sqlStr(classEn)}, NULL,
  'Why cities need green space', ${sqlStr(climatePassage)}, 72
),
(
  'demo-mat-football', ${sqlStr(teacherId)}, ${sqlStr(classEn)}, NULL,
  'Academy match day', ${sqlStr(footballPassage)}, 68
),
(
  'demo-mat-ielts-uni', ${sqlStr(teacherId)}, ${sqlStr(classIelts)}, NULL,
  'Should university be free?',
  ${sqlStr(
    'Some people argue that university education should be free for everyone because society benefits from skilled graduates. Others believe students who pay fees take their studies more seriously. In many countries, governments already fund primary and secondary school. Extending that support to university could reduce inequality, but it would require higher taxes. A balanced approach might offer free tuition for priority subjects while keeping fees for others.',
  )},
  84
),
(
  'demo-mat-ava-own', NULL, ${sqlStr(classEn)}, 'demo-stu-ava',
  'My football match report',
  ${sqlStr(
    'On Sunday our team played against Riverside. The first half was slow, but after half-time we scored twice. I assisted the second goal. The crowd was loud and the referee was fair. We won 2–1 and everyone celebrated.',
  )},
  48
),
(
  'demo-mat-noah-own', NULL, ${sqlStr(classEn)}, 'demo-stu-noah',
  'Chess tournament notes',
  ${sqlStr(
    'At the weekend tournament I played four games. In round two I used a Sicilian defence that surprised my opponent. I lost on time in the final, which taught me to manage the clock more carefully.',
  )},
  42
);
`)

  for (const [i, s] of studentsEn.slice(0, 7).entries()) {
    const wpm = s.wpm
    lines.push(`
INSERT INTO reading_speed_attempts (
  id, student_id, task_id, material_id, attempt_id, wpm, word_count,
  duration_seconds, started_at, completed_at, status, checks_correct, checks_total, flagged
) VALUES (
  ${sqlStr('demo-rsa-' + s.id)},
  ${sqlStr(s.id)},
  'demo-task-speed',
  'demo-mat-maya',
  NULL,
  ${wpm},
  78,
  ${Math.round((78 / wpm) * 60)},
  datetime('now', '-${6 - (i % 5)} days', '-5 minutes'),
  datetime('now', '-${6 - (i % 5)} days'),
  'completed',
  ${i === 3 ? 2 : 3}, 3, 0
);`)
  }

  lines.push(`
INSERT INTO reading_machine_sessions (
  id, student_id, material_id, wpm_setting, words_read, word_count, duration_seconds, completed
) VALUES
  ('demo-rms-1', 'demo-stu-ava', 'demo-mat-maya', 190, 78, 78, 25, 1),
  ('demo-rms-2', 'demo-stu-noah', 'demo-mat-climate', 240, 72, 72, 18, 1),
  ('demo-rms-3', 'demo-stu-zoe', 'demo-mat-climate', 320, 40, 72, 8, 0),
  ('demo-rms-4', 'demo-stu-ava', 'demo-mat-ava-own', 180, 48, 48, 16, 1),
  ('demo-rms-5', 'demo-stu-ava', 'demo-mat-football', 175, 68, 68, 23, 1),
  ('demo-rms-6', 'demo-stu-mia', 'demo-mat-climate', 160, 72, 72, 27, 1),
  ('demo-rms-7', 'demo-stu-rui', 'demo-mat-ielts-uni', 200, 84, 84, 25, 1);
`)

  lines.push(`
INSERT INTO story_events (id, student_id, story_slug, event_type, created_at) VALUES
  ('demo-se-1', 'demo-stu-ava', 'a1-1-mayas-new-home', 'open', datetime('now', '-2 days')),
  ('demo-se-2', 'demo-stu-ava', 'a1-1-mayas-new-home', 'play', datetime('now', '-2 days')),
  ('demo-se-3', 'demo-stu-leo', 'a2-1-the-camping-trip', 'open', datetime('now', '-1 days')),
  ('demo-se-4', 'demo-stu-zoe', 'c1-1-the-interview', 'open', datetime('now', '-3 days')),
  ('demo-se-5', 'demo-stu-zoe', 'c1-1-the-interview', 'play', datetime('now', '-3 days')),
  ('demo-se-6', 'demo-stu-mia', 'b1-2-a-big-decision', 'open', datetime('now', '-4 days')),
  ('demo-se-7', 'demo-stu-kai', 'b1-1-the-day-everything-went-wrong', 'open', datetime('now', '-5 days')),
  ('demo-se-8', 'demo-stu-iris', 'b2-1-the-startups-last-chance', 'open', datetime('now', '-6 days')),
  ('demo-se-9', 'demo-stu-sam', 'a2-2-lenas-birthday-surprise', 'open', datetime('now', '-2 days'));
`)

  // Broader CEFR completion
  for (const s of [
    { id: 'demo-stu-ava', level: 'B1', score: 42, max: 70 },
    { id: 'demo-stu-noah', level: 'B2', score: 51, max: 70 },
    { id: 'demo-stu-mia', level: 'B1', score: 39, max: 70 },
    { id: 'demo-stu-zoe', level: 'C1', score: 58, max: 70 },
    { id: 'demo-stu-leo', level: 'A2', score: 28, max: 70 },
    { id: 'demo-stu-kai', level: 'B1', score: 40, max: 70 },
    { id: 'demo-stu-iris', level: 'B2', score: 49, max: 70 },
    { id: 'demo-stu-sam', level: 'A2', score: 30, max: 70 },
  ]) {
    const testId = `demo-cefr-${s.id}`
    lines.push(`
INSERT INTO cefr_tests (
  id, student_id, task_id, attempt_id, status, item_ids, form_index,
  started_at, completed_at, time_limit_seconds, total_score, max_score, cefr_level, over_time_seconds
) VALUES (
  ${sqlStr(testId)},
  ${sqlStr(s.id)},
  'demo-task-cefr',
  NULL,
  'completed',
  ${sqlStr(JSON.stringify(['vocab-A1-0', 'grammar-A1-0', 'reading-B1-0']))},
  0,
  datetime('now', '-14 days'),
  datetime('now', '-14 days', '+55 minutes'),
  3600,
  ${s.score},
  ${s.max},
  ${sqlStr(s.level)},
  0
);`)
  }

  // ── Lessons ──────────────────────────────────────────────────────────────
  const enBatchStart = dateDaysAgo(21) // ~3 weeks ago
  const ieltsBatchStart = dateDaysAgo(10)

  const enLessonTitles = [
    { title: 'Relative clauses — who / which / that', career: 'sports journalism match reports' },
    { title: 'Articles in context', career: undefined },
    { title: 'Paragraph cohesion & linkers', career: 'travel writing blogs' },
    { title: 'Passive voice for processes', career: 'software release notes' },
    { title: 'Phrasal verbs in narratives', career: undefined },
    { title: 'Conditionals for choices', career: 'game narrative design' },
    { title: 'Formal register & hedging', career: 'debate / law arguments' },
    { title: 'Reading for detail — climate texts', career: undefined },
  ]

  // Generate Mon/Wed schedule for 4 weeks (8 lessons)
  const enLessons = []
  {
    let cursor = nextWeekdayOnOrAfter(enBatchStart, 1) // Monday
    let week = 1
    let seq = 0
    for (let i = 0; i < 8; i++) {
      const meta = enLessonTitles[i]
      enLessons.push({
        id: `demo-lesson-en-${i + 1}`,
        week,
        seq,
        date: ymd(cursor),
        day: dayName(cursor),
        title: meta.title,
        plan: lessonPlan({
          learningObjective: `Students can apply skills from “${meta.title}” in short written production.`,
          careerContext: meta.career,
          activityStyle: meta.career ? 'communicative' : i % 2 === 0 ? 'communicative' : 'traditional',
          materials: ['Mini-whiteboard', 'Model text', 'Guidelight task link'],
          homeworkOptional: i < 7 ? 'Complete related Guidelight homework questions.' : 'Revise for mid-term check.',
        }),
      })
      seq++
      if (i % 2 === 0) {
        // next is Wednesday of same week
        cursor = new Date(cursor)
        cursor.setDate(cursor.getDate() + 2)
      } else {
        // next Monday
        week++
        seq = 0
        cursor = new Date(cursor)
        cursor.setDate(cursor.getDate() + 5)
      }
    }
  }

  lines.push(`
INSERT INTO lesson_batches (
  id, teacher_id, class_id, subject, curriculum, age_range, duration_minutes,
  weekly_frequency, days_of_week, resources_json, weeks, start_date, title, created_at
) VALUES (
  'demo-batch-en',
  ${sqlStr(teacherId)},
  ${sqlStr(classEn)},
  'English',
  'Cambridge Secondary',
  '14–15',
  45,
  2,
  ${sqlStr(JSON.stringify(['Monday', 'Wednesday']))},
  ${sqlStr(JSON.stringify(['Cambridge coursebook Unit 3–4', 'Guidelight homework packs']))},
  4,
  ${sqlStr(enBatchStart)},
  'Term 1 — Grammar & writing foundations',
  datetime('now', '-22 days')
);
`)

  for (const L of enLessons) {
    lines.push(`
INSERT INTO lessons (
  id, batch_id, week_index, sequence_index, scheduled_date, day_of_week, title, plan_json, created_at
) VALUES (
  ${sqlStr(L.id)},
  'demo-batch-en',
  ${L.week},
  ${L.seq},
  ${sqlStr(L.date)},
  ${sqlStr(L.day)},
  ${sqlStr(L.title)},
  ${sqlStr(JSON.stringify(L.plan))},
  datetime('now', '-22 days')
);`)
  }

  const ieltsLessons = [
    {
      id: 'demo-lesson-ielts-1',
      week: 1,
      seq: 0,
      offsetDays: 0,
      title: 'Task 2 thesis & outline',
      plan: lessonPlan({
        learningObjective: 'Students can write a clear thesis and 4-paragraph outline for an opinion essay.',
        activityStyle: 'traditional',
        materials: ['Band descriptors', 'Model outline', 'Prompt cards'],
        careerContext: 'study-abroad application essays',
        presentation: {
          durationMins: 12,
          steps: ['Review band 6 vs 7 thesis examples.', 'Board the 4-paragraph skeleton.'],
          teacherNotes: 'Emphasise paraphrase of the prompt in the intro.',
        },
        practice: {
          durationMins: 15,
          steps: ['Pairs complete a gapped outline for a free-university prompt.', 'Compare with model.'],
        },
        production: {
          durationMins: 15,
          steps: ['Solo: write thesis + topic sentences for a new prompt.', 'Peer feedback on clarity.'],
        },
        plenary: 'Share one strong thesis aloud.',
        homeworkOptional: 'Finish Guidelight IELTS Task 2 outline homework.',
      }),
    },
    {
      id: 'demo-lesson-ielts-2',
      week: 1,
      seq: 1,
      offsetDays: 3,
      title: 'Paraphrasing the prompt',
      plan: lessonPlan({
        learningObjective: 'Students can paraphrase an IELTS prompt without copying key phrases.',
        activityStyle: 'communicative',
        materials: ['Synonym ladders', 'Timer'],
        presentation: {
          durationMins: 8,
          steps: ['Show weak vs strong paraphrases.', 'Elicit synonym strategies.'],
        },
        practice: {
          durationMins: 18,
          steps: ['Rotate prompt cards; rewrite in one sentence.', 'Vote on clearest paraphrase.'],
        },
        production: {
          durationMins: 12,
          steps: ['Write intro paraphrase + thesis for homework prompt.'],
        },
      }),
    },
    {
      id: 'demo-lesson-ielts-3',
      week: 2,
      seq: 0,
      offsetDays: 7,
      title: 'Listening section 3 — note grids',
      plan: lessonPlan({
        learningObjective: 'Students can track two speakers’ views using a note grid.',
        activityStyle: 'traditional',
        materials: ['Audio clip', 'Note-grid handout'],
        presentation: {
          durationMins: 10,
          steps: ['Preview section 3 question types.', 'Model note-grid with pause.'],
        },
        practice: {
          durationMins: 20,
          steps: ['Listen twice; complete grid.', 'Check in pairs.'],
        },
        production: {
          durationMins: 10,
          steps: ['Write a 3-sentence summary of the discussion.'],
        },
        plenary: 'One tip for catching speaker disagreement.',
      }),
    },
  ]

  lines.push(`
INSERT INTO lesson_batches (
  id, teacher_id, class_id, subject, curriculum, age_range, duration_minutes,
  weekly_frequency, days_of_week, resources_json, weeks, start_date, title, created_at
) VALUES (
  'demo-batch-ielts',
  ${sqlStr(teacherId)},
  ${sqlStr(classIelts)},
  'English',
  'IELTS Academic',
  '16–18',
  60,
  2,
  ${sqlStr(JSON.stringify(['Tuesday', 'Friday']))},
  ${sqlStr(JSON.stringify(['Cambridge IELTS 18', 'Band descriptor posters']))},
  2,
  ${sqlStr(ieltsBatchStart)},
  'IELTS Writing & Listening sprint',
  datetime('now', '-11 days')
);
`)

  for (const L of ieltsLessons) {
    const d = new Date(ieltsBatchStart + 'T12:00:00')
    d.setDate(d.getDate() + L.offsetDays)
    lines.push(`
INSERT INTO lessons (
  id, batch_id, week_index, sequence_index, scheduled_date, day_of_week, title, plan_json, created_at
) VALUES (
  ${sqlStr(L.id)},
  'demo-batch-ielts',
  ${L.week},
  ${L.seq},
  ${sqlStr(ymd(d))},
  ${sqlStr(dayName(d))},
  ${sqlStr(L.title)},
  ${sqlStr(JSON.stringify(L.plan))},
  datetime('now', '-11 days')
);`)
  }

  // ── Exam profiles & mock exams ─────────────────────────────────────────
  const gradeBoundaries = [
    { grade: '9', minPct: 90 },
    { grade: '8', minPct: 80 },
    { grade: '7', minPct: 70 },
    { grade: '6', minPct: 60 },
    { grade: '5', minPct: 50 },
    { grade: '4', minPct: 40, pass: true },
    { grade: '3', minPct: 30 },
  ]
  const examFormat = {
    sections: [
      {
        name: 'Section A',
        questionTypes: ['mcq', 'cloze', 'short_written'],
        questionCount: 8,
        marks: 40,
      },
      {
        name: 'Section B',
        questionTypes: ['reading_comprehension', 'extended_written'],
        questionCount: 4,
        marks: 60,
      },
    ],
  }

  const dojoPaper1Content = {
    title: 'Cambridge Secondary — Grammar & reading practice',
    instructions: 'Answer all questions. You have 40 minutes.',
    questions: [
      mcq(
        'demo-dq1-1',
        'Choose the correct relative pronoun.',
        'relative clauses',
        ['who', 'whomst', 'whats', 'whose'],
        'who',
      ),
      mcq(
        'demo-dq1-2',
        'Select the passive sentence.',
        'passive voice',
        [
          'The coach chose the captain.',
          'The captain was chosen by the coach.',
          'The captain choosing the team.',
          'Choose the captain now.',
        ],
        'The captain was chosen by the coach.',
      ),
      cloze('demo-dq1-3', 'She has lived here _____ 2019.', 'prepositions', ['since']),
      shortWritten(
        'demo-dq1-4',
        'Write 50–70 words describing a school event using at least one relative clause.',
        'relative clauses',
      ),
      readingComp(
        'demo-dq1-5',
        'According to the football passage, what was the final score?',
        'reading_comprehension',
      ),
    ],
  }

  const dojoPaper2Content = {
    title: 'Mid-year English skills paper',
    instructions: 'Focus on accuracy and clear explanations.',
    questions: [
      mcq(
        'demo-dq2-1',
        'Which linker shows contrast?',
        'paragraph cohesion',
        ['Moreover', 'However', 'Likewise', 'Firstly'],
        'However',
      ),
      cloze(
        'demo-dq2-2',
        'If players _____ (train) harder, they will improve.',
        'conditionals',
        ['train'],
      ),
      mcq(
        'demo-dq2-3',
        'Most formal rewrite of “kinda cool”:',
        'formal register',
        ['pretty cool', 'somewhat impressive', 'super cool', 'coolish'],
        'somewhat impressive',
      ),
      shortWritten(
        'demo-dq2-4',
        'Explain in 40–60 words why green space matters in cities. Use one hedge.',
        'hedging language',
      ),
    ],
  }

  const dojoPaper3Content = {
    title: 'Reading & vocabulary stretch',
    instructions: 'Read carefully; check academic vocabulary.',
    questions: [
      readingComp(
        'demo-dq3-1',
        'What benefit of outdoor play is mentioned in the climate passage?',
        'reading_comprehension',
      ),
      mcq(
        'demo-dq3-2',
        'Best synonym for “hypothesis” in a science text:',
        'academic vocabulary',
        ['guess party', 'testable idea', 'random joke', 'final proof'],
        'testable idea',
      ),
      shortWritten(
        'demo-dq3-3',
        'Summarise the climate passage in 3 sentences using academic vocabulary.',
        'academic vocabulary',
      ),
    ],
  }

  const mockPaper1Content = {
    ...dojoPaper1Content,
    title: 'Cambridge Secondary — Mock 1',
  }
  const mockPaper2Content = {
    ...dojoPaper2Content,
    title: 'Mid-year English skills — Mock 2',
  }
  const mockPaper3Content = {
    ...dojoPaper3Content,
    title: 'Reading & vocabulary — Mock 3',
  }

  lines.push(`
INSERT INTO exam_profiles (
  id, class_id, created_by, title, subject, curriculum, syllabus_code,
  duration_seconds, exam_format_json, grade_boundaries_json, rubric_json,
  reference_past_paper_text, source_file_name, pass_grade, target_grade, status,
  created_at, updated_at
) VALUES (
  'demo-exam-en', ${sqlStr(classEn)}, ${sqlStr(teacherId)},
  'Cambridge Secondary English', 'English', 'Cambridge Secondary', '0475',
  2400,
  ${sqlStr(JSON.stringify(examFormat))},
  ${sqlStr(JSON.stringify(gradeBoundaries))},
  ${sqlStr(JSON.stringify({ general: 'Mark extended answers for clarity, accuracy, and use of relative clauses where relevant.' }))},
  ${sqlStr(footballPassage)},
  'cambridge-grammar-reading-sep.pdf',
  '4', '8', 'active',
  datetime('now', '-18 days'), datetime('now', '-18 days')
);

INSERT INTO tasks (
  id, type, subtype, class_id, subject, title, description, difficulty,
  status, time_limit_seconds, content_json, reading_text, past_paper_text,
  exam_profile_id, created_by, created_at, published_at
) VALUES
(
  'demo-mock-en-1', 'assessment', 'mock_exam', ${sqlStr(classEn)}, 'English',
  'Cambridge Secondary — Mock 1', 'Timed mock exam', 'medium',
  'published', 2400, ${sqlStr(JSON.stringify(mockPaper1Content))}, '', '',
  'demo-exam-en', ${sqlStr(teacherId)}, datetime('now', '-18 days'), datetime('now', '-17 days')
),
(
  'demo-mock-en-2', 'assessment', 'mock_exam', ${sqlStr(classEn)}, 'English',
  'Mid-year English skills — Mock 2', 'Timed mock exam', 'medium',
  'published', 2100, ${sqlStr(JSON.stringify(mockPaper2Content))}, '', '',
  'demo-exam-en', ${sqlStr(teacherId)}, datetime('now', '-12 days'), datetime('now', '-11 days')
),
(
  'demo-mock-en-3', 'assessment', 'mock_exam', ${sqlStr(classEn)}, 'English',
  'Reading & vocabulary — Mock 3', 'Timed mock exam', 'medium',
  'published', 1800, ${sqlStr(JSON.stringify(mockPaper3Content))}, '', '',
  'demo-exam-en', ${sqlStr(teacherId)}, datetime('now', '-6 days'), datetime('now', '-5 days')
);

INSERT INTO task_assignments (id, task_id, student_id) VALUES
  ('demo-mock-en-1-assign', 'demo-mock-en-1', NULL),
  ('demo-mock-en-2-assign', 'demo-mock-en-2', NULL),
  ('demo-mock-en-3-assign', 'demo-mock-en-3', NULL);
`)

  const mockAttempts = [
    { id: 'demo-matt-p1-ava', task: 'demo-mock-en-1', student: 'demo-stu-ava', score: 76, daysAgo: 16 },
    { id: 'demo-matt-p1-noah', task: 'demo-mock-en-1', student: 'demo-stu-noah', score: 88, daysAgo: 16 },
    { id: 'demo-matt-p1-mia', task: 'demo-mock-en-1', student: 'demo-stu-mia', score: 64, daysAgo: 15 },
    { id: 'demo-matt-p1-leo', task: 'demo-mock-en-1', student: 'demo-stu-leo', score: 51, daysAgo: 15 },
    { id: 'demo-matt-p1-zoe', task: 'demo-mock-en-1', student: 'demo-stu-zoe', score: 94, daysAgo: 14 },
    { id: 'demo-matt-p1-kai', task: 'demo-mock-en-1', student: 'demo-stu-kai', score: 70, daysAgo: 14 },
    { id: 'demo-matt-p1-iris', task: 'demo-mock-en-1', student: 'demo-stu-iris', score: 82, daysAgo: 13 },
    { id: 'demo-matt-p2-ava', task: 'demo-mock-en-2', student: 'demo-stu-ava', score: 81, daysAgo: 10 },
    { id: 'demo-matt-p2-noah', task: 'demo-mock-en-2', student: 'demo-stu-noah', score: 85, daysAgo: 10 },
    { id: 'demo-matt-p2-zoe', task: 'demo-mock-en-2', student: 'demo-stu-zoe', score: 92, daysAgo: 9 },
    { id: 'demo-matt-p2-mia', task: 'demo-mock-en-2', student: 'demo-stu-mia', score: 69, daysAgo: 9 },
    { id: 'demo-matt-p2-iris', task: 'demo-mock-en-2', student: 'demo-stu-iris', score: 78, daysAgo: 8 },
    { id: 'demo-matt-p3-ava', task: 'demo-mock-en-3', student: 'demo-stu-ava', score: 79, daysAgo: 4 },
    { id: 'demo-matt-p3-noah', task: 'demo-mock-en-3', student: 'demo-stu-noah', score: 91, daysAgo: 4 },
    { id: 'demo-matt-p3-zoe', task: 'demo-mock-en-3', student: 'demo-stu-zoe', score: 97, daysAgo: 3 },
  ]

  for (const a of mockAttempts) {
    const feedback = {
      overview: {
        correct: a.score >= 70,
        feedback:
          a.score >= 85
            ? 'Excellent mock exam — maintain this pace.'
            : a.score >= 70
              ? 'Solid paper. Revisit flagged topics before the next mock.'
              : 'Review weak topics and reattempt when ready.',
        topic: 'overall',
        marksAwarded: Math.round(a.score / 10),
        marksPossible: 10,
      },
    }
    lines.push(`
INSERT INTO attempts (
  id, task_id, student_id, started_at, submitted_at, duration_ms,
  answers_json, score_pct, feedback_json, topic_tags_json, attempt_archive_md, status
) VALUES (
  ${sqlStr(a.id)},
  ${sqlStr(a.task)},
  ${sqlStr(a.student)},
  datetime('now', '-${a.daysAgo} days', '-35 minutes'),
  datetime('now', '-${a.daysAgo} days'),
  ${30 * 60 * 1000 + a.score * 500},
  ${sqlStr(JSON.stringify({ note: 'demo mock answers' }))},
  ${a.score},
  ${sqlStr(JSON.stringify(feedback))},
  ${sqlStr(JSON.stringify(['grammar', 'reading']))},
  ${sqlStr(`# Mock exam attempt archive\n\nScore: ${a.score}%\nTask: ${a.task}\n`)},
  'submitted'
);`)
  }

  // ── Insight events ───────────────────────────────────────────────────────
  lines.push(`
INSERT INTO insight_events (
  id, teacher_id, class_id, student_id, name, event_date, description, created_at
) VALUES
(
  'demo-evt-parents',
  ${sqlStr(teacherId)},
  ${sqlStr(classEn)},
  NULL,
  'Parents evening',
  ${sqlStr(dateDaysAgo(12))},
  'Shared diagnostic results and reading-speed targets with families.',
  datetime('now', '-12 days')
),
(
  'demo-evt-relative',
  ${sqlStr(teacherId)},
  ${sqlStr(classEn)},
  NULL,
  'Relative clauses workshop',
  ${sqlStr(dateDaysAgo(9))},
  'Whole-class workshop after diagnostic cluster errors on who/which/that.',
  datetime('now', '-9 days')
),
(
  'demo-evt-midterm',
  ${sqlStr(teacherId)},
  ${sqlStr(classEn)},
  NULL,
  'Mid-term assessment week',
  ${sqlStr(dateDaysAgo(2))},
  'Summative writing & grammar check sat by most of Year 10.',
  datetime('now', '-2 days')
),
(
  'demo-evt-leo',
  ${sqlStr(teacherId)},
  NULL,
  'demo-stu-leo',
  'Focus check-in with Leo',
  ${sqlStr(dateDaysAgo(19))},
  'Discussed flagged diagnostic attempt and set short tense-consistency goals.',
  datetime('now', '-19 days')
),
(
  'demo-evt-ava',
  ${sqlStr(teacherId)},
  NULL,
  'demo-stu-ava',
  'Ava reading goal set',
  ${sqlStr(dateDaysAgo(6))},
  'Agreed RSVP target ~190 wpm and weekly football-themed writing.',
  datetime('now', '-6 days')
);
`)

  // Reports
  lines.push(`
INSERT INTO reports (id, teacher_id, student_id, class_id, content, teacher_notes, created_at, updated_at) VALUES
(
  'demo-report-ava',
  ${sqlStr(teacherId)},
  'demo-stu-ava',
  ${sqlStr(classEn)},
  ${sqlStr(
    '## Progress note — Ava C.\n\nAva has improved on homework completion and is reading more confidently at B1. Continue relative-clause drills and keep football-themed prompts for engagement.\n\n**Exam readiness:** Three mock exams completed (avg ~79%) — pass/target probability estimates are unlocked.\n\n**Next steps:** two short writing tasks with model paragraphs; RSVP practice at ~190 wpm.',
  )},
  'Parents evening draft',
  datetime('now', '-1 days'),
  datetime('now', '-1 days')
),
(
  'demo-report-class',
  ${sqlStr(teacherId)},
  NULL,
  ${sqlStr(classEn)},
  ${sqlStr(
    '## Year 10 English — class snapshot\n\nAverage homework scores sit around the mid-70s. Stronger writers (Zoe, Noah, Iris) can mentor peers on cohesion. Priority whole-class focus: relative clauses and article usage.\n\nReading speed ranges from ~130–270 wpm; recommend weekly RSVP for students below 160.\n\nLesson batch “Grammar & writing foundations” is underway (Mon/Wed). Mock exams are published for independent practice with exam readiness tracking.',
  )},
  '',
  datetime('now', '-2 days'),
  datetime('now', '-2 days')
),
(
  'demo-report-rui',
  ${sqlStr(teacherId)},
  'demo-stu-rui',
  ${sqlStr(classIelts)},
  ${sqlStr(
    '## Progress note — Rui H.\n\nRui is on track for IELTS 6.5 with clear effort on Task 2. Paraphrasing still copies prompt language — daily warm-ups recommended.\n\n**Next steps:** complete another Dojo Task 2 sit; practise Listening section 3 note grids with Jin.',
  )},
  '',
  datetime('now', '-1 days'),
  datetime('now', '-1 days')
);
`)

  return lines.join('\n')
}

function runWranglerSql(sql) {
  const dir = mkdtempSync(join(tmpdir(), 'guidelight-demo-'))
  const file = join(dir, 'demo.sql')
  writeFileSync(file, sql, 'utf8')
  const wranglerArgs = [
    'd1',
    'execute',
    'guidelight',
    ...(remote ? ['--remote'] : ['--local']),
    '--file',
    file,
    '--yes',
  ]
  console.log(`Running: wrangler ${wranglerArgs.join(' ')}`)
  const res = spawnSync('npx', ['wrangler', ...wranglerArgs], {
    stdio: 'inherit',
    cwd: ROOT,
  })
  try {
    unlinkSync(file)
  } catch {
    /* ignore */
  }
  if (res.status !== 0) process.exit(res.status ?? 1)
}

async function main() {
  if (cmd === 'wipe') {
    console.log(`Wiping demo data (${remote ? 'remote' : 'local'})…`)
    runWranglerSql(wipeSql())
    console.log('Demo data wiped.')
    return
  }

  console.log(`Seeding demo data (${remote ? 'remote' : 'local'})…`)
  const sql = await seedSql()
  runWranglerSql(sql)
  console.log(`
Demo data ready (${remote ? 'remote' : 'local'}).

Teacher:  demo@guidelight.test / ${PASSWORD}
Students: demo.ava, demo.noah, demo.mia, demo.leo, demo.zoe,
          demo.kai, demo.iris, demo.sam, demo.rui, demo.jin
Password: ${PASSWORD}

Wipe later with: npm run db:demo:wipe${remote ? '' : ':local'}
`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
