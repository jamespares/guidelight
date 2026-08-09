import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BILLING_SETTINGS_PATH, TRUST_DIAL } from '@/lib/trustCopy'
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

/** Simple pay-as-you-go cost explainer for teachers — no model names. */
function AiCostExplainer() {
  const spendShare = [
    { label: 'Marking student work', share: 80, hint: 'Most of your bill' },
    { label: 'Creating tasks & lessons', share: 12, hint: 'A few dollars' },
    { label: 'Insights, exam readiness & extras', share: 8, hint: 'Small slice' },
  ]

  const scenarios = [
    {
      title: 'Light load',
      detail: '2 classes · lighter homework',
      price: 'About $8',
    },
    {
      title: 'Typical',
      detail: '4 classes · full features',
      price: '$15–25',
      highlight: true,
    },
    {
      title: 'Busy term',
      detail: '6 classes · lots of marking',
      price: '$40–60',
    },
  ]

  return (
    <div className="space-y-5">
      <p>
        Guidelight is <strong className="text-foreground">pay as you go</strong> — no subscription.
        You only pay at month end for the AI your classes actually use. A usage dial in the sidebar
        shows spend against your monthly limit (default{' '}
        <strong className="text-foreground">$20</strong>; you can raise it anytime in{' '}
        <Link
          to={BILLING_SETTINGS_PATH}
          className="font-medium text-foreground underline-offset-2 hover:underline"
        >
          Settings → Billing
        </Link>
        ).
      </p>
      <p className="text-xs text-muted-foreground">{TRUST_DIAL}</p>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
          Where a typical month goes
        </p>
        <div
          className="flex h-3 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label="Cost share: about 80% marking, 12% creating, 8% extras"
        >
          <div className="bg-primary" style={{ width: '80%' }} title="Marking" />
          <div className="bg-primary/55" style={{ width: '12%' }} title="Creating" />
          <div className="bg-primary/30" style={{ width: '8%' }} title="Extras" />
        </div>
        <ul className="space-y-2">
          {spendShare.map((row) => (
            <li key={row.label} className="flex items-baseline justify-between gap-3">
              <span>
                <strong className="text-foreground">{row.label}</strong>
                <span className="text-muted-foreground"> — {row.hint}</span>
              </span>
              <span className="shrink-0 tabular-nums text-foreground">{row.share}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
          Rough monthly cost
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {scenarios.map((s) => (
            <div
              key={s.title}
              className={
                s.highlight
                  ? 'rounded-lg border border-primary/40 bg-primary/5 px-3 py-3'
                  : 'rounded-lg border border-border px-3 py-3'
              }
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                {s.title}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{s.price}</p>
              <p className="mt-0.5 text-xs">{s.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-xs">
          Costs scale with how many students submit work — marking is the main driver. Planning
          lessons, drafting homework, and generating mock exams cost far less because you run them a
          handful of times, not hundreds.
        </p>
      </div>
    </div>
  )
}

export function TeacherGuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Info"
        description="A clear walkthrough of the teacher portal — classes, lessons, tasks, mock exams, and insights."
      />

      <Section title="Quick start">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open <strong className="text-foreground">Students</strong> and press{' '}
            <strong className="text-foreground">Add class</strong>. Share each student&apos;s
            username and password (shown once).
          </li>
          <li>
            In <strong className="text-foreground">Assessments</strong>, create a{' '}
            <strong className="text-foreground">Diagnostic</strong> for that class, review it, then
            publish. This unlocks personalised homework and later assessments.
          </li>
          <li>
            Create <strong className="text-foreground">Homework</strong> or further assessments,
            review every question, assign, and publish.
          </li>
          <li>
            Optional: plan a syllabus in <strong className="text-foreground">Lessons</strong>, or
            set up an exam profile under <strong className="text-foreground">Assessments</strong> to
            generate timed practice papers.
          </li>
          <li>
            Use <strong className="text-foreground">Insights</strong> for homework scores, submission
            rates, weakspots, and parent reports.
          </li>
        </ol>
      </Section>

      <Section title="Your workspace">
        <p>
          The sidebar has: <strong className="text-foreground">Students</strong>,{' '}
          <strong className="text-foreground">Lessons</strong>,{' '}
          <strong className="text-foreground">Homework</strong>,{' '}
          <strong className="text-foreground">Assessments</strong>, and{' '}
          <strong className="text-foreground">Insights</strong>. Exam profiles and mock exams live under Assessments.
          <strong className="text-foreground"> Info</strong> and{' '}
          <strong className="text-foreground">Settings</strong> sit below them. The sidebar also
          shows your <strong className="text-foreground">AI usage dial</strong> for this month.
        </p>
      </Section>

      <Section title="Students">
        <p>
          Press <strong className="text-foreground">Add class</strong>. Enter the class name,
          subject, age range, optional curriculum notes, and student names (one per line or
          separated by commas). Guidelight creates a login for each student.
        </p>
        <p>
          <strong className="text-foreground">Copy usernames and passwords straight away</strong> —
          passwords are shown only when first created or after you reset them.
        </p>
        <p>
          The roster shows username, class, subject, average homework score, English level, reading
          speed (WPM), weakspots, homework completion, interests, and career ambitions.
        </p>
        <p>Open a student to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Edit <strong className="text-foreground">Login credentials</strong> — change the
            username, set a custom password, or generate a new one.
          </li>
          <li>Edit interests and career ambitions, then save.</li>
          <li>Refresh their AI introduction.</li>
          <li>
            View <strong className="text-foreground">Exam readiness</strong> from mock exam
            attempts (separate from average homework score).
          </li>
          <li>
            Run <strong className="text-foreground">Pinpoint weakspots</strong> across homework and
            mock exam attempts.
          </li>
          <li>
            Add notes and generate a <strong className="text-foreground">parent report</strong>.
          </li>
        </ul>
      </Section>

      <Section title="Lessons">
        <p>
          Press <strong className="text-foreground">Plan lessons</strong>. Choose the class,
          subject (or keep the class subject), curriculum, lesson duration, days of the week, start
          date, syllabus length (1–12 weeks), and resources (whiteboard, iPads, and so on).
        </p>
        <p>
          Guidelight drafts a batch of lesson plans in a Presentation / Practice / Production (PPP)
          format — a mix of traditional and communicative activities. Generation can take a minute;
          wait for it to finish.
        </p>
        <p>Then:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Switch between <strong className="text-foreground">Calendar</strong> and{' '}
            <strong className="text-foreground">List</strong> views.
          </li>
          <li>Open a lesson to edit title, objectives, materials, PPP stages, and notes.</li>
          <li>
            Press <strong className="text-foreground">Save</strong> after edits.
          </li>
          <li>
            Export the whole batch as <strong className="text-foreground">DOCX</strong> or{' '}
            <strong className="text-foreground">CSV</strong>, or delete the batch if you no longer
            need it.
          </li>
        </ol>
      </Section>

      <Section title="Homework & Assessments">
        <p>
          Open <strong className="text-foreground">Homework</strong> or{' '}
          <strong className="text-foreground">Assessments</strong>, create a draft with AI, then
          open it to review.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Check every question. Keep a short <strong className="text-foreground">topic</strong>{' '}
            and a clear <strong className="text-foreground">learning objective</strong> on each one.
          </li>
          <li>
            Under <strong className="text-foreground">Assign & publish</strong>, choose the whole
            class or selected students.
          </li>
          <li>
            Press <strong className="text-foreground">Save draft</strong> or{' '}
            <strong className="text-foreground">Publish to students</strong>.
          </li>
          <li>
            After publish, review attempts — score, time taken, status, and any flags if a student
            left the page.
          </li>
        </ol>
        <p>Coloured badges show the task kind:</p>
        <ColourLegend />
        <p>
          For subject assessments you can upload a past paper (PDF or image) and optional notes so
          the draft matches that style. You can also set a hard time limit. Reading speed needs a
          reading passage; other tasks can include optional reading text.
        </p>
        <p>
          Subject-linked homework and assessments usually need a{' '}
          <strong className="text-foreground">Diagnostic</strong> first for that class — this unlocks
          personalisation. <strong className="text-foreground">English level</strong> and{' '}
          <strong className="text-foreground">Reading speed</strong> skip that gate and use their own
          student flows.
        </p>
      </Section>

      <Section title="Mock exams">
        <p>
          From <strong className="text-foreground">Assessments → Exam profiles</strong>, create an{' '}
          <strong className="text-foreground">exam profile</strong>: title, curriculum, syllabus
          code, duration, grade boundaries (% → grade), marking rubric, and an optional reference
          past paper.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Press <strong className="text-foreground">Generate mock</strong> — AI (Kimi on Workers
            AI) drafts a timed paper matching your format and rubric.
          </li>
          <li>Review and edit questions on the task review page, then publish to the class.</li>
          <li>
            Generate more mocks from the same profile whenever you want fresh practice papers.
          </li>
        </ol>
        <p>
          Students sit mocks like other timed assessments. After a few attempts, Guidelight shows an{' '}
          <strong className="text-foreground">exam readiness</strong> estimate (pass/target
          probability) — separate from average homework score.
        </p>
      </Section>

      <Section title="Insights">
        <p>
          Choose <strong className="text-foreground">Whole class</strong> or{' '}
          <strong className="text-foreground">Individual student</strong>. You will see average
          homework % correct, homework submission rate, and charts over time.
        </p>
        <p>
          Press <strong className="text-foreground">Pinpoint weakspots</strong> to analyse full
          attempt archives. Class scope finds shared gaps; student scope focuses on one learner.
        </p>
        <p>
          Under <strong className="text-foreground">Produce report</strong>, add notes, press{' '}
          <strong className="text-foreground">Generate report</strong>, then edit the text. Use{' '}
          <strong className="text-foreground">Save</strong> and{' '}
          <strong className="text-foreground">Print / PDF</strong> when ready. You can also generate
          a parent report from a student profile.
        </p>
      </Section>

      <Section title="Settings">
        <p>
          Use Settings to switch between light and dark theme, and to manage{' '}
          <strong className="text-foreground">Billing & AI usage</strong> — your monthly spending
          limit, payment method, and invoices. Your theme choice is stored on this device.
        </p>
      </Section>

      <Section title="Teacher account">
        <p>
          Register with your email and password. Guidelight emails a verification link — confirm it
          before signing in. Forgotten passwords use a reset link; you can also choose{' '}
          <strong className="text-foreground">Email me a sign-in link</strong> for password-free
          access.
        </p>
      </Section>

      <Section title="What AI costs">
        <AiCostExplainer />
      </Section>
    </div>
  )
}

export function StudentGuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Info"
        description="Everything you need for Tasks and Tools — from homework to reading practice."
      />

      <Section title="Getting started">
        <p>
          Your teacher creates your account and gives you a{' '}
          <strong className="text-foreground">username</strong> and{' '}
          <strong className="text-foreground">password</strong>. On the Guidelight home page, choose{' '}
          <strong className="text-foreground">Student</strong> sign-in and enter those details.
        </p>
        <p>
          Use the sidebar for <strong className="text-foreground">Tasks</strong> (work your teacher
          assigns) and <strong className="text-foreground">Tools</strong> (optional practice).{' '}
          <strong className="text-foreground">Info</strong> and{' '}
          <strong className="text-foreground">Settings</strong> sit below them.
        </p>
      </Section>

      <Section title="Tasks">
        <p>
          Open <strong className="text-foreground">Tasks</strong> to see homework and assessments
          assigned to you. Each row shows the title, a coloured type badge, subject, and your last
          score. If your class has an exam profile, you will also see{' '}
          <strong className="text-foreground">exam readiness</strong> cards above the list.
        </p>
        <p>
          Statuses: <strong className="text-foreground">Start</strong> a new task,{' '}
          <strong className="text-foreground">Continue</strong> one in progress, or see{' '}
          <strong className="text-foreground">Submitted</strong> when you are done. Work appears here
          as soon as your teacher publishes it.
        </p>
        <p>Badge colours mean:</p>
        <ColourLegend />
        <p>
          Homework, diagnostic, formative, and mock exam tasks test your class subject. English
          level and Reading speed measure general English and literacy — not your class topic.
        </p>
        <p>
          Tap <strong className="text-foreground">Start</strong> or{' '}
          <strong className="text-foreground">Continue</strong>. Answer each question, then submit.
          Copy and paste are disabled. After submit you see your score and feedback for each
          question.
        </p>
        <p>
          Timed tasks may auto-submit when time runs out. For assessments, stay on the page — leaving
          the window can be flagged for your teacher.
        </p>
        <p>
          <strong className="text-foreground">English level</strong> is a timed CEFR-style check
          (vocabulary, listening, reading, grammar, writing). You get an indicative level and IELTS
          band.
        </p>
        <p>
          <strong className="text-foreground">Reading speed</strong> times you on a passage, then
          checks comprehension before recording your words per minute (WPM).
        </p>
      </Section>

      <Section title="Tools">
        <p>
          <strong className="text-foreground">Tools</strong> are optional practice — they do not
          replace assigned Tasks.
        </p>
        <ul className="list-disc space-y-3 pl-5">
          <li>
            <strong className="text-foreground">Flashcards</strong> — generate cards from your
            weakspots and recent mistakes, then flip through them to revise.
          </li>
          <li>
            <strong className="text-foreground">Practice quiz</strong> — generate a short
            multiple-choice set on the same gaps and check the options.
          </li>
          <li>
            <strong className="text-foreground">A1–C2 Stories</strong> — pick a CEFR level, open a
            story, listen with highlighted words (change speed, show or hide 中文), tap a word to
            jump in the audio, and download DOCX, PDF, or Markdown. Short tips also appear on the
            Stories page.
          </li>
          <li>
            <strong className="text-foreground">RSVP Focused Reading Machine</strong> — practise class
            texts or upload your own. Open a text, set WPM, then play or pause (spacebar works too).
            Restart anytime; sessions are logged to help you track progress.
          </li>
          <li>
            Timed <strong className="text-foreground">mock exams</strong> appear in Tasks when your
            teacher publishes them. Your Tasks page also shows{' '}
            <strong className="text-foreground">exam readiness</strong> — a data-based guide to
            pass/target grades from your mock scores (not a guarantee).
          </li>
        </ul>
      </Section>

      <Section title="Settings">
        <p>Use Settings to switch light or dark theme. Your preference stays on this device.</p>
      </Section>
    </div>
  )
}
