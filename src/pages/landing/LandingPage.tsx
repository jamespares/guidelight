import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Play } from 'lucide-react'
import { BrandStar, GuidelightWordmark } from '@/components/BrandMark'
import { DemoVideoDialog } from '@/components/DemoVideoDialog'
import { LegalFooter } from '@/components/LegalFooter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const NightGuideScene = lazy(() =>
  import('@/components/NightGuideScene').then((m) => ({ default: m.NightGuideScene })),
)

const HOW_IT_WORKS = [
  {
    title: 'Homework',
    description:
      'AI drafts curriculum-aligned tasks; you approve before anything reaches a student. Every attempt is marked, stored, and turned into a data point on your students’ understanding.',
  },
  {
    title: 'Assessments',
    description:
      'Formative and summative papers that mirror exam formats, with integrity controls and readiness scoring built in.',
  },
  {
    title: 'Insights',
    description:
      'Class and student trends, weakspot analysis, and exam-readiness probabilities — so you can steer with confidence, not guesswork.',
  },
  {
    title: 'Lesson planning',
    description:
      'AI-generated, personalised semester plans that you can edit and export — saving you hours of preparation time.',
  },
] as const

function scrollToMission() {
  document.getElementById('mission')?.scrollIntoView({ behavior: 'smooth' })
}

export function Landing() {
  return (
    <div className="relative overflow-hidden">
      {/* Fixed ocean backdrop */}
      <div className="fixed inset-0 z-0">
        <Suspense fallback={null}>
          <NightGuideScene className="z-0" />
        </Suspense>
      </div>

      {/* Theme toggle */}
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle className="border-border/40 bg-card/30 shadow-sm backdrop-blur-xl hover:bg-card/45" />
      </div>

      {/* Hero section */}
      <section
        id="hero"
        className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pb-20 text-center"
      >
        <div className="max-w-2xl space-y-10">
          <div className="flex items-center justify-center gap-5">
            <BrandStar className="h-20 w-20 text-[var(--brand-guide)] sm:h-24 sm:w-24" />
            <GuidelightWordmark showStar={false} className="text-6xl sm:text-7xl md:text-8xl" />
          </div>

          <p className="text-lg font-normal leading-relaxed text-foreground/80 sm:text-xl">
            Lead your students to excellence
          </p>

          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-w-[11rem] sm:px-10">
              <Link to="/get-started">Get started</Link>
            </Button>
            <DemoVideoDialog
              trigger={
                <Button variant="ghost" size="lg" className="text-foreground/70 hover:text-foreground">
                  <Play className="h-4 w-4" />
                  Watch demo
                </Button>
              }
            />
          </div>
        </div>

        {/* Scroll indicator */}
        <button
          type="button"
          onClick={scrollToMission}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full p-2 text-foreground/60 transition-colors hover:text-foreground"
          aria-label="Scroll to learn more"
        >
          <ChevronDown className="h-6 w-6 animate-bounce" />
        </button>
      </section>

      {/* Mission / how it works section */}
      <section
        id="mission"
        className="relative z-10 w-full bg-gradient-to-b from-background/75 via-background/90 to-background px-6 py-24 backdrop-blur-sm sm:py-32"
      >
        <div className="mx-auto max-w-3xl space-y-12 text-center">
          <div className="space-y-6">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Evidence-based teaching
            </p>
            <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
              Know your students are learning it — not just that you taught it
            </h2>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Teaching is a journey across an ocean of uncertainty. Guidelight is the data layer
              that helps you steer — turning every homework, assessment, and class activity into
              clear signals about who is learning, who needs help, and what to teach next. We’re
              putting institutional-grade analytics into the hands of everyday teachers.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {HOW_IT_WORKS.map(({ title, description }) => (
              <Card
                key={title}
                className="border-0 bg-card/25 text-left shadow-sm backdrop-blur-xl"
              >
                <CardContent className="p-6">
                  <h3 className="mb-2 font-display text-lg font-semibold text-foreground">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-sm font-medium text-foreground/80">
            Guidelight is the guiding light for evidence-based teaching: rich classroom data, clear
            reasoning, and the confidence that your teaching is working.
          </p>
        </div>
      </section>

      {/* Legal footer */}
      <div className="relative z-10 bg-background px-6 pb-6">
        <LegalFooter variant="inline" />
      </div>
    </div>
  )
}
