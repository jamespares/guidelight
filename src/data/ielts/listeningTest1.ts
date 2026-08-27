/**
 * IELTS Listening Mock Test 1 — complete self-contained content.
 *
 * Authored for Guidelight as an original practice test in the style of the
 * IELTS computer-delivered listening exam: 4 parts, 40 questions, ~30 minutes
 * of audio. The `transcript` lines double as the TTS manifest source
 * (scripts/export-ielts-audio-manifest.mjs -> scripts/generate-ielts-audio.py)
 * and as the review transcript shown on the results page.
 *
 * Voice casting (Edge TTS):
 *   narrator   — exam instructions announcer
 *   part 1     — receptionist (GB F) + Daniel (GB M): social conversation
 *   part 2     — centre manager (AU F): informational monologue
 *   part 3     — Mia (US F) + Tom (GB M): academic discussion
 *   part 4     — lecturer (NZ M): academic monologue
 */

export type Speaker = string

export interface TranscriptLine {
  speaker: Speaker
  text: string
  /** Seconds of silence to insert before this line in the generated audio. */
  pauseBefore?: number
}

/** A line of notes/form/sentence completion: plain text with inline gaps. */
export interface NoteLine {
  segments: (string | { q: number })[]
}

export type QuestionBlock =
  | { type: 'notes'; heading?: string; lines: NoteLine[] }
  | {
      type: 'mcq'
      questions: { q: number; prompt: string; options: string[] }[]
    }
  | {
      type: 'matching'
      bankHeading?: string
      bank: string[]
      items: { q: number; prompt: string }[]
    }

export interface IeltsPart {
  part: 1 | 2 | 3 | 4
  /** Short context sentence shown before listening ("You will hear..."). */
  context: string
  questionRange: [number, number]
  /** Instruction shown above the questions, e.g. the word limit. */
  instruction: string
  audioFile: string
  /** Speaker id -> display name (results-page transcript). */
  speakers: Record<Speaker, string>
  transcript: TranscriptLine[]
  blocks: QuestionBlock[]
}

export type AnswerSpec =
  | { kind: 'choice'; correct: number }
  | { kind: 'text'; accept: string[] }

export interface IeltsListeningTest {
  slug: string
  title: string
  totalQuestions: number
  parts: IeltsPart[]
  answers: Record<number, AnswerSpec>
}

const NARRATOR = 'narrator'

// ---------------------------------------------------------------------------
// Part 1 — City Community College: evening course enrolment (form completion)
// ---------------------------------------------------------------------------

