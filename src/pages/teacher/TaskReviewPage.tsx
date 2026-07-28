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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, type Question, type StudentRow, type TaskContent, type TaskRow } from '@/lib/api'

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
              Human-in-the-loop edit before setting ·{' '}
              <Badge variant={task.status === 'published' ? 'accent' : 'warn'}>{task.status}</Badge>
              {task.subtype ? ` · ${task.subtype}` : ''}
            </>
          }
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? (
        <Card className="border-[hsl(152_40%_70%)] bg-[hsl(152_40%_94%)]">
          <CardContent className="p-3 text-sm text-[hsl(152_50%_25%)]">{message}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={content.title}
              onChange={(e) => setContent({ ...content, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Instructions</Label>
            <Textarea
              value={content.instructions}
              onChange={(e) => setContent({ ...content, instructions: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {content.questions.map((q, i) => (
        <Card key={q.id}>
          <CardHeader className="pb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Q{i + 1} · {q.type} · topic: {q.topic}
              {q.bloomLevel ? ` · Bloom: ${q.bloomLevel}` : ''}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea
                value={q.prompt}
                onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Topic tag</Label>
              <Input value={q.topic} onChange={(e) => updateQuestion(i, { topic: e.target.value })} />
            </div>
            {q.options ? (
              <div className="space-y-2">
                <Label>Options (one per line)</Label>
                <Textarea
                  value={q.options.join('\n')}
                  onChange={(e) =>
                    updateQuestion(i, { options: e.target.value.split('\n').filter(Boolean) })
                  }
                />
              </div>
            ) : null}
            {q.correctAnswer !== undefined ? (
              <div className="space-y-2">
                <Label>Correct answer</Label>
                <Input
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
                <Label>Listen script</Label>
                <Textarea
                  value={q.audioScript}
                  onChange={(e) => updateQuestion(i, { audioScript: e.target.value })}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}

      {task.status === 'draft' ? (
        <Card>
          <CardHeader>
            <CardTitle>Assign & publish</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="assign-class"
                  checked={assignMode === 'class'}
                  onCheckedChange={() => setAssignMode('class')}
                />
                <Label htmlFor="assign-class" className="font-normal">
                  Whole class
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="assign-indiv"
                  checked={assignMode === 'individuals'}
                  onCheckedChange={() => setAssignMode('individuals')}
                />
                <Label htmlFor="assign-indiv" className="font-normal">
                  Individual students
                </Label>
              </div>
            </div>
            {assignMode === 'individuals' ? (
              <div className="space-y-2">
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
              </div>
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
            <CardTitle>Attempts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead>Status</TableHead>
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
