import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { GuidelightWordmark } from '@/components/BrandMark'
import { LegalFooter } from '@/components/LegalFooter'
import { PageHeader } from '@/components/PageHeader'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PRODUCT_NAME } from '@/lib/legal'
import { flashcardLevelTitle, flashcardsHubTitle } from '@/lib/seo'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { cn } from '@/lib/utils'
import { FLASHCARD_LEVELS, OXFORD_3000, type FlashcardLevel } from './oxford3000'

/** Approximate IELTS band equivalents (same mapping as the graded stories). */
const IELTS_BANDS: Record<FlashcardLevel, string> = {
  A1: '2.0–3.0',
  A2: '3.0–3.5',
  B1: '4.0–5.0',
  B2: '5.5–6.5',
}

const LEVEL_BLURBS: Record<FlashcardLevel, string> = {
  A1: 'Beginner basics — everyday words for daily life. 入门级：日常生活基础词。',
  A2: 'Elementary — shopping, travel, past events and plans. 初级：购物、旅行、日常表达。',
  B1: 'Intermediate — opinions, experiences and connected ideas. 中级：观点、经历、连贯表达。',
  B2: 'Upper intermediate — abstract ideas and precise meaning. 中高级：抽象概念与精确表达。',
}

interface FlashcardProgress {
  /** Index of the card the student is on. */
  i: number
  /** Indices marked as known. */
  known: number[]
}

const storageKey = (level: FlashcardLevel) => `guidelight.flashcards.v1.${level}`

/** SSR-safe: during prerender there is no window, so start from the beginning. */
function loadProgress(level: FlashcardLevel): FlashcardProgress {
  if (typeof window === 'undefined') return { i: 0, known: [] }
  try {
    const raw = window.localStorage.getItem(storageKey(level))
    if (!raw) return { i: 0, known: [] }
    const parsed = JSON.parse(raw) as Partial<FlashcardProgress>
    const total = OXFORD_3000[level].length
    const i =
      typeof parsed.i === 'number' && parsed.i >= 0 && parsed.i < total ? Math.floor(parsed.i) : 0
    const known = Array.isArray(parsed.known)
      ? parsed.known.filter((n): n is number => typeof n === 'number' && n >= 0 && n < total)
      : []
    return { i, known }
  } catch {
    return { i: 0, known: [] }
  }
}

/**
 * Public (no-login) shell — same sticky-header layout as the graded-stories
 * and resource pages, wide content area for the flashcard app and word list.
 */
