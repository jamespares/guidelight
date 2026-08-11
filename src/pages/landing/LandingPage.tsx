import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import { BrandStar, GuidelightWordmark } from '@/components/BrandMark'
import { DemoVideoDialog } from '@/components/DemoVideoDialog'
import { LegalFooter } from '@/components/LegalFooter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'

const NightGuideScene = lazy(() =>
  import('@/components/NightGuideScene').then((m) => ({ default: m.NightGuideScene })),
)

export function Landing() {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
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

      {/* Centered content */}
      <main
        id="main-content"
        className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center"
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
      </main>

      {/* Legal footer */}
      <div className="relative z-10 px-6 pb-6">
        <LegalFooter variant="overlay" />
      </div>
    </div>
  )
}
