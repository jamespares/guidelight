import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Play, Send, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, type Question, type TaskContent, type TaskRow } from '@/lib/api'
import { taskTypeBadgeClass, taskTypeLabel } from '@/lib/taskLabels'

function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: Question
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (q.type === 'mcq' || q.type === 'bloom') {
    return (
      <div className="space-y-2">
        {(q.options ?? []).map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              name={q.id}
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            {opt}
          </label>
        ))}
      </div>
    )
  }

  if (q.type === 'frayer') {
    const v = (value as Record<string, string>) || {}
    const set = (k: string, val: string) => onChange({ ...v, [k]: val })
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Term: <strong>{q.frayer?.term || q.prompt}</strong>
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {['definition', 'characteristics', 'examples', 'nonExamples'].map((k) => (
            <div key={k} className="rounded-lg border border-border p-2">
              <div className="mb-1 text-xs uppercase text-muted-foreground">{k}</div>
              <Textarea value={v[k] || ''} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (q.type === 'listen_respond') {
    return (
      <div className="space-y-3">
        <Button type="button" variant="outline" onClick={() => speak(q.audioScript || q.prompt)}>
          <Play className="h-4 w-4" />
          Play audio
        </Button>
        <Textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your response…"
        />
      </div>
    )
  }

  if (q.type === 'image_analysis') {
    return (
      <div className="space-y-3">
        {q.imageUrl ? (
          <Card className="bg-secondary">
            <CardContent className="p-3 text-sm">Image stimulus: {q.imageUrl}</CardContent>
          </Card>
        ) : null}
        <Textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Analyse the image…"
        />
      </div>
    )
  }

  return (
    <Textarea
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder={q.type === 'cloze' ? 'Fill the blanks…' : 'Write your answer…'}
      className={q.type === 'extended_written' ? 'min-h-[180px]' : undefined}
    />
  )
}

export function StudentTasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    void api
      .studentTasks()
      .then((r) => setTasks(r.tasks))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [])

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={`${tasks.length} assigned task${tasks.length === 1 ? '' : 's'}`}
      />
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Last score</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No tasks yet.
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.title}</TableCell>
                <TableCell>
                  <Badge className={taskTypeBadgeClass(t.type, t.subtype)}>
                    {taskTypeLabel(t.type, t.subtype)}
                  </Badge>
                </TableCell>
                <TableCell>{t.subject}</TableCell>
                <TableCell>{t.last_score == null ? '—' : `${t.last_score}%`}</TableCell>
                <TableCell>
                  {t.attempt_status === 'submitted' ? (
                    <span className="text-muted-foreground">Submitted</span>
                  ) : (
                    <Link
                      className="font-semibold underline-offset-4 hover:underline"
                      to={
                        t.subtype === 'reading_speed'
                          ? `/student/reading-speed/${t.id}`
                          : t.subtype === 'english_level'
                            ? `/student/english-level/${t.id}`
                            : `/student/attempt/${t.id}`
                      }
                    >
                      {t.attempt_status === 'in_progress' ? 'Continue' : 'Start'}
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export function AttemptPage() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const [content, setContent] = useState<TaskContent | null>(null)
  const [taskMeta, setTaskMeta] = useState<{
    type: string
    time_limit_seconds: number | null
    title: string
  } | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<{
    score_pct: number
    feedback: Record<string, { correct: boolean; feedback: string }>
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const startedAt = useRef(Date.now())
  const hardStop = useRef(false)
  const answersRef = useRef(answers)
  const attemptRef = useRef(attemptId)
  const busyRef = useRef(busy)
  const resultRef = useRef(result)
  answersRef.current = answers
  attemptRef.current = attemptId
  busyRef.current = busy
  resultRef.current = result

  useEffect(() => {
    if (!taskId) return
    void (async () => {
      try {
        const t = await api.task(taskId)
        setContent(t.task.content)
        setTaskMeta({
          type: t.task.type,
          time_limit_seconds: t.task.time_limit_seconds,
          title: t.task.title,
        })
        const start = await api.startAttempt(taskId)
        setAttemptId(start.attemptId)
        startedAt.current = Date.now()
        if (t.task.time_limit_seconds) {
          setSecondsLeft(t.task.time_limit_seconds)
          hardStop.current = t.task.type === 'assessment'
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed')
      }
    })()
  }, [taskId])

  async function submit(auto = false) {
    if (!attemptRef.current || busyRef.current || resultRef.current) return
    setBusy(true)
    try {
      const res = await api.submitAttempt(attemptRef.current, {
        answers: answersRef.current,
        duration_ms: Date.now() - startedAt.current,
      })
      setResult(res)
      if (auto) setError('Time is up — your work was submitted automatically.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(Date.now() - startedAt.current)
      setSecondsLeft((s) => {
        if (s == null) return s
        if (s <= 1) {
          if (hardStop.current) void submit(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [attemptId])

  useEffect(() => {
    const block = (e: Event) => e.preventDefault()
    document.addEventListener('copy', block)
    document.addEventListener('cut', block)
    document.addEventListener('paste', block)
    document.addEventListener('contextmenu', block)

    const onVis = () => {
      if (document.visibilityState === 'hidden' && attemptId && taskMeta?.type === 'assessment') {
        void api.flagAttempt(attemptId)
      }
    }
    const onBlur = () => {
      if (attemptId && taskMeta?.type === 'assessment') void api.flagAttempt(attemptId)
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)

    return () => {
      document.removeEventListener('copy', block)
      document.removeEventListener('cut', block)
      document.removeEventListener('paste', block)
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
    }
  }, [attemptId, taskMeta?.type])

  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">Result: {result.score_pct}%</h1>
        <p className="text-muted-foreground">Detailed feedback on each question:</p>
        {Object.entries(result.feedback).map(([qid, fb]) => (
          <Card key={qid}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {qid}
                <Badge variant={fb.correct ? 'accent' : 'danger'}>
                  {fb.correct ? 'Correct' : 'Incorrect'}
                </Badge>
              </div>
              <p className="text-sm">{fb.feedback}</p>
            </CardContent>
          </Card>
        ))}
        <Button type="button" onClick={() => navigate('/student/tasks')}>
          Back to tasks
        </Button>
      </div>
    )
  }

  if (!content || !taskMeta) {
    return <p className="text-muted-foreground">{error || 'Loading task…'}</p>
  }

  const elapsedMin = Math.floor(elapsed / 60000)
  const elapsedSec = Math.floor((elapsed % 60000) / 1000)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border border-border bg-primary px-4 py-3 text-primary-foreground shadow-sm">
        <strong>{content.title || taskMeta.title}</strong>
        <span className="text-sm text-primary-foreground/85">
          Time spent {elapsedMin}:{String(elapsedSec).padStart(2, '0')}
          {secondsLeft != null &&
            ` · Remaining ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
        </span>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-sm text-muted-foreground">{content.instructions}</p>
      <Card className="border-[hsl(38_80%_70%)] bg-[hsl(38_92%_94%)]">
        <CardContent className="p-3 text-sm text-[hsl(32_80%_28%)]">
          Copy and paste are disabled for this task.
        </CardContent>
      </Card>

      {content.questions.map((q, i) => (
        <Card key={q.id}>
          <CardHeader className="pb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Question {i + 1} · {q.type} · {q.marks ?? 1} mark(s)
              {q.topic ? ` · ${q.topic}` : ''}
            </p>
            <CardTitle className="text-base font-semibold">{q.prompt}</CardTitle>
            {q.learningObjective ? (
              <p className="text-sm font-normal text-muted-foreground">{q.learningObjective}</p>
            ) : null}
          </CardHeader>
          <CardContent>
            <QuestionInput
              q={q}
              value={answers[q.id]}
              onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
            />
          </CardContent>
        </Card>
      ))}

      <Button type="button" className="w-full" disabled={busy} onClick={() => void submit(false)}>
        <Send className="h-4 w-4" />
        {busy ? 'Marking…' : 'Submit for marking'}
      </Button>
    </div>
  )
}

export function StudentToolsPage() {
  const [mode, setMode] = useState<'flashcards' | 'practice' | null>(null)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function generate(m: 'flashcards' | 'practice') {
    setBusy(true)
    setError('')
    setMode(m)
    try {
      const res = await api.studentTools(m)
      setResult(res.result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const cards =
    result && typeof result === 'object' && 'cards' in result
      ? (result as { cards: Array<{ front: string; back: string; topic: string }> }).cards
      : null
  const practice =
    result && typeof result === 'object' && 'questions' in result
      ? (result as { title: string; questions: Question[] })
      : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tools"
        description="Practise any time — stories, focused reading, revision utilities, and Exam Dojo."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/student/stories"
          className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm"
        >
          <h2 className="text-lg font-semibold">A1–C2 English Stories</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Twelve graded stories to listen, copy, and read along — always available.
          </p>
        </Link>

        <Link
          to="/student/reading-machine"
          className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm"
        >
          <h2 className="text-lg font-semibold">(RSVP) Focused Reading Machine</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Class texts and your uploads — RSVP practice at a speed you choose.
          </p>
        </Link>

        <Link
          to="/student/exam-dojo"
          className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm"
        >
          <h2 className="text-lg font-semibold">Exam Dojo</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sit AI-reconstructed practice papers, track scores, and see what average you need for a
            stronger chance of your target grade.
          </p>
        </Link>

        <button
          type="button"
          disabled={busy}
          onClick={() => void generate('flashcards')}
          className="rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary/40 hover:shadow-sm disabled:opacity-55"
        >
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-4 w-4" />
            Flashcards from weakspots
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            AI flashcards from your weakspots and recent mistakes.
          </p>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void generate('practice')}
          className="rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary/40 hover:shadow-sm disabled:opacity-55"
        >
          <h2 className="text-lg font-semibold">Practice quiz</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A short quiz generated from your weakspots.
          </p>
        </button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {busy ? <p className="text-sm text-muted-foreground">Generating with Kimi…</p> : null}

      {mode === 'flashcards' && cards ? (
        <div className="space-y-3">
          {cards.map((c, i) => (
            <Card key={i}>
              <CardContent className="space-y-2 p-4">
                <div className="text-xs text-muted-foreground">{c.topic}</div>
                <strong>{c.front}</strong>
                <p className="text-sm">{c.back}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {mode === 'practice' && practice ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{practice.title}</h2>
          {practice.questions.map((q, i) => (
            <Card key={q.id || i}>
              <CardContent className="space-y-2 p-4">
                <div className="text-xs text-muted-foreground">{q.topic}</div>
                <p className="text-sm font-medium">{q.prompt}</p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {(q.options ?? []).map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}
