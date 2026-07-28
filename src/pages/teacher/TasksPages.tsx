import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { api, type ClassRow, type StudentRow, type TaskRow } from '@/lib/api'

function TaskCreateForm({
  type,
  defaultSubtype,
  onCreated,
}: {
  type: 'homework' | 'assessment'
  defaultSubtype?: 'diagnostic' | 'formative' | 'summative' | null
  onCreated: (id: string) => void
}) {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [classId, setClassId] = useState('')
  const [subject, setSubject] = useState('')
  const [useClassSubject, setUseClassSubject] = useState(true)
  const [description, setDescription] = useState('')
  const [questionCount, setQuestionCount] = useState(8)
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [readingText, setReadingText] = useState('')
  const [pastPaper, setPastPaper] = useState('')
  const [subtype, setSubtype] = useState(defaultSubtype ?? null)
  const [timeLimit, setTimeLimit] = useState(type === 'assessment' ? 45 : 0)
  const [hasDiag, setHasDiag] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const [c, s] = await Promise.all([api.classes(), api.students()])
      setClasses(c.classes)
      setStudents(s.students)
      if (c.classes[0]) setClassId(c.classes[0].id)
    })()
  }, [])

  useEffect(() => {
    const cls = classes.find((c) => c.id === classId)
    if (cls && useClassSubject) setSubject(cls.subject)
    if (classId) {
      void api.diagnosticStatus(classId).then((r) => setHasDiag(r.hasDiagnostic))
    }
  }, [classId, classes, useClassSubject])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.createTask({
        type,
        subtype: type === 'assessment' ? subtype : subtype === 'diagnostic' ? 'diagnostic' : null,
        class_id: classId,
        subject,
        description,
        difficulty,
        question_count: questionCount,
        reading_text: readingText || undefined,
        past_paper_text: pastPaper || undefined,
        time_limit_seconds:
          type === 'assessment' ? timeLimit * 60 : timeLimit > 0 ? timeLimit * 60 : null,
        use_all_question_types: type === 'assessment',
      })
      onCreated(res.task.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const needsDiag = subtype !== 'diagnostic' && !hasDiag
  const selectClass =
    'flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
      {needsDiag ? (
        <Card className="border-[hsl(38_80%_70%)] bg-[hsl(38_92%_94%)]">
          <CardContent className="p-3 text-sm text-[hsl(32_80%_28%)]">
            Set a diagnostic first to gather personalisation data before homework or other
            assessments.
          </CardContent>
        </Card>
      ) : null}

      {type === 'assessment' ? (
        <div className="space-y-2">
          <Label htmlFor="subtype">Assessment type</Label>
          <select
            id="subtype"
            className={selectClass}
            value={subtype ?? ''}
            onChange={(e) =>
              setSubtype((e.target.value || null) as 'diagnostic' | 'formative' | 'summative' | null)
            }
            required
          >
            <option value="">Select…</option>
            <option value="diagnostic">Diagnostic</option>
            <option value="formative">Formative</option>
            <option value="summative">Summative</option>
          </select>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Checkbox
            id="diag-hw"
            checked={subtype === 'diagnostic'}
            onCheckedChange={(v) => setSubtype(v === true ? 'diagnostic' : null)}
          />
          <Label htmlFor="diag-hw" className="font-normal">
            Mark as diagnostic homework
          </Label>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="class">Class</Label>
          <select
            id="class"
            className={selectClass}
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            required
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.subject})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="difficulty">Difficulty</Label>
          <select
            id="difficulty"
            className={selectClass}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="use-subject"
          checked={useClassSubject}
          onCheckedChange={(v) => setUseClassSubject(v === true)}
        />
        <Label htmlFor="use-subject" className="font-normal">
          Use registered class subject
        </Label>
      </div>

      {!useClassSubject ? (
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="desc">Task description</Label>
        <Textarea
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          placeholder="What should students practise or be assessed on?"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="qcount">Number of questions</Label>
          <Input
            id="qcount"
            type="number"
            min={3}
            max={30}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
          />
        </div>
        {type === 'assessment' ? (
          <div className="space-y-2">
            <Label htmlFor="limit">Hard time limit (minutes)</Label>
            <Input
              id="limit"
              type="number"
              min={5}
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              required
            />
          </div>
        ) : (
          <div />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="reading">Optional reading text</Label>
        <p className="text-xs text-muted-foreground">
          Paste plain text / markdown for comprehension-style questions.
        </p>
        <Textarea id="reading" value={readingText} onChange={(e) => setReadingText(e.target.value)} />
      </div>

      {type === 'assessment' ? (
        <div className="space-y-2">
          <Label htmlFor="past">Past paper style reference</Label>
          <p className="text-xs text-muted-foreground">
            Paste text from past papers (convert PDF to text first).
          </p>
          <Textarea id="past" value={pastPaper} onChange={(e) => setPastPaper(e.target.value)} />
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Students in class: {students.filter((s) => s.class_id === classId).length}
      </p>
      <Button type="submit" className="w-full" disabled={busy || needsDiag || !classId}>
        <Sparkles className="h-4 w-4" />
        {busy ? 'Generating with Kimi…' : 'Generate draft'}
      </Button>
    </form>
  )
}

function TaskList({
  type,
  title,
  blurb,
}: {
  type: 'homework' | 'assessment'
  title: string
  blurb: string
}) {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  async function load() {
    const res = await api.tasks(type)
    setTasks(res.tasks)
  }

  useEffect(() => {
    void load()
  }, [type])

  return (
    <div>
      <PageHeader
        title={title}
        description={`${blurb} · ${tasks.length} item${tasks.length === 1 ? '' : 's'}`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button type="button">
                <Plus className="h-4 w-4" />
                Create {type}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create {type}</DialogTitle>
                <DialogDescription>
                  AI drafts the task; you review and edit before publishing to students.
                </DialogDescription>
              </DialogHeader>
              <TaskCreateForm
                type={type}
                defaultSubtype={type === 'assessment' ? 'diagnostic' : null}
                onCreated={(id) => {
                  setOpen(false)
                  navigate(`/teacher/tasks/${id}`)
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No {type} yet.
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.title || t.description.slice(0, 40)}</TableCell>
                <TableCell>{t.class_name}</TableCell>
                <TableCell>{t.subject}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{t.subtype || type}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={t.status === 'published' ? 'accent' : 'warn'}>{t.status}</Badge>
                </TableCell>
                <TableCell>
                  <Link
                    className="font-semibold underline-offset-4 hover:underline"
                    to={`/teacher/tasks/${t.id}`}
                  >
                    Open
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export function HomeworkPage() {
  return (
    <TaskList
      type="homework"
      title="Homework"
      blurb="Create webpage-completable tasks, review AI drafts, then assign"
    />
  )
}

export function AssessmentsPage() {
  return (
    <TaskList
      type="assessment"
      title="Assessments"
      blurb="Diagnostic, formative, and summative with hard time limits"
    />
  )
}