const part1: IeltsPart = {
  part: 1,
  context:
    'a telephone conversation between a student and a college receptionist about enrolling on an evening course.',
  questionRange: [1, 10],
  instruction: 'Complete the form below. Write ONE WORD AND/OR A NUMBER for each answer.',
  audioFile: '/ielts-listening/test-1/part-1.mp3',
  speakers: {
    [NARRATOR]: 'Instructions',
    r: 'Receptionist',
    d: 'Daniel',
  },
  transcript: [
    {
      speaker: NARRATOR,
      text: 'Part one. You will hear a man telephoning a community college to enrol on an evening course. Now listen carefully, and answer questions one to ten.',
    },
    {
      speaker: 'r',
      text: 'Good afternoon, City Community College, admissions office. How can I help you?',
    },
    {
      speaker: 'd',
      text: "Oh, hello. I'd like to enrol on one of your evening courses, please. The one starting this term, if there's still a place.",
    },
    {
      speaker: 'r',
      text: 'Of course. Let me pull up the enrolment form. Could I take your full name, please?',
    },
    { speaker: 'd', text: "It's Daniel Milton." },
    { speaker: 'r', text: 'Is that M, E, L, T, O, N?' },
    {
      speaker: 'd',
      text: "No, it's M, I, L, T, O, N. People always get that wrong.",
    },
    { speaker: 'r', text: 'Got it — Milton with an I. And your address, Daniel?' },
    { speaker: 'd', text: 'I live at forty-eight King Street.' },
    { speaker: 'r', text: 'Is that King, K, I, N, G?' },
    { speaker: 'd', text: "That's right." },
    { speaker: 'r', text: 'Lovely. And the postcode?' },
    { speaker: 'd', text: "It's N, R, two, four, Q, P." },
    {
      speaker: 'r',
      text: 'N, R, two, four, Q, P. Thank you. And a contact phone number?',
    },
    {
      speaker: 'd',
      text: "My mobile is probably best. It's zero, double seven, three, four — zero, eight, two, nine, five, six.",
    },
    {
      speaker: 'r',
      text: 'Perfect. Now, which course were you interested in? We still have places on the Italian for Beginners course, I believe.',
    },
    {
      speaker: 'd',
      text: "Well, I was originally thinking about Italian, but two of my friends have just signed up for Spanish, so I'd like to do Spanish for Beginners, please.",
    },
    {
      speaker: 'r',
      text: "Spanish for Beginners. Let's have a look... The beginners' group used to meet on Tuesdays, but that group is completely full this term, I'm afraid. We've opened up a new group on Thursdays instead.",
    },
    {
      speaker: 'd',
      text: 'Thursday is fine for me, yes. What time does the class run?',
    },
    {
      speaker: 'r',
      text: "It starts at seven thirty in the evening and finishes at nine. There's a short break in the middle.",
    },
    { speaker: 'd', text: 'Seven thirty. That suits me.' },
    {
      speaker: 'r',
      text: "Now, term officially begins on the twenty-sixth of September, but the Spanish group starts a week later than everything else — your first class will be on the third of October.",
    },
    { speaker: 'd', text: 'The third of October, okay.' },
    {
      speaker: 'r',
      text: "As for the fee, the course itself is a hundred and thirty pounds for the twelve weeks, and there's a fifteen-pound charge for materials on top of that — so a hundred and forty-five pounds altogether.",
    },
    {
      speaker: 'd',
      text: 'A hundred and forty-five with everything included? Fine, I can pay by card over the phone if that helps.',
    },
    {
      speaker: 'r',
      text: "It does — I'll take those details in a moment. Oh, and before I forget, last term the class was held in Room twenty, but this term you'll be in Room twelve, which is on the first floor, next to the library.",
    },
    { speaker: 'd', text: 'Room twelve. Brilliant. Thanks very much for your help.' },
    {
      speaker: 'r',
      text: "You're welcome, Daniel. We'll email you a confirmation this afternoon. Goodbye!",
    },
  ],
  blocks: [
    {
      type: 'notes',
      heading: 'CITY COMMUNITY COLLEGE — Evening course enrolment',
      lines: [
        { segments: ['Name: Daniel ', { q: 1 }] },
        { segments: ['Address: 48 ', { q: 2 }, ' Street'] },
        { segments: ['Postcode: ', { q: 3 }] },
        { segments: ['Phone: ', { q: 4 }] },
        { segments: ['Course: ', { q: 5 }, ' for Beginners'] },
        { segments: ['Day: ', { q: 6 }] },
        { segments: ['Class starts at ', { q: 7 }, ' p.m.'] },
        { segments: ['First class: ', { q: 8 }] },
        { segments: ['Total fee: £', { q: 9 }, ' (including materials)'] },
        { segments: ['Room: ', { q: 10 }, ' (first floor)'] },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Part 2 — Riverside Sports Centre induction talk (MCQ + matching)
// ---------------------------------------------------------------------------

const part2: IeltsPart = {
  part: 2,
  context: 'a talk by the manager of a sports centre, welcoming a group of new members.',
  questionRange: [11, 20],
  instruction:
    'Questions 11–15: choose the correct letter, A, B or C. Questions 16–20: match each area of the centre to the correct feature, A–G.',
  audioFile: '/ielts-listening/test-1/part-2.mp3',
  speakers: {
    [NARRATOR]: 'Instructions',
    m: 'Centre manager',
  },
  transcript: [
    {
      speaker: NARRATOR,
      text: 'Part two. You will hear the manager of a sports centre giving an induction talk to new members. Now listen carefully, and answer questions eleven to fifteen.',
    },
    {
      speaker: 'm',
      text: "Good morning, everyone, and a very warm welcome to Riverside Sports Centre. I'll keep this brief, because I know you'd all rather be using the facilities than listening to me.",
    },
    {
      speaker: 'm',
      text: "First, some practical details. Now, our gym staff arrive at six o'clock in the morning to get everything ready, but we actually open the doors to members at half past six. And if you're an early riser, do bear in mind that the first exercise classes of the day don't begin until seven.",
    },
    {
      speaker: 'm',
      text: "If you're driving here, the centre has its own car park. Members can park free of charge for the first two hours — just validate your ticket at reception. After two hours, it's two pounds an hour, so do remember if you're planning a longer session.",
    },
    {
      speaker: 'm',
      text: "A quick word about classes. We run about forty classes a week, everything from spinning to Pilates. In the past you could reserve a place by phoning the reception desk, but I'm afraid we no longer take bookings that way. All class bookings now go through the centre's app — you can book up to seven days in advance, and it's first come, first served.",
    },
    {
      speaker: 'm',
      text: "Now, the café on the first floor. Eventually it will serve hot meals throughout the day, but the kitchen is being completely refitted next month. So, for the time being, I'm afraid it's just hot and cold drinks and a selection of light snacks — sandwiches, fruit, that sort of thing.",
    },
    {
      speaker: 'm',
      text: "One last thing before you look around. Every new member is entitled to a free fitness assessment with one of our qualified instructors — we really recommend it, as it helps you plan your training safely. Personal training sessions after that are extra, I'm afraid, and I'm sorry to say we no longer offer guest passes.",
    },
    {
      speaker: NARRATOR,
      text: 'Before you hear the rest of the talk, you have some time to look at questions sixteen to twenty.',
    },
    {
      speaker: NARRATOR,
      text: 'Now listen, and answer questions sixteen to twenty.',
      pauseBefore: 8,
    },
    {
      speaker: 'm',
      text: "Right, let me tell you quickly about the different areas of the centre, because quite a lot has changed over the summer.",
    },
    {
      speaker: 'm',
      text: "The main gym, on the ground floor, has just been completely refitted — all the running machines and weights are brand new, so you'll find it in excellent condition. I'm sure you'll be impressed.",
    },
    {
      speaker: 'm',
      text: "Our climbing wall is hugely popular, especially with teenagers. For safety reasons, every session is supervised by a qualified instructor, which means you can't just turn up — you'll need to reserve a session at least forty-eight hours ahead, again through the app.",
    },
    {
      speaker: 'm',
      text: "We have six tennis courts. They're out the back of the centre, in the open air, and they're floodlit, so you can play until ten o'clock at night, whatever the season.",
    },
    {
      speaker: 'm',
      text: "Now, I'm afraid there's some bad news about Studio Two, where we normally hold the dance classes. We're having a new floor laid this week, so it's out of action until further notice. All the classes have been moved to Studio One in the meantime.",
    },
    {
      speaker: 'm',
      text: "And finally, the community room next to reception. It's mostly used for meetings during the week, but at weekends you can rent it for children's birthday parties and that sort of event — just speak to reception for the rates.",
    },
    {
      speaker: 'm',
      text: "Right, that's quite enough from me. If you'd like to follow me, we'll start the tour in the main gym...",
    },
  ],
  blocks: [
    {
      type: 'mcq',
      questions: [
        {
          q: 11,
          prompt: 'On weekdays, the centre opens to members at',
          options: ['6.00 a.m.', '6.30 a.m.', '7.00 a.m.'],
        },
        {
          q: 12,
          prompt: 'Members can use the car park',
          options: [
            'free of charge at all times.',
            'free of charge for the first two hours.',
            'at a reduced hourly rate.',
          ],
        },
        {
          q: 13,
          prompt: 'To reserve a place in a class, members must',
          options: [
            'book through the centre’s app.',
            'phone the reception desk.',
            'arrive ten minutes early.',
          ],
        },
        {
          q: 14,
          prompt: 'At the moment, the café',
          options: [
            'serves hot meals throughout the day.',
            'is closed for refurbishment.',
            'offers drinks and light snacks only.',
          ],
        },
        {
          q: 15,
          prompt: 'Every new member is entitled to',
          options: [
            'a free guest pass.',
            'a free personal training session.',
            'a free fitness assessment.',
          ],
        },
      ],
    },
    {
      type: 'matching',
      bankHeading: 'Features',
      bank: [
        'has recently been refurbished',
        'must be booked in advance',
        'is open later than the rest of the centre',
        'is located in the open air',
        'can be hired for private events',
        'is temporarily unavailable',
        'is suitable for complete beginners',
      ],
      items: [
        { q: 16, prompt: 'Main gym' },
        { q: 17, prompt: 'Climbing wall' },
        { q: 18, prompt: 'Tennis courts' },
        { q: 19, prompt: 'Studio Two' },
        { q: 20, prompt: 'Community room' },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Part 3 — Mia and Tom plan their presentation (MCQ + matching)
// ---------------------------------------------------------------------------

const part3: IeltsPart = {
  part: 3,
  context:
    'a discussion between two university students, Mia and Tom, who are preparing a presentation on urban gardening for their environmental studies course.',
  questionRange: [21, 30],
  instruction:
    'Questions 21–25: choose the correct letter, A, B or C. Questions 26–30: who will prepare each part of the presentation — Mia (A), Tom (B), or both (C)?',
  audioFile: '/ielts-listening/test-1/part-3.mp3',
  speakers: {
    [NARRATOR]: 'Instructions',
    mia: 'Mia',
    tom: 'Tom',
  },
  transcript: [
    {
      speaker: NARRATOR,
      text: 'Part three. You will hear two university students, Mia and Tom, discussing a presentation they are preparing together. Now listen carefully, and answer questions twenty-one to twenty-five.',
    },
    {
      speaker: 'mia',
      text: "Hi Tom. Thanks for coming — let's get our presentation plan sorted out. We're on in three weeks, which is a bit scary.",
    },
    {
      speaker: 'tom',
      text: "Hi Mia. Yeah. I still can't quite believe we picked urban gardening. Neither of us even has a garden!",
    },
    {
      speaker: 'mia',
      text: "That's true! But remember, it was that magazine article you showed me, the one about vegetable plots on rooftops in New York. That's what got me interested.",
    },
    {
      speaker: 'tom',
      text: "Oh yes, I'd forgotten that. Well, at least Doctor Patel approved the topic straight away, so we must be doing something right.",
    },
    {
      speaker: 'mia',
      text: "Definitely. Now, the survey. We got forty residents to fill in the questionnaire, which is more than I expected — but that wasn't the interesting bit, was it?",
    },
    {
      speaker: 'tom',
      text: "No. What really struck me was that nearly seventy percent of the people we asked said they'd like to grow some of their own food, if only they had the space. I never imagined the appetite for it would be that strong.",
    },
    {
      speaker: 'mia',
      text: "Me neither. So that leads us to what the presentation should concentrate on. We could talk about the history of urban gardening — it's actually fascinating...",
    },
    {
      speaker: 'tom',
      text: "It is, but we've only got ten minutes. I'd rather we spent the time on what gardening projects do for the people who live nearby — the health benefits, the community side of it.",
    },
    {
      speaker: 'mia',
      text: "Agreed. We'll mention what it costs to set one up, but only briefly, in passing.",
    },
    {
      speaker: 'tom',
      text: "Right. We need some good photographs as well. I looked in the university library — they've got lovely books, but all the images are under copyright.",
    },
    {
      speaker: 'mia',
      text: 'What about the local newspaper? The Echo covered that project on Beech Street.',
    },
    {
      speaker: 'tom',
      text: "They charge for their archive photos, unfortunately. But I found something better: the city council's website has a whole gallery of before-and-after pictures of the Beech Street site, and it's free to use for educational purposes.",
    },
    { speaker: 'mia', text: 'Perfect. Well done, you.' },
    {
      speaker: 'tom',
      text: "Now, when are we going to rehearse? I can't do Tuesday afternoon — I've got my statistics lecture — and Friday lunchtime I'm helping at the open day.",
    },
    {
      speaker: 'mia',
      text: "Tuesday's out for me too; I've got a lab session. What about Wednesday morning? Say ten o'clock, in the library seminar room?",
    },
    { speaker: 'tom', text: "Wednesday morning works for me. I'll book the room tonight." },
    {
      speaker: NARRATOR,
      text: 'Before you hear the rest of the conversation, you have some time to look at questions twenty-six to thirty.',
    },
    {
      speaker: NARRATOR,
      text: 'Now listen, and answer questions twenty-six to thirty.',
      pauseBefore: 8,
    },
    {
      speaker: 'mia',
      text: "Okay, so let's divide up the actual work. Since I found the original article, it makes sense for me to write the introduction — I'm happy to open the presentation too.",
    },
    {
      speaker: 'tom',
      text: "Fine by me. And since I designed the questionnaire, I should be the one to present the survey results — I can explain the charts properly.",
    },
    {
      speaker: 'mia',
      text: "Good. Now, the Beech Street case study — that's the heart of the whole thing. I think we should deliver that section jointly: you talk through the photographs, and I'll present the figures alongside them.",
    },
    {
      speaker: 'tom',
      text: "Agreed, that's much stronger together. What about costs and funding, though? I'm hopeless with spreadsheets, to be honest.",
    },
    {
      speaker: 'mia',
      text: "Well, I did economics last year, so I can put that section together — grant applications, set-up costs, all of that.",
    },
    {
      speaker: 'tom',
      text: "You're a star. And the conclusion? I think the recommendations should come from both of us — it'll look more convincing if we deliver them jointly.",
    },
    {
      speaker: 'mia',
      text: "Absolutely, we'll do the conclusion together. Right, that's everything. See you Wednesday!",
    },
  ],
  blocks: [
    {
      type: 'mcq',
      questions: [
        {
          q: 21,
          prompt: 'Why did the students choose urban gardening as their topic?',
          options: [
            'They both grow vegetables at home.',
            'They were inspired by a magazine article.',
            'Their tutor recommended the topic.',
          ],
        },
        {
          q: 22,
          prompt: 'What surprised the students about their survey?',
          options: [
            'the number of residents who responded',
            'the age range of the respondents',
            'the level of interest in growing food',
          ],
        },
        {
          q: 23,
          prompt: 'The students agree that the presentation should focus on',
          options: [
            'the history of urban gardening.',
            'the benefits for local residents.',
            'the cost of setting up gardens.',
          ],
        },
        {
          q: 24,
          prompt: 'Where will Tom get the photographs for the presentation?',
          options: [
            'from the city council’s website',
            'from a local newspaper’s archive',
            'from books in the university library',
          ],
        },
        {
          q: 25,
          prompt: 'When will the students meet to rehearse?',
          options: ['on Tuesday afternoon', 'on Wednesday morning', 'on Friday lunchtime'],
        },
      ],
    },
    {
      type: 'matching',
      bankHeading: 'Who will prepare each part?',
      bank: ['Mia', 'Tom', 'both Mia and Tom'],
      items: [
        { q: 26, prompt: 'Introduction' },
        { q: 27, prompt: 'Survey results' },
        { q: 28, prompt: 'Beech Street case study' },
        { q: 29, prompt: 'Costs and funding' },
        { q: 30, prompt: 'Conclusion and recommendations' },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Part 4 — Lecture: how cities respond to rising temperatures (note completion)
// ---------------------------------------------------------------------------

const part4: IeltsPart = {
  part: 4,
  context: 'a geography lecture about how cities can respond to rising temperatures.',
  questionRange: [31, 40],
  instruction: 'Complete the notes below. Write ONE WORD ONLY for each answer.',
  audioFile: '/ielts-listening/test-1/part-4.mp3',
  speakers: {
    [NARRATOR]: 'Instructions',
    l: 'Lecturer',
  },
  transcript: [
    {
      speaker: NARRATOR,
      text: 'Part four. You will hear a geography lecturer giving a talk about how cities respond to rising temperatures. Now listen carefully, and answer questions thirty-one to forty.',
    },
    {
      speaker: 'l',
      text: "Good morning, everyone. In today's lecture, we're going to look at urban heat — why cities are warmer than the countryside around them, and what planners are doing about it.",
    },
    {
      speaker: 'l',
      text: "So why do cities get so hot? The main reason is the material we build with. Dark surfaces absorb the sun's energy during the day and release it slowly overnight. And the single biggest contributor is asphalt — the dark covering of our roads and car parks — which can reach sixty degrees on a summer's day.",
    },
    {
      speaker: 'l',
      text: "The result is a measurable temperature gap between the city and the rural areas around it. This phenomenon has a name you're probably familiar with: we call it the urban heat island. The city sits, in effect, like an island of warmth in a cooler sea of countryside.",
    },
    {
      speaker: 'l',
      text: 'And the effect is far from trivial. In Tokyo, for example, night-time temperatures in the city centre can be as much as five degrees Celsius higher than in the surrounding rural districts. During the day the difference is smaller, but at night the stored heat keeps the city warm.',
    },
    {
      speaker: 'l',
      text: "So, what can be done? Let's start with green solutions. Street trees are remarkably effective. Yes, they provide shade, but more importantly, trees cool the air around them by releasing water from their leaves — a process called transpiration — and that evaporation works like natural air conditioning. Research suggests a row of mature trees can lower the temperature of a street by as much as two degrees.",
    },
    {
      speaker: 'l',
      text: "Roofs are another opportunity. In many cities, flat roofs are now being painted white — so-called 'cool roofs' — because a light surface reflects the sunlight back into the atmosphere instead of absorbing it. Some cities have gone further and planted vegetation on rooftops. As well as cooling the building, these green roofs slow the flow of rainwater during heavy storms, which takes pressure off the drains.",
    },
    {
      speaker: 'l',
      text: "Now let's look at two policy examples. Singapore is probably the world leader here. Since two thousand and nine, developers putting up a new building have been required by law to replace any greenery that is lost during construction — usually with roof gardens or planted walls.",
    },
    {
      speaker: 'l',
      text: "Paris has taken a different approach. During heatwaves, the city has converted school playgrounds into public 'cool islands' — opening them outside school hours as shaded spaces where anyone can escape the heat. It costs very little, and it targets the neighbourhoods that need it most.",
    },
    {
      speaker: 'l',
      text: "Looking ahead, engineers are now developing 'cool pavements' — road and pavement surfaces that use lighter-coloured materials to reflect more of the sun's energy. Early trials in Los Angeles suggest surface temperatures can fall by ten degrees or more.",
    },
    {
      speaker: 'l',
      text: "But I'd like to finish with a note of perspective. With all this clever technology, it's easy to forget the simplest answer. Study after study shows that the cheapest and most effective measure of all is simply planting more trees. Everything else — cool roofs, green walls, reflective pavements — is, in a sense, a supplement to that.",
    },
    {
      speaker: 'l',
      text: "Next week, we'll move on to water management in cities, so please read chapter nine before then. Thank you.",
    },
  ],
  blocks: [
    {
      type: 'notes',
      heading: 'URBAN HEAT — how cities respond',
      lines: [
        {
          segments: [
            'Dark surfaces — especially ',
            { q: 31 },
            ' — absorb heat during the day',
          ],
        },
        {
          segments: [
            'The temperature gap between a city and the countryside is called the urban heat ',
            { q: 32 },
          ],
        },
        {
          segments: [
            'In Tokyo, night-time temperatures can be up to ',
            { q: 33 },
            ' °C higher than in rural areas',
          ],
        },
      ],
    },
    {
      type: 'notes',
      heading: 'Green solutions',
      lines: [
        {
          segments: [
            'Trees cool the air by releasing ',
            { q: 34 },
            ' from their leaves (transpiration)',
          ],
        },
        {
          segments: [
            'White “cool roofs” reflect the ',
            { q: 35 },
            ' back into the atmosphere',
          ],
        },
        {
          segments: [
            'Green roofs slow the flow of ',
            { q: 36 },
            ' during heavy storms',
          ],
        },
      ],
    },
    {
      type: 'notes',
      heading: 'Policy examples',
      lines: [
        {
          segments: [
            'Singapore: developers must replace any ',
            { q: 37 },
            ' lost during construction',
          ],
        },
        {
          segments: [
            'Paris: school ',
            { q: 38 },
            ' are opened to the public as cool spaces in summer',
          ],
        },
      ],
    },
    {
      type: 'notes',
      heading: 'Looking ahead',
      lines: [
        { segments: ['“Cool pavements” use lighter-coloured ', { q: 39 }] },
        {
          segments: [
            'The cheapest and most effective measure is simply planting more ',
            { q: 40 },
          ],
        },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Answer key
// ---------------------------------------------------------------------------

const answers: Record<number, AnswerSpec> = {
  // Part 1
  1: { kind: 'text', accept: ['Milton'] },
  2: { kind: 'text', accept: ['King'] },
  3: { kind: 'text', accept: ['NR2 4QP', 'NR24QP'] },
  4: { kind: 'text', accept: ['07734 082956', '07734082956'] },
  5: { kind: 'text', accept: ['Spanish'] },
  6: { kind: 'text', accept: ['Thursday', 'Thursdays'] },
  7: { kind: 'text', accept: ['7.30', '7:30', 'seven thirty', 'half past seven'] },
  8: {
    kind: 'text',
    accept: ['3 October', '3rd October', 'October 3', 'October 3rd', 'the third of October', '3/10'],
  },
  9: { kind: 'text', accept: ['145', '£145', 'one hundred and forty-five', 'a hundred and forty-five'] },
  10: { kind: 'text', accept: ['12', 'twelve'] },
  // Part 2 (A=0, B=1, C=2 …)
  11: { kind: 'choice', correct: 1 }, // B — 6.30 a.m.
  12: { kind: 'choice', correct: 1 }, // B — free for the first two hours
  13: { kind: 'choice', correct: 0 }, // A — book through the app
  14: { kind: 'choice', correct: 2 }, // C — drinks and light snacks only
  15: { kind: 'choice', correct: 2 }, // C — a free fitness assessment
  16: { kind: 'choice', correct: 0 }, // A — recently refurbished
  17: { kind: 'choice', correct: 1 }, // B — must be booked in advance
  18: { kind: 'choice', correct: 3 }, // D — in the open air
  19: { kind: 'choice', correct: 5 }, // F — temporarily unavailable
  20: { kind: 'choice', correct: 4 }, // E — can be hired for private events
  // Part 3
  21: { kind: 'choice', correct: 1 }, // B — inspired by a magazine article
  22: { kind: 'choice', correct: 2 }, // C — the level of interest in growing food
  23: { kind: 'choice', correct: 1 }, // B — benefits for local residents
  24: { kind: 'choice', correct: 0 }, // A — the city council's website
  25: { kind: 'choice', correct: 1 }, // B — Wednesday morning
  26: { kind: 'choice', correct: 0 }, // A — Mia
  27: { kind: 'choice', correct: 1 }, // B — Tom
  28: { kind: 'choice', correct: 2 }, // C — both
  29: { kind: 'choice', correct: 0 }, // A — Mia
  30: { kind: 'choice', correct: 2 }, // C — both
  // Part 4
  31: { kind: 'text', accept: ['asphalt'] },
  32: { kind: 'text', accept: ['island'] },
  33: { kind: 'text', accept: ['5', 'five'] },
  34: { kind: 'text', accept: ['water'] },
  35: { kind: 'text', accept: ['sunlight', 'sun'] },
  36: { kind: 'text', accept: ['rainwater', 'rain water'] },
  37: { kind: 'text', accept: ['greenery', 'plants', 'vegetation'] },
  38: { kind: 'text', accept: ['playgrounds', 'playground'] },
  39: { kind: 'text', accept: ['materials', 'material'] },
  40: { kind: 'text', accept: ['trees'] },
}

export const LISTENING_TEST_1: IeltsListeningTest = {
  slug: 'test-1',
  title: 'IELTS Listening Mock Test 1',
  totalQuestions: 40,
  parts: [part1, part2, part3, part4],
  answers,
}
