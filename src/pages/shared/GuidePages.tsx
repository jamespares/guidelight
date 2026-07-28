import type { ReactNode } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TASK_KIND_GROUPS, TASK_KIND_LEGEND, taskKindBadgeClass, taskKindLabel } from '@/lib/taskLabels'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  )
}

function ColourLegend() {
  const descriptions = Object.fromEntries(TASK_KIND_LEGEND.map((e) => [e.kind, e.description]))
  return (
    <div className="space-y-4">
      {TASK_KIND_GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
            {group.title}
          </p>
          <p>{group.note}</p>
          <ul className="space-y-2">
            {group.kinds.map((kind) => (
              <li key={kind} className="flex flex-wrap items-center gap-2">
                <Badge className={taskKindBadgeClass(kind)}>{taskKindLabel(kind)}</Badge>
                <span>{descriptions[kind]}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function TeacherGuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="How to use Guidelight"
        description="A quick guide to the teacher portal — classes, tasks, insights, and pinpointing weakspots."
      />

      <Section title="Your workspace">
        <p>
          The sidebar has four main areas: <strong className="text-foreground">Students</strong>,{' '}
          <strong className="text-foreground">Homework</strong>,{' '}
          <strong className="text-foreground">Assessments</strong>, and{' '}
          <strong className="text-foreground">Insights</strong>. Settings and this guide sit below
          them.
        </p>
      </Section>

      <Section title="Students">
        <p>
          Create classes and enrol students. The spreadsheet shows each learner&apos;s username,
          average score across completed homework and assessments (a guideline figure for overall
          ability), English level, reading speed, and more.
        </p>
        <p>
          Open a student profile to{' '}
          <strong className="text-foreground">view and edit login credentials</strong> (username and
          password). Passwords are only shown when first created or after you reset them — use the{' '}
          <strong className="text-foreground">Login credentials</strong> card on their profile page.
          You can set a custom password or generate a new one.
        </p>
        <p>
          From the profile you can also edit interests and career ambitions, refresh their AI
          introduction, generate a parent report, or run{' '}
          <strong className="text-foreground">Pinpoint weakspots</strong> on their full attempt
          history.
        </p>
      </Section>

      <Section title="Homework & Assessments">
        <p>
          Create drafts with AI, review every question (human-in-the-loop), then publish to the whole
          class or selected students. Coloured badges show the task kind:
        </p>
        <ColourLegend />
        <p>
          Subject-linked assessments (diagnostic, formative, summative) and homework use your class
          subject. English level and Reading speed are literacy checks only — they do not test class
          content.
        </p>
        <p>
          Subject-linked assessments usually need a diagnostic first for that class — this unlocks
          personalisation. English level and Reading speed skip the diagnostic gate and use
          specialised student flows.
        </p>
        <p>
          Each question should carry a short <strong className="text-foreground">topic</strong> tag
          and a clear <strong className="text-foreground">learning objective</strong> so feedback and
          weakspot analysis stay precise.
        </p>
      </Section>

      <Section title="Insights">
        <p>
          View average % correct and homework submission rates for a class or one student. Charts use
          matching colours: stronger sky for scores, quieter emerald for homework rates.
        </p>
        <p>
          <strong className="text-foreground">Pinpoint weakspots</strong> asks Kimi to read full
          attempt archives (not just topic error counts). On class scope it scans every student in
          the class for shared gaps; on student scope it focuses on that learner.
        </p>
      </Section>

      <Section title="Settings">
        <p>Use Settings to switch between light and dark theme. Your choice is stored on this device.</p>
      </Section>
    </div>
  )
}

export function StudentGuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="How to use Guidelight"
        description="Everything you need for Tasks and Tools — from starting homework to reading practice."
      />

      <Section title="Tasks">
        <p>
          Open <strong className="text-foreground">Tasks</strong> to see homework and assessments
          assigned to you. Each row shows the title, a coloured type badge, subject, and your last
          score.
        </p>
        <p>
          Statuses: start a new task, continue one in progress, or see Submitted when you are done.
          Due work appears here as soon as your teacher publishes it.
        </p>
        <p>Badge colours mean:</p>
        <ColourLegend />
        <p>
          Homework, diagnostic, formative, and summative tasks test your class subject. English
          level and Reading speed measure general English and literacy — not your class topic.
        </p>
        <p>
          Tap <strong className="text-foreground">Start</strong> or{' '}
          <strong className="text-foreground">Continue</strong>. Answer each question, then submit.
          Copy and paste are disabled. After submit you see your score and per-question feedback.
        </p>
        <p>
          <strong className="text-foreground">English level</strong> opens a timed CEFR-style
          diagnostic (vocabulary, listening, reading, grammar, writing) with an indicative level and
          IELTS band.
        </p>
        <p>
          <strong className="text-foreground">Reading speed</strong> times you on a passage, then
          checks comprehension before recording your words-per-minute.
        </p>
      </Section>

      <Section title="Tools">
        <p>
          <strong className="text-foreground">Tools</strong> are optional practice — they do not
          replace assigned Tasks.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Flashcards</strong> — AI cards built from your
            weakspots and recent mistakes.
          </li>
          <li>
            <strong className="text-foreground">Practice quiz</strong> — a short MCQ set targeting
            the same gaps.
          </li>
          <li>
            <strong className="text-foreground">A1–C2 Stories</strong> — graded stories by CEFR
            level; read (and optionally quiz) at your own pace.
          </li>
          <li>
            <strong className="text-foreground">RSVP Focused Reading Machine</strong> — flash words
            at a chosen WPM to train focus and fluency; save class or personal texts.
          </li>
          <li>
            <strong className="text-foreground">Exam Dojo</strong> — coming soon for timed exam
            practice.
          </li>
        </ul>
      </Section>

      <Section title="Settings">
        <p>Use Settings to switch light or dark theme. Your preference stays on this device.</p>
      </Section>
    </div>
  )
}
