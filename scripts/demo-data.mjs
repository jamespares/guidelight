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
DELETE FROM attempts WHERE id LIKE 'demo-%' OR student_id LIKE 'demo-%' OR task_id LIKE 'demo-%';
DELETE FROM task_assignments WHERE id LIKE 'demo-%' OR task_id LIKE 'demo-%' OR student_id LIKE 'demo-%';
DELETE FROM reports WHERE id LIKE 'demo-%' OR teacher_id LIKE 'demo-%';
DELETE FROM reading_materials WHERE id LIKE 'demo-%' OR class_id LIKE 'demo-%' OR teacher_id LIKE 'demo-%';
DELETE FROM tasks WHERE id LIKE 'demo-%' OR created_by LIKE 'demo-%' OR class_id LIKE 'demo-%';
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
        { topic: 'relative clauses', count: 4 },
        { topic: 'article usage', count: 3 },
      ],
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
        { topic: 'passive voice', count: 5 },
        { topic: 'formal register', count: 2 },
      ],
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
        { topic: 'paragraph cohesion', count: 3 },
        { topic: 'phrasal verbs', count: 4 },
      ],
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
        { topic: 'tense consistency', count: 6 },
        { topic: 'spelling', count: 3 },
      ],
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
      weakspots: [{ topic: 'hedging language', count: 2 }],
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
        { topic: 'conditionals', count: 4 },
        { topic: 'listening detail', count: 3 },
      ],
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
      weakspots: [{ topic: 'academic vocabulary', count: 5 }],
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
        { topic: 'word order', count: 3 },
        { topic: 'prepositions', count: 4 },
      ],
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
        { topic: 'IELTS Task 2 structure', count: 3 },
        { topic: 'paraphrasing', count: 4 },
      ],
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
      weakspots: [{ topic: 'IELTS Listening section 3', count: 5 }],
      cefr: 'B1',
      wpm: 172,
      summary:
        'Jin is solid on reading but loses marks in Listening section 3 discussions. Multi-speaker practice with note grids recommended.',
    },
  ]

  const allStudents = [...studentsEn, ...studentsIelts]

  const readingPassage = `Maya moved to London last year. Her new flat has three rooms and a small kitchen. Every morning she walks to the park with her dog. On Saturdays she meets her friends at a cafe near the river. She says the city is busy but beautiful, and she is learning English quickly because she talks to people every day.`

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
    cloze(
      'demo-q-h2',
      'She has lived here _____ 2019.',
      'prepositions',
      ['since'],
    ),
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

  const lines = []
  lines.push('-- Guidelight demo seed (ids prefixed demo-)')
  lines.push(wipeSql())

  lines.push(`
INSERT INTO teachers (id, email, password_hash, name) VALUES (
  ${sqlStr(teacherId)},
  'demo@guidelight.test',
  ${sqlStr(hash)},
  'Demo Teacher'
);

INSERT INTO classes (id, teacher_id, name, subject, curriculum, age_range, student_count) VALUES
  (${sqlStr(classEn)}, ${sqlStr(teacherId)}, 'Year 10 English', 'English', 'Cambridge Secondary', '14–15', ${studentsEn.length}),
  (${sqlStr(classIelts)}, ${sqlStr(teacherId)}, 'IELTS Prep', 'English', 'IELTS Academic', '16–18', ${studentsIelts.length});
`)

  for (const s of allStudents) {
    const classId = studentsEn.some((x) => x.id === s.id) ? classEn : classIelts
    lines.push(`
INSERT INTO students (
  id, class_id, display_name, interests, career_ambitions, weakspots,
  username, password_hash, ai_summary, cefr_level, latest_wpm
) VALUES (
  ${sqlStr(s.id)},
  ${sqlStr(classId)},
  ${sqlStr(s.name)},
  ${sqlStr(s.interests)},
  ${sqlStr(s.career)},
  ${sqlStr(JSON.stringify(s.weakspots))},
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
  'demo-task-form', 'assessment', 'formative', ${sqlStr(classEn)}, 'English',
  'Phrasal verbs & formal tone', 'Quick formative assessment', 'easy',
  'published', 900, ${sqlStr(JSON.stringify(formContent))},
  '', '', ${sqlStr(teacherId)}, datetime('now', '-5 days')
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
    'demo-task-cefr',
    'demo-task-speed',
    'demo-task-ielts-hw',
  ]
  for (const tid of publishedTasks) {
    lines.push(
      `INSERT INTO task_assignments (id, task_id, student_id) VALUES (${sqlStr('demo-asg-' + tid)}, ${sqlStr(tid)}, NULL);`,
    )
  }
  // Formative to first 4 EN students only
  for (const s of studentsEn.slice(0, 4)) {
    lines.push(
      `INSERT INTO task_assignments (id, task_id, student_id) VALUES (${sqlStr('demo-asg-form-' + s.id)}, 'demo-task-form', ${sqlStr(s.id)});`,
    )
  }

  // Attempts with varied scores
  const attemptSpecs = [
    // diagnostic — most students submitted
    ...studentsEn.map((s, i) => ({
      id: `demo-att-diag-${s.id}`,
      task: 'demo-task-diag',
      student: s.id,
      score: [72, 88, 65, 48, 94, 70, 81, 55][i],
      daysAgo: 20 - (i % 3),
      flagged: i === 3 ? 1 : 0,
      focus: i === 3 ? 2 : 0,
    })),
    // homework
    ...studentsEn.slice(0, 6).map((s, i) => ({
      id: `demo-att-hw-${s.id}`,
      task: 'demo-task-hw',
      student: s.id,
      score: [78, 91, 60, 52, 97, 74][i],
      daysAgo: 8,
      flagged: 0,
      focus: 0,
    })),
    // formative
    ...studentsEn.slice(0, 4).map((s, i) => ({
      id: `demo-att-form-${s.id}`,
      task: 'demo-task-form',
      student: s.id,
      score: [66, 85, 71, 58][i],
      daysAgo: 4,
      flagged: 0,
      focus: 0,
    })),
    // IELTS hw
    ...studentsIelts.map((s, i) => ({
      id: `demo-att-ielts-${s.id}`,
      task: 'demo-task-ielts-hw',
      student: s.id,
      score: [73, 62][i],
      daysAgo: 2,
      flagged: 0,
      focus: 0,
    })),
  ]

  for (const a of attemptSpecs) {
    const feedback = {
      overview: {
        correct: a.score >= 70,
        feedback: a.score >= 85 ? 'Strong work overall.' : a.score >= 70 ? 'Solid — keep practising weakspots.' : 'Review the marked topics carefully.',
        topic: 'overall',
        marksAwarded: Math.round(a.score / 10),
        marksPossible: 10,
      },
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
  ${sqlStr(JSON.stringify({ note: 'demo answers' }))},
  ${a.score},
  ${sqlStr(JSON.stringify(feedback))},
  ${sqlStr(JSON.stringify(['grammar', 'writing']))},
  ${a.focus},
  ${a.flagged},
  'submitted'
);`)
  }

  // One in-progress attempt
  lines.push(`
INSERT INTO attempts (
  id, task_id, student_id, started_at, answers_json, status
) VALUES (
  'demo-att-hw-open', 'demo-task-hw', 'demo-stu-sam',
  datetime('now', '-1 hours'), '{}', 'in_progress'
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
  'Why cities need green space',
  ${sqlStr(
    'Cities around the world are planting trees along busy streets and turning empty lots into parks. Green space cools neighbourhoods, improves air quality, and gives people a place to rest. Studies show that children who play outside concentrate better in class. However, building parks costs money, and some developers prefer apartments. Communities that plan carefully can protect nature while still growing.',
  )},
  72
),
(
  'demo-mat-ava-own', NULL, ${sqlStr(classEn)}, 'demo-stu-ava',
  'My football match report',
  ${sqlStr(
    'On Sunday our team played against Riverside. The first half was slow, but after half-time we scored twice. I assisted the second goal. The crowd was loud and the referee was fair. We won 2–1 and everyone celebrated.',
  )},
  48
);
`)

  // Reading speed attempts (completed for several students)
  for (const [i, s] of studentsEn.slice(0, 5).entries()) {
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
  datetime('now', '-${6 - i} days', '-5 minutes'),
  datetime('now', '-${6 - i} days'),
  'completed',
  3, 3, 0
);`)
  }

  // Reading machine sessions
  lines.push(`
