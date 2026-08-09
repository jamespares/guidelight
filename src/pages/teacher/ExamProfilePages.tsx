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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  api,
  type ClassRow,
  type ExamProfile,
  type GradeBoundary,
  type MockExamRow,
} from '@/lib/api'
import { readPastPaperFile } from '@/lib/pastPaper'
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
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
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
            <Label>Exam title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. IGCSE Biology Paper 2"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Curriculum</Label>
              <Select value={curriculum} onValueChange={setCurriculum}>
                <SelectTrigger>
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
              <Label>Syllabus code</Label>
              <Input
                value={syllabusCode}
                onChange={(e) => setSyllabusCode(e.target.value)}
                placeholder="e.g. 0610"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <Input
              type="number"
              min={10}
              max={180}
              value={durationMins}
              onChange={(e) => setDurationMins(Number(e.target.value))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Pass grade</Label>
              <Select value={passGrade} onValueChange={setPassGrade}>
                <SelectTrigger>
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
              <Label>Target grade</Label>
              <Select value={targetGrade} onValueChange={setTargetGrade}>
                <SelectTrigger>
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
          <div className="space-y-2">
            <Label>Grade boundaries (% minimum)</Label>
            <div className="space-y-2 rounded-lg border p-3">
              {boundaries.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="w-16"
                    value={b.grade}
                    onChange={(e) => updateBoundary(i, 'grade', e.target.value)}
                  />
                  <Input
                    type="number"
                    className="w-20"
                    value={b.minPct}
                    onChange={(e) => updateBoundary(i, 'minPct', Number(e.target.value))}
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
          </div>
          <div className="space-y-2">
            <Label>Marking rubric</Label>
            <Textarea
              value={rubricGeneral}
              onChange={(e) => setRubricGeneral(e.target.value)}
              placeholder="General marking criteria for AI marking…"
              className="min-h-[80px]"
            />
          </div>
          <div className="space-y-2">
            <Label>Reference past paper (optional)</Label>
            <Input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              disabled={uploadBusy}
            />
            {uploadName ? (
              <span className="text-xs text-muted-foreground">{uploadName}</span>
            ) : null}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exam config</CardTitle>
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
            <CardTitle className="text-base">Exam format</CardTitle>
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
          <CardTitle className="text-base">Generated mocks</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Time limit</TableHead>
              <TableHead />
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
