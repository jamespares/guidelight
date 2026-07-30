import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileUp, Plus, Sparkles, X } from 'lucide-react'
import { GenerationBusyLabel } from '@/components/GenerationProgress'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, type ClassRow, type StudentRow, type TaskRow, type TaskSubtype } from '@/lib/api'
import { taskTypeBadgeClass, taskTypeLabel } from '@/lib/taskLabels'
import { readPastPaperFile } from '@/lib/pastPaper'
import { AI_WAIT_MS, useEstimatedProgress } from '@/lib/useEstimatedProgress'

function TaskCreateForm({
  type,
  defaultSubtype,
  onCreated,
}: {
  type: 'homework' | 'assessment'
  defaultSubtype?: TaskSubtype
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
  const [pastPaperImage, setPastPaperImage] = useState<string | undefined>()
  const [uploadName, setUploadName] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [subtype, setSubtype] = useState<TaskSubtype>(defaultSubtype ?? null)
  const [timeLimit, setTimeLimit] = useState(type === 'assessment' ? 45 : 0)
  const [hasDiag, setHasDiag] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isSpecial = subtype === 'english_level' || subtype === 'reading_speed'
  // Only estimate progress for AI drafts (not special non-AI create)
  const draftProgress = useEstimatedProgress(busy && !isSpecial, AI_WAIT_MS.draft)

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

  async function onUpload(file: File | null) {
    if (!file) return
    setUploadBusy(true)
    setError('')
    try {
      const result = await readPastPaperFile(file)
      setUploadName(result.fileName)
      if (result.text) {
        setPastPaper((prev) => (prev ? `${prev}\n\n${result.text}` : result.text!))
        setPastPaperImage(undefined)
      }
      if (result.imageDataUrl) {
        setPastPaperImage(result.imageDataUrl)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setUploadName(null)
    } finally {
      setUploadBusy(false)
    }
  }

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
        description:
          description ||
          (subtype === 'english_level'
            ? 'English level (CEFR) diagnostic'
            : subtype === 'reading_speed'
              ? 'Reading speed assessment'
              : ''),
        difficulty,
        question_count: isSpecial ? 0 : questionCount,
        reading_text: readingText || undefined,
        past_paper_text: isSpecial ? undefined : pastPaper || undefined,
        past_paper_image: isSpecial ? undefined : pastPaperImage || undefined,
        time_limit_seconds: isSpecial
          ? subtype === 'english_level'
            ? timeLimit * 60 || 3600
            : null
          : type === 'assessment'
            ? timeLimit * 60
            : timeLimit > 0
              ? timeLimit * 60
              : null,
        use_all_question_types: type === 'assessment' && !isSpecial,
      })
      onCreated(res.task.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const needsDiag = !isSpecial && subtype !== 'diagnostic' && !hasDiag

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
          <Label>Assessment type</Label>
          <Select
            value={subtype ?? undefined}
            onValueChange={(v) => {
              const next = v as TaskSubtype
              setSubtype(next)
              if (next === 'english_level') setTimeLimit(60)
              if (next === 'reading_speed') setTimeLimit(0)
            }}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="diagnostic">Diagnostic (class subject)</SelectItem>
              <SelectItem value="formative">Formative (class subject)</SelectItem>
              <SelectItem value="summative">Summative (class subject)</SelectItem>
              <SelectItem value="english_level">English level (literacy — not class subject)</SelectItem>
              <SelectItem value="reading_speed">Reading speed (literacy — not class subject)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Diagnostic, formative, and summative tests cover your class subject. English level and
            Reading speed measure general English proficiency and literacy — not your class topic.
          </p>
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
          <Label>Class</Label>
          <Select value={classId || undefined} onValueChange={setClassId} required>
            <SelectTrigger>
              <SelectValue placeholder="Select class…" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.subject})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Difficulty</Label>
          <Select
            value={difficulty}
            onValueChange={(v) => setDifficulty(v as 'easy' | 'medium' | 'hard')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
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
          required={!isSpecial}
          placeholder={
            subtype === 'english_level'
              ? 'Optional label — e.g. Term 1 English level check'
              : subtype === 'reading_speed'
                ? 'Optional label — e.g. September reading speed'
                : 'What should students practise or be assessed on?'
          }
        />
      </div>

      {!isSpecial ? (
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
      ) : subtype === 'english_level' ? (
        <div className="space-y-2">
          <Label htmlFor="limit">Time limit (minutes)</Label>
          <Input
            id="limit"
            type="number"
            min={30}
            value={timeLimit || 60}
            onChange={(e) => setTimeLimit(Number(e.target.value))}
            required
          />
          <p className="text-xs text-muted-foreground">
            Full CEFR diagnostic (~66 questions). Default 60 minutes.
          </p>
        </div>
      ) : null}

      {subtype !== 'english_level' ? (
      <div className="space-y-2">
        <Label htmlFor="reading">
          {subtype === 'reading_speed' ? 'Reading passage (required)' : 'Optional reading text'}
        </Label>
        <p className="text-xs text-muted-foreground">
          {subtype === 'reading_speed'
            ? 'Students read this at their natural pace; spot-checks verify they read it.'
            : 'Paste plain text / markdown for comprehension-style questions.'}
        </p>
        <Textarea
          id="reading"
          value={readingText}
          onChange={(e) => setReadingText(e.target.value)}
          required={subtype === 'reading_speed'}
          className={subtype === 'reading_speed' ? 'min-h-[180px]' : undefined}
        />
      </div>
      ) : null}

      {!isSpecial && type === 'assessment' ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Past paper inspiration</Label>
            <p className="text-xs text-muted-foreground">
              Upload a PDF or image of a past paper, and/or paste extra notes. AI will mimic the style.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-secondary/40 px-4 py-6 text-center transition-all hover:border-primary/40 hover:bg-secondary">
              <FileUp className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">
                {uploadBusy ? 'Reading file…' : 'Upload PDF or image'}
              </span>
              <span className="text-xs text-muted-foreground">PNG, JPG, WebP, or PDF</span>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                disabled={uploadBusy || busy}
                onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
              />
            </label>
            {uploadName ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span className="truncate">{uploadName}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setUploadName(null)
                    setPastPaperImage(undefined)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            {pastPaperImage ? (
              <img
                src={pastPaperImage}
                alt="Past paper preview"
                className="max-h-40 rounded-lg border border-border object-contain"
              />
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="past">Additional text notes (optional)</Label>
            <Textarea
              id="past"
              value={pastPaper}
              onChange={(e) => setPastPaper(e.target.value)}
              placeholder="Extracted PDF text appears here — you can edit it."
            />
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Students in class: {students.filter((s) => s.class_id === classId).length}
      </p>
      <Button type="submit" className="w-full" disabled={busy || needsDiag || !classId || uploadBusy}>
        {busy ? (
          isSpecial ? (
            'Creating…'
          ) : (
            <GenerationBusyLabel
              label="Guidelight is drafting…"
              percent={draftProgress.percent}
              elapsedLabel={draftProgress.elapsedLabel}
            />
          )
        ) : (
          <>
            {!isSpecial ? <Sparkles className="h-4 w-4" /> : null}
            {isSpecial ? 'Create assessment' : 'Generate draft'}
          </>
        )}
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
                  <Badge className={taskTypeBadgeClass(type, t.subtype)}>
                    {taskTypeLabel(type, t.subtype)}
                  </Badge>
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
