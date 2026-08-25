import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { OXFORD_3000, type OxfordWord } from '@/data/oxford3000/index'
import {
  flashcardsHubTitle,
  flashcardsLevelTitle,
  type FlashcardsLevel,
} from '@/lib/seo'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

const LEVELS: FlashcardsLevel[] = ['A1', 'A2', 'B1', 'B2']

const LEVEL_BLURBS: Record<FlashcardsLevel, string> = {
  A1: 'Everyday basics — the first words every English speaker learns. 入门基础词。',
  A2: 'Everyday English — shopping, travel, past events and plans. 初级日常用词。',
  B1: 'Intermediate — experiences, opinions, hopes and decisions. 中级常用词。',
  B2: 'Upper-intermediate — abstract ideas, argument and nuance. 中高级词汇。',
}

const PROGRESS_KEY = 'oxford3000-flashcard-progress'

type ProgressMap = Partial<Record<FlashcardsLevel, number>>

function readProgress(): ProgressMap {
  try {
    if (typeof localStorage === 'undefined') return {} // SSR prerender
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveProgress(level: FlashcardsLevel, index: number) {
  try {
    if (typeof localStorage === 'undefined') return // SSR prerender
    const map = readProgress()
    map[level] = index
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(map))
  } catch {
    // private browsing / storage full — progress simply won't persist
  }
}

export function FlashcardsHubPage() {
  useDocumentTitle(flashcardsHubTitle)
  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const w of OXFORD_3000) c.set(w.lv, (c.get(w.lv) ?? 0) + 1)
    return c
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Free vocabulary trainer"
        title="Oxford 3000 Flashcards"
        description={
          <>
            The 3,000 most important English words, organised by CEFR level, with Chinese
            meanings. Pick a level and test yourself — no login, completely free.
            <br />
            牛津3000核心词，按 CEFR 等级分类，英译中抽认卡。选择等级开始自测——免费，无需登录。
          </>
        }
      />

      <Card>
        <CardContent className="space-y-2 p-6">
          <h2 className="font-semibold">How to use 使用方法</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Look at the English word and say the Chinese meaning out loud, then tap the card to
              check. 先看英文单词，说出中文意思，再点卡片核对。
            </li>
            <li>
              Tap <strong>我认识 I know it</strong> to skip ahead — only review what you don't
              know. 认识就跳过，只复习不熟的词。
            </li>
            <li>
              Your place is remembered on this device, or jump to any word number to pick up where
              you left off. 进度会自动记住，也可以输入编号跳到上次的位置。
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {LEVELS.map((level) => (
          <Link
            key={level}
            to={`/flashcards/${level.toLowerCase()}`}
            className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm"
          >
            <div className="flex flex-wrap gap-2">
              <Badge variant="accent">{level}</Badge>
              <Badge variant="outline">{counts.get(level) ?? 0} words</Badge>
            </div>
            <h2 className="mt-3 text-lg font-semibold">{level} flashcards</h2>
            <p className="mt-1 text-sm text-muted-foreground">{LEVEL_BLURBS[level]}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

function FlashcardDeck({ level }: { level: FlashcardsLevel }) {
  const words = useMemo(() => OXFORD_3000.filter((w) => w.lv === level), [level])
  const [index, setIndex] = useState(() => {
    const saved = readProgress()[level]
    return saved && saved > 0 && saved < words.length ? saved : 0
  })
  const [flipped, setFlipped] = useState(false)
  const [known, setKnown] = useState(0)
  const [learning, setLearning] = useState(0)
  const [jumpValue, setJumpValue] = useState('')
  const done = index >= words.length
  const word: OxfordWord | undefined = done ? undefined : words[index]

  useEffect(() => {
    saveProgress(level, Math.min(index, words.length))
  }, [index, level, words.length])

  // Keyboard: Space/Enter flips, ArrowRight = next (learning), ArrowUp = known.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (e.key === 'ArrowRight') {
        setIndex((i) => Math.min(i + 1, words.length))
        setFlipped(false)
      } else if (e.key === 'ArrowUp') {
        mark(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words.length])

  function mark(knewIt: boolean) {
    if (done) return
    if (knewIt) setKnown((k) => k + 1)
    else setLearning((l) => l + 1)
    setFlipped(false)
    setIndex((i) => i + 1)
  }

  function jump(e: React.FormEvent) {
    e.preventDefault()
    const n = Number.parseInt(jumpValue, 10)
    if (Number.isFinite(n) && n >= 1 && n <= words.length) {
      setIndex(n - 1)
      setFlipped(false)
      setJumpValue('')
    }
  }

  function restart() {
    setIndex(0)
    setFlipped(false)
    setKnown(0)
    setLearning(0)
    saveProgress(level, 0)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          Word 第 <strong className="text-foreground">{Math.min(index + 1, words.length)}</strong>{' '}
          of {words.length} · <span className="text-emerald-600 dark:text-emerald-400">认识 {known}</span>{' '}
          · <span className="text-amber-600 dark:text-amber-400">不熟 {learning}</span>
        </span>
        <Button variant="outline" size="sm" onClick={restart}>
          重新开始 Restart
        </Button>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${Math.min(100, (index / words.length) * 100)}%` }}
        />
      </div>

      {done ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <p className="font-display text-2xl font-semibold">全部完成！Level complete 🎉</p>
            <p className="text-sm text-muted-foreground">
              You marked <strong>{known}</strong> as known and <strong>{learning}</strong> as still
              learning. 认识 {known} 个，不熟 {learning} 个。Restart to review the ones you
              missed — or move up a level.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={restart}>再来一遍 Review again</Button>
              {level !== 'B2' ? (
                <Button asChild variant="outline">
                  <Link to={`/flashcards/${LEVELS[LEVELS.indexOf(level) + 1].toLowerCase()}`}>
                    Next level 下一级 →
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? 'Show English' : 'Show Chinese meaning'}
            className="block w-full rounded-2xl border border-border bg-card p-8 text-center shadow-sm transition-all hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-12"
          >
            <div className="flex items-center justify-center gap-2">
              <Badge variant="secondary">{word!.lv}</Badge>
              <Badge variant="outline">{word!.pos}</Badge>
            </div>
            <p className="mt-6 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {word!.w}
            </p>
            {word!.ph ? (
              <p className="mt-2 text-sm text-muted-foreground">/{word!.ph}/</p>
            ) : null}
            <div className="mt-8 min-h-12">
              {flipped ? (
                <p className="text-2xl font-medium leading-relaxed text-foreground sm:text-3xl">
                  {word!.zh}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  点击卡片看中文意思 — tap to reveal the Chinese meaning
                </p>
              )}
            </div>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <Button
              size="lg"
              variant="outline"
              className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
              onClick={() => mark(false)}
            >
              还不熟 Still learning
            </Button>
            <Button
              size="lg"
              className="bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-600 dark:hover:bg-emerald-600/90"
              onClick={() => mark(true)}
            >
              我认识 I know it ✓
            </Button>
          </div>

          <form onSubmit={jump} className="flex items-center gap-2">
            <label htmlFor="jump-to" className="shrink-0 text-sm text-muted-foreground">
              跳到第 Jump to
            </label>
            <Input
              id="jump-to"
              type="number"
              min={1}
              max={words.length}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              placeholder={`1–${words.length}`}
              className="w-28"
            />
            <Button type="submit" variant="outline" size="sm">
              Go
            </Button>
          </form>
        </>
      )}
    </div>
  )
}

export function FlashcardsLevelPage() {
  const { level } = useParams()
  const band = (level ?? '').toUpperCase() as FlashcardsLevel
  const valid = LEVELS.includes(band)
  useDocumentTitle(flashcardsLevelTitle(valid ? band : 'A1'))

  if (!valid) {
    return (
      <div className="space-y-4">
        <PageHeader title="Unknown level" />
        <p className="text-sm text-muted-foreground">
          Choose a level from A1 to B2. 请选择 A1 到 B2 的等级。
        </p>
        <Button asChild variant="outline">
          <Link to="/flashcards">← All levels 所有等级</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/flashcards" className="text-sm text-muted-foreground hover:underline">
          ← Oxford 3000 Flashcards
        </Link>
        <PageHeader
          title={`${band} flashcards`}
          description={LEVEL_BLURBS[band]}
        />
      </div>
      <FlashcardDeck key={band} level={band} />
    </div>
  )
}
