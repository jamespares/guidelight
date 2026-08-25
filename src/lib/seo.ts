import { DEMO_VIDEO_POSTER, DEMO_VIDEO_URL } from '@/lib/demo'
import { APP_URL, OPERATOR_NAME, SUPPORT_EMAIL } from '@/lib/legal'
import { landingCopy } from '@/pages/landing/landingCopy'
import { STORIES } from '@shared/cefr/stories'

/**
 * Single source of truth for SEO/GEO metadata.
 * Consumed by scripts/prerender.mjs (via the SSR bundle) to stamp per-route
 * <head> tags and JSON-LD into the static HTML, and by useDocumentTitle for
 * client-side navigation. index.html carries the DEFAULT_* values so the raw
 * template is already correct for the landing page.
 */

export const SITE_URL = APP_URL
export const SITE_NAME = 'Guidelight'
export const OG_IMAGE_URL = `${SITE_URL}/brand/og-image.png`

export const DEFAULT_TITLE = 'Guidelight — AI-native homework, assessment & insights for teachers'
export const DEFAULT_DESCRIPTION =
  'Guidelight turns every homework, assessment and class activity into clear, actionable data — AI-generated tasks, automatic marking and exam-readiness insights, with institutional-grade privacy.'

export interface RouteMeta {
  path: string
  title: string
  description: string
}

/** Document titles for the stories pages, shared by prerender + client nav. */
export const storiesHubTitle = 'Graded English stories (A1–C2) with audio — Guidelight'
export const storyLevelTitle = (level: string) =>
  `${level} graded English stories with audio — Guidelight`
export const storyReaderTitle = (story: { title: string; level: string }) =>
  `${story.title} — ${story.level} graded story with audio — Guidelight`

const STORY_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

/** Document titles for the Oxford 3000 flashcards pages, shared by prerender + client nav. */
export type FlashcardsLevel = 'A1' | 'A2' | 'B1' | 'B2'
export const flashcardsHubTitle = 'Oxford 3000 flashcards with Chinese meanings (A1–B2) — Guidelight'
export const flashcardsLevelTitle = (level: string) =>
  `Oxford 3000 ${level} flashcards — English to Chinese vocabulary practice — Guidelight`

const FLASHCARDS_LEVELS: FlashcardsLevel[] = ['A1', 'A2', 'B1', 'B2']

const flashcardsRoutes: RouteMeta[] = [
  {
    path: '/flashcards',
    title: flashcardsHubTitle,
    description:
      'Free Oxford 3000 flashcards organised by CEFR level (A1–B2), English to Chinese. Test yourself, skip words you know, and jump back to where you left off — no login required. 免费牛津3000词抽认卡，英译中，按CEFR等级分类。',
  },
  ...FLASHCARDS_LEVELS.map(
    (level): RouteMeta => ({
      path: `/flashcards/${level.toLowerCase()}`,
      title: flashcardsLevelTitle(level),
      description: `Free Oxford 3000 ${level} flashcards with Chinese translations — tap to flip, skip the words you know and pick up where you left off. 免费牛津3000词${level}等级中英抽认卡，无需登录。`,
    }),
  ),
]

const storiesRoutes: RouteMeta[] = [
  {
    path: '/stories',
    title: storiesHubTitle,
    description:
      'Twelve free CEFR-graded English stories from A1 to C2, each with synchronised audio, word-by-word karaoke highlighting, Chinese translation and PDF/DOCX downloads.',
  },
  ...STORY_LEVELS.map(
    (level): RouteMeta => ({
      path: `/stories/${level.toLowerCase()}`,
      title: storyLevelTitle(level),
      description: `Free ${level} CEFR-graded English stories with audio, word-by-word karaoke highlighting, Chinese translations and PDF/DOCX downloads — no login required.`,
    }),
  ),
  ...STORIES.map(
    (story): RouteMeta => ({
      path: `/stories/read/${story.slug}`,
      title: storyReaderTitle(story),
      description: `Read and listen to “${story.title}” (${story.zhTitle}) — a free ${story.level} CEFR-graded English story, ${story.words} words in ${story.accent}, with karaoke highlighting and PDF/DOCX downloads.`,
    }),
  ),
]

/** Public routes that get prerendered to static HTML at build time. */
export const PRERENDER_ROUTES: RouteMeta[] = [
  { path: '/', title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  {
    path: '/get-started',
    title: 'Get started — Guidelight',
    description:
      'Create a Guidelight teacher account, or sign in as a student or parent. Starter credit included — no card required.',
  },
  {
    path: '/resources/cefr-levels',
    title: 'CEFR levels explained (A1–C2) — Guidelight',
    description:
      'What the CEFR A1–C2 levels mean, how they map to IELTS bands, and how Guidelight measures a student’s English level in one sitting.',
  },
  {
    path: '/resources/ai-marking-rubrics',
    title: 'Rubric-aligned AI marking — Guidelight',
    description:
      'How Guidelight aligns AI marking to an exam-board rubric: model essays, written feedback, teacher review and a student rewrite loop.',
  },
  {
    path: '/terms',
    title: 'Terms of Service — Guidelight',
    description:
      'The terms that govern use of Guidelight: accounts, acceptable use, AI features, pay-as-you-go billing and liability.',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy — Guidelight',
    description:
      'What data Guidelight processes, why, and the controls teachers and schools have — including GDPR export and deletion.',
  },
  {
    path: '/accessibility',
    title: 'Accessibility Statement — Guidelight',
    description:
      'Guidelight’s commitment to WCAG 2.1 AA: keyboard navigation, screen-reader support, contrast, and how to report barriers.',
  },
  ...storiesRoutes,
  ...flashcardsRoutes,
]

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  legalName: OPERATOR_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/brand/guidelight-logo.png`,
  email: SUPPORT_EMAIL,
}

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: 'en',
}

const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  url: SITE_URL,
  description: DEFAULT_DESCRIPTION,
  provider: { '@type': 'Organization', name: OPERATOR_NAME, url: SITE_URL },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description:
      'Starter credit included; pay-as-you-go AI usage with a configurable monthly spending cap.',
  },
}

/** Site-wide structured data, injected into every prerendered page. */
export function siteJsonLd(): object[] {
  return [organizationJsonLd, websiteJsonLd, softwareApplicationJsonLd]
}

/** Route-specific structured data (currently the landing page extras). */
export function routeJsonLd(path: string): object[] {
  if (path !== '/') return []
  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: landingCopy.en.faq.items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
  const video = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: 'Guidelight classroom demo',
    description:
      'A walkthrough of Guidelight: AI-generated homework and assessments, automatic marking with written feedback, and class insights.',
    thumbnailUrl: `${SITE_URL}${DEMO_VIDEO_POSTER}`,
    contentUrl: `${SITE_URL}${DEMO_VIDEO_URL}`,
    uploadDate: '2026-08-09',
  }
  return [faqPage, video]
}
