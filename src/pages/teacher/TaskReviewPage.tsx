import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Send, Volume2, Eye } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { MarkingGapsBanner } from '@/components/MarkingGapsBanner'
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
import { api, type Question, type TaskContent, type TtsVoice } from '@/lib/api'
import { findTaskGaps } from '@/lib/taskGaps'
import { queryKeys } from '@/lib/queryKeys'
import { taskTypeBadgeClass, taskTypeLabel } from '@/lib/taskLabels'

// Open question types take a multi-line model answer (teacher-only) that anchors
// the AI marker; objective types keep a single-line answer key.
// Mirrors the open/default branch in src/lib/taskGaps.ts.
const MODEL_ANSWER_TYPES: ReadonlySet<Question['type']> = new Set([
  'short_written',
  'extended_written',
  'reading_comprehension',
  'image_analysis',
  'frayer',
  'listen_respond',
])

export function TaskReviewPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [content, setContent] = useState<TaskContent | null>(null)
  const [assignMode, setAssignMode] = useState<'class' | 'individuals'>('class')
  const [selected, setSelected] = useState<string[]>([])
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [voiceSel, setVoiceSel] = useState<Record<string, string>>({})
  const [audioBusyId, setAudioBusyId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const {
    data: task,
    isLoading: taskLoading,
    error: taskError,
  } = useQuery({
    queryKey: queryKeys.tasks.detail(id ?? ''),
    queryFn: async () => {
      if (!id) throw new Error('No task id')
      const res = await api.task(id)
      return res.task
    },
    enabled: !!id,
  })

  const { data: students = [] } = useQuery({
    queryKey: queryKeys.students.all,
    queryFn: async () => {
      const res = await api.students()
      return res.students
    },
  })

  const { data: attempts = [] } = useQuery({
    queryKey: queryKeys.tasks.attempts(id ?? ''),
    queryFn: async () => {
      if (!id) throw new Error('No task id')
      const res = await api.taskAttempts(id)
      return res.attempts
    },
    enabled: !!id && task?.status === 'published',
  })

  useEffect(() => {
    if (task) setContent(task.content)
  }, [task])

  useEffect(() => {
    api
      .ttsVoices()
      .then((r) => setVoices(r.voices))
      .catch(() => setVoices([{ id: 'English_expressive_narrator', label: 'Expressive narrator' }]))
  }, [])

  function updateQuestion(qi: number, patch: Partial<Question>) {
    if (!content) return
    const questions = content.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q))
    setContent({ ...content, questions })
  }

  async function generateAudio(qi: number, q: Question) {
    if (!q.audioScript?.trim()) return
    setAudioBusyId(q.id)
    setError('')
    try {
      const res = await api.ttsGenerate({
        text: q.audioScript,
        voice: voiceSel[q.id],
        class_id: task?.class_id,
      })
      updateQuestion(qi, { audioUrl: res.url })
      setMessage(res.cached ? 'Audio ready (reused cached clip)' : 'Audio generated — preview below')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audio generation failed')
    } finally {
      setAudioBusyId('')
    }
  }

  async function saveDraft() {
    if (!id || !content) return
    setBusy(true)
    setError('')
    try {
      await api.updateTask(id, { content, title: content.title })
      setMessage('Draft saved')
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(id) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    if (!id || !content) return
    const gaps = findTaskGaps(content, { rubricText: task?.rubric_text })
    if (gaps.length > 0) {
      const list = gaps
        .slice(0, 6)
        .map((g) => `• ${g.message}`)
        .join('\n')
      const more = gaps.length > 6 ? `\n• …and ${gaps.length - 6} more` : ''
      const ok = window.confirm(
        `This task has ${gaps.length} marking gap(s):\n${list}${more}\n\n` +
          'The AI marker anchors on these answers/rubrics — without them marking is approximate. Publish anyway?',
      )
      if (!ok) return
    }
    setBusy(true)
    setError('')
    try {
      await api.updateTask(id, { content, title: content.title })
      await api.publishTask(id, {
        assign_all: assignMode === 'class',
        student_ids: assignMode === 'individuals' ? selected : undefined,
      })
      setMessage('Published to student dashboard')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all('homework') }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all('assessment') }),
        queryClient.invalidateQueries({ queryKey: queryKeys.studentTasks.all }),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (taskLoading) return <p className="text-muted-foreground">Loading…</p>
  if (!task || !content) return <p className="text-muted-foreground">{error || taskError?.message || 'Not found'}</p>

  const classStudents = students.filter((s) => s.class_id === task.class_id)

  const isSpecial =
    task.subtype === 'english_level' ||
    task.subtype === 'reading_speed' ||
    content.kind === 'english_level' ||
    content.kind === 'reading_speed'

  const markingGaps = isSpecial ? [] : findTaskGaps(content, { rubricText: task.rubric_text })

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-2">
          <Link
            to={task.type === 'homework' ? '/teacher/homework' : '/teacher/assessments'}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back
          </Link>
          {task.subtype === 'english_level' ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to={`/teacher/tasks/${task.id}/english-level-preview`}>
                <Eye className="h-4 w-4" />
                Preview as student
              </Link>
            </Button>
          ) : !isSpecial ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to={`/teacher/tasks/${task.id}/preview`}>
                <Eye className="h-4 w-4" />
                Preview as student
              </Link>
            </Button>
          ) : null}
        </div>
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

      {markingGaps.length > 0 ? <MarkingGapsBanner gaps={markingGaps} /> : null}

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

      {task.rubric_text || task.model_essay ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Marking reference</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {task.rubric_text ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Marking rubric</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary p-4 text-sm">
                  {task.rubric_text}
                </pre>
              </div>
            ) : null}
            {task.model_essay ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Model essay (shown to students after they submit)</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary p-4 text-sm">
                  {task.model_essay}
                </pre>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
            {MODEL_ANSWER_TYPES.has(q.type) ? (
              <div className="space-y-2">
                <Label htmlFor={`q-${q.id}-answer`}>Model answer (teacher-only)</Label>
                <Textarea
                  id={`q-${q.id}-answer`}
                  value={
                    Array.isArray(q.correctAnswer)
                      ? q.correctAnswer.join('\n')
                      : q.correctAnswer || ''
                  }
                  onChange={(e) => {
                    const value = e.target.value
                    // Store undefined (not '') when cleared: an empty answer key
                    // would auto-pass the offline fallback marker.
                    updateQuestion(i, { correctAnswer: value.trim() ? value : undefined })
                  }}
                  placeholder="A strong sample answer — the AI marker uses it to calibrate marking. Students never see it."
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor={`q-${q.id}-answer`}>Correct answer</Label>
                <Input
                  id={`q-${q.id}-answer`}
                  value={
                    Array.isArray(q.correctAnswer)
                      ? q.correctAnswer.join(' | ')
                      : q.correctAnswer || ''
                  }
                  onChange={(e) => {
                    const value = e.target.value
                    updateQuestion(i, { correctAnswer: value.trim() ? value : undefined })
                  }}
                />
              </div>
            )}
            {q.audioScript ? (
              <div className="space-y-2">
                <Label htmlFor={`q-${q.id}-audio`}>Listen script</Label>
                <Textarea
                  id={`q-${q.id}-audio`}
                  value={q.audioScript}
                  onChange={(e) =>
                    updateQuestion(i, { audioScript: e.target.value, audioUrl: undefined })
                  }
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Narration voice"
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                    value={voiceSel[q.id] ?? voices[0]?.id ?? 'English_expressive_narrator'}
                    onChange={(e) =>
                      setVoiceSel((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                  >
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={audioBusyId === q.id || !q.audioScript.trim()}
                    onClick={() => void generateAudio(i, q)}
                  >
                    <Volume2 className="h-4 w-4" />
                    {audioBusyId === q.id
                      ? 'Generating…'
                      : q.audioUrl
                        ? 'Regenerate audio'
                        : 'Generate audio'}
                  </Button>
                </div>
                {q.audioUrl ? (
                  <audio controls src={q.audioUrl} className="w-full max-w-md" />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No audio yet — students will hear on-device speech until you generate it.
                  </p>
                )}
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
                {classStudents.map((s) => (
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
