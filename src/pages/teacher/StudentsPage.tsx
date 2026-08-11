import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'

function ReadMoreCell({
  text,
  title,
  maxLength = 60,
}: {
  text?: string | null
  title: string
  maxLength?: number
}) {
  const [open, setOpen] = useState(false)
  if (!text) return '—'
  if (text.length <= maxLength) return <span className="break-words">{text}</span>
  return (
    <>
      <span className="break-words">{text.slice(0, maxLength).trim()}…</span>{' '}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0 py-0 text-xs font-medium"
        onClick={() => setOpen(true)}
      >
        read more
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <p className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
            {text}
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}

function WeakspotsCell({
  weakspots,
  studentName,
}: {
  weakspots?: Array<{ skill?: string; topic?: string }>
  studentName: string
}) {
  const [open, setOpen] = useState(false)
  if (!weakspots?.length) return '—'
  const labels = weakspots.map((w) => w.skill || w.topic)
  if (labels.length <= 2) {
    return <span className="break-words">{labels.join(', ')}</span>
  }
  const [first, second, ...rest] = labels
  return (
    <>
      <span className="break-words">
        {first}, {second}
      </span>{' '}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0 py-0 text-xs font-medium"
        onClick={() => setOpen(true)}
      >
        +{rest.length + 1} more
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Current weakspots — {studentName}</DialogTitle>
          </DialogHeader>
          <ul className="max-h-96 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-muted-foreground">
            {labels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function StudentsPage() {
  const queryClient = useQueryClient()
  const {
    data: students = [],
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.students.all,
    queryFn: async () => {
      const res = await api.students()
      return res.students
    },
  })
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState<
    Array<{ display_name: string; username: string; password: string }> | null
  >(null)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [curriculum, setCurriculum] = useState('')
  const [ageRange, setAgeRange] = useState('')
  const [namesText, setNamesText] = useState('')
  const [saving, setSaving] = useState(false)

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await api.createClass({
        name,
        subject,
        curriculum,
        age_range: ageRange,
        names_text: namesText,
      })
      setCredentials(res.credentials)
      setOpen(false)
      setName('')
      setSubject('')
      setCurriculum('')
      setAgeRange('')
      setNamesText('')
      await queryClient.invalidateQueries({ queryKey: queryKeys.students.all })
      await queryClient.invalidateQueries({ queryKey: queryKeys.classes.all })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Students"
        description={`${students.length} learner${students.length === 1 ? '' : 's'} · names stored as first name + surname initial`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button type="button">
                <Plus className="h-4 w-4" />
                Add class
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Add class</DialogTitle>
                <DialogDescription>
                  Create a class and student logins. Paste names as text — convert PDFs to markdown
                  or plain text first.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={(e) => void onCreate(e)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="class-name">Class name</Label>
                    <Input
                      id="class-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Year 10 Biology A"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      required
                      placeholder="Biology"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="age">Age range</Label>
                    <Input
                      id="age"
                      value={ageRange}
                      onChange={(e) => setAgeRange(e.target.value)}
                      placeholder="14–15"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="curriculum">Curriculum / syllabus notes</Label>
                  <p className="text-xs text-muted-foreground">
                    Text only — convert PDFs to markdown or plain text and paste here.
                  </p>
                  <Textarea
                    id="curriculum"
                    value={curriculum}
                    onChange={(e) => setCurriculum(e.target.value)}
                    placeholder="Paste curriculum outcomes, topics, exam board notes…"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="names">Student names</Label>
                  <p className="text-xs text-muted-foreground">
                    One per line or comma-separated. We store only first name + second initial.
                  </p>
                  <Textarea
                    id="names"
                    value={namesText}
                    onChange={(e) => setNamesText(e.target.value)}
                    required
                    placeholder={'Ava Chen\nNoah Patel\nMia Rossi'}
                  />
                </div>
                {error && open ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? 'Creating…' : 'Create class & student logins'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {(error || queryError?.message) && !open ? (
        <p className="mb-4 text-sm text-destructive">{error || queryError?.message}</p>
      ) : null}

      {credentials ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Student logins</CardTitle>
            <p className="text-sm text-muted-foreground">Save now — passwords are shown once.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-secondary p-4 font-mono text-xs text-foreground">
              {credentials.map((c) => `${c.display_name} — ${c.username} / ${c.password}`).join('\n')}
            </pre>
            <Button type="button" variant="outline" onClick={() => setCredentials(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Subject(s)</TableHead>
            <TableHead>Avg HW score</TableHead>
            <TableHead>Exam readiness</TableHead>
            <TableHead>English level</TableHead>
            <TableHead>Reading speed</TableHead>
            <TableHead>Current Weakspots</TableHead>
            <TableHead>HW completion</TableHead>
            <TableHead>Interests</TableHead>
            <TableHead>Career Ambitions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={12} className="text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : students.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="text-muted-foreground">
                <div className="space-y-2 py-4">
                  <p>Welcome! Add your first class to get started.</p>
                  <p>
                    No card is needed to start — your account has starter credit and a monthly AI
                    spending cap.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            students.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link className="font-semibold text-foreground underline-offset-4 hover:underline" to={`/teacher/students/${s.id}`}>
                    {s.display_name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{s.username}</TableCell>
                <TableCell>{s.class_name}</TableCell>
                <TableCell>{s.class_subject}</TableCell>
                <TableCell className="font-semibold text-[hsl(var(--insight-score-fg))]">
                  {s.avg_score == null ? '—' : `${s.avg_score}%`}
                </TableCell>
                <TableCell className="font-semibold text-[hsl(var(--insight-readiness-fg))]">
                  {s.exam_readiness == null ? '—' : `${s.exam_readiness}%`}
                </TableCell>
                <TableCell>{s.cefr_level || '—'}</TableCell>
                <TableCell>{s.latest_wpm != null ? `${s.latest_wpm} wpm` : '—'}</TableCell>
                <TableCell>
                  <WeakspotsCell weakspots={s.weakspots} studentName={s.display_name} />
                </TableCell>
                <TableCell>
                  {s.hw_completion_rate == null ? '—' : `${s.hw_completion_rate}%`}
                </TableCell>
                <TableCell>
                  <ReadMoreCell text={s.interests} title={`Interests — ${s.display_name}`} />
                </TableCell>
                <TableCell>
                  <ReadMoreCell
                    text={s.career_ambitions}
                    title={`Career ambitions — ${s.display_name}`}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