function FlashcardsShell({ children }: { children: ReactNode }) {
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

export function FlashcardsHubPage() {
  useDocumentTitle(flashcardsHubTitle)
  return (
    <FlashcardsShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Free vocabulary trainer · 免费词汇闪卡"
          title="Oxford 3000 word flashcards (A1–B2)"
          description={
            <>
              Free English–Chinese flashcards covering every entry of the Oxford 3000 — the 3,000
              most important words to learn in English — organised by CEFR level. No login
              required. 免费的英汉闪卡，收录牛津3000核心词汇表全部词条，按 CEFR
              级别（A1–B2）分类，无需登录。
            </>
          }
        />

        <Card>
          <CardContent className="space-y-2 p-6">
            <h2 className="font-semibold">How to use these flashcards 如何使用</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                <strong>Pick your level</strong> below (A1–B2). 选择你的 CEFR 级别。
              </li>
              <li>
                <strong>Say the Chinese meaning</strong> of the English word, then tap the card to
                check. 看着英文单词说出中文意思，点击卡片核对答案。
              </li>
              <li>
                <strong>Mark "I know it"</strong> to skip ahead — your progress is saved on this
                device. 认识就点"认识"，自动跳到下一个；进度保存在本设备上。
              </li>
              <li>
                <strong>Jump to any word number</strong> to pick up where you left off.
                输入词号即可跳转，随时接着上次继续学。
              </li>
            </ul>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {FLASHCARD_LEVELS.map((level) => (
            <Link
              key={level}
              to={`/flashcards/${level.toLowerCase()}`}
              className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm"
            >
              <div className="flex flex-wrap gap-2">
                <Badge variant="accent">{level}</Badge>
                <Badge variant="outline">IELTS {IELTS_BANDS[level]}</Badge>
              </div>
              <h2 className="mt-3 text-lg font-semibold">{level} flashcards</h2>
              <p className="mt-1 text-sm text-muted-foreground">{LEVEL_BLURBS[level]}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {OXFORD_3000[level].length} words 词
              </p>
            </Link>
          ))}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Word list: The Oxford 3000™ by CEFR level © Oxford University Press. Oxford 3000 is a
          trademark of Oxford University Press. Chinese glosses are provided by {PRODUCT_NAME} for
          study purposes. 词表来源于牛津大学出版社《牛津3000核心词汇表》（按 CEFR
          级别），中文释义由本站提供，仅供学习使用。
        </p>

        <div className="mt-8 flex flex-col items-center gap-4 border-t border-border/60 pt-10 text-center">
          <p className="text-sm font-medium text-foreground/80">
            Free to use — create an account to track your students' progress across flashcards,
            stories, diagnostics and homework.
          </p>
          <Button asChild size="lg" className="min-w-[11rem] sm:px-10">
            <Link to="/get-started">Sign up to track progress</Link>
          </Button>
        </div>
      </div>
    </FlashcardsShell>
  )
}

export function FlashcardsLevelPage() {
  const { level: levelParam } = useParams()
  const band = (levelParam ?? '').toUpperCase()
  if (!FLASHCARD_LEVELS.includes(band as FlashcardLevel)) {
    return <Navigate to="/flashcards" replace />
  }
  // key on level: navigating A1 -> A2 must reload that level's saved progress.
  return <FlashcardsLevelApp key={band} level={band as FlashcardLevel} />
}

function FlashcardsLevelApp({ level }: { level: FlashcardLevel }) {
  const words = OXFORD_3000[level]
  const total = words.length
  // Start from the SSR-consistent default so hydration matches the prerendered
  // HTML, then restore saved progress after mount (returning students resume).
  const [progress, setProgress] = useState<FlashcardProgress>({ i: 0, known: [] })
  const [loaded, setLoaded] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(false)
  const [jumpValue, setJumpValue] = useState('')
  useDocumentTitle(flashcardLevelTitle(level))

  useEffect(() => {
    setProgress(loadProgress(level))
    setLoaded(true)
  }, [level])

  const knownSet = useMemo(() => new Set(progress.known), [progress.known])
  const index = Math.min(progress.i, total - 1)
  const entry = words[index]
  const knownCount = progress.known.length

  // Persist progress on this device so students pick up where they left off.
  // Skipped until the saved state has been restored, so the first client render
  // does not overwrite it with the SSR default.
  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(
        storageKey(level),
        JSON.stringify({ i: index, known: progress.known }),
      )
    } catch {
      // storage unavailable (private mode etc.) — progress just won't persist
    }
  }, [loaded, level, index, progress.known])

  function goTo(next: number, markKnown: boolean) {
    setDone(false)
    setFlipped(false)
    setProgress((p) => ({
      i: Math.max(0, Math.min(next, total - 1)),
      known: markKnown && !p.known.includes(p.i) ? [...p.known, p.i] : p.known,
    }))
  }

  function advance(markKnown: boolean) {
    if (index >= total - 1) {
      if (markKnown && !knownSet.has(index)) {
        setProgress((p) => ({ ...p, known: [...p.known, index] }))
      }
      setDone(true)
      return
    }
    goTo(index + 1, markKnown)
  }

  function jump() {
    const n = Number.parseInt(jumpValue, 10)
    if (!Number.isNaN(n)) goTo(n - 1, false)
    setJumpValue('')
  }

  function restart() {
    setProgress({ i: 0, known: [] })
    setFlipped(false)
    setDone(false)
    try {
      window.localStorage.removeItem(storageKey(level))
    } catch {
      // ignore
    }
  }

  // Keyboard: ← previous, → next, Space/↑ flip.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowRight') advance(false)
      else if (e.key === 'ArrowLeft') goTo(index - 1, false)
      else if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault()
        setFlipped((f) => !f)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pct = Math.round(((index + 1) / total) * 100)

  return (
    <FlashcardsShell>
      <div className="space-y-6">
        <div>
          <Link to="/flashcards" className="text-sm text-muted-foreground hover:underline">
            ← Oxford 3000 flashcards
          </Link>
          <PageHeader
            eyebrow={`${total} words · IELTS ${IELTS_BANDS[level]}`}
            title={`${level} flashcards`}
            description={
              <>
                {LEVEL_BLURBS[level]} Tap the card to reveal the Chinese meaning, mark the words
                you know, and jump to any word number. 点击卡片查看中文释义；认识的词标记"认识"；可随时按词号跳转。
              </>
            }
            action={
              <Button variant="outline" size="sm" onClick={restart}>
                Restart 重新开始
              </Button>
            }
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-muted-foreground">
            <span>
              Word {index + 1} of {total} · 第 {index + 1} / {total} 词
            </span>
            <span>
              Known 认识 {knownCount} · Still learning 还需巩固 {total - knownCount}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={total}
            aria-label={`${level} flashcard progress`}
          >
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {done ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
              <h2 className="font-display text-2xl font-semibold">Level complete! 完成！</h2>
              <p className="text-sm text-muted-foreground">
                You have seen all {total} {level} words — known {knownCount}, still learning{' '}
                {total - knownCount}. 你已经看完本级别全部 {total} 个单词：认识 {knownCount}
                个，还需巩固 {total - knownCount} 个。
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button onClick={restart}>Review again 再学一遍</Button>
                <Button asChild variant="outline">
                  <Link to="/flashcards">Choose another level 选择其他级别</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              aria-live="polite"
              className={cn(
                'flex min-h-56 w-full flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-sm transition-all hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-64',
                knownSet.has(index) ? 'border-primary/40' : 'border-border',
              )}
            >
              <span className="flex flex-wrap items-center justify-center gap-2">
                <Badge variant="outline">{entry.pos}</Badge>
                {knownSet.has(index) ? <Badge variant="accent">Known 认识</Badge> : null}
              </span>
              <span className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">
                {entry.w}
              </span>
              {flipped ? (
                <span className="text-xl leading-relaxed text-foreground/90 sm:text-2xl">
                  {entry.zh}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Tap to reveal the Chinese meaning 点击卡片查看中文释义
                </span>
              )}
            </button>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Button
                variant="outline"
                onClick={() => goTo(index - 1, false)}
                disabled={index === 0}
              >
                ← Previous 上一个
              </Button>
              <Button variant="outline" onClick={() => setFlipped((f) => !f)}>
                {flipped ? 'Hide 隐藏释义' : 'Flip 翻面'}
              </Button>
              <Button variant="secondary" onClick={() => advance(false)}>
                Skip 跳过 →
              </Button>
              <Button onClick={() => advance(true)}>I know it 认识 →</Button>
            </div>

            <form
              className="flex flex-wrap items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                jump()
              }}
            >
              <label htmlFor="flashcard-jump" className="text-sm text-muted-foreground">
                Jump to word 跳转到第
              </label>
              <Input
                id="flashcard-jump"
                type="number"
                min={1}
                max={total}
                inputMode="numeric"
                value={jumpValue}
                onChange={(e) => setJumpValue(e.target.value)}
                placeholder={`1–${total}`}
                className="w-28"
              />
              <Button type="submit" variant="outline" size="sm">
                Go 跳转
              </Button>
              <span className="text-xs text-muted-foreground">
                Your place is saved on this device. 学习进度会自动保存在本设备上。
              </span>
            </form>
          </>
        )}

        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer p-5 text-sm font-semibold">
            Full {level} word list 查看完整词表（{total} words 词）
          </summary>
          <div className="border-t border-border/60 px-5 py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Word 单词</th>
                  <th className="py-2 pr-3 font-medium">POS 词性</th>
                  <th className="py-2 font-medium">中文释义</th>
                </tr>
              </thead>
              <tbody>
                {words.map((w, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="py-1.5 pr-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-3 font-medium text-foreground">{w.w}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{w.pos}</td>
                    <td className="py-1.5 text-foreground/90">{w.zh}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Word list: The Oxford 3000™ by CEFR level © Oxford University Press. Oxford 3000 is a
          trademark of Oxford University Press. Chinese glosses are provided by {PRODUCT_NAME} for
          study purposes. 词表来源于牛津大学出版社《牛津3000核心词汇表》，中文释义由本站提供，仅供学习使用。
        </p>
      </div>
    </FlashcardsShell>
  )
}
