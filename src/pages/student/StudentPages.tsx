import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Play, Send, Sparkles } from 'lucide-react'
import { GenerationBusyLabel, GenerationProgress } from '@/components/GenerationProgress'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, type ExamProfile, type ExamReadiness, type Question, type TaskContent, type TaskRow } from '@/lib/api'
import { taskTypeBadgeClass, taskTypeLabel } from '@/lib/taskLabels'
import { AI_WAIT_MS, useEstimatedProgress } from '@/lib/useEstimatedProgress'

function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

function formatAnswerForReview(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, string>)
      .map(([k, v]) => `${k}: ${v || '—'}`)
      .join('\n')
  }
  return String(value)
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
      <fieldset className="space-y-2">
        <legend className="sr-only">{q.prompt}</legend>
        {(q.options ?? []).map((opt) => (
          <label
            key={opt}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-secondary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <input
              type="radio"
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              name={q.id}
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            <span className="text-sm">{opt}</span>
          </label>
        ))}
      </fieldset>
    )
  }

  if (q.type === 'cloze') {
    const parts = q.prompt.split('_____')
    const vals = (value as string[]) ?? Array(parts.length - 1).fill('')
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Fill in each blank.</p>
        <div className="flex flex-wrap items-center gap-2 text-sm leading-relaxed">
          {parts.map((part, i) => (
            <span key={i} className="flex items-center gap-2">
              <span>{part}</span>
              {i < parts.length - 1 ? (
                <Input
                  className="w-40"
                  value={vals[i] ?? ''}
                  onChange={(e) => {
                    const next = [...vals]
                    next[i] = e.target.value
                    onChange(next)
                  }}
                  placeholder="answer"
                />
              ) : null}
            </span>
          ))}
        </div>
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
        {q.audioUrl ? (
          <audio controls src={q.audioUrl} className="w-full max-w-md" />
        ) : (
          <Button type="button" variant="outline" onClick={() => speak(q.audioScript || q.prompt)}>
            <Play className="h-4 w-4" />
            Play audio
          </Button>
        )}
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Image stimulus</CardTitle>
            </CardHeader>
            <CardContent>
              <img
                src={q.imageUrl}
                alt=""
                className="max-h-80 rounded-md border border-border object-contain"
                onError={(e) => {
                  const target = e.currentTarget
                  target.style.display = 'none'
                  target.nextElementSibling?.classList.remove('hidden')
                }}
              />
              <p className="hidden text-sm text-muted-foreground">
                Image could not be loaded: {q.imageUrl}
              </p>
            </CardContent>
          </Card>
        ) : null}
        <Textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Analyse the stimulus and explain what it shows…"
        />
      </div>
    )
  }

  return (
    <Textarea
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder={q.type === 'reading_comprehension' ? 'Write your answer…' : 'Write your answer…'}
      className={q.type === 'extended_written' ? 'min-h-[180px]' : undefined}
    />
  )
}

