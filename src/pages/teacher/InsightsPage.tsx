import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FileText, Printer, Save } from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api, type ClassRow, type StudentRow } from '@/lib/api'

export function InsightsPage() {
  const [scope, setScope] = useState<'class' | 'student'>('class')
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [id, setId] = useState('')
  const [data, setData] = useState<{
    avgScore: number | null
    scoreSeries: Array<{ date: string; value: number }>
    hwRate: number | null
    hwSeries: Array<{ date: string; value: number }>
    weakspots: Array<{ topic: string; count: number }>
  } | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    void (async () => {
      const [c, s] = await Promise.all([api.classes(), api.students()])
      setClasses(c.classes)
      setStudents(s.students)
      if (c.classes[0]) setId(c.classes[0].id)
    })()
  }, [])

  useEffect(() => {
    if (!id) return
    void (async () => {
      try {
        setData(await api.insights(scope, id))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed')
      }
    })()
  }, [scope, id])

  async function report() {
    setBusy(true)
    try {
      const res = await api.createReport(
        scope === 'class'
          ? { class_id: id, teacher_notes: notes }
          : { student_id: id, teacher_notes: notes },
      )
      navigate(`/teacher/reports/${res.report.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const scoreChart = (data?.scoreSeries ?? []).map((p) => ({
    ...p,
    label: p.date?.slice(0, 10),
  }))
  const hwChart = (data?.hwSeries ?? []).map((p) => ({
    ...p,
    label: p.date?.slice(0, 10),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="Scores, submission rates, and weakspots for a class or individual student."
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select
              value={scope}
              onValueChange={(next) => {
                const value = next as 'class' | 'student'
                setScope(value)
                setId(value === 'class' ? classes[0]?.id ?? '' : students[0]?.id ?? '')
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="class">Whole class</SelectItem>
                <SelectItem value="student">Individual student</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{scope === 'class' ? 'Class' : 'Student'}</Label>
            <Select value={id || undefined} onValueChange={setId}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {scope === 'class'
                  ? classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))
                  : students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.display_name} ({s.class_name})
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Avg % correct
            </div>
            <div className="mt-2 font-display text-3xl font-semibold">
              {data?.avgScore == null ? '—' : `${data.avgScore}%`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              HW submission rate
            </div>
            <div className="mt-2 font-display text-3xl font-semibold">
              {data?.hwRate == null ? '—' : `${data.hwRate}%`}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scores over time</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={scoreChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="value" name="% correct" stroke="#6bb8ef" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Homework submission over time</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hwChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="value" name="submission %" stroke="#7dd3c0" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current weakspots</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.weakspots?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {data.weakspots.map((w) => (
                <li key={w.topic}>
                  {w.topic} ({w.count} errors)
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No repeated weakspots yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Produce report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notes">Additional information for AI</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button type="button" className="w-full" disabled={busy || !id} onClick={() => void report()}>
            <FileText className="h-4 w-4" />
            {busy ? 'Generating…' : 'Generate report'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function ReportPage() {
  const { id } = useParams()
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!id) return
    void api
      .getReport(id)
      .then((r) => setContent(r.report.content))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [id])

  async function save() {
    if (!id) return
    await api.updateReport(id, content)
    setSaved(true)
  }

  return (
    <div className="space-y-4">
      <div>
        <Link to="/teacher/insights" className="text-sm text-muted-foreground hover:underline">
          ← Insights
        </Link>
        <PageHeader
          title="Parent report"
          description="Edit the AI draft, then print or download to share with parents."
          action={
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => void save()}>
                <Save className="h-4 w-4" />
                Save edits
              </Button>
              <Button type="button" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print / PDF
              </Button>
            </div>
          }
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm text-muted-foreground">Saved</p> : null}
      <Textarea
        className="min-h-[480px] font-sans"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
    </div>
  )
}
