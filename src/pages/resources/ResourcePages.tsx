import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GuidelightWordmark } from '@/components/BrandMark'
import { LegalFooter } from '@/components/LegalFooter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { PRODUCT_NAME } from '@/lib/legal'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

/**
 * Public, text-first resource pages. Deliberately quiet: same typographic
 * shell as the legal pages, no marketing chrome — they exist so search and
 * answer engines have something substantive to cite.
 */

function ResourceShell({
  title,
  lede,
  children,
}: {
  title: string
  lede: string
  children: ReactNode
}) {
  useDocumentTitle(`${title} — Guidelight`)
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="text-xl" aria-label={`${PRODUCT_NAME} home`}>
            <GuidelightWordmark />
          </Link>
          <ThemeToggle className="border-border/40 bg-card/40 shadow-sm" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{lede}</p>
        <div className="prose-legal mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
        <div className="mt-14 flex flex-col items-center gap-4 border-t border-border/60 pt-10 text-center">
          <p className="text-sm font-medium text-foreground/80">
            Guide your students to excellence with AI-native homework, assessment and data insights.
          </p>
          <Button asChild size="lg" className="min-w-[11rem] sm:px-10">
            <Link to="/get-started">Get started</Link>
          </Button>
        </div>
      </main>

      <footer className="mx-auto max-w-3xl border-t border-border/60 px-6 py-8">
        <LegalFooter />
      </footer>
    </div>
  )
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-xl font-semibold text-foreground">{children}</h2>
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="text-base font-semibold text-foreground">{children}</h3>
}

function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>
}

const CEFR_LEVELS: { level: string; name: string; summary: string }[] = [
  {
    level: 'A1',
    name: 'Beginner',
    summary:
      'Understands and uses familiar everyday expressions and very basic phrases. Can introduce themselves and answer simple questions about personal details when the other person speaks slowly and clearly.',
  },
  {
    level: 'A2',
    name: 'Elementary',
    summary:
      'Understands sentences and frequently used expressions about areas of immediate relevance — family, shopping, work. Can describe aspects of their background and handle simple, routine exchanges.',
  },
  {
    level: 'B1',
    name: 'Intermediate',
    summary:
      'Understands the main points of clear standard input on familiar matters. Can deal with most situations while travelling, produce simple connected text on familiar topics, and describe experiences, ambitions and plans.',
  },
  {
    level: 'B2',
    name: 'Upper intermediate',
    summary:
      'Understands the main ideas of complex text on concrete and abstract topics. Interacts with a degree of fluency that makes regular conversation with native speakers possible without strain for either side.',
  },
  {
    level: 'C1',
    name: 'Advanced',
    summary:
      'Understands a wide range of demanding, longer texts and recognises implicit meaning. Expresses ideas fluently and spontaneously, using language flexibly for social, academic and professional purposes.',
  },
  {
    level: 'C2',
    name: 'Mastery',
    summary:
      'Understands with ease virtually everything heard or read. Summarises arguments and accounts coherently, and expresses themselves spontaneously, very fluently and precisely, even in complex situations.',
  },
]

const CEFR_IELTS: { cefr: string; ielts: string }[] = [
  { cefr: 'A1–A2', ielts: 'Below 4.0' },
  { cefr: 'B1', ielts: '4.0 – 5.0' },
  { cefr: 'B2', ielts: '5.5 – 6.5' },
  { cefr: 'C1', ielts: '7.0 – 8.0' },
  { cefr: 'C2', ielts: '8.5 – 9.0' },
]

