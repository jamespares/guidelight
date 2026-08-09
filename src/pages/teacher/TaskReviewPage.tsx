import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Save, Send } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { api, type Question, type StudentRow, type TaskContent, type TaskRow } from '@/lib/api'
import { taskTypeBadgeClass, taskTypeLabel } from '@/lib/taskLabels'

export function TaskReviewPage() {
  const { id } = useParams()
  const [task, setTask] = useState<(TaskRow & { content: TaskContent }) | null>(null)
  const [content, setContent] = useState<TaskContent | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [assignMode, setAssignMode] = useState<'class' | 'individuals'>('class')
  const [selected, setSelected] = useState<string[]>([])
  const [attempts, setAttempts] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    if (!id) return
    const res = await api.task(id)
    setTask(res.task)
    setContent(res.task.content)
    const s = await api.students()
    setStudents(s.students.filter((x) => x.class_id === res.task.class_id))
    if (res.task.status === 'published') {
      const a = await api.taskAttempts(id)
      setAttempts(a.attempts)
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [id])

  function updateQuestion(qi: number, patch: Partial<Question>) {
    if (!content) return
    const questions = content.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q))
    setContent({ ...content, questions })
  }

  async function saveDraft() {
    if (!id || !content) return
    setBusy(true)
    setError('')
    try {
      await api.updateTask(id, { content, title: content.title })
      setMessage('Draft saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    if (!id || !content) return
    setBusy(true)
    setError('')
    try {
      await api.updateTask(id, { content, title: content.title })
      await api.publishTask(id, {
        assign_all: assignMode === 'class',
        student_ids: assignMode === 'individuals' ? selected : undefined,
      })
      setMessage('Published to student dashboard')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (!task || !content) return <p className="text-muted-foreground">{error || 'Loading…'}</p>

  const isSpecial =
    task.subtype === 'english_level' ||
    task.subtype === 'reading_speed' ||
    content.kind === 'english_level' ||
    content.kind === 'reading_speed'

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={task.type === 'homework' ? '/teacher/homework' : '/teacher/assessments'}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back
        </Link>
        <PageHeader
          title={`Review: ${content.title || task.title}`}
          description={
            <>
              {isSpecial ? 'Specialised assessment · ' : 'Human-in-the-loop edit before setting · '}
              <Badge variant={task.status === 'published' ? 'accent' : 'warn'}>{task.status}</Badge>
              {' · '}
              <Badge className={taskTypeBadgeClass(task.type, task.subtype)}>
                {taskTypeLabel(task.type, task.subtype)}
              </Badge>
            </>
          }
        />
      </div>

      {error ? (
        <div aria-live="polite" role="status">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : null}
      {message ? (
        <div aria-live="polite" role="status">
          <Card className="border border-success-foreground/30 bg-success text-success-foreground">
            <CardContent className="p-3 text-sm">{message}</CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={content.title}
              onChange={(e) => setContent({ ...content, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-instructions">Instructions</Label>
            <Textarea
              id="task-instructions"
              value={content.instructions}
              onChange={(e) => setContent({ ...content, instructions: e.target.value })}
            />
          </div>
          {task.subtype === 'reading_speed' && task.reading_text ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Passage</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary p-4 text-sm">
                {task.reading_text}
              </pre>
            </div>
          ) : null}
          {task.subtype === 'english_level' ? (
            <p className="text-sm text-muted-foreground">
              Students take the full CEFR diagnostic (vocabulary, listening, reading, grammar,
              writing). Results show an indicative CEFR level and IELTS band.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!isSpecial
        ? content.questions.map((q, i) => (
        <Card key={q.id}>
          <CardHeader className="pb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Q{i + 1} · {q.type} · topic: {q.topic}
              {q.bloomLevel ? ` · Bloom: ${q.bloomLevel}` : ''}
            </p>
            {q.learningObjective ? (
              <p className="text-sm text-muted-foreground">{q.learningObjective}</p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`q-${q.id}-prompt`}>Prompt</Label>
              <Textarea
                id={`q-${q.id}-prompt`}
                value={q.prompt}
                onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`q-${q.id}-topic`}>Topic tag</Label>
              <Input id={`q-${q.id}-topic`} value={q.topic} onChange={(e) => updateQuestion(i, { topic: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`q-${q.id}-objective`}>Learning objective</Label>
              <Input
                id={`q-${q.id}-objective`}
                value={q.learningObjective ?? ''}
                onChange={(e) => updateQuestion(i, { learningObjective: e.target.value })}
                placeholder="One sentence: what this question assesses"
              />
            </div>
            {q.options ? (
              <div className="space-y-2">
                <Label htmlFor={`q-${q.id}-options`}>Options (one per line)</Label>
                <Textarea
                  id={`q-${q.id}-options`}
                  value={q.options.join('\n')}
                  onChange={(e) =>
                    updateQuestion(i, { options: e.target.value.split('\n').filter(Boolean) })
                  }
                />
              </div>
            ) : null}
            {q.correctAnswer !== undefined ? (
              <div className="space-y-2">
                <Label htmlFor={`q-${q.id}-answer`}>Correct answer</Label>
                <Input
                  id={`q-${q.id}-answer`}
                  value={
                    Array.isArray(q.correctAnswer)
                      ? q.correctAnswer.join(' | ')
                      : q.correctAnswer || ''
                  }
                  onChange={(e) => updateQuestion(i, { correctAnswer: e.target.value })}
                />
              </div>
            ) : null}
            {q.audioScript ? (
              <div className="space-y-2">
                <Label htmlFor={`q-${q.id}-audio`}>Listen script</Label>
                <Textarea
                  id={`q-${q.id}-audio`}
                  value={q.audioScript}
                  onChange={(e) => updateQuestion(i, { audioScript: e.target.value })}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))
        : null}

      {task.status === 'draft' ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Assign & publish</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="flex flex-wrap gap-4">
              <legend className="sr-only">Assign to</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="h-4 w-4 accent-primary"
                  name="assign-mode"
                  checked={assignMode === 'class'}
                  onChange={() => setAssignMode('class')}
                />
                Whole class
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="h-4 w-4 accent-primary"
                  name="assign-mode"
                  checked={assignMode === 'individuals'}
                  onChange={() => setAssignMode('individuals')}
                />
                Individual students
              </label>
            </fieldset>
            {assignMode === 'individuals' ? (
              <fieldset className="space-y-2">
                <legend className="sr-only">Select students</legend>
                {students.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`stu-${s.id}`}
                      checked={selected.includes(s.id)}
                      onCheckedChange={(v) =>
                        setSelected((prev) =>
                          v === true ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                        )
                      }
                    />
                    <Label htmlFor={`stu-${s.id}`} className="font-normal">
                      {s.display_name}
                    </Label>
                  </div>
                ))}
              </fieldset>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => void saveDraft()}>
                <Save className="h-4 w-4" />
                Save draft
              </Button>
              <Button type="button" disabled={busy} onClick={() => void publish()}>
                <Send className="h-4 w-4" />
                Publish to students
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {task.status === 'published' ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Attempts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableCaption>Student attempts for this task.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Student</TableHead>
                  <TableHead scope="col">Score</TableHead>
                  <TableHead scope="col">Duration</TableHead>
                  <TableHead scope="col">Flags</TableHead>
                  <TableHead scope="col">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No attempts yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  attempts.map((a) => (
                    <TableRow key={String(a.id)}>
                      <TableCell>{String(a.display_name)}</TableCell>
                      <TableCell>{a.score_pct == null ? '—' : `${a.score_pct}%`}</TableCell>
                      <TableCell>
                        {a.duration_ms == null
                          ? '—'
                          : `${Math.round(Number(a.duration_ms) / 60000)} min`}
                      </TableCell>
                      <TableCell>
                        {Number(a.flagged) ? (
                          <Badge variant="danger">left window ×{String(a.focus_leave_count)}</Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{String(a.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
