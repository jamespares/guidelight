import { lazy, Suspense, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpenCheck,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Languages,
  LineChart,
  PiggyBank,
  Play,
  Quote,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { BrandStar, GuidelightWordmark } from '@/components/BrandMark'
import { DemoVideoDialog } from '@/components/DemoVideoDialog'
import { LegalFooter } from '@/components/LegalFooter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { landingCopy, type LandingLang } from '@/pages/landing/landingCopy'
import { useInView } from '@/lib/useInView'
import { cn } from '@/lib/utils'

const NightGuideScene = lazy(() =>
  import('@/components/NightGuideScene').then((m) => ({ default: m.NightGuideScene })),
)

const FEATURE_ICONS: LucideIcon[] = [
  BookOpenCheck,
  ClipboardList,
  LineChart,
  CalendarDays,
  ShieldCheck,
  Languages,
]

const PRICING_ICONS: LucideIcon[] = [PiggyBank, SlidersHorizontal, Receipt]

const LANG_STORAGE_KEY = 'guidelight-landing-lang'

function initialLang(): LandingLang {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY)
    if (stored === 'en' || stored === 'zh') return stored
  } catch {
    /* ignore */
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh')) {
    return 'zh'
  }
  return 'en'
}

function scrollToMission() {
  document.getElementById('mission')?.scrollIntoView({ behavior: 'smooth' })
}

