import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Download,
  List,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  api,
  type ClassRow,
  type LessonBatchRow,
  type LessonPlan,
  type LessonRow,
  type LessonStage,
} from '@/lib/api'
import { exportLessonBatchCsv, exportLessonBatchDocx } from '@/lib/lessonExport'
import { cn } from '@/lib/utils'

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const RESOURCE_PRESETS = [
  'Whiteboard',
  'Projector / PPT',
  'iPads / tablets',
  'Textbooks',
  'Worksheets printer',
  'Speakers / audio',
]

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function PlanLessonsForm({
  classes,
  onDone,
}: {
  classes: ClassRow[]
  onDone: (batchId: string) => void
}) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [useClassSubject, setUseClassSubject] = useState(true)
  const [subject, setSubject] = useState(classes[0]?.subject ?? '')
  const [curriculum, setCurriculum] = useState(classes[0]?.curriculum ?? '')
  const [duration, setDuration] = useState(45)
  const [days, setDays] = useState<string[]>(['Mon', 'Wed'])
  const [resources, setResources] = useState<string[]>(['Whiteboard', 'Projector / PPT'])
  const [customResource, setCustomResource] = useState('')
  const [weeks, setWeeks] = useState(4)
  const [startDate, setStartDate] = useState(todayIso())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const selectedClass = classes.find((c) => c.id === classId)

  useEffect(() => {
    if (!selectedClass) return
    if (useClassSubject) setSubject(selectedClass.subject)
    setCurriculum(selectedClass.curriculum || curriculum)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when class changes
  }, [classId, useClassSubject])

  function toggleDay(day: string) {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    )
  }

  function toggleResource(r: string) {
    setResources((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!classId) {
      setError('Choose a class')
      return
    }
    if (!days.length) {
      setError('Select at least one day (including weekends if you teach then)')
      return
    }
    if (weeks < 1 || weeks > 12) {
      setError('Syllabus length must be 1–12 weeks')
      return
    }
    setBusy(true)
    try {
      const orderedDays = ALL_DAYS.filter((d) => days.includes(d))
      const res = await api.createLessonBatch({
        class_id: classId,
        subject: useClassSubject ? selectedClass?.subject : subject,
        curriculum,
        duration_minutes: duration,
        weekly_frequency: orderedDays.length,
        days_of_week: orderedDays,
        resources,
        weeks,
        start_date: startDate,
      })
      onDone(res.batch.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to plan lessons')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Class</Label>
        <Select
          value={classId}
          onValueChange={(v) => {
            setClassId(v)
            const c = classes.find((x) => x.id === v)
            if (c) {
              if (useClassSubject) setSubject(c.subject)
              setCurriculum(c.curriculum)
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select class" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} ({c.subject}) · {c.student_count} students
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedClass ? (
          <p className="text-xs text-muted-foreground">
            Age range from class: {selectedClass.age_range || 'not set'} ·{' '}
            {selectedClass.student_count} students
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="lesson-use-subject"
          checked={useClassSubject}
          onCheckedChange={(v) => setUseClassSubject(v === true)}
        />
        <Label htmlFor="lesson-use-subject" className="font-normal">
          Use registered class subject
        </Label>
      </div>

      {!useClassSubject ? (
        <div className="space-y-2">
          <Label htmlFor="lesson-subject">Subject</Label>
          <Input
            id="lesson-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="lesson-curriculum">Curriculum (IB, IGCSE, GCSE…)</Label>
        <Input
          id="lesson-curriculum"
          value={curriculum}
          onChange={(e) => setCurriculum(e.target.value)}
          placeholder="e.g. IGCSE English"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lesson-duration">Lesson duration (minutes)</Label>
          <Input
            id="lesson-duration"
            type="number"
            min={15}
            max={180}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lesson-weeks">Syllabus length (weeks, max 12)</Label>
          <Input
            id="lesson-weeks"
            type="number"
            min={1}
            max={12}
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Days of the week (incl. weekends)</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_DAYS.map((day) => {
            const on = days.includes(day)
            return (
              <Button
                key={day}
                type="button"
                size="sm"
                variant={on ? 'default' : 'outline'}
                onClick={() => toggleDay(day)}
              >
                {day}
              </Button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Weekly frequency: {days.length} lesson{days.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="lesson-start">Start date</Label>
        <Input
          id="lesson-start"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Resources available</Label>
        <div className="flex flex-wrap gap-2">
          {RESOURCE_PRESETS.map((r) => {
            const on = resources.includes(r)
            return (
              <Button
                key={r}
                type="button"
                size="sm"
                variant={on ? 'default' : 'outline'}
                onClick={() => toggleResource(r)}
              >
                {r}
              </Button>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Input
            value={customResource}
            onChange={(e) => setCustomResource(e.target.value)}
            placeholder="Add custom resource"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const t = customResource.trim()
              if (!t) return
              if (!resources.includes(t)) setResources((prev) => [...prev, t])
              setCustomResource('')
            }}
          >
            Add
          </Button>
        </div>
        {resources.filter((r) => !RESOURCE_PRESETS.includes(r)).length ? (
          <div className="flex flex-wrap gap-1">
            {resources
              .filter((r) => !RESOURCE_PRESETS.includes(r))
              .map((r) => (
                <Badge key={r} variant="secondary" className="gap-1">
                  {r}
                  <button type="button" onClick={() => toggleResource(r)}>
                    ×
                  </button>
                </Badge>
              ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={busy} className="w-full gap-2">
        <Sparkles className="size-4" />
        {busy ? 'Generating with Kimi…' : 'Plan lessons'}
      </Button>
    </form>
  )
}

export function LessonsPage() {
  const navigate = useNavigate()
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [batches, setBatches] = useState<LessonBatchRow[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [c, b] = await Promise.all([api.classes(), api.lessonBatches()])
    setClasses(c.classes)
    setBatches(b.batches)
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lessons"
        description="Plan PPP lesson batches with Kimi, then review them on a calendar or list."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={!classes.length}>
                <Plus className="size-4" />
                Plan lessons
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Plan lessons</DialogTitle>
                <DialogDescription>
                  Choose the class, schedule, and resources. Kimi will draft a PPP syllabus
                  (mostly traditional, with occasional career-framed activities).
                </DialogDescription>
              </DialogHeader>
              {classes.length ? (
                <PlanLessonsForm
                  classes={classes}
                  onDone={(id) => {
                    setOpen(false)
                    void navigate(`/teacher/lessons/${id}`)
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Add a class first.</p>
              )}
            </DialogContent>
          </Dialog>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!batches.length ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No lesson plans yet. Press <strong>Plan lessons</strong> to generate a batch.
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Weeks</TableHead>
              <TableHead>Starts</TableHead>
              <TableHead>Days</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((b) => (
              <TableRow key={b.id} className="cursor-pointer">
                <TableCell>
                  <Link className="font-medium hover:underline" to={`/teacher/lessons/${b.id}`}>
                    {b.title || `${b.subject} plan`}
                  </Link>
                </TableCell>
                <TableCell>{b.class_name}</TableCell>
                <TableCell>{b.subject}</TableCell>
                <TableCell>{b.weeks}</TableCell>
                <TableCell>{b.start_date}</TableCell>
                <TableCell>{(b.days_of_week ?? []).join(', ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function parseIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIso(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function monthMatrix(anchor: Date) {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const first = new Date(year, month, 1)
  // Start grid on Monday
  const startOffset = (first.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - startOffset)
  const weeks: Date[][] = []
  const cursor = new Date(gridStart)
  for (let w = 0; w < 6; w++) {
    const row: Date[] = []
    for (let d = 0; d < 7; d++) {
      row.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(row)
  }
  return weeks
}

export function LessonBatchPage() {
  const { batchId } = useParams()
  const navigate = useNavigate()
  const [batch, setBatch] = useState<LessonBatchRow | null>(null)
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [monthAnchor, setMonthAnchor] = useState<Date | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!batchId) return
    const res = await api.lessonBatch(batchId)
    setBatch(res.batch)
    setLessons(res.lessons)
    setMonthAnchor(parseIso(res.batch.start_date))
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [batchId])

  const byDate = useMemo(() => {
    const map = new Map<string, LessonRow[]>()
    for (const l of lessons) {
      const arr = map.get(l.scheduled_date) ?? []
      arr.push(l)
      map.set(l.scheduled_date, arr)
    }
    return map
  }, [lessons])

  const weeks = monthAnchor ? monthMatrix(monthAnchor) : []

  async function onDelete() {
    if (!batchId || !confirm('Delete this entire lesson batch?')) return
    setBusy(true)
    try {
      await api.deleteLessonBatch(batchId)
      navigate('/teacher/lessons')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function onExportDocx() {
    if (!batch) return
    setBusy(true)
    try {
      await exportLessonBatchDocx(batch, lessons)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  function onExportCsv() {
    if (!batch) return
    exportLessonBatchCsv(batch, lessons)
  }

  if (!batch || !monthAnchor) {
    return (
      <div className="text-muted-foreground">{error || 'Loading…'}</div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="mb-1 gap-1 px-0" asChild>
            <Link to="/teacher/lessons">
              <ArrowLeft className="size-4" />
              All lesson plans
            </Link>
          </Button>
          <h1 className="font-display text-3xl tracking-tight">{batch.title}</h1>
          <p className="text-muted-foreground">
            {batch.class_name} · {batch.subject} · {batch.weeks} weeks · {batch.duration_minutes}{' '}
            min · {batch.days_of_week.join(', ')} from {batch.start_date}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={view === 'calendar' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setView('calendar')}
          >
            <CalendarDays className="size-4" />
            Calendar
          </Button>
          <Button
            variant={view === 'list' ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => setView('list')}
          >
            <List className="size-4" />
            List
          </Button>
          <Button variant="outline" size="sm" className="gap-1" disabled={busy} onClick={() => void onExportDocx()}>
            <Download className="size-4" />
            DOCX
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={onExportCsv}>
            <Download className="size-4" />
            CSV
          </Button>
          <Button variant="destructive" size="sm" className="gap-1" disabled={busy} onClick={() => void onDelete()}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {view === 'calendar' ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">
              {monthAnchor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))
                }
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))
                }
              >
                Next
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
              {ALL_DAYS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {weeks.flat().map((day) => {
                const iso = toIso(day)
                const inMonth = day.getMonth() === monthAnchor.getMonth()
                const dayLessons = byDate.get(iso) ?? []
                return (
                  <div
                    key={iso + String(day.getTime())}
                    className={cn(
                      'min-h-24 rounded-md border p-1.5 text-left',
                      inMonth ? 'bg-card' : 'bg-muted/40 text-muted-foreground',
                    )}
                  >
                    <div className="mb-1 text-xs font-medium">{day.getDate()}</div>
                    <div className="space-y-1">
                      {dayLessons.map((l) => (
                        <Link
                          key={l.id}
                          to={`/teacher/lessons/${batch.id}/${l.id}`}
                          className="block rounded bg-primary/15 px-1 py-0.5 text-[10px] leading-tight text-foreground hover:bg-primary/25"
                        >
                          {l.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>Week</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Style</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lessons.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.scheduled_date}</TableCell>
                <TableCell>{l.day_of_week}</TableCell>
                <TableCell>{l.week_index}</TableCell>
                <TableCell>
                  <Link
                    className="font-medium hover:underline"
                    to={`/teacher/lessons/${batch.id}/${l.id}`}
                  >
                    {l.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={l.plan?.activityStyle === 'communicative' ? 'warn' : 'secondary'}>
                    {l.plan?.activityStyle ?? 'traditional'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function StageEditor({
  label,
  stage,
  onChange,
}: {
  label: string
  stage: LessonStage
  onChange: (next: LessonStage) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Duration (minutes)</Label>
          <Input
            type="number"
            min={1}
            value={stage.durationMins}
            onChange={(e) => onChange({ ...stage, durationMins: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>Steps (one per line)</Label>
          <Textarea
            rows={4}
            value={(stage.steps ?? []).join('\n')}
            onChange={(e) =>
              onChange({
                ...stage,
                steps: e.target.value.split('\n').map((s) => s.trimEnd()),
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Teacher notes</Label>
          <Textarea
            rows={2}
            value={stage.teacherNotes ?? ''}
            onChange={(e) => onChange({ ...stage, teacherNotes: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function emptyStage(): LessonStage {
  return { durationMins: 10, steps: [''], teacherNotes: '' }
}

function ensurePlan(plan?: LessonPlan): LessonPlan {
  return {
    learningObjective: plan?.learningObjective ?? '',
    materials: plan?.materials ?? [],
    activityStyle: plan?.activityStyle === 'communicative' ? 'communicative' : 'traditional',
    careerContext: plan?.careerContext,
    presentation: plan?.presentation ?? emptyStage(),
    practice: plan?.practice ?? emptyStage(),
    production: plan?.production ?? emptyStage(),
    differentiation: plan?.differentiation ?? '',
    plenary: plan?.plenary ?? '',
    homeworkOptional: plan?.homeworkOptional ?? '',
  }
}

export function LessonDetailPage() {
  const { batchId, lessonId } = useParams()
  const [batchTitle, setBatchTitle] = useState('')
  const [title, setTitle] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState('')
  const [plan, setPlan] = useState<LessonPlan | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!batchId || !lessonId) return
    void api
      .lessonBatch(batchId)
      .then((res) => {
        setBatchTitle(res.batch.title)
        const lesson = res.lessons.find((l) => l.id === lessonId)
        if (!lesson) throw new Error('Lesson not found')
        setTitle(lesson.title)
        setScheduledDate(lesson.scheduled_date)
        setDayOfWeek(lesson.day_of_week)
        setPlan(ensurePlan(lesson.plan))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [batchId, lessonId])

  async function save() {
    if (!lessonId || !plan) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const cleaned: LessonPlan = {
        ...plan,
        materials: (plan.materials ?? []).map((m) => m.trim()).filter(Boolean),
        presentation: {
          ...plan.presentation,
          steps: plan.presentation.steps.map((s) => s.trim()).filter(Boolean),
        },
        practice: {
          ...plan.practice,
          steps: plan.practice.steps.map((s) => s.trim()).filter(Boolean),
        },
        production: {
          ...plan.production,
          steps: plan.production.steps.map((s) => s.trim()).filter(Boolean),
        },
        careerContext: plan.careerContext?.trim() || undefined,
      }
      await api.updateLesson(lessonId, {
        title: title.trim(),
        plan: cleaned,
        scheduled_date: scheduledDate,
      })
      setPlan(cleaned)
      setMessage('Saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (!plan) {
    return <div className="text-muted-foreground">{error || 'Loading…'}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-1 gap-1 px-0" asChild>
            <Link to={`/teacher/lessons/${batchId}`}>
              <ArrowLeft className="size-4" />
              {batchTitle || 'Back to batch'}
            </Link>
          </Button>
          <h1 className="font-display text-3xl tracking-tight">Edit lesson</h1>
          <p className="text-muted-foreground">
            {dayOfWeek} · week plan detail
          </p>
        </div>
        <Button className="gap-2" disabled={busy} onClick={() => void save()}>
          <Save className="size-4" />
          Save
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Scheduled date</Label>
          <Input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Activity style</Label>
          <Select
            value={plan.activityStyle}
            onValueChange={(v) =>
              setPlan({
                ...plan,
                activityStyle: v === 'communicative' ? 'communicative' : 'traditional',
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="traditional">Traditional</SelectItem>
              <SelectItem value="communicative">Communicative</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Career context (optional)</Label>
          <Input
            value={plan.careerContext ?? ''}
            onChange={(e) => setPlan({ ...plan, careerContext: e.target.value })}
            placeholder="Only when there is a career-framed activity"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Learning objective</Label>
        <Textarea
          value={plan.learningObjective}
          onChange={(e) => setPlan({ ...plan, learningObjective: e.target.value })}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Materials (comma-separated)</Label>
        <Input
          value={(plan.materials ?? []).join(', ')}
          onChange={(e) =>
            setPlan({
              ...plan,
              materials: e.target.value.split(',').map((s) => s.trim()),
            })
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StageEditor
          label="Presentation"
          stage={plan.presentation}
          onChange={(presentation) => setPlan({ ...plan, presentation })}
        />
        <StageEditor
          label="Practice"
          stage={plan.practice}
          onChange={(practice) => setPlan({ ...plan, practice })}
        />
        <StageEditor
          label="Production"
          stage={plan.production}
          onChange={(production) => setPlan({ ...plan, production })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Differentiation</Label>
          <Textarea
            rows={3}
            value={plan.differentiation ?? ''}
            onChange={(e) => setPlan({ ...plan, differentiation: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Plenary</Label>
          <Textarea
            rows={3}
            value={plan.plenary ?? ''}
            onChange={(e) => setPlan({ ...plan, plenary: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Optional homework</Label>
          <Textarea
            rows={3}
            value={plan.homeworkOptional ?? ''}
            onChange={(e) => setPlan({ ...plan, homeworkOptional: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
}
