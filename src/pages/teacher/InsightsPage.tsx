import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarPlus, FileText, Printer, Save, Trash2 } from 'lucide-react'
import { GenerationBusyLabel } from '@/components/GenerationProgress'
import { eventColor, InsightLineChartCard } from '@/components/InsightLineChart'
import { PageHeader } from '@/components/PageHeader'
import { WeakspotsPanel } from '@/components/WeakspotsPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  isAiBudgetError,
  type ClassRow,
  type InsightEvent,
  type StudentRow,
  type Weakspot,
} from '@/lib/api'
import { CAP_HIT_TEACHER } from '@/lib/trustCopy'
import { AI_WAIT_MS, useEstimatedProgress } from '@/lib/useEstimatedProgress'

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
    weakspots: Weakspot[]
    weakspotsSummary?: string | null
    weakspotsUpdatedAt?: string | null
    events: InsightEvent[]
  } | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [pinpointError, setPinpointError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pinpointBusy, setPinpointBusy] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventBusy, setEventBusy] = useState(false)
  const [eventError, setEventError] = useState('')
  const reportProgress = useEstimatedProgress(busy, AI_WAIT_MS.report)
  const navigate = useNavigate()

  const events = data?.events ?? []

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

  async function pinpoint() {
    if (!id) return
    setPinpointBusy(true)
    setPinpointError('')
    try {
      const res =
        scope === 'class'
          ? await api.pinpointClassWeakspots(id)
          : await api.pinpointStudentWeakspots(id)
      setData((prev) =>
        prev
          ? {
              ...prev,
              weakspots: res.weakspots,
              weakspotsSummary: res.summary,
              weakspotsUpdatedAt: res.weakspotsUpdatedAt,
            }
          : prev,
      )
    } catch (err) {
      if (isAiBudgetError(err)) {
        setPinpointError(CAP_HIT_TEACHER)
      } else {
        setPinpointError(err instanceof Error ? err.message : 'Pinpoint failed')
      }
    } finally {
      setPinpointBusy(false)
    }
  }

  async function createEvent() {
    if (!id) return
    setEventBusy(true)
    setEventError('')
    try {
      const res = await api.createInsightEvent({
        ...(scope === 'class' ? { class_id: id } : { student_id: id }),
        name: eventName.trim(),
        event_date: eventDate,
        description: eventDescription.trim(),
      })
      setData((prev) =>
        prev
          ? {
              ...prev,
              events: [...prev.events, res.event].sort((a, b) =>
                a.event_date.localeCompare(b.event_date),
              ),
            }
          : prev,
      )
      setEventName('')
      setEventDate('')
      setEventDescription('')
      setEventOpen(false)
    } catch (err) {
      setEventError(err instanceof Error ? err.message : 'Failed to add event')
    } finally {
      setEventBusy(false)
    }
  }

  async function deleteEvent(eventId: string) {
    try {
      await api.deleteInsightEvent(eventId)
      setData((prev) =>
        prev ? { ...prev, events: prev.events.filter((e) => e.id !== eventId) } : prev,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="Scores, submission rates, and weakspots for a class or individual student."
        action={
          <Dialog
            open={eventOpen}
            onOpenChange={(open) => {
              setEventOpen(open)
              if (!open) setEventError('')
            }}
          >
            <DialogTrigger asChild>
              <Button type="button" variant="outline" disabled={!id}>
                <CalendarPlus className="h-4 w-4" />
                Add event
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add event</DialogTitle>
                <DialogDescription>
                  {scope === 'class'
                    ? 'This class event will appear on the class charts and on every student’s charts in this class.'
                    : 'This student event appears only on this student’s charts (not on the class graph).'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="event-name">Event name</Label>
                  <Input
                    id="event-name"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="e.g. New textbook started"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-date">Date</Label>
                  <Input
                    id="event-date"
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-desc">Description</Label>
                  <Textarea
                    id="event-desc"
                    value={eventDescription}
                    onChange={(e) => setEventDescription(e.target.value)}
                    placeholder="Optional context for what changed"
                  />
                </div>
                {eventError ? <p className="text-sm text-destructive">{eventError}</p> : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={eventBusy || !eventName.trim() || !eventDate}
                  onClick={() => void createEvent()}
                >
                  {eventBusy ? 'Saving…' : 'Save event'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
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
              Avg HW % correct
            </div>
            <div className="mt-2 font-display text-3xl font-semibold text-[hsl(var(--insight-score-fg))]">
              {data?.avgScore == null ? '—' : `${data.avgScore}%`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              HW submission rate
            </div>
            <div className="mt-2 font-display text-3xl font-semibold text-[hsl(var(--insight-hw-fg))]">
              {data?.hwRate == null ? '—' : `${data.hwRate}%`}
            </div>
          </CardContent>
        </Card>
      </div>

      <InsightLineChartCard
        title="Scores over time"
        description="Expand for a larger, zoomable view. Dashed lines mark class or student events."
        series={data?.scoreSeries ?? []}
        events={events}
        seriesName="% correct"
        stroke="hsl(var(--insight-score))"
      />

      <InsightLineChartCard
        title="Homework submission over time"
        description="Expand for a larger, zoomable view. Dashed lines mark class or student events."
        series={data?.hwSeries ?? []}
        events={events}
        seriesName="submission %"
        stroke="hsl(var(--insight-hw))"
      />

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events yet. Add one to mark dates that may have affected performance.
            </p>
          ) : (
            <ul className="space-y-3">
              {events.map((e) => {
                const canDelete = scope === 'class' ? e.scope === 'class' : e.scope === 'student'
                return (
                  <li
                    key={e.id}
                    className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: eventColor(e.id) }}
                          aria-hidden
                        />
                        <span className="font-medium">{e.name}</span>
                        <span className="text-sm text-muted-foreground">{e.event_date}</span>
                        {e.scope === 'class' && scope === 'student' ? (
                          <Badge variant="secondary">Class</Badge>
                        ) : null}
                        {e.scope === 'student' ? <Badge variant="outline">Student</Badge> : null}
                      </div>
                      {e.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>
                      ) : null}
                      {!canDelete && e.scope === 'class' ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Switch to class scope to delete this event.
                        </p>
                      ) : null}
                    </div>
                    {canDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Delete ${e.name}`}
                        onClick={() => void deleteEvent(e.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <WeakspotsPanel
        title={scope === 'class' ? 'Class weakspots' : 'Student weakspots'}
        weakspots={data?.weakspots ?? []}
        summary={data?.weakspotsSummary}
        updatedAt={data?.weakspotsUpdatedAt}
        busy={pinpointBusy}
        error={pinpointError}
        onPinpoint={() => void pinpoint()}
      />

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
            {busy ? (
              <GenerationBusyLabel
                label="Generating…"
                percent={reportProgress.percent}
                elapsedLabel={reportProgress.elapsedLabel}
              />
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Generate report
              </>
            )}
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
