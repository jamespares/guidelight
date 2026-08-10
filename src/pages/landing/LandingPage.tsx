import { lazy, Suspense, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Cloud,
  Coins,
  Compass,
  Gauge,
  GraduationCap,
  Languages,
  NotebookPen,
  ShieldCheck,
  Target,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react'
import { GuidelightWordmark } from '@/components/BrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { InsightLineChartCard } from '@/components/InsightLineChart'
import { WeakspotsPanel } from '@/components/WeakspotsPanel'
import { UsageDial } from '@/components/UsageDial'
import { AuthLegalFooter } from '@/pages/auth/AuthPages'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InsightEvent, Weakspot } from '@/lib/api'
import { TRUST_LANDING } from '@/lib/trustCopy'
import { cn } from '@/lib/utils'

const NightGuideScene = lazy(() =>
  import('@/components/NightGuideScene').then((m) => ({ default: m.NightGuideScene })),
)

/* ------------------------------------------------------------------ */
/* Sample data — mirrors scripts/demo-data.mjs so mock-ups look real.  */
/* ------------------------------------------------------------------ */

const CLASS_AVERAGE_SERIES = [
  { date: '2025-09-08', value: 68 },
  { date: '2025-09-22', value: 74 },
  { date: '2025-10-06', value: 71 },
  { date: '2025-10-27', value: 79 },
  { date: '2025-11-10', value: 84 },
]

const CLASS_EVENTS: InsightEvent[] = [
  {
    id: 'landing-ev-midterm',
    name: 'Mid-term exam',
    event_date: '2025-10-06',
    description: 'Summative mid-term assessment.',
    scope: 'class',
  },
  {
    id: 'landing-ev-intervention',
    name: 'Intervention week',
    event_date: '2025-10-20',
    description: 'Whole-class workshop on relative clauses.',
    scope: 'class',
  },
]

const CLASS_WEAKSPOTS: Weakspot[] = [
  {
    topic: 'relative clauses',
    skill: 'relative clauses',
    count: 12,
    severity: 'high',
    evidence: 'Appears in 6 of 8 students’ recent attempts.',
    remediation: 'Whole-class workshop week 3; peer mentoring by stronger writers.',
    frequency: 12,
  },
  {
    topic: 'article usage',
    skill: 'article usage',
    count: 8,
    severity: 'medium',
    evidence: 'Diagnostic cluster errors on a/an/the.',
    remediation: 'Daily 5-minute article warm-ups.',
    frequency: 8,
  },
  {
    topic: 'prepositions',
    skill: 'prepositions',
    count: 7,
    severity: 'medium',
    evidence: 'Homework cloze + individual profiles.',
    remediation: 'Contextual preposition cards in writing lessons.',
    frequency: 7,
  },
]

const HOW_IT_WORKS_STEPS = [
  {
    icon: ClipboardCheck,
    title: 'Diagnose',
    copy: 'A multimedia diagnostic captures current knowledge, interests and ambitions — drafted by AI, reviewed by you.',
  },
  {
    icon: CalendarDays,
    title: 'Plan',
    copy: 'Generate a tailored semester plan with scaffolded lessons. Edit anything in the app; export for your team.',
  },
  {
    icon: NotebookPen,
    title: 'Assign & mark',
    copy: 'Homework aligned to your curriculum and student interests. Marking returns scores and feedback you approve.',
  },
  {
    icon: ShieldCheck,
    title: 'Assess',
    copy: 'Timed formative and summative papers with integrity measures build a readiness signal over time.',
  },
  {
    icon: TrendingUp,
    title: 'Understand',
    copy: 'Insights show who is rising, who is stuck, and where to steer next — while there is still time.',
  },
]

const GLASS = 'border-border/30 bg-card/40 shadow-lg backdrop-blur-xl'

/** Text placed directly on the ocean scene — dark over the day sea, light over the night sea. */
const ON_SCENE =
  'text-slate-700 [text-shadow:0_1px_2px_rgba(255,255,255,0.4)] dark:text-white/85 dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.45)]'
const ON_SCENE_STRONG =
  'text-slate-900 [text-shadow:0_1px_3px_rgba(255,255,255,0.4)] dark:text-white dark:[text-shadow:0_1px_3px_rgba(0,0,0,0.5)]'
const ON_SCENE_MUTED =
  'text-slate-600 [text-shadow:0_1px_2px_rgba(255,255,255,0.4)] dark:text-white/75 dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.45)]'

/* ------------------------------------------------------------------ */
/* Presentational helpers                                               */
/* ------------------------------------------------------------------ */

