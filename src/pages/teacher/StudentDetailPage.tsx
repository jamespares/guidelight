import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FileText, RefreshCw, Save } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { WeakspotsPanel, weakspotLabel } from '@/components/WeakspotsPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, type StudentRow, type Weakspot } from '@/lib/api'

export function StudentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState<StudentRow | null>(null)
  const [attempts, setAttempts] = useState<unknown[]>([])
  const [interests, setInterests] = useState('')
  const [career, setCareer] = useState('')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const [pinpointError, setPinpointError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pinpointBusy, setPinpointBusy] = useState(false)
  const [notes, setNotes] = useState('')
  const [weakspots, setWeakspots] = useState<Weakspot[]>([])
  const [weakspotsSummary, setWeakspotsSummary] = useState<string | null>(null)
  const [weakspotsUpdatedAt, setWeakspotsUpdatedAt] = useState<string | null>(null)

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
        setWeakspots(res.student.weakspots ?? [])
        setWeakspotsSummary(res.student.weakspots_summary ?? null)
        setWeakspotsUpdatedAt(res.student.weakspots_updated_at ?? null)
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

  async function pinpoint() {
    if (!id) return
    setPinpointBusy(true)
    setPinpointError('')
    try {
      const res = await api.pinpointStudentWeakspots(id)
      setWeakspots(res.weakspots)
      setWeakspotsSummary(res.summary)
      setWeakspotsUpdatedAt(res.weakspotsUpdatedAt)
    } catch (err) {
      setPinpointError(err instanceof Error ? err.message : 'Pinpoint failed')
    } finally {
      setPinpointBusy(false)
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
            value: weakspots.length
              ? weakspots.map((w) => weakspotLabel(w)).join(', ')
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

      <WeakspotsPanel
        weakspots={weakspots}
        summary={weakspotsSummary}
        updatedAt={weakspotsUpdatedAt}
        busy={pinpointBusy}
        error={pinpointError}
        onPinpoint={() => void pinpoint()}
      />

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
