import type { ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { Route, Routes, StaticRouter } from 'react-router-dom'
import { ThemeProvider } from '@/lib/theme'
import { Landing } from '@/pages/landing/LandingPage'
import { RoleSelectPage } from '@/pages/landing/RoleSelectPage'
import { CefrLevelsPage, AiMarkingRubricsPage } from '@/pages/resources/ResourcePages'
import {
  AccessibilityStatementPage,
  PrivacyPolicyPage,
  TermsOfServicePage,
} from '@/pages/shared/LegalPages'
import {
  PublicStoriesHubPage,
  PublicStoriesLevelPage,
  PublicStoryReaderPage,
} from '@/pages/stories/PublicStoriesPages'
import { STORIES } from '@shared/cefr/stories'

/**
 * SSR entry used only by scripts/prerender.mjs (built via vite.ssr.config.ts).
 * Renders the public marketing/legal pages to static HTML so crawlers —
 * including AI crawlers that never execute JavaScript — receive real content.
 * App routes stay client-rendered; the prerendered pages hydrate normally.
 */

const PAGES: Record<string, ComponentType> = {
  '/': Landing,
  '/get-started': RoleSelectPage,
  '/resources/cefr-levels': CefrLevelsPage,
  '/resources/ai-marking-rubrics': AiMarkingRubricsPage,
  '/terms': TermsOfServicePage,
  '/privacy': PrivacyPolicyPage,
  '/accessibility': AccessibilityStatementPage,
  '/stories': PublicStoriesHubPage,
  ...Object.fromEntries(
    ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'].map((level) => [
      `/stories/${level}`,
      PublicStoriesLevelPage,
    ]),
  ),
  ...Object.fromEntries(
    STORIES.map((story) => [`/stories/read/${story.slug}`, PublicStoryReaderPage]),
  ),
}

/**
 * Route pattern used to render a prerendered path, so dynamic pages
 * (story levels/readers) get their useParams values under StaticRouter.
 */
function patternFor(path: string): string {
  if (path.startsWith('/stories/read/')) return '/stories/read/:slug'
  if (/^\/stories\/[a-c][12]$/.test(path)) return '/stories/:level'
  return path
}

export function renderRoute(path: string): string {
  const Page = PAGES[path]
  if (!Page) throw new Error(`No prerender page registered for ${path}`)
  return renderToString(
    <ThemeProvider>
      <StaticRouter location={path}>
        <Routes>
          <Route path={patternFor(path)} element={<Page />} />
        </Routes>
      </StaticRouter>
    </ThemeProvider>,
  )
}

// Re-exported so the prerender script has one import surface for HTML + head data
export { PRERENDER_ROUTES, routeJsonLd, siteJsonLd } from '@/lib/seo'
