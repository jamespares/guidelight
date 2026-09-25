import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { englishLevelTestTitle } from '@/lib/seo'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { PublicToolsShell } from '@/pages/tools/PublicToolsShell'
import {
  buildEnglishLevelReport,
  copyTextToClipboard,
  reportDate,
  type LevelBreakdownRow,
} from '@/pages/tools/publicTestUtils'
import { PASSAGES, type Item } from '@shared/cefr/items'
import {
  calculateLevel,
  ieltsBandForLevel,
  PARALLEL_FORM_COUNT,
  scoreAnswers,
  selectItems,
  TEST_TIME_LIMIT_SECONDS,
  totalScore,
  type ScoredResponse,
} from '@shared/cefr/test-engine'

function audioUrlFor(item: Item): string | null {
  if (item.type === 'dictation' || item.type === 'listening') {
    return `/cefr-audio/${item.audioKey.replace(/^audio\//, '')}`
  }
  return null
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function AudioPlayer({ src, maxPlays = 3 }: { src: string; maxPlays?: number }) {
  const [plays, setPlays] = useState(0)
  const left = Math.max(0, maxPlays - plays)
  return (
    <div className="space-y-1">
      <audio
        controls={left > 0}
        src={src}
        className="w-full max-w-md"
        onPlay={() => setPlays((p) => p + 1)}
      />
      <p className="text-xs text-muted-foreground">
        {left} play{left === 1 ? '' : 's'} left
      </p>
    </div>
  )
}

interface ReviewRow {
  itemId: string
  level: string
  skill: string
  type: string
  prompt: string
  response: string
  score: number
  maxScore: number
  correct: string | null
  feedback: string
}

export function EnglishLevelTestPage() {
  useDocumentTitle(englishLevelTestTitle)
  const [phase, setPhase] = useState<'start' | 'test' | 'result'>('start')
  const [name, setName] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [secondsLeft, setSecondsLeft] = useState(TEST_TIME_LIMIT_SECONDS)
  const [timeAnnouncement, setTimeAnnouncement] = useState('')
  const announcedBoundary = useRef<number | null>(null)
  const autoSubmitted = useRef(false)
  const [result, setResult] = useState<{
    level: string
    score: number
    max: number
    ieltsBand: string
    perLevel: LevelBreakdownRow[]
    report: string
  } | null>(null)
  const [review, setReview] = useState<ReviewRow[]>([])
  const [copied, setCopied] = useState(false)

  const grouped = useMemo(() => items, [items])

  useEffect(() => {
    if (phase !== 'test') return
    const t = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [phase])

  useEffect(() => {
    if (secondsLeft <= 0) return
    if (secondsLeft === 10) {
      setTimeAnnouncement('10 seconds remaining')
      return
    }
    const minutes = Math.floor(secondsLeft / 60)
    if (secondsLeft % 60 === 0 && minutes > 0 && announcedBoundary.current !== minutes) {
      announcedBoundary.current = minutes
      setTimeAnnouncement(`${minutes} minute${minutes === 1 ? '' : 's'} remaining`)
    }
  }, [secondsLeft])

  // Keep a live ref to submit so the auto-submit effect stays dependency-stable.
  const submitRef = useRef<() => void>(() => {})
  useEffect(() => {
    submitRef.current = submit
  })

  // Auto-submit when the time limit runs out — the limit is real, not advisory.
  useEffect(() => {
    if (phase !== 'test' || secondsLeft > 0 || autoSubmitted.current) return
    autoSubmitted.current = true
    setTimeAnnouncement("Time's up — submitting your answers")
    submitRef.current()
  }, [phase, secondsLeft])

  function start() {
    const formIndex = Math.floor(Math.random() * PARALLEL_FORM_COUNT)
    setItems(selectItems({ formIndex }))
    setAnswers({})
    setSecondsLeft(TEST_TIME_LIMIT_SECONDS)
    autoSubmitted.current = false
    announcedBoundary.current = null
    setCopied(false)
    setPhase('test')
    window.scrollTo({ top: 0 })
  }

  function submit() {
    const inputs = items.map((item) => ({
      itemId: item.id,
      response: (answers[item.id] ?? '').trim(),
    }))
    const scored: ScoredResponse[] = scoreAnswers(items, inputs)
    const totals = totalScore(scored)
    const level = calculateLevel(scored)
    const ieltsBand = ieltsBandForLevel(level)
    const perLevel: LevelBreakdownRow[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lv) => {
      const rows = scored.filter((r) => r.itemLevel === lv)
      return {
        level: lv,
        score: rows.reduce((sum, r) => sum + r.score, 0),
        max: rows.reduce((sum, r) => sum + r.maxScore, 0),
      }
    })
    const date = reportDate()
    const report = buildEnglishLevelReport({
      name: name.trim(),
      date,
      level,
      score: totals.score,
      max: totals.max,
      ieltsBand,
      perLevel,
    })
    setResult({ level, score: totals.score, max: totals.max, ieltsBand, perLevel, report })
    setReview(
      scored.map((r) => {
        const item = items.find((i) => i.id === r.itemId)
        let correct: string | null = null
        let feedback = ''
        if (item) {
          if (
            item.type === 'mcq' ||
            item.type === 'cloze' ||
            item.type === 'reading' ||
            item.type === 'listening'
          ) {
            correct = item.correct
          } else if (item.type === 'dictation') {
            correct = item.transcript
          } else {
            feedback = `Matched ${r.score} of ${r.maxScore} key points (automatic marking).`
          }
        }
        return {
          itemId: r.itemId,
          level: r.itemLevel,
          skill: r.itemSkill,
          type: r.itemType,
          prompt:
            item && item.type === 'reading'
              ? `Gap ${item.gapIndex}`
              : (item?.prompt ?? r.itemId),
          response: r.response,
          score: r.score,
          maxScore: r.maxScore,
          correct,
          feedback,
        }
      }),
    )
    setPhase('result')
    window.scrollTo({ top: 0 })
  }

  async function copyReport() {
    if (!result) return
    const ok = await copyTextToClipboard(result.report)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 3000)
    }
  }

  return (
    <PublicToolsShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader
            eyebrow="Free tool · no login needed"
            title="Free English level test (CEFR A1–C2)"
            description="A full diagnostic of vocabulary, listening, reading, grammar and writing, with an instant CEFR level and indicative IELTS band."
          />
          {phase === 'test' ? (
            <Badge variant={secondsLeft < 300 ? 'warn' : 'accent'} className="text-base px-3 py-1">
              {formatTime(secondsLeft)}
            </Badge>
          ) : null}
        </div>

        {phase === 'start' ? (
          <div className="space-y-6">
            <Card>
              <CardContent className="space-y-4 p-6">
                <div className="rounded-lg border border-warning-foreground/30 bg-warning p-3 text-sm text-warning-foreground">
                  <strong>Do your own work.</strong> No AI help, no dictionaries, no asking other
                  people — your teacher wants to see your real level.
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>72 questions grouped by level from A1 to C2</li>
                  <li>Each level mixes vocabulary, listening, reading, grammar and writing</li>
                  <li>
                    You will need headphones or speakers for the listening and dictation questions
                  </li>
                  <li>One hour — the test submits automatically when time runs out</li>
                  <li>
                    At the end you get your CEFR level and a full report —{' '}
                    <strong>copy the report and take a screenshot</strong> to send to your teacher
                  </li>
                </ul>
                <div className="max-w-sm space-y-2">
                  <label htmlFor="elt-name" className="text-sm font-medium">
                    Your name (goes on the report)
                  </label>
                  <Input
                    id="elt-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sam Wang"
                    autoComplete="name"
                  />
                </div>
                <Button type="button" onClick={start}>
                  Start test
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <h2 className="text-lg font-semibold text-foreground">
                What is my English level? Find out in one hour — free
              </h2>
              <p>
                This free English level test measures your proficiency against the CEFR scale (A1
                beginner to C2 mastery) — the same scale used by Cambridge, IELTS and schools
                worldwide. It is the same diagnostic Guidelight teachers assign to their classes,
                made free here with no account and no login: vocabulary and grammar questions,
                reading cloze passages, listening comprehension and dictation with real audio, and
                short writing tasks. Your answers are marked instantly in your browser and nothing
                is stored on our servers.
              </p>
              <p>
                When you finish you get an indicative CEFR level, an approximate IELTS band, a
                per-level breakdown and a full question-by-question review you can copy or
                screenshot for your teacher. Want to know what the levels mean? Read{' '}
                <Link to="/resources/cefr-levels" className="underline hover:text-foreground">
                  CEFR levels explained
                </Link>
                , or check your reading fluency with the{' '}
                <Link to="/reading-speed-test" className="underline hover:text-foreground">
                  free reading speed test
                </Link>
                .
              </p>
            </div>
          </div>
        ) : null}

        {phase === 'test' ? (
          <div className="space-y-6">
            <div aria-live="polite" className="sr-only">
              {timeAnnouncement}
            </div>
            <div className="rounded-lg border border-warning-foreground/30 bg-warning p-3 text-sm text-warning-foreground">
              <strong>Do your own work.</strong> No AI help during the test.
            </div>
            {grouped.map((item, i) => {
              const prev = i > 0 ? grouped[i - 1] : null
              const showLevel = !prev || prev.level !== item.level
              const passageId = 'passageId' in item ? item.passageId : undefined
              const showPassage =
                passageId && PASSAGES[passageId] && (!prev || !('passageId' in prev) || prev.passageId !== passageId)
              const audioUrl = audioUrlFor(item)
              return (
                <div key={item.id} className="space-y-3">
                  {showLevel ? (
                    <h2 className="text-lg font-semibold text-primary">Level {item.level}</h2>
                  ) : null}
                  {showPassage ? (
                    <Card className="bg-secondary">
                      <CardContent className="whitespace-pre-wrap p-4 text-sm leading-relaxed">
                        {PASSAGES[passageId!]}
                      </CardContent>
                    </Card>
                  ) : null}
                  <Card>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Question {i + 1}</span>
                        <Badge variant="secondary">{item.level}</Badge>
                        <Badge variant="outline">{item.type}</Badge>
                      </div>
                      <p className="text-sm font-medium">
                        {item.type === 'reading' ? `Gap ${item.gapIndex}` : item.prompt}
                      </p>
                      {audioUrl ? <AudioPlayer src={audioUrl} /> : null}
                      {item.type === 'written' || item.type === 'dictation' ? (
                        <Textarea
                          value={answers[item.id] ?? ''}
                          onChange={(e) =>
                            setAnswers((a) => ({ ...a, [item.id]: e.target.value }))
                          }
                          className={item.type === 'written' ? 'min-h-[140px]' : undefined}
                          placeholder={
                            item.type === 'dictation' ? 'Type what you hear…' : 'Type your answer…'
                          }
                        />
                      ) : (
                        <fieldset className="space-y-2">
                          <legend className="sr-only">{item.prompt}</legend>
                          {item.options.map((opt) => (
                            <label key={opt} className="flex items-center gap-2 text-sm">
                              <input
                                type="radio"
                                name={item.id}
                                className="h-4 w-4 accent-[hsl(var(--primary))]"
                                checked={answers[item.id] === opt}
                                onChange={() => setAnswers((a) => ({ ...a, [item.id]: opt }))}
                              />
                              {opt}
                            </label>
                          ))}
                        </fieldset>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )
            })}
            <Button type="button" onClick={submit}>
              Submit test
            </Button>
          </div>
        ) : null}

        {phase === 'result' && result ? (
          <div className="space-y-6">
            <Card>
              <CardContent className="space-y-4 p-6">
                <p className="text-2xl font-semibold">
                  {name.trim() ? `${name.trim()} — ` : ''}Your level:{' '}
                  <span className="text-primary">{result.level}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Score {result.score} / {result.max} · Indicative IELTS {result.ieltsBand} ·{' '}
                  {reportDate()}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {result.perLevel.map((r) => (
                    <div
                      key={r.level}
                      className="rounded-lg border border-border/60 bg-secondary/60 p-2 text-center"
                    >
                      <p className="text-xs font-semibold">{r.level}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.score}/{r.max}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-border bg-secondary p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Your report — copy this and send it to your teacher
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap text-sm">{result.report}</pre>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void copyReport()}>
                    {copied ? 'Copied!' : 'Copy report'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setPhase('start')}>
                    Take it again
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tip: take a screenshot of this page too. Written answers were marked by automatic
                  key-point matching, so the level is indicative.
                </p>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Question review</h2>
              {review.map((r, i) => {
                const isCorrect = r.score > 0 && r.score >= r.maxScore
                const isPartial = r.score > 0 && r.score < r.maxScore
                return (
                  <Card key={r.itemId}>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Question {i + 1}</span>
                        <Badge variant="secondary">{r.level}</Badge>
                        <Badge variant="outline">{r.skill}</Badge>
                        <Badge variant={isCorrect ? 'accent' : isPartial ? 'warn' : 'danger'}>
                          {r.score}/{r.maxScore}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium">{r.prompt}</p>
                      <div className="rounded-lg border border-border bg-secondary p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Your answer
                        </p>
                        <p className="mt-1 text-sm">
                          {r.response || (
                            <span className="italic text-muted-foreground">No answer</span>
                          )}
                        </p>
                      </div>
                      {r.correct ? (
                        <p className="text-sm text-muted-foreground">
                          Correct answer:{' '}
                          <span className="font-medium text-foreground">{r.correct}</span>
                        </p>
                      ) : null}
                      {r.feedback ? (
                        <p className="text-sm text-muted-foreground">Feedback: {r.feedback}</p>
                      ) : null}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </PublicToolsShell>
  )
}
