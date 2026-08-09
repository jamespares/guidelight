import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { api } from '@/lib/api'

export function ReadingSpeedPage() {
  const { taskId } = useParams()
  const [phase, setPhase] = useState<'loading' | 'start' | 'reading' | 'checks' | 'result'>('loading')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [checks, setChecks] = useState<Array<{ id: string; prompt: string; options: string[] }>>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [passNeed, setPassNeed] = useState(2)
  const [wpm, setWpm] = useState<number | null>(null)
  const [flagged, setFlagged] = useState(false)
  const [checkScore, setCheckScore] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [canFinish, setCanFinish] = useState(false)
  const passageRef = useRef<HTMLPreElement>(null)

  async function load() {
    if (!taskId) return
    setError('')
    const res = await api.readingSpeedStatus(taskId)
    setTitle(res.title)
    setPhase(res.phase)
    if (res.body) setBody(res.body)
    if (res.wordCount) setWordCount(res.wordCount)
    if (res.checks) {
      setChecks(res.checks)
      setPassNeed(res.passNeed ?? 2)
    }
    if (res.attempt) {
      setWpm(res.attempt.wpm)
      setFlagged(!!res.attempt.flagged)
      if (res.attempt.checks_correct != null) {
        setCheckScore(`${res.attempt.checks_correct}/${res.attempt.checks_total}`)
      }
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [taskId])

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
  }, [phase, body])



  async function start() {
    if (!taskId) return
    setBusy(true)
    setError('')
    try {
      const res = await api.readingSpeedStart(taskId)
      setBody(res.body)
      setWordCount(res.wordCount)
      setPhase('reading')
      setCanFinish(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    if (!taskId) return
    setBusy(true)
    setError('')
    try {
      await api.readingSpeedFinish(taskId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      await load().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  async function submitChecks() {
    if (!taskId) return
    setBusy(true)
    setError('')
    try {
      const res = await api.readingSpeedChecks(taskId, answers)
      setWpm(res.wpm)
      setPhase('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      await load().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/student/tasks" className="text-sm text-muted-foreground hover:underline">
          ← Tasks
        </Link>
        <PageHeader title={title || 'Reading speed'} description="Timed natural-pace reading with spot-checks." />
      </div>
      {error ? (
        <div aria-live="polite" role="status">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : null}

      {phase === 'loading' ? <p className="text-muted-foreground">Loading…</p> : null}

      {phase === 'start' ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-muted-foreground">
              You will read a passage of about {wordCount} words at your normal pace. When you finish,
              you will answer {passNeed}+ of 3 quick questions about words in the text.
            </p>
            <Button type="button" disabled={busy} onClick={() => void start()}>
              Start reading
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {phase === 'reading' ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-muted-foreground">
              Scroll to the bottom, then finish. Do your own reading — copying is not allowed.
            </p>
            <pre
              ref={passageRef}
              className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary p-4 text-base leading-relaxed"
            >
              {body}
            </pre>
            <Button type="button" disabled={busy || !canFinish} onClick={() => void finish()}>
              Finish reading
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {phase === 'checks' ? (
        <Card>
          <CardContent className="space-y-6 p-6">
            <p className="text-sm text-muted-foreground">
              Answer these questions about the passage. You need at least {passNeed} correct.
            </p>
            {checks.map((ch, i) => (
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
              disabled={busy || checks.some((c) => !answers[c.id])}
              onClick={() => void submitChecks()}
            >
              Submit checks
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {phase === 'result' ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-lg font-semibold">
              Your reading speed: <span className="text-primary">{wpm} wpm</span>
            </p>
            {checkScore ? (
              <p className="text-sm text-muted-foreground">
                Spot-checks: {checkScore}
                {flagged ? ' (flagged)' : ''}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Practise pushing a little faster with the Focused Reading Machine in Tools.
            </p>
            <Button asChild variant="outline">
              <Link to="/student/tasks">Back to tasks</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
