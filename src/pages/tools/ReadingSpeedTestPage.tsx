import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { readingSpeedTestTitle } from '@/lib/seo'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { PublicToolsShell } from '@/pages/tools/PublicToolsShell'
import {
  buildReadingSpeedReport,
  copyTextToClipboard,
  PUBLIC_READING_PASSAGE,
  PUBLIC_READING_SEED,
  PUBLIC_READING_WORD_COUNT,
  reportDate,
} from '@/pages/tools/publicTestUtils'
import {
  buildSpotChecks,
  computeWpm,
  scoreSpotChecks,
  SPOT_CHECK_PASS,
  wpmBoundError,
} from '@shared/cefr/reading-checks'

const CHECKS = buildSpotChecks(PUBLIC_READING_PASSAGE, PUBLIC_READING_SEED)

export function ReadingSpeedTestPage() {
  useDocumentTitle(readingSpeedTestTitle)
  const [phase, setPhase] = useState<'start' | 'reading' | 'checks' | 'result'>('start')
  const [name, setName] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{
    wpm: number
    durationSeconds: number
    checksCorrect: number
    checksTotal: number
    report: string
  } | null>(null)
  const [error, setError] = useState('')
  const [canFinish, setCanFinish] = useState(false)
  const [copied, setCopied] = useState(false)
  const passageRef = useRef<HTMLPreElement>(null)
  const startedAtRef = useRef(0)

  useEffect(() => {
    if (phase !== 'reading') return
    const el = passageRef.current
    if (!el) return
    const onScroll = () => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8
      setCanFinish(atBottom)
    }
    el.addEventListener('scroll', onScroll)
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [phase])

  useEffect(() => {
    if (phase !== 'reading') return
    const block = (e: Event) => e.preventDefault()
    const keyBlock = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) {
        e.preventDefault()
      }
    }
    document.addEventListener('contextmenu', block)
    document.addEventListener('copy', block)
    document.addEventListener('cut', block)
    document.addEventListener('keydown', keyBlock)
    return () => {
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('copy', block)
      document.removeEventListener('cut', block)
      document.removeEventListener('keydown', keyBlock)
    }
  }, [phase])

  function start() {
    startedAtRef.current = Date.now()
    setAnswers({})
    setError('')
    setCopied(false)
    setCanFinish(false)
    setPhase('reading')
    window.scrollTo({ top: 0 })
  }

  function finish() {
    const durationSeconds = Math.min(
      7200,
      Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
    )
    const wpm = computeWpm(PUBLIC_READING_WORD_COUNT, durationSeconds)
    const boundErr = wpmBoundError(wpm)
    if (boundErr) {
      setError(boundErr)
      setPhase('start')
      return
    }
    setResult({
      wpm,
      durationSeconds,
      checksCorrect: 0,
      checksTotal: CHECKS.length,
      report: '',
    })
    setPhase('checks')
    window.scrollTo({ top: 0 })
  }

  function submitChecks() {
    if (!result) return
    const scored = scoreSpotChecks(CHECKS, answers)
    if (!scored.passed) {
      setError(
        `You got ${scored.correct}/${scored.total} spot-checks right (need ${SPOT_CHECK_PASS}). Start again and read carefully.`,
      )
      setResult(null)
      setPhase('start')
      return
    }
    const report = buildReadingSpeedReport({
      name: name.trim(),
      date: reportDate(),
      wpm: result.wpm,
      wordCount: PUBLIC_READING_WORD_COUNT,
      durationSeconds: result.durationSeconds,
      checksCorrect: scored.correct,
      checksTotal: scored.total,
    })
    setResult({ ...result, checksCorrect: scored.correct, checksTotal: scored.total, report })
    setPhase('result')
    window.scrollTo({ top: 0 })
  }

  async function copyReport() {
    if (!result?.report) return
    const ok = await copyTextToClipboard(result.report)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 3000)
    }
  }

  return (
    <PublicToolsShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Free tool · no login needed"
          title="Free reading speed test (WPM)"
          description="Read a short passage at your natural pace, answer three quick comprehension checks, and get your words-per-minute score instantly."
        />

        {error ? (
          <div aria-live="polite" role="status">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : null}

        {phase === 'start' ? (
          <div className="space-y-6">
            <Card>
              <CardContent className="space-y-4 p-6">
                <p className="text-sm text-muted-foreground">
                  You will read a passage of about {PUBLIC_READING_WORD_COUNT} words at your normal
                  pace. When you finish, you will answer 3 quick questions about words in the text —
                  you need at least {SPOT_CHECK_PASS} correct, so read properly, don't skim.
                </p>
                <div className="max-w-sm space-y-2">
                  <label htmlFor="rst-name" className="text-sm font-medium">
                    Your name (goes on the report)
                  </label>
                  <Input
                    id="rst-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sam Wang"
                    autoComplete="name"
                  />
                </div>
                <Button type="button" onClick={start}>
                  Start reading
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <h2 className="text-lg font-semibold text-foreground">
                How fast do you read English? Test it free
              </h2>
              <p>
                This free reading speed test measures your English reading fluency in words per
                minute (WPM). Timing starts when you press start and stops when you finish the
                passage; three comprehension spot-checks make sure you actually read the text — the
                same integrity system Guidelight teachers use with their classes. Everything runs in
                your browser: no account, no login, and nothing is stored on our servers.
              </p>
              <p>
                Typical adult native speakers read at 200–250 wpm; students learning English are
                often between 100 and 200 wpm depending on level. When you finish, copy your report
                or take a screenshot to send to your teacher. You can also find out your level with
                the{' '}
                <Link to="/english-level-test" className="underline hover:text-foreground">
                  free English level test (CEFR A1–C2)
                </Link>
                .
              </p>
            </div>
          </div>
        ) : null}

        {phase === 'reading' ? (
          <Card>
            <CardContent className="space-y-4 p-6">
              <p className="text-sm text-muted-foreground">
                Read at your normal pace. Scroll to the bottom, then finish. Copying is disabled.
              </p>
              <pre
                ref={passageRef}
                className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary p-4 text-base leading-relaxed select-none"
              >
                {PUBLIC_READING_PASSAGE}
              </pre>
              <Button type="button" disabled={!canFinish} onClick={finish}>
                Finish reading
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {phase === 'checks' ? (
          <Card>
            <CardContent className="space-y-6 p-6">
              <p className="text-sm text-muted-foreground">
                Answer these questions about the passage. You need at least {SPOT_CHECK_PASS}{' '}
                correct.
              </p>
              {CHECKS.map((ch, i) => (
                <fieldset key={ch.id} className="space-y-2">
                  <legend className="text-sm font-medium">
                    {i + 1}. {ch.prompt}
                  </legend>
                  {ch.options.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={ch.id}
                        className="h-4 w-4 accent-[hsl(var(--primary))]"
                        checked={answers[ch.id] === opt}
                        onChange={() => setAnswers((a) => ({ ...a, [ch.id]: opt }))}
                      />
                      {opt}
                    </label>
                  ))}
                </fieldset>
              ))}
              <Button
                type="button"
                disabled={CHECKS.some((c) => !answers[c.id])}
                onClick={submitChecks}
              >
                Submit checks
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {phase === 'result' && result ? (
          <Card>
            <CardContent className="space-y-4 p-6">
              <p className="text-2xl font-semibold">
                {name.trim() ? `${name.trim()} — ` : ''}Your reading speed:{' '}
                <span className="text-primary">{result.wpm} wpm</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {PUBLIC_READING_WORD_COUNT} words in {result.durationSeconds} seconds ·
                Spot-checks: {result.checksCorrect}/{result.checksTotal} · {reportDate()}
              </p>
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
                Tip: take a screenshot of this page too.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PublicToolsShell>
  )
}
