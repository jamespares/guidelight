import type { ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { ThemeProvider } from '@/lib/theme'
import { Landing } from '@/pages/landing/LandingPage'
import { RoleSelectPage } from '@/pages/landing/RoleSelectPage'
import { CefrLevelsPage, AiMarkingRubricsPage } from '@/pages/resources/ResourcePages'
import {
  AccessibilityStatementPage,
  PrivacyPolicyPage,
  TermsOfServicePage,
} from '@/pages/shared/LegalPages'

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
}

export function renderRoute(path: string): string {
  const Page = PAGES[path]
  if (!Page) throw new Error(`No prerender page registered for ${path}`)
  return renderToString(
    <ThemeProvider>
      <StaticRouter location={path}>
        <Page />
      </StaticRouter>
    </ThemeProvider>,
  )
}

// Re-exported so the prerender script has one import surface for HTML + head data
export { PRERENDER_ROUTES, routeJsonLd, siteJsonLd } from '@/lib/seo'
