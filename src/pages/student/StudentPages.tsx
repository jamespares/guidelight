import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { AttemptView } from '@/components/AttemptView'
import { GenerationBusyLabel, GenerationProgress } from '@/components/GenerationProgress'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, type Question, type TaskContent } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { taskTypeBadgeClass, taskTypeLabel } from '@/lib/taskLabels'
import { AI_WAIT_MS, useEstimatedProgress } from '@/lib/useEstimatedProgress'

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

export function StudentTasksPage() {
  const {
    data: tasks = [],
    isLoading: tasksLoading,
    error: tasksError,
  } = useQuery({
    queryKey: queryKeys.studentTasks.all,
    queryFn: async () => {
      const res = await api.studentTasks()
      return res.tasks
    },
  })

  const { data: examProfiles = [] } = useQuery({
    queryKey: ['student-exam-profiles'],
    queryFn: async () => {
      const res = await api.studentExamProfiles()
      return res.profiles
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description={`${tasks.length} assigned task${tasks.length === 1 ? '' : 's'}`}
      />
      {tasksError?.message ? (
        <div aria-live="polite" role="status">
          <p className="text-sm text-destructive">{tasksError.message}</p>
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
          {tasksLoading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : tasks.length === 0 ? (
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

  return (
    <AttemptView
      content={content}
      taskMeta={taskMeta}
      answers={answers}
      onAnswer={(qid, v) => setAnswers((prev) => ({ ...prev, [qid]: v }))}
      secondsLeft={secondsLeft}
      elapsed={elapsed}
      error={error}
      timeAnnouncement={timeAnnouncement}
      busy={busy}
      onSubmit={() => void submit(false)}
      submitLabel={
        busy ? (
          <GenerationBusyLabel
            label="Marking…"
            percent={markProgress.percent}
            elapsedLabel={markProgress.elapsedLabel}
          />
        ) : undefined
      }
    />
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