export function CefrLevelsPage() {
  return (
    <ResourceShell
      title="CEFR levels explained"
      lede="The Common European Framework of Reference for Languages (CEFR) is the international standard for describing language ability. It runs from A1 (beginner) to C2 (mastery), and it is the backbone of Guidelight’s English-level diagnostics."
    >
      <section className="space-y-3">
        <H2>What is the CEFR?</H2>
        <P>
          The CEFR is a framework published by the Council of Europe that describes what a language
          learner can do at each stage of proficiency. Instead of vague labels like “good English”,
          it defines concrete abilities — what a student can understand, say, read and write — across
          six levels: A1, A2, B1, B2, C1 and C2. Schools, exam boards and employers around the world
          use it as a common currency for language level.
        </P>
      </section>

      <section className="space-y-4">
        <H2>The six levels</H2>
        <div className="space-y-5">
          {CEFR_LEVELS.map((l) => (
            <div key={l.level} className="space-y-1">
              <H3>
                {l.level} — {l.name}
              </H3>
              <P>{l.summary}</P>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <H2>How CEFR maps to IELTS bands</H2>
        <P>
          Teachers often need to translate CEFR levels into IELTS bands. The mapping is approximate
          — the exams measure different things — but this is the commonly accepted alignment:
        </P>
        <ul className="list-disc space-y-1 pl-5">
          {CEFR_IELTS.map((m) => (
            <li key={m.cefr}>
              <strong className="text-foreground">{m.cefr}</strong> ≈ IELTS {m.ielts}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <H2>How Guidelight measures English level</H2>
        <P>
          {PRODUCT_NAME} includes a full CEFR diagnostic that students complete in one sitting:
          vocabulary, grammar, reading and listening comprehension, calibrated against the CEFR
          descriptor bank from A1 to C2. Results are reported as a CEFR level with an indicative
          IELTS band, and feed directly into task difficulty, story recommendations and
          exam-readiness estimates.
        </P>
        <P>
          A built-in RSVP reading-speed test measures words-per-minute with comprehension
          spot-checks, so placement reflects genuine understanding rather than skimming. Together
          these give teachers a defensible, evidence-based placement for every student — without
          marking a single paper.
        </P>
      </section>
    </ResourceShell>
  )
}

export function AiMarkingRubricsPage() {
  return (
    <ResourceShell
      title="Rubric-aligned AI marking"
      lede="AI marking is only useful if it marks to your standard. Guidelight aligns every mark to the rubric you upload — exam-board specific, teacher reviewed, and never released to students until you say so."
    >
      <section className="space-y-3">
        <H2>What “rubric-aligned” means</H2>
        <P>
          Every exam board rewards different things. An essay that scores full marks under one
          board’s criteria can underperform under another’s. In {PRODUCT_NAME}, you upload the
          exam-board rubric itself when you create an essay task. The AI then marks against those
          exact criteria — band by band, criterion by criterion — rather than against a generic
          notion of “good writing”.
        </P>
      </section>

      <section className="space-y-3">
        <H2>The workflow</H2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Upload the rubric.</strong> Paste or upload the
            exam-board marking criteria when creating the task.
          </li>
          <li>
            <strong className="text-foreground">Model essay.</strong> The AI drafts a model answer
            aligned to the top band of your rubric, so students can see what excellence looks like.
          </li>
          <li>
            <strong className="text-foreground">Student writes.</strong> The task is delivered as a
            single-question essay with the integrity controls you choose.
          </li>
          <li>
            <strong className="text-foreground">AI marks.</strong> Each attempt receives a mark and
            written feedback tied to specific rubric criteria.
          </li>
          <li>
            <strong className="text-foreground">Teacher reviews.</strong> Nothing reaches students
            until you have reviewed and released the marks. You stay the examiner of record.
          </li>
          <li>
            <strong className="text-foreground">Rewrite loop.</strong> Students revise against the
            feedback and resubmit, turning one essay into a genuine learning cycle.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <H2>Why teacher review is built in</H2>
        <P>
          AI output is probabilistic; assessment is consequential. {PRODUCT_NAME} therefore treats
          AI marks as drafts: fast, consistent and rubric-referenced, but provisional. Teachers
          review, adjust and release. Every mark is then stored against the student’s profile,
          feeding weakspot analysis and exam-readiness probabilities across the term.
        </P>
      </section>

      <section className="space-y-3">
        <H2>Where the AI runs</H2>
        <P>
          All marking runs on Cloudflare Workers AI, at the edge, on our own domain. Class data is
          never sent to OpenAI, ChatGPT or any external AI provider — which keeps the feature
          usable in every region and straightforward under GDPR and school data policies.
        </P>
      </section>
    </ResourceShell>
  )
}
