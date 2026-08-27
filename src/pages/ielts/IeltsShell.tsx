import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GuidelightWordmark } from '@/components/BrandMark'
import { LegalFooter } from '@/components/LegalFooter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { PRODUCT_NAME } from '@/lib/legal'

/**
 * Public (no-login) shell for the IELTS listening mock exam — same
 * sticky-header layout as the graded-stories and flashcards pages.
 */
export function IeltsShell({ children }: { children: ReactNode }) {
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