export function StudentTasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [examProfiles, setExamProfiles] = useState<
    Array<{ profile: ExamProfile; readiness: ExamReadiness }>
  >([])
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const [t, ep] = await Promise.all([api.studentTasks(), api.studentExamProfiles()])
        setTasks(t.tasks)
        setExamProfiles(ep.profiles)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed')
      }
    })()
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description={`${tasks.length} assigned task${tasks.length === 1 ? '' : 's'}`}
      />
      {error ? (
        <div aria-live="polite" role="status">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : null}

      {examProfiles.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Exam readiness
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {examProfiles.map(({ profile, readiness }) => (
              <Card key={profile.id}>
                <CardHeader className="pb-2">
                  <CardTitle as="h2" className="text-base">{profile.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {readiness.unlockMessage ? (
                    <p className="text-muted-foreground">{readiness.unlockMessage}</p>
                  ) : (
                    <>
                      <p>
                        Mock exams completed: <strong>{readiness.mockExamsCompleted}</strong>
                        {readiness.averageScore != null ? (
                          <>
                            {' '}
                            · Avg: <strong>{readiness.averageScore}%</strong>
                          </>
                        ) : null}
                      </p>
                      {readiness.predictedGrade ? (
                        <p>
                          Predicted grade: <strong>{readiness.predictedGrade}</strong>
                        </p>
                      ) : null}
                      {readiness.passProbability != null ? (
                        <p>
                          Chance of {profile.pass_grade}:{' '}
                          <strong>{readiness.passProbability}%</strong>
                          {readiness.targetProbability != null ? (
                            <>
                              {' '}
                              · Target {profile.target_grade}:{' '}
                              <strong>{readiness.targetProbability}%</strong>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                      {readiness.recommendation ? (
                        <p className="text-muted-foreground">{readiness.recommendation}</p>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <Table>
        <TableCaption>Assigned tasks and quick links to start or continue.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Title</TableHead>
            <TableHead scope="col">Type</TableHead>
            <TableHead scope="col">Subject</TableHead>
            <TableHead scope="col">Last score</TableHead>
            <TableHead scope="col">
              <span className="sr-only">Actions</span>
            </TableHead>
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
    reading_text?: string
  } | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [timeAnnouncement, setTimeAnnouncement] = useState('')
  const announcedBoundary = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<{
    score_pct: number
    feedback: Record<string, { correct: boolean; feedback: string }>
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const markProgress = useEstimatedProgress(busy, AI_WAIT_MS.marking)
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
          reading_text: t.task.reading_text,
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
    if (secondsLeft == null || secondsLeft <= 0) return
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

  if (result && content) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">Result: {result.score_pct}%</h1>
        <p className="text-muted-foreground">Review your answers and feedback:</p>
        {content.questions.map((q, i) => {
          const fb = result.feedback[q.id]
          const ans = answers[q.id]
          return (
            <Card key={q.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Question {i + 1}</span>
                  {q.topic ? <span>· {q.topic}</span> : null}
                  {fb ? (
                    <Badge variant={fb.correct ? 'accent' : 'danger'}>
                      {fb.correct ? 'Correct' : 'Incorrect'}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm font-medium">{q.prompt}</p>
                <div className="rounded-lg border border-border bg-secondary p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Your answer
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">
                    {formatAnswerForReview(ans) || <span className="italic text-muted-foreground">No answer</span>}
                  </p>
                </div>
                {fb ? <p className="text-sm">{fb.feedback}</p> : null}
              </CardContent>
            </Card>
          )
        })}
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

  const answeredCount = content.questions.filter((q) => {
    const v = answers[q.id]
    if (v == null) return false
    if (typeof v === 'string') return v.trim().length > 0
    if (Array.isArray(v)) return v.some((s) => String(s).trim().length > 0)
    if (typeof v === 'object') return Object.keys(v).length > 0
    return true
  }).length

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div aria-live="polite" className="sr-only">
        {timeAnnouncement}
      </div>
      <div className="sticky top-0 z-10 space-y-2 rounded-lg border border-border bg-primary px-4 py-3 text-primary-foreground shadow-sm">
        <div className="flex items-center justify-between">
          <strong>{content.title || taskMeta.title}</strong>
          <span className="text-sm text-primary-foreground/85">
            Time spent {elapsedMin}:{String(elapsedSec).padStart(2, '0')}
            {secondsLeft != null &&
              ` · Remaining ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-primary-foreground/85">
          <span>
            Question {Math.min(answeredCount + 1, content.questions.length)} of {content.questions.length}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-primary-foreground/20">
            <div
              className="h-full bg-primary-foreground transition-all duration-300"
              style={{ width: `${(answeredCount / content.questions.length) * 100}%` }}
            />
          </div>
          <span>{answeredCount}/{content.questions.length} answered</span>
        </div>
      </div>
      {error ? (
        <div aria-live="polite" role="status">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">{content.instructions}</p>
      <Card className="border border-warning-foreground/30 bg-warning text-warning-foreground">
        <CardContent className="p-3 text-sm">
          Copy and paste are disabled for this task.
        </CardContent>
      </Card>

      {taskMeta.reading_text ? (
        <Card className="bg-secondary">
          <CardHeader className="pb-2">
            <CardTitle as="h2" className="text-base">Reading passage</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm leading-relaxed">
            {taskMeta.reading_text}
          </CardContent>
        </Card>
      ) : null}

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
        {busy ? (
          <GenerationBusyLabel
            label="Marking…"
            percent={markProgress.percent}
            elapsedLabel={markProgress.elapsedLabel}
          />
        ) : (
          <>
            <Send className="h-4 w-4" />
            Submit for marking
          </>
        )}
      </Button>
    </div>
  )
}

export function StudentToolsPage() {
  const [mode, setMode] = useState<'flashcards' | 'practice' | null>(null)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const draftProgress = useEstimatedProgress(busy, AI_WAIT_MS.practice)

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
        description="Practise any time — stories, focused reading, and revision utilities."
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

      {error ? (
        <div aria-live="polite" role="status">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : null}
      {busy ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <GenerationProgress value={draftProgress.percent} size="sm" variant="onSurface" />
          Guidelight is drafting… · {draftProgress.elapsedLabel}
        </p>
      ) : null}

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
