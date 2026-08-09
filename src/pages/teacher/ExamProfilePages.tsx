import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { GenerationBusyLabel } from '@/components/GenerationProgress'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  api,
  type ClassRow,
  type ExamFormat,
  type ExamFormatSection,
  type ExamProfile,
  type GradeBoundary,
  type MockExamRow,
  type QuestionType,
} from '@/lib/api'
import { readPastPaperFile } from '@/lib/pastPaper'
import { cn } from '@/lib/utils'
import { AI_WAIT_MS, useEstimatedProgress } from '@/lib/useEstimatedProgress'

const CURRICULA = ['IB', 'IGCSE', 'GCSE', 'A-Level', 'Other']

const DEFAULT_BOUNDARIES: GradeBoundary[] = [
  { grade: '9', minPct: 90 },
  { grade: '8', minPct: 80 },
  { grade: '7', minPct: 70 },
  { grade: '6', minPct: 60 },
  { grade: '5', minPct: 50 },
  { grade: '4', minPct: 40, pass: true },
  { grade: '3', minPct: 30 },
]

const MOCK_QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'cloze', label: 'Cloze / fill blanks' },
  { value: 'short_written', label: 'Short written' },
  { value: 'reading_comprehension', label: 'Reading comprehension' },
  { value: 'bloom', label: "Bloom's taxonomy" },
  { value: 'extended_written', label: 'Extended written' },
  { value: 'image_analysis', label: 'Image analysis' },
]

const DEFAULT_EXAM_FORMAT: ExamFormat = {
  sections: [
    {
      name: 'Section A — Short answer',
      questionTypes: ['mcq', 'cloze', 'short_written'],
      questionCount: 10,
      marks: 40,
    },
    {
      name: 'Section B — Extended response',
      questionTypes: ['extended_written', 'reading_comprehension'],
      questionCount: 4,
      marks: 60,
    },
  ],
}