INSERT INTO reading_machine_sessions (
  id, student_id, material_id, wpm_setting, words_read, word_count, duration_seconds, completed
) VALUES
  ('demo-rms-1', 'demo-stu-ava', 'demo-mat-maya', 190, 78, 78, 25, 1),
  ('demo-rms-2', 'demo-stu-noah', 'demo-mat-climate', 240, 72, 72, 18, 1),
  ('demo-rms-3', 'demo-stu-zoe', 'demo-mat-climate', 320, 40, 72, 8, 0),
  ('demo-rms-4', 'demo-stu-ava', 'demo-mat-ava-own', 180, 48, 48, 16, 1);
`)

  // Story engagement
  lines.push(`
INSERT INTO story_events (id, student_id, story_slug, event_type, created_at) VALUES
  ('demo-se-1', 'demo-stu-ava', 'a1-1-mayas-new-home', 'open', datetime('now', '-2 days')),
  ('demo-se-2', 'demo-stu-ava', 'a1-1-mayas-new-home', 'play', datetime('now', '-2 days')),
  ('demo-se-3', 'demo-stu-leo', 'a2-1-the-camping-trip', 'open', datetime('now', '-1 days')),
  ('demo-se-4', 'demo-stu-zoe', 'c1-1-the-interview', 'open', datetime('now', '-3 days')),
  ('demo-se-5', 'demo-stu-zoe', 'c1-1-the-interview', 'play', datetime('now', '-3 days')),
  ('demo-se-6', 'demo-stu-mia', 'b1-2-a-big-decision', 'open', datetime('now', '-4 days'));