function Section({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} className={cn('relative z-10 mx-auto w-full max-w-5xl px-6 py-16 sm:py-20', className)}>
      {children}
    </section>
  )
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl space-y-3 text-center">
      <p className={cn('text-xs font-semibold uppercase tracking-[0.14em]', ON_SCENE_MUTED)}>
        {eyebrow}
      </p>
      <h2 className={cn('font-display text-2xl font-semibold tracking-tight sm:text-3xl', ON_SCENE_STRONG)}>
        {title}
      </h2>
      {copy ? <p className={cn('leading-relaxed', ON_SCENE)}>{copy}</p> : null}
    </div>
  )
}

/** Simple gap diagram: two cliffs, ocean between, a Guidelight beam bridging them. */
function GapDiagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 170"
      role="img"
      aria-label="Diagram: a beam of light bridging the gap between where students are and where they need to be"
      className={cn('h-auto w-full', className)}
    >
      {/* ocean strip */}
      <path
        d="M0 136 Q60 128 120 136 T240 136 T360 136 T480 136 V170 H0 Z"
        className="fill-primary/20"
      />
      {/* slender beam from the star to the left cliff */}
      <path d="M398 47 L152 94 L152 104 L398 53 Z" className="fill-amber-300/30" />
      <path d="M398 49 L152 97 L152 101 L398 51 Z" className="fill-amber-200/50" />
      {/* left cliff */}
      <path d="M0 170 V108 H150 L176 140 V170 Z" className="fill-muted-foreground/35" />
      {/* right cliff (higher) */}
      <path d="M480 170 V78 H330 L304 140 V170 Z" className="fill-muted-foreground/35" />
      {/* guiding star above the right cliff */}
      <circle cx="400" cy="50" r="11" className="fill-amber-200/25" />
      <circle cx="400" cy="50" r="4" className="fill-amber-200" />
      {/* labels */}
      <text x="75" y="94" textAnchor="middle" className="fill-foreground text-[11px] font-medium">
        Where students are
      </text>
      <text x="400" y="26" textAnchor="middle" className="fill-foreground text-[11px] font-medium">
        Where they need to be
      </text>
    </svg>
  )
}