function FeatureTile({
  icon: Icon,
  title,
  features,
  impact,
  inView,
  index,
}: {
  icon: LucideIcon
  title: string
  features: string
  impact: string
  inView: boolean
  index: number
}) {
  return (
    <div
      className={cn(
        'motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out',
        inView
          ? 'motion-safe:translate-y-0 motion-safe:opacity-100'
          : 'motion-safe:translate-y-6 motion-safe:opacity-0',
      )}
      style={{ transitionDelay: inView ? `${index * 90}ms` : '0ms' }}
    >
      <Card className="group relative h-full overflow-hidden border-0 bg-card/25 text-left shadow-sm backdrop-blur-xl transition-all duration-300 hover:bg-card/35 hover:shadow-lg motion-safe:hover:-translate-y-1">
        {/* Water-shimmer light sweep on hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent transition-transform duration-700 ease-out motion-safe:group-hover:translate-x-full"
        />
        <CardContent className="relative p-6">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-card/40 text-foreground/80">
            <Icon className="size-5" />
          </div>
          <h3 className="mb-3 font-display text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{features}</p>
          <p className="mt-4 border-t border-border/40 pt-3 text-sm leading-relaxed text-foreground/80">
            {impact}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <div className="rounded-xl border border-border/40 bg-card/25 backdrop-blur-xl transition-colors hover:bg-card/35">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left font-medium text-foreground"
      >
        {q}
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        id={panelId}
        role="region"
        className={cn(
          'grid transition-all duration-300 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  )
}

function ReviewCard({ quote, author, role }: { quote: string; author: string; role: string }) {
  return (
    <div className="flex w-[18rem] shrink-0 flex-col justify-between rounded-2xl border border-border/40 bg-card/30 p-6 backdrop-blur-xl sm:w-[22rem]">
      <Quote className="mb-4 size-5 text-foreground/40" />
      <p className="flex-1 text-base leading-relaxed text-foreground/90">{quote}</p>
      <div className="mt-5">
        <p className="font-display text-sm font-semibold text-foreground">{author}</p>
        <p className="text-xs text-muted-foreground">{role}</p>
      </div>
    </div>
  )
}

function ReviewsSection({
  eyebrow,
  heading,
  reviews,
}: {
  eyebrow: string
  heading: string
  reviews: Array<{ quote: string; author: string; role: string }>
}) {
  return (
    <section id="reviews" className="relative z-10 w-full overflow-hidden py-24 sm:py-28">
      <div className="mx-auto max-w-5xl space-y-4 px-6 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
        <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
          {heading}
        </h2>
      </div>
      <div className="relative mt-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background/75 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background/75 to-transparent"
        />
        <div className="flex w-max gap-6 px-6 animate-marquee will-change-transform hover:[animation-play-state:paused] motion-reduce:[animation-play-state:paused]">
          {reviews.map((r, i) => (
            <ReviewCard key={`r1-${i}`} {...r} />
          ))}
          {reviews.map((r, i) => (
            <div key={`r2-${i}`} aria-hidden>
              <ReviewCard {...r} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Landing() {
  const [lang, setLang] = useState<LandingLang>(initialLang)
  const t = landingCopy[lang]
  const featuresView = useInView<HTMLDivElement>(0.15)
  const pricingView = useInView<HTMLDivElement>(0.15)
  const faqView = useInView<HTMLDivElement>(0.15)

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang)
    } catch {
      /* ignore */
    }
  }, [lang])

  return (
    <div className="relative overflow-hidden">
      {/* Fixed ocean backdrop */}
      <div className="fixed inset-0 z-0">
        <Suspense fallback={null}>
          <NightGuideScene className="z-0" />
        </Suspense>
      </div>

      {/* Language + theme toggles */}
      <div className="fixed right-4 top-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
          className="rounded-lg border border-border/40 bg-card/30 px-3 py-2 text-xs font-semibold text-foreground/80 shadow-sm backdrop-blur-xl transition-colors hover:bg-card/45 hover:text-foreground"
          aria-label={lang === 'en' ? '切换到中文' : 'Switch to English'}
        >
          {lang === 'en' ? '中文' : 'EN'}
        </button>
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
            <h1>
              <GuidelightWordmark showStar={false} className="text-6xl sm:text-7xl md:text-8xl" />
            </h1>
          </div>

          <p className="text-lg font-normal leading-relaxed text-foreground/80 sm:text-xl">
            {t.hero.tagline}
          </p>

          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-w-[11rem] sm:px-10">
              <Link to="/get-started">{t.hero.getStarted}</Link>
            </Button>
            <DemoVideoDialog
              trigger={
                <Button variant="ghost" size="lg" className="text-foreground/70 hover:text-foreground">
                  <Play className="h-4 w-4" />
                  {t.hero.watchDemo}
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
          aria-label={t.hero.scrollLabel}
        >
          <ChevronDown className="h-6 w-6 animate-bounce" />
        </button>
      </section>

      {/* Mission section */}
      <section
        id="mission"
        className="relative z-10 w-full bg-gradient-to-b from-background/70 via-background/80 to-background/70 px-6 py-24 backdrop-blur-sm sm:py-32"
      >
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            {t.mission.eyebrow}
          </p>
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
            {t.mission.heading}
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t.mission.body}
          </p>
        </div>
      </section>

      {/* Features section */}
      <section id="features" className="relative z-10 w-full bg-background/75 px-6 py-24 backdrop-blur-sm sm:py-28">
        <div className="mx-auto max-w-5xl space-y-12">
          <div className="space-y-4 text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              {t.features.eyebrow}
            </p>
            <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              {t.features.heading}
            </h2>
          </div>
          <div ref={featuresView.ref} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.features.items.map((f, i) => (
              <FeatureTile
                key={f.title}
                icon={FEATURE_ICONS[i] ?? BookOpenCheck}
                title={f.title}
                features={f.features}
                impact={f.impact}
                inView={featuresView.inView}
                index={i}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Reviews section */}
      <ReviewsSection
        eyebrow={t.reviews.eyebrow}
        heading={t.reviews.heading}
        reviews={t.reviews.items}
      />

      {/* Pricing section */}
      <section id="pricing" className="relative z-10 w-full bg-background/75 px-6 pb-24 backdrop-blur-sm sm:pb-28">
        <div
          ref={pricingView.ref}
          className={cn(
            'mx-auto max-w-3xl motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out',
            pricingView.inView
              ? 'motion-safe:translate-y-0 motion-safe:opacity-100'
              : 'motion-safe:translate-y-6 motion-safe:opacity-0',
          )}
        >
          <Card className="relative overflow-hidden border-0 bg-card/25 shadow-sm backdrop-blur-xl">
            <CardContent className="relative space-y-10 p-8 text-center sm:p-12">
              <div className="space-y-4">
                <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                  {t.pricing.eyebrow}
                </p>
                <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
                  {t.pricing.heading}
                </h2>
                <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {t.pricing.body}
                </p>
              </div>

              <div className="grid gap-6 text-left sm:grid-cols-3">
                {t.pricing.points.map((p, i) => {
                  const Icon = PRICING_ICONS[i] ?? PiggyBank
                  return (
                    <div key={p.title} className="space-y-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-card/40 text-foreground/80">
                        <Icon className="size-5" />
                      </div>
                      <h3 className="font-display text-base font-semibold text-foreground">
                        {p.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                    </div>
                  )
                })}
              </div>

              <Button asChild size="lg" className="min-w-[11rem] sm:px-10">
                <Link to="/get-started">{t.pricing.cta}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FAQ section */}
      <section id="faq" className="relative z-10 w-full bg-background/75 px-6 pb-24 backdrop-blur-sm sm:pb-28">
        <div
          ref={faqView.ref}
          className={cn(
            'mx-auto max-w-2xl space-y-8 motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out',
            faqView.inView
              ? 'motion-safe:translate-y-0 motion-safe:opacity-100'
              : 'motion-safe:translate-y-6 motion-safe:opacity-0',
          )}
        >
          <div className="space-y-4 text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              {t.faq.eyebrow}
            </p>
            <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              {t.faq.heading}
            </h2>
          </div>
          <div className="space-y-3">
            {t.faq.items.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Sign-off + legal footer */}
      <div className="relative z-10 bg-background/80 px-6 pb-6 backdrop-blur-md">
        <div className="flex flex-col items-center gap-5 pb-12 text-center">
          <p className="text-sm font-medium text-foreground/80">{t.signoff.line}</p>
          <Button asChild size="lg" className="min-w-[11rem] sm:px-10">
            <Link to="/get-started">{t.signoff.cta}</Link>
          </Button>
        </div>
        <LegalFooter variant="inline" />
      </div>
    </div>
  )
}
