import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FileUp, Plus, Save, Send, X } from 'lucide-react'
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
  type DojoPaper,
  type Question,
  type TaskContent,
} from '@/lib/api'
import { readPastPaperFile } from '@/lib/pastPaper'

const CURRICULA = ['IB', 'IGCSE', 'GCSE', 'A-Level', 'Other']

function reconstructionBadge(label: string) {
  if (label === 'ai_reconstructed_practice') return 'AI-reconstructed practice'
  return label
}

export function TeacherDojoPage() {
  const navigate = useNavigate()
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [classId, setClassId] = useState('')
  const [papers, setPapers] = useState<DojoPaper[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  const [subject, setSubject] = useState('')
  const [curriculum, setCurriculum] = useState('IGCSE')
  const [syllabusCode, setSyllabusCode] = useState('')
  const [title, setTitle] = useState('')
  const [extractedText, setExtractedText] = useState('')
  const [imageUrl, setImageUrl] = useState<string | undefined>()
  const [uploadName, setUploadName] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)

  async function loadPapers(cid: string) {
    if (!cid) return
    const res = await api.dojoPapers(cid)
    setPapers(res.papers)
  }

  useEffect(() => {
    void (async () => {
      const c = await api.classes()
      setClasses(c.classes)
      if (c.classes[0]) {
        setClassId(c.classes[0].id)
        setSubject(c.classes[0].subject)
        if (c.classes[0].curriculum) setCurriculum(c.classes[0].curriculum)
      }
    })().catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [])

  useEffect(() => {
    if (!classId) return
    const cls = classes.find((c) => c.id === classId)
    if (cls) {
      setSubject(cls.subject)
      if (cls.curriculum) setCurriculum(cls.curriculum)
    }
    void loadPapers(classId).catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed'),
    )
  }, [classId, classes])

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

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!classId) return
    setBusy(true)
    setError('')
    try {
      const res = await api.createDojoPaper({
        class_id: classId,
        subject,
        curriculum,
        syllabus_code: syllabusCode,
        title: title || undefined,
        source_file_name: uploadName || undefined,
        extracted_text: extractedText || undefined,
        past_paper_image: imageUrl,
      })
      setOpen(false)
      setExtractedText('')
      setImageUrl(undefined)
      setUploadName(null)
      setTitle('')
      setSyllabusCode('')
      if (res.paper.status === 'failed') {
        setError(res.paper.fail_reason || 'Reconstruction failed')
        await loadPapers(classId)
        return
      }
      navigate(`/teacher/exam-dojo/${res.paper.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam Dojo papers"
        description="Upload past papers, review the AI-reconstructed practice version, then publish to your class."
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} · {c.subject}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <Plus className="h-4 w-4" />
              Upload past paper
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload past paper</DialogTitle>
              <DialogDescription>
                Kimi reconstructs a passable practice paper once. It is labelled and never
                regenerated — you can edit manually before publishing.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(e) => void create(e)}>
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
                  placeholder="e.g. 0500, HL History"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Title (optional)</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Past paper file</Label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm hover:border-primary/40">
                  <FileUp className="h-4 w-4" />
                  {uploadBusy ? 'Reading…' : uploadName || 'PDF or image'}
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {uploadName ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUploadName(null)
                      setExtractedText('')
                      setImageUrl(undefined)
                    }}
                  >
                    <X className="h-3 w-3" />
                    Clear file
                  </Button>
                ) : null}
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={busy || uploadBusy}>
                {busy ? 'Reconstructing with Kimi…' : 'Reconstruct practice paper'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && !open ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Class papers</CardTitle>
        </CardHeader>
        <CardContent>
          {!papers.length ? (
            <p className="text-sm text-muted-foreground">No Exam Dojo papers for this class yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Syllabus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Label</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {papers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        to={`/teacher/exam-dojo/${p.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {p.title || 'Untitled'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.curriculum} · {p.syllabus_code}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'published' ? 'accent' : 'secondary'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {reconstructionBadge(p.reconstruction_label)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function TeacherDojoReviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [paper, setPaper] = useState<DojoPaper | null>(null)
  const [content, setContent] = useState<TaskContent | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    void (async () => {
      const res = await api.dojoPaper(id)
      setPaper(res.paper)
      setContent(res.paper.content ?? { title: '', instructions: '', questions: [] })
    })().catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
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
      const res = await api.updateDojoPaper(id, { content, title: content.title })
      setPaper(res.paper)
      setMessage('Draft saved (no AI regenerate)')
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
      await api.updateDojoPaper(id, { content, title: content.title })
      await api.publishDojoPaper(id)
      setMessage('Published to Exam Dojo for your class')
      const res = await api.dojoPaper(id)
      setPaper(res.paper)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (!paper || !content) {
    return <p className="text-muted-foreground">{error || 'Loading…'}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/teacher/exam-dojo" className="text-sm text-muted-foreground hover:underline">
          ← Exam Dojo papers
        </Link>
        <PageHeader
          title={content.title || paper.title || 'Practice paper'}
          description={`${paper.subject} · ${paper.curriculum} · ${paper.syllabus_code}`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{reconstructionBadge(paper.reconstruction_label)}</Badge>
        <Badge variant={paper.status === 'published' ? 'accent' : 'warn'}>{paper.status}</Badge>
      </div>

      {paper.status === 'failed' ? (
        <p className="text-sm text-destructive">
          Reconstruction failed: {paper.fail_reason || 'Unknown error'}
        </p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

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
          rows={3}
        />
      </div>

      {content.questions.map((q, qi) => (
        <Card key={q.id || qi}>
          <CardHeader>
            <CardTitle className="text-base">
              Q{qi + 1} · {q.type} · {q.marks ?? 1} mark(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea
                value={q.prompt}
                onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Topic</Label>
                <Input
                  value={q.topic}
                  onChange={(e) => updateQuestion(qi, { topic: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Correct answer (practice key)</Label>
                <Input
                  value={
                    Array.isArray(q.correctAnswer)
                      ? q.correctAnswer.join(', ')
                      : String(q.correctAnswer ?? '')
                  }
                  onChange={(e) => updateQuestion(qi, { correctAnswer: e.target.value })}
                />
              </div>
            </div>
            {q.options?.length ? (
              <div className="space-y-2">
                <Label>Options (one per line)</Label>
                <Textarea
                  value={q.options.join('\n')}
                  onChange={(e) =>
                    updateQuestion(qi, {
                      options: e.target.value.split('\n').filter(Boolean),
                    })
                  }
                  rows={4}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void saveDraft()}>
          <Save className="h-4 w-4" />
          Save edits
        </Button>
        {paper.status !== 'published' && paper.status !== 'failed' ? (
          <Button type="button" disabled={busy} onClick={() => void publish()}>
            <Send className="h-4 w-4" />
            Publish to class
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => navigate('/teacher/exam-dojo')}>
          Back
        </Button>
      </div>
    </div>
  )
}