function SignInButtons({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:justify-center', className)}>
      <Button asChild className="flex-1 sm:flex-none sm:px-8">
        <Link to="/login/teacher">
          <GraduationCap className="h-4 w-4" />
          Teacher sign in
        </Link>
      </Button>
      <Button asChild variant="outline" className="flex-1 sm:flex-none sm:px-8">
        <Link to="/login/student">
          <Users className="h-4 w-4" />
          Student sign in
        </Link>
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Landing page                                                         */
/* ------------------------------------------------------------------ */

export function Landing() {
  return (
    <div className="relative min-h-screen">
      {/* Fixed ocean backdrop — sections scroll over it */}
      <div className="fixed inset-0 z-0">
        <Suspense fallback={null}>
          <NightGuideScene className="z-0" />
        </Suspense>
      </div>

      {/* Floating theme toggle — no header bar, the ocean stays unobstructed */}
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle className="border-border/40 bg-card/30 shadow-sm backdrop-blur-xl hover:bg-card/45" />
      </div>

      <main id="main-content" className="relative z-10">
        {/* Hero */}
        <Section id="top" className="flex min-h-screen flex-col items-center justify-center text-center">
          <div className="max-w-2xl space-y-6">
            <p className={cn('text-xs font-semibold uppercase tracking-[0.14em]', ON_SCENE_MUTED)}>
              Classroom intelligence, finally in your hands
            </p>
            <h1 className="flex justify-center text-4xl sm:text-5xl">
              <GuidelightWordmark />
            </h1>
            <p className={cn('text-lg leading-relaxed', ON_SCENE_STRONG)}>
              Guidelight turns planning, assessment, and student data into clear direction — so
              every learner can close the gap.
            </p>
            <SignInButtons className="mx-auto max-w-md" />
            <p className={cn('text-xs font-medium', ON_SCENE_MUTED)}>
              AI drafts. You decide. Pay only for what you use.
            </p>
          </div>
          <a
            href="#problem"
            aria-label="Scroll to learn more"
            className="absolute bottom-6 text-slate-600 transition-colors hover:text-slate-900 dark:text-white/70 dark:hover:text-white"
          >
            <ChevronDown className="h-6 w-6 animate-bounce" />
          </a>
        </Section>

        {/* Problem / solution */}
        <Section id="problem">
          <SectionHeading
            eyebrow="The gap"
            title="A lot of ocean between here and there"
            copy="That distance feels even further when you don’t have the data to guide your journey."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className={GLASS}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4" />
                  The problem
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                It often feels like there’s a lot of ocean between where your students are and
                where you need them to be — and that distance feels even further when you don’t
                have the data to guide your journey.
              </CardContent>
            </Card>
            <Card className={GLASS}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Compass className="h-4 w-4" />
                  The solution
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                Guidelight is an AI-native system for planning, assessment, and performance
                analysis. AI drafts; you review and approve — so your expertise stays front and
                centre.
              </CardContent>
            </Card>
          </div>
          <Card className={cn(GLASS, 'mt-4')}>
            <CardContent className="space-y-4 pt-6">
              <GapDiagram className="mx-auto max-w-md" />
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
                <span>Whatever your curriculum:</span>
                {['IB', 'IGCSE', 'GCSE', 'IELTS', 'CEFR'].map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-foreground"
                  >
                    {c}
                  </span>
                ))}
                <span>— Guidelight is ready to light the way.</span>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* How it works */}
        <Section id="how-it-works">
          <SectionHeading
            eyebrow="How it works"
            title="One loop, every term"
            copy="Start with a diagnostic, plan the semester, assign personalised work, assess under exam conditions, and watch the picture sharpen."
          />
          <ol className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* connector line (desktop) */}
            <div
              aria-hidden
              className="absolute left-0 right-0 top-10 hidden border-t-2 border-dashed border-slate-500/40 lg:block dark:border-white/25"
            />
            {HOW_IT_WORKS_STEPS.map((step, i) => (
              <li key={step.title} className="relative">
                <Card className={cn(GLASS, 'h-full')}>
                  <CardContent className="space-y-3 pt-6">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary/60 text-xs font-bold">
                        {i + 1}
                      </span>
                      <step.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{step.copy}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </Section>

        {/* Insights, live */}
        <Section id="insights">
          <SectionHeading
            eyebrow="Insights"
            title="Not more noise — a clearer picture"
            copy="See how a class is performing, how each student is moving over time, and exactly where to intervene."
          />
          <div className="space-y-4">
            <InsightLineChartCard
              title="Class average over the term"
              description="Sample data — events mark what changed and when."
              series={CLASS_AVERAGE_SERIES}
              events={CLASS_EVENTS}
              seriesName="Class average (%)"
              stroke="#2a6f6f"
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <WeakspotsPanel
                title="Class weakspots"
                weakspots={CLASS_WEAKSPOTS}
                summary="Whole-class priorities: relative clauses, articles, and prepositions. Stretch stronger writers on formal register and hedging."
                updatedAt="2025-11-08T09:30"
                onPinpoint={() => {}}
              />
              <Card className={GLASS}>
                <CardHeader>
                  <CardTitle className="text-base">Pay only for what you use</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <UsageDial usedCents={340} capCents={2000} />
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    No subscription. You pay only for the AI you use, with a monthly cap you
                    control and automatic invoices you can claim back from your school.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </Section>

        {/* Going further */}
        <Section id="going-further">
          <SectionHeading
            eyebrow="Going further"
            title="Built for diverse classrooms"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className={GLASS}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Languages className="h-4 w-4" />
                  English level assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                A CEFR-aligned assessment across speaking, listening, reading, and writing — so
                you know whether language is the barrier, and at which level to teach.
              </CardContent>
            </Card>
            <Card className={GLASS}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gauge className="h-4 w-4" />
                  Reading speed assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                Natural-pace reading checks help you plan assigned reading realistically and
                support students who need to build pace.
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Why Guidelight */}
        <Section id="why">
          <SectionHeading
            eyebrow="Why Guidelight"
            title="Your expertise stays front and centre"
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className={GLASS}>
              <CardContent className="space-y-3 pt-6">
                <UserCheck className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">AI drafts, you decide</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Nothing important reaches a student before you review and approve it.
                </p>
              </CardContent>
            </Card>
            <Card className={GLASS}>
              <CardContent className="space-y-3 pt-6">
                <Cloud className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Private by design</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{TRUST_LANDING}</p>
              </CardContent>
            </Card>
            <Card className={GLASS}>
              <CardContent className="space-y-3 pt-6">
                <Coins className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Pay-as-you-go</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  No subscription — pay only for the intelligence you use, with a spending cap
                  you control.
                </p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Final CTA */}
        <Section className="text-center">
          <Card className={cn(GLASS, 'mx-auto max-w-2xl')}>
            <CardContent className="space-y-5 px-6 py-10">
              <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                Lead your students to excellence.
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Better tools for teachers. Clearer data for every class. Stronger outcomes for
                students.
              </p>
              <SignInButtons className="mx-auto max-w-md" />
            </CardContent>
          </Card>
        </Section>

        {/* Footer */}
        <div className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-10">
          <AuthLegalFooter />
        </div>
      </main>
    </div>
  )
}
