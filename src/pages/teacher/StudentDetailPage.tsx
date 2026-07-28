import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FileText, RefreshCw, Save } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, type StudentRow } from '@/lib/api'

export function StudentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState<StudentRow | null>(null)
  const [attempts, setAttempts] = useState<unknown[]>([])
  const [interests, setInterests] = useState('')
  const [career, setCareer] = useState('')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!id) return
    void (async () => {
      try {
        const res = await api.student(id)
        setStudent(res.student)
        setAttempts(res.attempts)
        setInterests(res.student.interests)
        setCareer(res.student.career_ambitions)
        setSummary(res.student.ai_summary)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed')
      }
    })()
  }, [id])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!id) return
    setBusy(true)
    try {
      await api.updateStudent(id, { interests, career_ambitions: career })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function refreshSummary() {
    if (!id) return
    setBusy(true)
    try {
      const res = await api.refreshSummary(id)
      setSummary(res.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function makeReport() {
    if (!id) return
    setBusy(true)
    try {
      const res = await api.createReport({ student_id: id, teacher_notes: notes })
      navigate(`/teacher/reports/${res.report.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (!student) {
    return <p className="text-muted-foreground">{error || 'Loading…'}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/teacher/students" className="text-sm text-muted-foreground hover:underline">
          ← Students
        </Link>
        <PageHeader
          title={student.display_name}
          description={`${student.class_name} · ${student.class_subject} · @${student.username}`}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: 'HW completion',
            value:
              student.hw_completion_rate == null ? '—' : `${student.hw_completion_rate}%`,
          },
          { label: 'English level', value: student.cefr_level || '—' },
          {
            label: 'Reading speed',
            value: student.latest_wpm != null ? `${student.latest_wpm} wpm` : '—',
          },
          {
            label: 'Weakspots',
            value: student.weakspots?.length
              ? student.weakspots.map((w) => w.topic).join(', ')
              : 'None yet',
          },
          { label: 'Attempts', value: String(attempts.length) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {s.label}
              </div>
              <div className="mt-2 font-display text-2xl font-semibold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>AI introduction</CardTitle>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void refreshSummary()}>
            <RefreshCw className="h-4 w-4" />
            Generate / refresh
          </Button>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {summary ||
              'No summary yet. Generate one after students complete diagnostic or homework.'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Editable profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void save(e)}>
            <div className="space-y-2">
              <Label htmlFor="interests">Interests</Label>
              <Textarea id="interests" value={interests} onChange={(e) => setInterests(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="career">Career ambitions</Label>
              <Textarea id="career" value={career} onChange={(e) => setCareer(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              <Save className="h-4 w-4" />
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parent report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notes">Extra notes for the report</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button type="button" className="w-full" disabled={busy} onClick={() => void makeReport()}>
            <FileText className="h-4 w-4" />
            Generate report
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
