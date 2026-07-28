import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

type CefrItem = {
  id: string
  level: string
  skill: string
  type: string
  prompt: string
  options?: string[]
  audioUrl?: string
  passageId?: string
  gapIndex?: number
  maxScore: number
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

export function EnglishLevelPage() {
  const { taskId } = useParams()
  const [phase, setPhase] = useState<'loading' | 'start' | 'test' | 'result'>('loading')
  const [title, setTitle] = useState('')
  const [testId, setTestId] = useState<string | null>(null)
  const [items, setItems] = useState<CefrItem[]>([])
  const [passages, setPassages] = useState<Record<string, string>>({})
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [secondsLeft, setSecondsLeft] = useState(3600)
  const [result, setResult] = useState<{
    cefr_level: string
    total_score: number
    max_score: number
    ieltsBand: string
    over_time_seconds?: number
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadStatus() {
    if (!taskId) return
    const res = await api.cefrTaskStatus(taskId)
    setTitle(res.title ?? 'English level')
    if (res.phase === 'result' && res.test) {
      setPhase('result')
      setResult({
        cefr_level: res.test.cefr_level ?? 'A1',
        total_score: res.test.total_score ?? 0,
        max_score: res.test.max_score ?? 0,
        ieltsBand: res.ieltsBand ?? '—',
        over_time_seconds: res.test.over_time_seconds ?? 0,
      })
      return
    }
    if (res.phase === 'test' && res.testId) {
      setTestId(res.testId)
      setItems((res.items as CefrItem[]) ?? [])
      setPassages(res.passages ?? {})
      setSecondsLeft(res.secondsLeft ?? 0)
      setPhase('test')
      return
    }
    setPhase('start')
  }

  useEffect(() => {
    void loadStatus().catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [taskId])

  useEffect(() => {
    if (phase !== 'test') return
    const t = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [phase])

  const grouped = useMemo(() => items, [items])

  async function start() {
    if (!taskId) return
    setBusy(true)
    setError('')
    try {
      const res = await api.cefrStart(taskId)
      const full = await api.cefrGetTest(res.testId)
      setTestId(res.testId)
      setItems((full.items as CefrItem[]) ?? [])
      setPassages(full.passages ?? {})
      setSecondsLeft(full.secondsLeft ?? 3600)
      setPhase('test')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!testId) return
    setBusy(true)
    setError('')
    try {
      const res = await api.cefrSubmit(testId, answers)
      setResult(res)
      setPhase('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/student/tasks" className="text-sm text-muted-foreground hover:underline">
            ← Tasks
          </Link>
          <PageHeader
            title={title || 'English level assessment'}
            description="CEFR diagnostic — vocabulary, listening, reading, grammar and writing."
          />
        </div>
        {phase === 'test' ? (
          <Badge variant={secondsLeft < 300 ? 'warn' : 'accent'} className="text-base px-3 py-1">
            {formatTime(secondsLeft)}
          </Badge>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {phase === 'loading' ? <p className="text-muted-foreground">Loading…</p> : null}

      {phase === 'start' ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="rounded-lg border border-[hsl(38_80%_70%)] bg-[hsl(38_92%_94%)] p-3 text-sm text-[hsl(32_80%_28%)]">
              <strong>Do your own work.</strong> No AI help, no copy-paste, no asking other people.
              Your teacher sees your answers.
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>~66 questions grouped by level from A1 to C2</li>
              <li>Each level mixes vocabulary, listening, reading, grammar and writing</li>
              <li>About one hour — overtime is flagged</li>
            </ul>
            <Button type="button" disabled={busy} onClick={() => void start()}>
              Start test
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {phase === 'test' ? (
        <div className="space-y-6">
          <div className="rounded-lg border border-[hsl(38_80%_70%)] bg-[hsl(38_92%_94%)] p-3 text-sm text-[hsl(32_80%_28%)]">
            <strong>Do your own work.</strong> No AI help during the diagnostic.
          </div>
          {grouped.map((item, i) => {
            const prev = i > 0 ? grouped[i - 1] : null
            const showLevel = !prev || prev.level !== item.level
            const showPassage =
              item.passageId &&
              passages[item.passageId] &&
              (!prev || prev.passageId !== item.passageId)
            return (
              <div key={item.id} className="space-y-3">
                {showLevel ? (
                  <h2 className="text-lg font-semibold text-primary">Level {item.level}</h2>
                ) : null}
                {showPassage ? (
                  <Card className="bg-secondary">
                    <CardContent className="whitespace-pre-wrap p-4 text-sm leading-relaxed">
                      {passages[item.passageId!]}
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
                    {item.audioUrl ? <AudioPlayer src={item.audioUrl} /> : null}
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
                      <div className="space-y-2">
                        {(item.options ?? []).map((opt) => (
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
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )
          })}
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Submitting…' : 'Submit test'}
          </Button>
        </div>
      ) : null}

      {phase === 'result' && result ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-2xl font-semibold">
              Your level: <span className="text-primary">{result.cefr_level}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Score {result.total_score} / {result.max_score} · Indicative IELTS {result.ieltsBand}
              {result.over_time_seconds
                ? ` · Overtime ${result.over_time_seconds}s`
                : ''}
            </p>
            <p className="text-sm text-muted-foreground">
              Practise with A1–C2 English Stories and the Focused Reading Machine in Tools.
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
