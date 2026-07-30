import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FileUp, Upload } from 'lucide-react'
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
  api,
  type DojoPaper,
  type DojoStats,
  type Question,
  type TaskContent,
} from '@/lib/api'
import { readPastPaperFile } from '@/lib/pastPaper'
import { AI_WAIT_MS, useEstimatedProgress } from '@/lib/useEstimatedProgress'

const CURRICULA = ['IB', 'IGCSE', 'GCSE', 'A-Level', 'Other']

function PaperCard({
  paper,
  onSit,
}: {
  paper: DojoPaper
  onSit: (id: string) => void
}) {
  const canSit = paper.status === 'ready' || paper.status === 'published'
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{paper.title || 'Practice paper'}</h3>
          <Badge variant="secondary">AI-reconstructed practice</Badge>
          {paper.status === 'failed' ? <Badge variant="danger">Failed</Badge> : null}
          {paper.status === 'processing' ? <Badge variant="warn">Processing</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {paper.subject} · {paper.curriculum} · {paper.syllabus_code}
        </p>
        {paper.fail_reason ? (
          <p className="text-sm text-destructive">{paper.fail_reason}</p>
        ) : null}
        {canSit ? (
          <Button type="button" onClick={() => onSit(paper.id)}>
            Sit this paper
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function ExamDojoHubPage() {
  const navigate = useNavigate()
  const [shared, setShared] = useState<DojoPaper[]>([])
  const [mine, setMine] = useState<DojoPaper[]>([])
  const [stats, setStats] = useState<DojoStats | null>(null)
  const [topThreshold, setTopThreshold] = useState<'80' | '90'>('80')
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const draftProgress = useEstimatedProgress(busy, AI_WAIT_MS.draft)

  const [subject, setSubject] = useState('')
  const [curriculum, setCurriculum] = useState('IGCSE')
  const [syllabusCode, setSyllabusCode] = useState('')
  const [title, setTitle] = useState('')
  const [extractedText, setExtractedText] = useState('')
  const [imageUrl, setImageUrl] = useState<string | undefined>()
  const [uploadName, setUploadName] = useState<string | null>(null)

  async function load() {
    const [papers, s] = await Promise.all([
      api.studentDojoPapers(),
      api.studentDojoStats({ pass: 50, top: Number(topThreshold) }),
    ])
    setShared(papers.shared)
    setMine(papers.mine)
    setStats(s.stats)
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [topThreshold])

  async function onFile(file: File | null) {
    if (!file) return
    setUploadBusy(true)
    setError('')
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

  async function upload(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.createStudentDojoPaper({
        subject,
        curriculum,
        syllabus_code: syllabusCode,
        title: title || undefined,
        source_file_name: uploadName || undefined,
        extracted_text: extractedText || undefined,
        past_paper_image: imageUrl,
      })
      setOpen(false)
      setSubject('')
      setSyllabusCode('')
      setTitle('')
      setExtractedText('')
      setImageUrl(undefined)
      setUploadName(null)
      await load()
      if (res.paper.status === 'failed') {
        setError(res.paper.fail_reason || 'Could not reconstruct this paper')
        return
      }
      if (res.paper.status === 'ready') {
        navigate(`/student/exam-dojo/sit/${res.paper.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/student/tools" className="text-sm text-muted-foreground hover:underline">
          ← Tools
        </Link>
        <PageHeader
          title="Exam Dojo"
          description="Sit AI-reconstructed practice papers from your teacher or your own uploads. Scores feed your profile for later insight."
        />
      </div>

      <Card className="border-border/80 bg-secondary/30">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Pass probability (practice estimate)</CardTitle>
          <Select
            value={topThreshold}
            onValueChange={(v) => setTopThreshold(v as '80' | '90')}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="80">Top mark 80%</SelectItem>
              <SelectItem value="90">Top mark 90%</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {stats ? (
            <>
              <p>
                Papers completed: <strong>{stats.papersCompleted}</strong>
                {stats.averageScore != null ? (
                  <>
                    {' '}
                    · Average: <strong>{stats.averageScore}%</strong>
                  </>
                ) : null}
              </p>
              {stats.unlockMessage ? (
                <p className="text-muted-foreground">{stats.unlockMessage}</p>
              ) : (
                <p>
                  Chance of passing (≥50%): <strong>{stats.passProbability}%</strong>
                  {' · '}
                  Chance of ≥{topThreshold}%:{' '}
                  <strong>{stats.topProbability}%</strong>
                </p>
              )}
              {stats.recommendation ? (
                <p className="text-muted-foreground">{stats.recommendation}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Estimates for practice only — not a guarantee of your real exam result.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Loading stats…</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <Upload className="h-4 w-4" />
              Upload past paper
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload a past paper</DialogTitle>
              <DialogDescription>
                Tell us about the exam so Guidelight can draft a passable practice paper. This is for
                practice — not an official exam copy.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(e) => void upload(e)}>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
              </div>
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
                  placeholder="e.g. 0500"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Title (optional)</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>File</Label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm">
                  <FileUp className="h-4 w-4" />
                  {uploadBusy ? 'Reading…' : uploadName || 'PDF or image'}
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={busy || uploadBusy}>
                {busy ? (
                  <GenerationBusyLabel
                    label="Guidelight is drafting…"
                    percent={draftProgress.percent}
                    elapsedLabel={draftProgress.elapsedLabel}
                  />
                ) : (
                  'Turn into practice paper'
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && !open ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">From your teacher</h2>
        {!shared.length ? (
          <p className="text-sm text-muted-foreground">No shared papers yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {shared.map((p) => (
              <PaperCard
                key={p.id}
                paper={p}
                onSit={(id) => navigate(`/student/exam-dojo/sit/${id}`)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My uploads</h2>
        {!mine.length ? (
          <p className="text-sm text-muted-foreground">Upload a past paper to practise.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {mine.map((p) => (
              <PaperCard
                key={p.id}
                paper={p}
                onSit={(id) => navigate(`/student/exam-dojo/sit/${id}`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: Question
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (q.type === 'mcq' || q.type === 'bloom') {
    return (
      <div className="space-y-2">
        {(q.options ?? []).map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={q.id}
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            {opt}
          </label>
        ))}
      </div>
    )
  }
  return (
    <Textarea
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      rows={q.type === 'extended_written' ? 6 : 3}
      placeholder="Your answer"
    />
  )
}

export function ExamDojoSitPage() {
  const { paperId } = useParams()
  const navigate = useNavigate()
  const [content, setContent] = useState<TaskContent | null>(null)
  const [paperMeta, setPaperMeta] = useState<DojoPaper | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<{
    score_pct: number
    feedback: Record<string, { correct: boolean; feedback: string }>
    stats: DojoStats
    pass_threshold: number
    top_threshold: number
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const markProgress = useEstimatedProgress(busy, AI_WAIT_MS.marking)
  const startedAt = useRef(Date.now())
  const answersRef = useRef(answers)
  const attemptRef = useRef(attemptId)
  const busyRef = useRef(busy)
  const resultRef = useRef(result)
  answersRef.current = answers
  attemptRef.current = attemptId
  busyRef.current = busy
  resultRef.current = result

  useEffect(() => {
    if (!paperId) return
    void (async () => {
      try {
        const t = await api.dojoPaper(paperId)
        setPaperMeta(t.paper)
        setContent(t.paper.content ?? null)
        const start = await api.startDojoAttempt(paperId)
        setAttemptId(start.attemptId)
        startedAt.current = Date.now()
        if (start.time_limit_seconds) setSecondsLeft(start.time_limit_seconds)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed')
      }
    })()
  }, [paperId])

  async function submit(auto = false) {
    if (!attemptRef.current || busyRef.current || resultRef.current) return
    setBusy(true)
    try {
      const res = await api.submitDojoAttempt(attemptRef.current, {
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
          void submit(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [attemptId])

  useEffect(() => {
    const block = (e: Event) => e.preventDefault()
    document.addEventListener('copy', block)
    document.addEventListener('cut', block)
    document.addEventListener('paste', block)
    document.addEventListener('contextmenu', block)
    return () => {
      document.removeEventListener('copy', block)
      document.removeEventListener('cut', block)
      document.removeEventListener('paste', block)
      document.removeEventListener('contextmenu', block)
    }
  }, [])

  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">Result: {result.score_pct}%</h1>
        <Card className="bg-secondary/30">
          <CardContent className="space-y-2 p-4 text-sm">
            {result.stats.unlockMessage ? (
              <p>{result.stats.unlockMessage}</p>
            ) : (
              <p>
                Pass chance (~≥{result.pass_threshold}%):{' '}
                <strong>{result.stats.passProbability}%</strong>
                {' · '}
                Top mark (~≥{result.top_threshold}%):{' '}
                <strong>{result.stats.topProbability}%</strong>
              </p>
            )}
            {result.stats.recommendation ? (
              <p className="text-muted-foreground">{result.stats.recommendation}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Practice estimate only. Your score is saved to your profile archive.
            </p>
          </CardContent>
        </Card>
        <p className="text-muted-foreground">Detailed feedback:</p>
        {Object.entries(result.feedback).map(([qid, fb]) => (
          <Card key={qid}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {qid}
                <Badge variant={fb.correct ? 'accent' : 'danger'}>
                  {fb.correct ? 'Correct' : 'Incorrect'}
                </Badge>
              </div>
              <p className="text-sm">{fb.feedback}</p>
            </CardContent>
          </Card>
        ))}
        <Button type="button" onClick={() => navigate('/student/exam-dojo')}>
          Back to Exam Dojo
        </Button>
      </div>
    )
  }

  if (!content || !paperMeta) {
    return <p className="text-muted-foreground">{error || 'Loading paper…'}</p>
  }

  const elapsedMin = Math.floor(elapsed / 60000)
  const elapsedSec = Math.floor((elapsed % 60000) / 1000)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border border-border bg-primary px-4 py-3 text-primary-foreground shadow-sm">
        <strong>{content.title || paperMeta.title}</strong>
        <span className="text-sm text-primary-foreground/85">
          Time spent {elapsedMin}:{String(elapsedSec).padStart(2, '0')}
          {secondsLeft != null &&
            ` · Remaining ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
        </span>
      </div>
      <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
        AI-reconstructed practice paper — not an official exam copy. {paperMeta.subject} ·{' '}
        {paperMeta.curriculum} · {paperMeta.syllabus_code}
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-sm text-muted-foreground">{content.instructions}</p>
      {content.questions.map((q, i) => (
        <Card key={q.id}>
          <CardContent className="space-y-3 p-4">
            <div className="text-xs text-muted-foreground">
              Q{i + 1} · {q.marks ?? 1} mark(s) · {q.topic}
            </div>
            <p className="font-medium whitespace-pre-wrap">{q.prompt}</p>
            <QuestionInput
              q={q}
              value={answers[q.id]}
              onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
            />
          </CardContent>
        </Card>
      ))}
      <Button type="button" disabled={busy} onClick={() => void submit(false)}>
        {busy ? (
          <GenerationBusyLabel
            label="Marking…"
            percent={markProgress.percent}
            elapsedLabel={markProgress.elapsedLabel}
          />
        ) : (
          'Submit for marking'
        )}
      </Button>
    </div>
  )
}
