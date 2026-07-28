// Generate src/data/items.ts from standards/cefr_standards_a1_c2.json.
// Run with: node scripts/generate-items.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const VOCAB_PER_LEVEL = 10;

const standards = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'standards/cefr_standards_a1_c2.json'), 'utf8')
);

function shuffle(array, rng = Math.random) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickN(items, n, rng = Math.random) {
  const shuffled = shuffle(items, rng);
  return shuffled.slice(0, n);
}

function escapeTsString(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function generateVocabItems(level) {
  const vocab = standards.levels[level].vocabulary;
  const allWords = [
    ...(vocab.nouns || []),
    ...(vocab.verbs || []),
    ...(vocab.adjectives || []),
    ...(vocab.adverbs || []),
  ];
  const selected = pickN(allWords, VOCAB_PER_LEVEL);
  const allGlosses = allWords.map((w) => w.gloss);

  return selected.map((word, idx) => {
    const correct = word.gloss;
    const distractors = [];
    while (distractors.length < 3) {
      const candidate = allGlosses[Math.floor(Math.random() * allGlosses.length)];
      if (candidate !== correct && !distractors.includes(candidate)) {
        distractors.push(candidate);
      }
    }
    const options = shuffle([correct, ...distractors]);
    return {
      id: `vocab-${level}-${idx}`,
      level,
      skill: 'vocabulary',
      type: 'mcq',
      prompt: `What does "${word.word}" mean?`,
      options,
      correct,
      maxScore: 1,
    };
  });
}

const GRAMMAR_CLOZE = {
  A1: [
    { prompt: 'She ____ a teacher.', options: ['is', 'am', 'are', 'be'], correct: 'is' },
    { prompt: 'I ____ got two sisters.', options: ['have', 'has', 'had', 'having'], correct: 'have' },
    { prompt: '____ your books. Don\'t run.', options: ['Open', 'Opening', 'To open', 'Opened'], correct: 'Open' },
    { prompt: '____ a bank near here.', options: ["There's", 'There', 'There are', 'There is a'], correct: "There's" },
  ],
  A2: [
    { prompt: 'I ____ a film last night.', options: ['watched', 'watch', 'watching', 'watches'], correct: 'watched' },
    { prompt: 'It ____ cold yesterday.', options: ['was', 'were', 'is', 'been'], correct: 'was' },
    { prompt: 'My car is ____ than yours.', options: ['faster', 'fast', 'more fast', 'fastest'], correct: 'faster' },
    { prompt: 'You ____ see a doctor.', options: ['should', 'must', 'have to', 'could'], correct: 'should' },
  ],
  B1: [
    { prompt: '____ you ever been to Japan?', options: ['Have', 'Has', 'Did', 'Are'], correct: 'Have' },
    { prompt: 'If it rains, we ____ stay home.', options: ['will', 'would', 'stayed', 'stay'], correct: 'will' },
    { prompt: 'The man ____ lives next door is a teacher.', options: ['who', 'which', 'that', 'whose'], correct: 'who' },
    { prompt: 'English ____ spoken here.', options: ['is', 'was', 'has been', 'being'], correct: 'is' },
  ],
};

function generateGrammarItems(level) {
  const items = GRAMMAR_CLOZE[level] || [];
  return items.map((it, idx) => ({
    id: `grammar-${level}-${idx}`,
    level,
    skill: 'grammar',
    type: 'cloze',
    prompt: it.prompt,
    options: shuffle(it.options),
    correct: it.correct,
    maxScore: 1,
  }));
}

// Extended reading passages: one per level, five gaps each. Gap options are
// drawn from the level's vocabulary band so range is tested in context.
const READING_PASSAGES = {
  A1: {
    passage:
      'My name is Marco. I live in a small __(1)__ near the park. Every morning, I drink __(2)__ and eat bread for breakfast. My __(3)__ is a teacher; she works in a school. I have a __(4)__; it is black and white. In the evening, we sit at the __(5)__ and eat dinner together.',
    gaps: [
      { options: ['house', 'water', 'door', 'table'], correct: 'house' },
      { options: ['milk', 'bread', 'apple', 'egg'], correct: 'milk' },
      { options: ['mother', 'dog', 'chair', 'room'], correct: 'mother' },
      { options: ['dog', 'book', 'door', 'garden'], correct: 'dog' },
      { options: ['table', 'bed', 'grass', 'school'], correct: 'table' },
    ],
  },
  A2: {
    passage:
      'Last Saturday, I went to the __(1)__ with my friends. We took the bus at nine o\'clock. The weather was __(2)__ and hot. We swam in the sea and __(3)__ volleyball on the sand. In the evening, we ate pizza in a small __(4)__ near the beach. We were very __(5)__, but we had a great day.',
    gaps: [
      { options: ['beach', 'school', 'shop', 'library'], correct: 'beach' },
      { options: ['sunny', 'rainy', 'cloudy', 'windy'], correct: 'sunny' },
      { options: ['played', 'watched', 'cooked', 'cleaned'], correct: 'played' },
      { options: ['restaurant', 'hospital', 'office', 'station'], correct: 'restaurant' },
      { options: ['tired', 'angry', 'bored', 'scared'], correct: 'tired' },
    ],
  },
  B1: {
    passage:
      'I\'ve lived in this city __(1)__ ten years. When I first __(2)__ here, I didn\'t know anyone, but I\'ve made many friends since then. Last month, I __(3)__ a new job at a hospital. The work is interesting, __(4)__ the hours are quite long. I\'ve never __(5)__ so tired, but I\'m enjoying the challenge.',
    gaps: [
      { options: ['for', 'since', 'from', 'until'], correct: 'for' },
      { options: ['arrived', 'decided', 'borrowed', 'promised'], correct: 'arrived' },
      { options: ['found', 'lost', 'forgot', 'broke'], correct: 'found' },
      { options: ['although', 'because', 'so', 'if'], correct: 'although' },
      { options: ['felt', 'heard', 'said', 'wrote'], correct: 'felt' },
    ],
  },
  B2: {
    passage:
      'Living in a big city has many advantages, but it also has some serious __(1)__. Public transport is cheap and efficient, so you don\'t need a car. __(2)__, the cost of housing is extremely high, and many young people cannot __(3)__ to buy their own home. In __(4)__, city life can be stressful because of the noise and pollution. __(5)__, I believe the opportunities for work and culture make it worthwhile.',
    gaps: [
      { options: ['disadvantages', 'advantages', 'benefits', 'opportunities'], correct: 'disadvantages' },
      { options: ['However', 'Therefore', 'Moreover', 'Similarly'], correct: 'However' },
      { options: ['afford', 'allow', 'avoid', 'arrange'], correct: 'afford' },
      { options: ['addition', 'contrast', 'conclusion', 'comparison'], correct: 'addition' },
      { options: ['Overall', 'Instead', 'Meanwhile', 'Otherwise'], correct: 'Overall' },
    ],
  },
  C1: {
    passage:
      'Working from home has become increasingly common in recent years. For many employees, it offers greater __(1)__ and saves hours of commuting each week. On the other hand, some people find it __(2)__ because they miss the social interaction of the office. There are also concerns about productivity, as home environments can be full of __(3)__. A recent study __(4)__ that workers were most effective when they split their time between home and office. __(5)__, a hybrid model seems to suit the majority of employees.',
    gaps: [
      { options: ['flexibility', 'responsibility', 'difficulty', 'salary'], correct: 'flexibility' },
      { options: ['isolating', 'exciting', 'rewarding', 'amusing'], correct: 'isolating' },
      { options: ['distractions', 'attractions', 'instructions', 'descriptions'], correct: 'distractions' },
      { options: ['concluded', 'pretended', 'refused', 'doubted'], correct: 'concluded' },
      { options: ['Consequently', 'Nevertheless', 'Conversely', 'Regardless'], correct: 'Consequently' },
    ],
  },
  C2: {
    passage:
      'The assertion that technology has rendered communication effortless yet somehow less meaningful __(1)__ careful scrutiny. On one hand, digital platforms have __(2)__ the constraints of geography, enabling instant exchange across continents. On the other hand, the sheer __(3)__ of messages we send may have __(4)__ their individual significance; a thousand casual texts scarcely equal one heartfelt letter. Whether this constitutes a genuine loss or merely an __(5)__ in the nature of intimacy remains an open question.',
    gaps: [
      { options: ['merits', 'denies', 'ignores', 'avoids'], correct: 'merits' },
      { options: ['transcended', 'reinforced', 'obstructed', 'diminished'], correct: 'transcended' },
      { options: ['volume', 'quality', 'absence', 'simplicity'], correct: 'volume' },
      { options: ['eroded', 'enhanced', 'celebrated', 'guaranteed'], correct: 'eroded' },
      { options: ['evolution', 'illusion', 'obstacle', 'invention'], correct: 'evolution' },
    ],
  },
};

function generateReadingItems(level) {
  const data = READING_PASSAGES[level];
  if (!data) return [];
  const passageId = `reading-${level}`;
  return data.gaps.map((gap, idx) => ({
    id: `reading-${level}-${idx + 1}`,
    level,
    skill: 'reading',
    type: 'reading',
    prompt: `Gap ${idx + 1}`,
    passageId,
    gapIndex: idx + 1,
    options: shuffle(gap.options),
    correct: gap.correct,
    maxScore: 1,
  }));
}

// Dictation: one sentence per level. The transcript is what the student must type.
const DICTATION = {
  A1: 'My mother drinks milk every morning.',
  A2: 'We went to the beach last weekend and swam in the sea.',
  B1: "I've lived in this city for ten years and I've made many friends.",
  B2: 'Many young people cannot afford to buy their own home in big cities.',
  C1: 'A recent study concluded that workers were most effective when they split their time between home and office.',
  C2: 'The sheer volume of messages we send may have eroded their individual significance.',
};

function generateDictationItems(level) {
  const transcript = DICTATION[level];
  if (!transcript) return [];
  return [
    {
      id: `dictation-${level}-0`,
      level,
      skill: 'listening',
      type: 'dictation',
      prompt: 'Listen and type exactly what you hear.',
      audioKey: `audio/dictation-${level}.mp3`,
      transcript,
      maxScore: 3,
    },
  ];
}

// Listening comprehension: one spoken passage per level with two questions.
const LISTENING_PASSAGES = {
  A1: {
    text: 'Hello! My name is Anna. I am ten years old. I have a dog. It is black and white. Every day after school, I play with my dog in the garden.',
    questions: [
      { prompt: 'How old is Anna?', options: ['Ten', 'Eight', 'Twelve', 'Six'], correct: 'Ten' },
      { prompt: 'What animal does Anna have?', options: ['A dog', 'A cat', 'A bird', 'A fish'], correct: 'A dog' },
    ],
  },
  A2: {
    text: "Hi Tom, it's Lisa. Thanks for your message. The party is on Saturday at seven o'clock at my house. Can you bring some juice? See you there!",
    questions: [
      { prompt: 'When is the party?', options: ['Saturday', 'Sunday', 'Friday', 'Monday'], correct: 'Saturday' },
      { prompt: 'What should Tom bring?', options: ['Some juice', 'A cake', 'Some bread', 'Music'], correct: 'Some juice' },
    ],
  },
  B1: {
    text: "When I first moved to Manchester, I didn't know anyone. I joined a football club near my house, and that's how I made my first friends. We play every Sunday morning, and afterwards we usually have breakfast together in a café near the park.",
    questions: [
      { prompt: 'How did the speaker make friends?', options: ['By joining a football club', 'At work', 'At school', 'Through family'], correct: 'By joining a football club' },
      { prompt: 'What do they do after playing?', options: ['Have breakfast together', 'Go to work', 'Watch a film', 'Go shopping'], correct: 'Have breakfast together' },
    ],
  },
  B2: {
    text: 'Our company introduced a four-day week six months ago, and the results have been surprising. Productivity has actually increased, and staff report much lower stress levels. The main challenge has been scheduling meetings, since everyone has a different day off.',
    questions: [
      { prompt: 'What has happened to productivity?', options: ['It has increased', 'It has decreased', 'It has stayed the same', 'It is unknown'], correct: 'It has increased' },
      { prompt: 'What is the main challenge?', options: ['Scheduling meetings', 'Paying salaries', 'Hiring staff', 'Training employees'], correct: 'Scheduling meetings' },
    ],
  },
  C1: {
    text: 'Critics of remote learning often argue that students miss out on the social aspects of education. While this concern is valid, it overlooks the fact that many learners thrive without the distractions of a busy classroom. The real issue is not location but engagement: a disengaged student will struggle whether they are sitting in a lecture hall or watching from their bedroom.',
    questions: [
      { prompt: 'According to the speaker, what is the real issue?', options: ['Engagement', 'Location', 'Technology', 'Cost'], correct: 'Engagement' },
      { prompt: 'What does the speaker say about critics?', options: ['Their concern is valid but incomplete', 'They are completely wrong', 'They ignore technology', 'They focus too much on cost'], correct: 'Their concern is valid but incomplete' },
    ],
  },
  C2: {
    text: 'The notion that convenience inevitably improves our lives deserves rigorous challenge. Each technological shortcut we adopt quietly erodes a skill we once possessed: navigation apps have atrophied our sense of direction, and autocorrect has blunted our spelling. Whether this trade is worth making depends less on the technology than on our willingness to remain deliberate users of it.',
    questions: [
      { prompt: 'What does the speaker say technology erodes?', options: ['Skills we once had', 'Our free time', 'Our relationships', 'Our health'], correct: 'Skills we once had' },
      { prompt: 'What does the trade depend on?', options: ['Remaining deliberate users', 'The price of devices', 'Government rules', 'Faster internet'], correct: 'Remaining deliberate users' },
    ],
  },
};

function generateListeningItems(level) {
  const data = LISTENING_PASSAGES[level];
  if (!data) return [];
  const passageId = `listening-${level}`;
  return data.questions.map((q, idx) => ({
    id: `listening-${level}-${idx}`,
    level,
    skill: 'listening',
    type: 'listening',
    prompt: q.prompt,
    passageId,
    audioKey: `audio/${passageId}.mp3`,
    audioText: data.text,
    options: shuffle(q.options),
    correct: q.correct,
    maxScore: 1,
  }));
}

/* ---------------- Audio manifest (for scripts/generate-audio.py) ---------------- */

// Edge TTS neural voices per level — distinct, clear voices; slower rate for lower levels.
const EDGE_VOICES = {
  A1: { voice: 'en-US-AriaNeural', rate: '-20%' },
  A2: { voice: 'en-US-JennyNeural', rate: '-10%' },
  B1: { voice: 'en-GB-SoniaNeural', rate: '+0%' },
  B2: { voice: 'en-GB-RyanNeural', rate: '+0%' },
  C1: { voice: 'en-US-GuyNeural', rate: '+0%' },
  C2: { voice: 'en-GB-LibbyNeural', rate: '+0%' },
};

function buildAudioManifest() {
  const manifest = [];
  for (const level of LEVELS) {
    const { voice, rate } = EDGE_VOICES[level];
    if (DICTATION[level]) {
      manifest.push({ key: `audio/dictation-${level}.mp3`, text: DICTATION[level], voice, rate });
    }
    if (LISTENING_PASSAGES[level]) {
      manifest.push({ key: `audio/listening-${level}.mp3`, text: LISTENING_PASSAGES[level].text, voice, rate });
    }
  }
  return manifest;
}

const WRITTEN_PROMPTS = {
  A1: [
    {
      prompt: 'Introduce yourself. Write 2–3 sentences. Say your name, where you live, and one thing you like.',
      keywords: ['name', 'live', 'like'],
    },
    {
      prompt: 'Describe your family. Write 2–3 sentences. Say who is in your family.',
      keywords: ['family', 'mother', 'father', 'brother', 'sister'],
    },
  ],
  A2: [
    {
      prompt: 'Write 3–4 sentences about your last weekend. What did you do?',
      keywords: ['weekend', 'went', 'visited', 'watched', 'saw', 'Saturday', 'Sunday'],
    },
    {
      prompt: 'Describe your favourite place (e.g. a park, café, or room). Write 3–4 sentences.',
      keywords: ['favourite', 'place', 'because', 'big', 'small', 'nice'],
    },
  ],
  B1: [
    {
      prompt: 'Write a short email (4–5 sentences) to a friend about a film you saw recently. Say what it was about and whether you liked it.',
      keywords: ['film', 'story', 'liked', 'because', 'recommend'],
    },
    {
      prompt: 'You lost something important. Write 4–5 sentences explaining what happened and what you did.',
      keywords: ['lost', 'looked', 'found', 'police', 'worried'],
    },
  ],
  B2: [
    {
      prompt: 'Write 5–6 sentences giving your opinion on whether young people should learn a foreign language at school. Give reasons.',
      keywords: ['opinion', 'language', 'school', 'important', 'learn', 'reasons'],
    },
    {
      prompt: 'Describe the advantages and disadvantages of living in a big city. Write 5–6 sentences.',
      keywords: ['advantages', 'disadvantages', 'city', 'transport', 'expensive', 'however'],
    },
  ],
  C1: [
    {
      prompt: 'Write a short paragraph (80–100 words) discussing the advantages and disadvantages of working from home.',
      keywords: ['advantages', 'disadvantages', 'working', 'home', 'flexible', 'however'],
    },
    {
      prompt: 'Some people say social media has more negative than positive effects. Write 80–100 words giving your view with examples.',
      keywords: ['social', 'media', 'positive', 'negative', 'examples', 'opinion'],
    },
  ],
  C2: [
    {
      prompt: 'Write a short discursive paragraph (100–120 words) on the statement: "Technology has made communication easier but less meaningful." Include examples and a conclusion.',
      keywords: ['technology', 'communication', 'meaningful', 'examples', 'conclusion', 'however'],
    },
    {
      prompt: 'Should governments ban advertising aimed at children? Write 100–120 words arguing your position with reasons and examples.',
      keywords: ['government', 'advertising', 'children', 'reasons', 'examples', 'believe'],
    },
  ],
};

function generateWrittenItems(level) {
  return (WRITTEN_PROMPTS[level] || []).map((it, idx) => ({
    id: `written-${level}-${idx}`,
    level,
    skill: 'writing',
    type: 'written',
    prompt: it.prompt,
    keywords: it.keywords,
    maxScore: 3,
  }));
}

function itemToTs(item) {
  const base = `    id: '${escapeTsString(item.id)}',
    level: '${item.level}',
    skill: '${item.skill}',
    type: '${item.type}',
    prompt: '${escapeTsString(item.prompt)}',
    maxScore: ${item.maxScore}`;
  if (item.type === 'written') {
    return `  {
${base},
    keywords: [${item.keywords.map((k) => `'${escapeTsString(k)}'`).join(', ')}],
  }`;
  }
  if (item.type === 'reading') {
    return `  {
${base},
    passageId: '${escapeTsString(item.passageId)}',
    gapIndex: ${item.gapIndex},
    options: [${item.options.map((o) => `'${escapeTsString(o)}'`).join(', ')}],
    correct: '${escapeTsString(item.correct)}',
  }`;
  }
  if (item.type === 'dictation') {
    return `  {
${base},
    audioKey: '${escapeTsString(item.audioKey)}',
    transcript: '${escapeTsString(item.transcript)}',
  }`;
  }
  if (item.type === 'listening') {
    return `  {
${base},
    passageId: '${escapeTsString(item.passageId)}',
    audioKey: '${escapeTsString(item.audioKey)}',
    audioText: '${escapeTsString(item.audioText)}',
    options: [${item.options.map((o) => `'${escapeTsString(o)}'`).join(', ')}],
    correct: '${escapeTsString(item.correct)}',
  }`;
  }
  return `  {
${base},
    options: [${item.options.map((o) => `'${escapeTsString(o)}'`).join(', ')}],
    correct: '${escapeTsString(item.correct)}',
  }`;
}

const items = [];
for (const level of LEVELS) {
  items.push(...generateVocabItems(level));
}
for (const level of Object.keys(GRAMMAR_CLOZE)) {
  items.push(...generateGrammarItems(level));
}
for (const level of LEVELS) {
  items.push(...generateReadingItems(level));
}
for (const level of LEVELS) {
  items.push(...generateDictationItems(level));
}
for (const level of LEVELS) {
  items.push(...generateListeningItems(level));
}
for (const level of LEVELS) {
  items.push(...generateWrittenItems(level));
}

const passagesTs = Object.entries(READING_PASSAGES)
  .map(([level, data]) => `  'reading-${level}': '${escapeTsString(data.passage)}',`)
  .join('\n');

const typeUnion = `export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Skill = 'vocabulary' | 'grammar' | 'reading' | 'listening' | 'writing';
export type ItemType = 'mcq' | 'cloze' | 'reading' | 'dictation' | 'listening' | 'written';

export interface BaseItem {
  id: string;
  level: CEFRLevel;
  skill: Skill;
  type: ItemType;
  prompt: string;
  maxScore: number;
}

export interface McqItem extends BaseItem {
  type: 'mcq';
  options: string[];
  correct: string;
}

export interface ClozeItem extends BaseItem {
  type: 'cloze';
  options: string[];
  correct: string;
}

export interface ReadingItem extends BaseItem {
  type: 'reading';
  passageId: string;
  gapIndex: number;
  options: string[];
  correct: string;
}

export interface DictationItem extends BaseItem {
  type: 'dictation';
  audioKey: string;
  transcript: string;
}

export interface ListeningItem extends BaseItem {
  type: 'listening';
  passageId: string;
  audioKey: string;
  audioText: string;
  options: string[];
  correct: string;
}

export interface WrittenItem extends BaseItem {
  type: 'written';
  keywords: string[];
}

export type Item = McqItem | ClozeItem | ReadingItem | DictationItem | ListeningItem | WrittenItem;
`;

const output = `// Auto-generated by scripts/generate-items.js. Do not edit manually.
// Source: standards/cefr_standards_a1_c2.json

${typeUnion}

export const PASSAGES: Record<string, string> = {
${passagesTs}
};

export const ITEMS: Item[] = [
${items.map(itemToTs).join(',\n')},
];

export const ITEMS_BY_ID: Record<string, Item> = Object.fromEntries(
  ITEMS.map((item) => [item.id, item])
);

export const LEVEL_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
`;

fs.writeFileSync(path.join(ROOT, 'src/data/items.ts'), output, 'utf8');
console.log(`Generated ${items.length} items in src/data/items.ts`);

// Manifest consumed by scripts/generate-audio.py (Edge TTS → MP3 → R2).
const manifest = buildAudioManifest();
fs.writeFileSync(path.join(ROOT, 'scripts/audio-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Wrote ${manifest.length} audio assets to scripts/audio-manifest.json`);

// CEFR writing rubrics per level (first official writing descriptor of each band)
// — used to anchor AI marking to the standards.
const rubrics = {};
for (const level of LEVELS) {
  const writing = standards.levels[level].competencies?.writing || [];
  rubrics[level] = writing[0] || '';
}
const rubricsTs = `// Auto-generated by scripts/generate-items.js. Do not edit manually.
// Official CEFR writing-production descriptor per level, used as the AI marking rubric anchor.

import type { CEFRLevel } from './items';

export const WRITING_RUBRICS: Record<CEFRLevel, string> = {
${LEVELS.map((l) => `  ${l}: '${rubrics[l].replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`).join('\n')}
};
`;
fs.writeFileSync(path.join(ROOT, 'src/data/rubrics.ts'), rubricsTs, 'utf8');
console.log('Wrote src/data/rubrics.ts');
