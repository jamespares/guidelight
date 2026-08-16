import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GuidelightWordmark } from '@/components/BrandMark'
import { LegalFooter } from '@/components/LegalFooter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { PRODUCT_NAME } from '@/lib/legal'
import {
  StoriesHubPage,
  StoriesLevelPage,
  StoryReaderPage,
} from '@/pages/student/StoriesPages'

export const PUBLIC_STORIES_BASE = '/stories'

/**
 * Public (no-login) wrapper around the graded-stories pages. Same sticky-header
 * shell as the resource/legal pages, but wider — the story grids and reader
 * were designed for a roomy content area.
 */
function PublicStoriesShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="text-xl" aria-label={`${PRODUCT_NAME} home`}>
            <GuidelightWordmark />
          </Link>
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link to="/get-started">Get started</Link>
            </Button>
            <ThemeToggle className="border-border/40 bg-card/40 shadow-sm" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>

      <footer className="mx-auto max-w-5xl border-t border-border/60 px-6 py-8">
        <LegalFooter />
      </footer>
    </div>
  )
}

export function PublicStoriesHubPage() {
  return (
    <PublicStoriesShell>
      <StoriesHubPage base={PUBLIC_STORIES_BASE} />
      <div className="mt-14 flex flex-col items-center gap-4 border-t border-border/60 pt-10 text-center">
        <p className="text-sm font-medium text-foreground/80">
          Free to read and listen — create an account to track your students' progress across
          stories, diagnostics and homework.
        </p>
        <Button asChild size="lg" className="min-w-[11rem] sm:px-10">
          <Link to="/get-started">Sign up to track progress</Link>
        </Button>
      </div>
    </PublicStoriesShell>
  )
}

export function PublicStoriesLevelPage() {
  return (
    <PublicStoriesShell>
      <StoriesLevelPage base={PUBLIC_STORIES_BASE} />
    </PublicStoriesShell>
  )
}

export function PublicStoryReaderPage() {
  return (
    <PublicStoriesShell>
      <StoryReaderPage base={PUBLIC_STORIES_BASE} />
    </PublicStoriesShell>
  )
}
