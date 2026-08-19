import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, FileUp, Plus, Sparkles, Trash2, Users, X } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  api,
  type ClassRow,
  type TaskSubtype,
} from '@/lib/api'
import {
  defaultExamProfileFormState,
  ExamProfileFields,
  type ExamProfileFormState,
} from '@/pages/teacher/ExamProfilePages'
import { taskTypeBadgeClass, taskTypeLabel } from '@/lib/taskLabels'
import { readPastPaperFile } from '@/lib/pastPaper'
import { queryKeys } from '@/lib/queryKeys'
import { AI_WAIT_MS, useEstimatedProgress } from '@/lib/useEstimatedProgress'

const ASSESSMENT_SUBTYPES: { value: Exclude<TaskSubtype, null>; label: string }[] = [
  { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'formative', label: 'Formative' },
  { value: 'summative', label: 'Summative' },
  { value: 'mock_exam', label: 'Mock exam' },
  { value: 'english_level', label: 'English level' },
  { value: 'reading_speed', label: 'Reading speed' },
]

function TaskCreateForm({
  type,
  defaultSubtype,
  classes,
  onCreated,
}: {
  type: 'homework' | 'assessment'
  defaultSubtype?: TaskSubtype
  classes: ClassRow[]
  onCreated: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const { data: students = [] } = useQuery({
    queryKey: queryKeys.students.all,
    queryFn: async () => {
      const res = await api.students()
      return res.students
    },
  })
  const [classId, setClassId] = useState('')
  const [subject, setSubject] = useState('')
  const [useClassSubject, setUseClassSubject] = useState(true)
  const [description, setDescription] = useState('')
  const [questionCount, setQuestionCount] = useState(8)
  const [questionStyle, setQuestionStyle] = useState<'mixed' | 'essay'>('mixed')
  const [rubricText, setRubricText] = useState('')
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
  const [examProfileId, setExamProfileId] = useState<string | 'new' | ''>('')
  const [newProfile, setNewProfile] = useState<ExamProfileFormState>(() =>
    defaultExamProfileFormState(classes, classId),
  )

  const isSpecial = subtype === 'english_level' || subtype === 'reading_speed'
  const isMock = subtype === 'mock_exam'
  // Only estimate progress for AI drafts (not special non-AI create)
  const draftProgress = useEstimatedProgress(busy && !isSpecial, AI_WAIT_MS.draft)

  const { data: examProfiles = [] } = useQuery({
    queryKey: queryKeys.examProfiles.all(classId),
    queryFn: async () => {
      if (!classId) return []
      const res = await api.examProfiles(classId)
      return res.profiles
    },
    enabled: isMock && !!classId,
  })

  useEffect(() => {
    if (classes.length > 0 && !classId) {
      setClassId(classes[0].id)
    }
  }, [classes, classId])

  useEffect(() => {
    const cls = classes.find((c) => c.id === classId)
    if (cls && useClassSubject && !isMock) setSubject(cls.subject)
    if (classId) {
      void api.diagnosticStatus(classId).then((r) => setHasDiag(r.hasDiagnostic))
    }
  }, [classId, classes, useClassSubject, isMock])

  useEffect(() => {
    if (isMock && classId) {
      setNewProfile(defaultExamProfileFormState(classes, classId))
    }
  }, [isMock, classId, classes])

  useEffect(() => {
    if (!isMock) return
    if (examProfiles.length > 0 && !examProfileId) {
      setExamProfileId(examProfiles[0].id)
    } else if (examProfiles.length === 0) {
      setExamProfileId('new')
    }
  }, [examProfiles, isMock, examProfileId])

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
      let res
      if (isMock) {
        let profileId = examProfileId
        if (profileId === 'new') {
          const created = await api.createExamProfile({
            class_id: classId,
            title: newProfile.title.trim(),
            subject: newProfile.subject,
            curriculum: newProfile.curriculum,
            syllabus_code: newProfile.syllabusCode,
            duration_seconds: newProfile.durationMins * 60,
            grade_boundaries: newProfile.boundaries,
            pass_grade: newProfile.passGrade,
            target_grade: newProfile.targetGrade,
            rubric: { general: newProfile.rubricGeneral },
            exam_format: newProfile.examFormat,
            reference_past_paper_text: newProfile.extractedText || undefined,
            source_file_name: newProfile.uploadName || undefined,
            past_paper_image: newProfile.imageUrl,
          })
          profileId = created.profile.id
          void queryClient.invalidateQueries({ queryKey: queryKeys.examProfiles.all(classId) })
        }
        res = await api.createTask({
          type,
          subtype,
          class_id: classId,
          exam_profile_id: profileId,
        })
      } else {
        res = await api.createTask({
          type,
          subtype: type === 'assessment' ? subtype : null,
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
          question_count: isSpecial ? 0 : questionStyle === 'essay' ? 1 : questionCount,
          question_types: !isSpecial && questionStyle === 'essay' ? ['extended_written'] : undefined,
          rubric_text:
            !isSpecial && questionStyle === 'essay' ? rubricText || undefined : undefined,
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
      }
      onCreated(res.task.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const needsDiag = !isSpecial && subtype !== 'diagnostic' && !isMock && !hasDiag
  const selectedProfile = examProfiles.find((p) => p.id === examProfileId)

  return (
    <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
      {needsDiag ? (
        <Card className="border border-warning-foreground/30 bg-warning text-warning-foreground">
          <CardContent className="p-3 text-sm">
            A diagnostic assessment is highly recommended first — it gives Guidelight the
            personalisation data to tailor homework and assessments. Create one under{' '}
            <Link to="/teacher/assessments" className="font-semibold underline underline-offset-4">
              Assessments
            </Link>
            . You can still create this task, but it will be less personalised until students
            complete a diagnostic assessment.
          </CardContent>
        </Card>
      ) : null}

      {type === 'assessment' ? (
        <div className="space-y-2">
          <Label htmlFor="assessment-type">Assessment type</Label>
          <Select
            value={subtype ?? undefined}
            onValueChange={(v) => {
              const next = v as TaskSubtype
              setSubtype(next)
              setExamProfileId('')
              if (next === 'english_level') setTimeLimit(60)
              if (next === 'reading_speed') setTimeLimit(0)
            }}
            required
          >
            <SelectTrigger id="assessment-type">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {ASSESSMENT_SUBTYPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                  {s.value === 'english_level' || s.value === 'reading_speed'
                    ? ' (literacy — not class subject)'
                    : s.value === 'mock_exam'
                      ? ' (timed, class subject)'
                      : ' (class subject)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Diagnostic, formative, summative, and mock exams cover your class subject. English level
            and reading speed measure general English proficiency — not your class topic.
          </p>
        </div>
      ) : null}

      {isMock ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label htmlFor="mock-template">Mock exam template</Label>
            <Select
              value={examProfileId}
              onValueChange={(v) => setExamProfileId(v)}
            >
              <SelectTrigger id="mock-template">
                <SelectValue placeholder="Select a saved mock or create a new one…" />
              </SelectTrigger>
              <SelectContent>
                {examProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} — {p.curriculum} {p.syllabus_code} (
                    {p.duration_seconds ? `${Math.round(p.duration_seconds / 60)} min` : 'no time limit'})
                  </SelectItem>
                ))}
                <SelectItem value="new">+ Create new mock exam template</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedProfile ? (
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Duration:</span>{' '}
                {selectedProfile.duration_seconds
                  ? `${Math.round(selectedProfile.duration_seconds / 60)} minutes`
                  : '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Target grade:</span>{' '}
                {selectedProfile.target_grade || '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                Selecting this template generates a fresh mock paper.{' '}
                <Link
                  to={`/teacher/exam-profiles/${selectedProfile.id}`}
                  className="underline"
                  target="_blank"
                >
                  Edit template
                </Link>
              </p>
            </div>
          ) : null}

          {examProfileId === 'new' ? (
            <ExamProfileFields
              classes={classes}
              value={newProfile}
              onChange={setNewProfile}
              showClassSelect={false}
              disabled={busy}
            />
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="task-class">Class</Label>
          <Select value={classId || undefined} onValueChange={setClassId} required>
            <SelectTrigger id="task-class">
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
        {!isMock ? (
          <div className="space-y-2">
            <Label htmlFor="task-difficulty">Difficulty</Label>
            <Select
              value={difficulty}
              onValueChange={(v) => setDifficulty(v as 'easy' | 'medium' | 'hard')}
            >
              <SelectTrigger id="task-difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {!isMock ? (
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
      ) : null}

      {!useClassSubject && !isMock ? (
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
          required={!isSpecial && !isMock}
          placeholder={
            subtype === 'english_level'
              ? 'Optional label — e.g. Term 1 English level check'
              : subtype === 'reading_speed'
                ? 'Optional label — e.g. September reading speed'
                : isMock
                  ? 'Optional label for this mock paper'
                  : 'What should students practise or be assessed on?'
          }
        />
      </div>

      {!isSpecial && !isMock ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="qstyle">Question style</Label>
            <Select
              value={questionStyle}
              onValueChange={(v) => setQuestionStyle(v as 'mixed' | 'essay')}
            >
              <SelectTrigger id="qstyle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mixed">Mixed question types</SelectItem>
                <SelectItem value="essay">Essay — one long written answer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {questionStyle === 'mixed' ? (
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
          ) : null}
          {type === 'assessment' ? (
            <div className="space-y-2">
              <Label htmlFor="task-time-limit">Hard time limit (minutes)</Label>
              <Input
                id="task-time-limit"
                type="number"
                min={5}
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
                required
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="hw-time-limit">Time limit (minutes, optional)</Label>
              <Input
                id="hw-time-limit"
                type="number"
                min={0}
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                0 = untimed. Students see a countdown; work is not auto-submitted at 0:00.
              </p>
            </div>
          )}
        </div>
      ) : subtype === 'english_level' ? (
        <div className="space-y-2">
          <Label htmlFor="cefr-time-limit">Time limit (minutes)</Label>
          <Input
            id="cefr-time-limit"
            type="number"
            min={30}
            value={timeLimit || 60}
            onChange={(e) => setTimeLimit(Number(e.target.value))}
            required
          />
          <p className="text-xs text-muted-foreground">
            Full CEFR diagnostic (~72 questions). Default 60 minutes.
          </p>
        </div>
      ) : null}

      {!isSpecial && !isMock && questionStyle === 'essay' ? (
        <div className="space-y-2">
          <Label htmlFor="rubric">Exam-board rubric / mark scheme (optional but recommended)</Label>
          <p className="text-xs text-muted-foreground">
            Paste the criteria, band descriptors, or exemplar notes. Students see this before
            writing; marking and the model essay are aligned to it.
          </p>
          <Textarea
            id="rubric"
            value={rubricText}
            onChange={(e) => setRubricText(e.target.value)}
            className="min-h-[140px]"
            placeholder="e.g. AO1: clear argument (8 marks)… Band 5: sustained, convincing…"
          />
        </div>
      ) : null}

      {subtype !== 'english_level' && !isMock ? (
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

      {!isSpecial && type === 'assessment' && !isMock ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="past-paper-upload">Past paper inspiration</Label>
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
                id="past-paper-upload"
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
                  aria-label="Remove uploaded past paper"
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

      {error ? (
        <div aria-live="polite" role="status">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Students in class: {students.filter((s) => s.class_id === classId).length}
      </p>
      <Button type="submit" className="w-full" disabled={busy || !classId || uploadBusy}>
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
            {!isSpecial && !isMock ? <Sparkles className="h-4 w-4" /> : null}
            {isSpecial || isMock ? 'Create assessment' : 'Generate draft'}
          </>
        )}
      </Button>
    </form>
  )
}

type TaskSortKey = 'created_at' | 'title' | 'class' | 'status'

function formatTaskDate(createdAt: string): string {
  // SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' in UTC
  const iso = createdAt.includes('T') ? createdAt : `${createdAt.replace(' ', 'T')}Z`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? createdAt : d.toLocaleDateString()
}

function TaskList({
  type,
  title,
  blurb,
  excludeSubtypes = [],
}: {
  type: 'homework' | 'assessment'
  title: string
  blurb: string
  excludeSubtypes?: TaskSubtype[]
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [sort, setSort] = useState<{ key: TaskSortKey; dir: 'asc' | 'desc' }>({
    key: 'created_at',
    dir: 'desc',
  })
  const navigate = useNavigate()

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: queryKeys.tasks.all(type),
    queryFn: async () => {
      const res = await api.tasks(type)
      return res.tasks.filter((t) => !excludeSubtypes.includes(t.subtype as TaskSubtype))
    },
  })
  const { data: classes = [] } = useQuery({
    queryKey: queryKeys.classes.all,
    queryFn: async () => {
      const res = await api.classes()
      return res.classes
    },
  })

  const sortedTasks = useMemo(() => {
    const value = (t: (typeof tasks)[number]): string => {
      switch (sort.key) {
        case 'title':
          return (t.title || t.description).toLowerCase()
        case 'class':
          return (t.class_name ?? '').toLowerCase()
        case 'status':
          return t.status
        case 'created_at':
          return t.created_at
      }
    }
    return [...tasks].sort((a, b) => {
      const cmp = value(a).localeCompare(value(b))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [tasks, sort])

  function toggleSort(key: TaskSortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'created_at' ? 'desc' : 'asc' },
    )
  }

  async function deleteDraft(t: (typeof tasks)[number]) {
    const label = t.title || t.description.slice(0, 40)
    if (!confirm(`Delete draft "${label}"? This cannot be undone.`)) return
    setDeletingId(t.id)
    setDeleteError('')
    try {
      await api.deleteTask(t.id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(type) })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId('')
    }
  }

  function sortableHead(key: TaskSortKey, label: string) {
    const active = sort.key === key
    return (
      <TableHead scope="col">
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => toggleSort(key)}
        >
          {label}
          {active ? (
            sort.dir === 'asc' ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </TableHead>
    )
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={`${blurb} · ${tasks.length} item${tasks.length === 1 ? '' : 's'}`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button type="button" disabled={classes.length === 0}>
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
                classes={classes}
                onCreated={(taskId) => {
                  setOpen(false)
                  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(type) })
                  navigate(`/teacher/tasks/${taskId}`)
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {deleteError ? (
        <div aria-live="polite" role="status">
          <p className="text-sm text-destructive">{deleteError}</p>
        </div>
      ) : null}

      {classes.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Add a class to get started"
          description={`Before you can create ${type}, you need a class with students. Add one on the Students page and then come back here. No card is needed to start — your account has starter credit and a monthly AI spending cap.`}
          action={
            <Button asChild>
              <Link to="/teacher/students">Add class</Link>
            </Button>
          }
        />
      ) : (
        <Table>
        <TableCaption>{`List of ${type} tasks.`}</TableCaption>
        <TableHeader>
          <TableRow>
            {sortableHead('title', 'Title')}
            {sortableHead('class', 'Class')}
            <TableHead scope="col">Subject</TableHead>
            <TableHead scope="col">Type</TableHead>
            {sortableHead('status', 'Status')}
            {sortableHead('created_at', 'Created')}
            <TableHead scope="col">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={7}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                No {type} yet.
              </TableCell>
            </TableRow>
          ) : (
            sortedTasks.map((t) => (
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
                <TableCell className="whitespace-nowrap">{formatTaskDate(t.created_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link
                      className="font-semibold underline-offset-4 hover:underline"
                      to={`/teacher/tasks/${t.id}`}
                    >
                      Open
                    </Link>
                    {t.status === 'draft' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Delete draft ${t.title || t.description.slice(0, 40)}`}
                        disabled={deletingId === t.id}
                        onClick={() => void deleteDraft(t)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      )}
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
      blurb="Diagnostic, formative, summative, and timed mock exams"
    />
  )
}