export function ExamProfileCreateDialog({
  classes,
  defaultClassId,
  open,
  onOpenChange,
  onCreated,
}: {
  classes: ClassRow[]
  defaultClassId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (profile: ExamProfile) => void
}) {
  const [classId, setClassId] = useState(defaultClassId ?? classes[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [curriculum, setCurriculum] = useState('IGCSE')
  const [syllabusCode, setSyllabusCode] = useState('')
  const [durationMins, setDurationMins] = useState(45)
  const [passGrade, setPassGrade] = useState('4')
  const [targetGrade, setTargetGrade] = useState('8')
  const [boundaries, setBoundaries] = useState<GradeBoundary[]>(DEFAULT_BOUNDARIES)
  const [rubricGeneral, setRubricGeneral] = useState('')
  const [examFormat, setExamFormat] = useState<ExamFormat>(DEFAULT_EXAM_FORMAT)
  const [extractedText, setExtractedText] = useState('')
  const [uploadName, setUploadName] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | undefined>()
  const [uploadBusy, setUploadBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const draftProgress = useEstimatedProgress(busy, AI_WAIT_MS.draft)

  useEffect(() => {
    if (open) {
      setClassId(defaultClassId ?? classes[0]?.id ?? '')
      setTitle('')
      setSyllabusCode('')
      setDurationMins(45)
      setPassGrade('4')
      setTargetGrade('8')
      setBoundaries(DEFAULT_BOUNDARIES)
      setRubricGeneral('')
      setExamFormat(DEFAULT_EXAM_FORMAT)
      setExtractedText('')
      setUploadName(null)
      setImageUrl(undefined)
      setError('')
    }
  }, [open, classes, defaultClassId])

  useEffect(() => {
    const cls = classes.find((c) => c.id === classId)
    if (cls) {
      setSubject(cls.subject)
      if (cls.curriculum) setCurriculum(cls.curriculum)
    }
  }, [classId, classes])

  async function onFile(file: File | null) {
    if (!file) return
    setUploadBusy(true)
    try {
      const parsed = await readPastPaperFile(file)
      setUploadName(parsed.fileName)
      setExtractedText(parsed.text || '')
      setImageUrl(parsed.imageDataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadBusy(false)
    }
  }

  async function createProfile(e: FormEvent) {
    e.preventDefault()
    if (!classId || !title.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await api.createExamProfile({
        class_id: classId,
        title: title.trim(),
        subject,
        curriculum,
        syllabus_code: syllabusCode,
        duration_seconds: durationMins * 60,
        grade_boundaries: boundaries,
        pass_grade: passGrade,
        target_grade: targetGrade,
        rubric: { general: rubricGeneral },
        exam_format: examFormat,
        reference_past_paper_text: extractedText || undefined,
        source_file_name: uploadName || undefined,
        past_paper_image: imageUrl,
      })
      onOpenChange(false)
      onCreated(res.profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  function updateBoundary(index: number, field: keyof GradeBoundary, value: string | number | boolean) {
    setBoundaries((prev) =>
      prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    )
  }

  function updateSection(index: number, field: keyof ExamFormatSection, value: unknown) {
    setExamFormat((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }))
  }

  function toggleSectionType(index: number, type: QuestionType) {
    setExamFormat((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => {
        if (i !== index) return s
        const has = s.questionTypes.includes(type)
        return {
          ...s,
          questionTypes: has
            ? s.questionTypes.filter((t) => t !== type)
            : [...s.questionTypes, type],
        }
      }),
    }))
  }

  function addSection() {
    setExamFormat((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        { name: `Section ${String.fromCharCode(65 + prev.sections.length)}`, questionTypes: ['mcq'], questionCount: 5, marks: 20 },
      ],
    }))
  }

  function removeSection(index: number) {
    setExamFormat((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== index),
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create exam profile</DialogTitle>
          <DialogDescription>
            Set curriculum, grade boundaries, rubric, and optional reference past paper.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => void createProfile(e)}>
          <div className="space-y-2">
            <Label htmlFor="exam-class">Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger id="exam-class">
                <SelectValue placeholder="Select class…" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exam-title">Exam title</Label>
            <Input
              id="exam-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. IGCSE Biology Paper 2"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="exam-curriculum">Curriculum</Label>
              <Select value={curriculum} onValueChange={setCurriculum}>
                <SelectTrigger id="exam-curriculum">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRICULA.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exam-syllabus">Syllabus code</Label>
              <Input
                id="exam-syllabus"
                value={syllabusCode}
                onChange={(e) => setSyllabusCode(e.target.value)}
                placeholder="e.g. 0610"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exam-duration">Duration (minutes)</Label>
            <Input
              id="exam-duration"
              type="number"
              min={10}
              max={180}
              value={durationMins}
              onChange={(e) => setDurationMins(Number(e.target.value))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="exam-pass-grade">Pass grade</Label>
              <Select value={passGrade} onValueChange={setPassGrade}>
                <SelectTrigger id="exam-pass-grade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {boundaries.map((b) => (
                    <SelectItem key={b.grade} value={b.grade}>
                      {b.grade} (≥{b.minPct}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exam-target-grade">Target grade</Label>
              <Select value={targetGrade} onValueChange={setTargetGrade}>
                <SelectTrigger id="exam-target-grade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {boundaries.map((b) => (
                    <SelectItem key={b.grade} value={b.grade}>
                      {b.grade} (≥{b.minPct}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Grade boundaries (% minimum)</legend>
            <div className="space-y-2 rounded-lg border p-3">
              {boundaries.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="w-16"
                    value={b.grade}
                    onChange={(e) => updateBoundary(i, 'grade', e.target.value)}
                    aria-label={`Grade ${i + 1} label`}
                  />
                  <Input
                    type="number"
                    className="w-20"
                    value={b.minPct}
                    onChange={(e) => updateBoundary(i, 'minPct', Number(e.target.value))}
                    aria-label={`Grade ${b.grade} minimum percentage`}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={!!b.pass}
                      onChange={(e) => updateBoundary(i, 'pass', e.target.checked)}
                    />
                    Pass
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="rubric-general">Marking rubric</Label>
            <Textarea
              id="rubric-general"
              value={rubricGeneral}
              onChange={(e) => setRubricGeneral(e.target.value)}
              placeholder="General marking criteria for AI marking…"
              className="min-h-[80px]"
            />
          </div>
          <fieldset className="space-y-3">
            <legend className="flex w-full items-center justify-between text-sm font-semibold">
              <span>Exam format</span>
              <Button type="button" variant="outline" size="sm" onClick={addSection}>
                Add section
              </Button>
            </legend>
            <p className="text-xs text-muted-foreground">
              Define sections, question types, and marks. AI uses this to structure mock papers.
            </p>
            <div className="space-y-3">
              {examFormat.sections.map((section, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={section.name}
                      onChange={(e) => updateSection(i, 'name', e.target.value)}
                      placeholder="Section name"
                      className="flex-1"
                      aria-label={`Section ${i + 1} name`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSection(i)}
                      disabled={examFormat.sections.length <= 1}
                      aria-label={`Remove section ${section.name}`}
                    >
                      ×
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={section.questionCount}
                      onChange={(e) => updateSection(i, 'questionCount', Number(e.target.value))}
                      placeholder="Questions"
                      aria-label={`Section ${section.name} question count`}
                    />
                    <Input
                      type="number"
                      min={1}
                      value={section.marks}
                      onChange={(e) => updateSection(i, 'marks', Number(e.target.value))}
                      placeholder="Marks"
                      aria-label={`Section ${section.name} marks`}
                    />
                  </div>
                  <fieldset className="space-y-1">
                    <legend className="text-xs font-medium text-muted-foreground">Question types</legend>
                    <div className="flex flex-wrap gap-2">
                      {MOCK_QUESTION_TYPES.map((t) => {
                        const checked = section.questionTypes.includes(t.value)
                        return (
                          <label
                            key={t.value}
                            className={cn(
                              'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                              checked
                                ? 'border-primary bg-primary/10 text-foreground'
                                : 'border-input text-muted-foreground hover:bg-secondary',
                            )}
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5"
                              checked={checked}
                              onChange={() => toggleSectionType(i, t.value)}
                            />
                            {t.label}
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="exam-past-paper">Reference past paper (optional)</Label>
            <Input
              id="exam-past-paper"
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              disabled={uploadBusy}
            />
            {uploadName ? (
              <span className="text-xs text-muted-foreground">{uploadName}</span>
            ) : null}
          </div>
          {error ? (
            <div aria-live="polite" role="status">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : null}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? (
              <GenerationBusyLabel
                label="Creating profile…"
                percent={draftProgress.percent}
                elapsedLabel={draftProgress.elapsedLabel}
              />
            ) : (
              'Create profile'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ExamProfileDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<ExamProfile | null>(null)
  const [mocks, setMocks] = useState<MockExamRow[]>([])
  const [error, setError] = useState('')
  const [generateBusy, setGenerateBusy] = useState(false)
  const generateProgress = useEstimatedProgress(generateBusy, AI_WAIT_MS.draft)

  async function load() {
    if (!id) return
    const [p, m] = await Promise.all([api.examProfile(id), api.examProfileMocks(id)])
    setProfile(p.profile)
    setMocks(m.mocks)
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [id])

  async function generateMock() {
    if (!id) return
    setGenerateBusy(true)
    setError('')
    try {
      const res = await api.generateMockExam(id)
      navigate(`/teacher/tasks/${res.task.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerateBusy(false)
    }
  }

  if (!profile) {
    return <p className="text-muted-foreground">{error || 'Loading…'}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/teacher/assessments" className="text-sm text-muted-foreground hover:underline">
          ← Assessments
        </Link>
        <PageHeader
          title={profile.title}
          description={`${profile.curriculum} ${profile.syllabus_code} · ${profile.subject}`}
          action={
            <Button onClick={() => void generateMock()} disabled={generateBusy}>
              {generateBusy ? (
                <GenerationBusyLabel
                  label="Generating mock…"
                  percent={generateProgress.percent}
                  elapsedLabel={generateProgress.elapsedLabel}
                />
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate mock
                </>
              )}
            </Button>
          }
        />
      </div>

      {error ? (
        <div aria-live="polite" role="status">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">Exam config</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Duration:</span>{' '}
              {profile.duration_seconds
                ? `${Math.round(profile.duration_seconds / 60)} minutes`
                : '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Pass grade:</span> {profile.pass_grade}
            </p>
            <p>
              <span className="text-muted-foreground">Target grade:</span> {profile.target_grade}
            </p>
            {profile.rubric?.general ? (
              <p>
                <span className="text-muted-foreground">Rubric:</span> {profile.rubric.general}
              </p>
            ) : null}
            <div>
              <span className="text-muted-foreground">Grade boundaries:</span>
              <ul className="mt-1 list-inside list-disc">
                {profile.grade_boundaries.map((b) => (
                  <li key={b.grade}>
                    {b.grade}: ≥{b.minPct}%{b.pass ? ' (pass)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">Exam format</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(profile.exam_format?.sections ?? []).map((s, i) => (
              <div key={i}>
                <p className="font-medium">{s.name}</p>
                <p className="text-muted-foreground">
                  {s.questionCount} questions · {s.marks} marks · {s.questionTypes.join(', ')}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">Generated mocks</CardTitle>
        </CardHeader>
        <Table>
          <TableCaption>Generated mock exams for this profile.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Title</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Time limit</TableHead>
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mocks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No mocks yet. Click Generate mock to create a draft with AI.
                </TableCell>
              </TableRow>
            ) : (
              mocks.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.title}</TableCell>
                  <TableCell>
                    <Badge variant={m.status === 'published' ? 'default' : 'secondary'}>
                      {m.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {m.time_limit_seconds
                      ? `${Math.round(m.time_limit_seconds / 60)} min`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/teacher/tasks/${m.id}`}>Review</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