`)

  // Lightweight completed CEFR test records (results only — enough for UI/roster)
  for (const s of [
    { id: 'demo-stu-ava', level: 'B1', score: 42, max: 70 },
    { id: 'demo-stu-noah', level: 'B2', score: 51, max: 70 },
    { id: 'demo-stu-zoe', level: 'C1', score: 58, max: 70 },
    { id: 'demo-stu-leo', level: 'A2', score: 28, max: 70 },
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
  ${sqlStr(JSON.stringify(['vocab-A1-0', 'vocab-A1-0']))},
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

  // Reports
  lines.push(`
INSERT INTO reports (id, teacher_id, student_id, class_id, content, teacher_notes, created_at, updated_at) VALUES
(
  'demo-report-ava',
  ${sqlStr(teacherId)},
  'demo-stu-ava',
  ${sqlStr(classEn)},
  ${sqlStr(
    '## Progress note — Ava C.\n\nAva has improved on homework completion and is reading more confidently at B1. Continue relative-clause drills and keep football-themed prompts for engagement.\n\n**Next steps:** two short writing tasks with model paragraphs; RSVP practice at ~190 wpm.',
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
    '## Year 10 English — class snapshot\n\nAverage recent assessment scores sit around the mid-70s. Stronger writers (Zoe, Noah, Iris) can mentor peers on cohesion. Priority whole-class focus: relative clauses and article usage.\n\nReading speed ranges from ~130–270 wpm; recommend weekly RSVP for students below 160.',
  )},
  '',
  datetime('now', '-2 days'),
  datetime('now', '-2 days')
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
