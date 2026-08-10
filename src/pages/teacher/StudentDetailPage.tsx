import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, KeyRound, RefreshCw, Save } from 'lucide-react'
import { GenerationBusyLabel } from '@/components/GenerationProgress'
import { PageHeader } from '@/components/PageHeader'
import { WeakspotsPanel, weakspotLabel } from '@/components/WeakspotsPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, isAiBudgetError, type Weakspot } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { CAP_HIT_TEACHER } from '@/lib/trustCopy'
import { AI_WAIT_MS, useEstimatedProgress } from '@/lib/useEstimatedProgress'

type BusyKind = 'save' | 'summary' | 'report' | null

export function StudentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const {
    data: student,
    isLoading: studentLoading,
    error: studentError,
  } = useQuery({
    queryKey: queryKeys.students.detail(id ?? ''),
    queryFn: async () => {
      if (!id) throw new Error('No student id')
      const res = await api.student(id)
      return res.student
    },
    enabled: !!id,
  })

  const { data: attempts = [] } = useQuery({
    queryKey: [...queryKeys.students.detail(id ?? ''), 'attempts'],
    queryFn: async () => {
      if (!id) throw new Error('No student id')
      const res = await api.student(id)
      return res.attempts
    },
    enabled: !!id,
  })

  const { data: examReadiness = [] } = useQuery({
    queryKey: queryKeys.students.examReadiness(id ?? ''),
    queryFn: async () => {
      if (!id) throw new Error('No student id')
      const res = await api.studentExamReadinessDetail(id)
      return res.profiles
    },
    enabled: !!id,
  })

  const [interests, setInterests] = useState('')
  const [career, setCareer] = useState('')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const [pinpointError, setPinpointError] = useState('')
  const [busyKind, setBusyKind] = useState<BusyKind>(null)
  const [pinpointBusy, setPinpointBusy] = useState(false)
  const [notes, setNotes] = useState('')
  const [weakspots, setWeakspots] = useState<Weakspot[]>([])
  const [weakspotsSummary, setWeakspotsSummary] = useState<string | null>(null)
  const [weakspotsUpdatedAt, setWeakspotsUpdatedAt] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)
  const [credBusy, setCredBusy] = useState(false)
  const [credError, setCredError] = useState('')

  const busy = busyKind !== null
  const summaryProgress = useEstimatedProgress(busyKind === 'summary', AI_WAIT_MS.report)
  const reportProgress = useEstimatedProgress(busyKind === 'report', AI_WAIT_MS.report)

  useEffect(() => {
    if (student) {
      setInterests(student.interests)
      setCareer(student.career_ambitions)
      setSummary(student.ai_summary)
      setWeakspots(student.weakspots ?? [])
      setWeakspotsSummary(student.weakspots_summary ?? null)
      setWeakspotsUpdatedAt(student.weakspots_updated_at ?? null)
      setUsername(student.username)
    }
  }, [student])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!id) return
    setBusyKind('save')
    try {
      await api.updateStudent(id, { interests, career_ambitions: career })
      await queryClient.invalidateQueries({ queryKey: queryKeys.students.detail(id) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusyKind(null)
    }
  }

  async function refreshSummary() {
    if (!id) return
    setBusyKind('summary')
    try {
      const res = await api.refreshSummary(id)
      setSummary(res.summary)
      await queryClient.invalidateQueries({ queryKey: queryKeys.students.detail(id) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusyKind(null)
    }
  }

  async function makeReport() {
    if (!id) return
    setBusyKind('report')
    try {
      const res = await api.createReport({ student_id: id, teacher_notes: notes })
      navigate(`/teacher/reports/${res.report.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusyKind(null)
    }
  }

  async function saveCredentials(e: FormEvent) {
    e.preventDefault()
    if (!id) return
    setCredBusy(true)
    setCredError('')
    try {
      await api.updateStudent(id, { username: username.trim().toLowerCase() })
      await queryClient.invalidateQueries({ queryKey: queryKeys.students.detail(id) })
    } catch (err) {
      setCredError(err instanceof Error ? err.message : 'Failed to save username')
    } finally {
      setCredBusy(false)
    }
  }

  async function resetPassword() {
    if (!id) return
    setCredBusy(true)
    setCredError('')
    try {
      const res = await api.resetStudentPassword(
        id,
        newPassword.trim() ? { password: newPassword.trim() } : undefined,
      )
      setRevealedPassword(res.password)
      setNewPassword('')
    } catch (err) {
      setCredError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setCredBusy(false)
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.students.detail(id) })
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

  if (studentLoading) {
    return <p className="text-muted-foreground">Loading…</p>
  }
  if (!student) {
    return <p className="text-muted-foreground">{error || studentError?.message || 'Not found'}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/teacher/students" className="text-sm text-muted-foreground hover:underline">
          ← Students
        </Link>
        <PageHeader
          title={student.display_name}
          description={`${student.class_name} · ${student.class_subject}`}
        />
      </div>

      {error ? (
        <div aria-live="polite" role="status">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {[
          {
            label: 'Avg HW score',
            value: student.avg_score == null ? '—' : `${student.avg_score}%`,
            className: 'text-[hsl(var(--insight-score-fg))]',
          },
          {
            label: 'Exam readiness',
            value:
              student.exam_readiness == null ? '—' : `${student.exam_readiness}%`,
            className: 'text-[hsl(var(--insight-readiness-fg))]',
          },
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
              <div className={`mt-2 font-display text-2xl font-semibold ${'className' in s ? s.className : ''}`}>
                {s.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Login credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Students sign in with username and password. Passwords are stored securely — you can only
            see them when first created or after a reset below.
          </p>
          {credError ? <p className="text-sm text-destructive">{credError}</p> : null}
          <form className="space-y-4" onSubmit={(e) => void saveCredentials(e)}>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                pattern="[a-z0-9]{3,32}"
                title="3–32 lowercase letters or numbers"
                required
              />
            </div>
            <Button type="submit" variant="outline" disabled={credBusy}>
              <Save className="h-4 w-4" />
              {credBusy ? 'Saving…' : 'Save username'}
            </Button>
          </form>
          <div className="space-y-2 border-t border-border pt-4">
            <Label htmlFor="new-password">Set or reset password</Label>
            <p className="text-xs text-muted-foreground">
              Leave blank to generate a random password, or type one (4–64 characters).
            </p>
            <Input
              id="new-password"
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Optional custom password"
              autoComplete="new-password"
            />
            <Button type="button" disabled={credBusy} onClick={() => void resetPassword()}>
              {credBusy ? 'Resetting…' : 'Reset password'}
            </Button>
          </div>
          {revealedPassword ? (
            <div className="rounded-lg border border-border bg-secondary p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                New password — save now
              </p>
              <p className="mt-2 font-mono text-lg font-semibold">{revealedPassword}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => setRevealedPassword(null)}
              >
                Dismiss
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <WeakspotsPanel
        weakspots={weakspots}
        summary={weakspotsSummary}
        updatedAt={weakspotsUpdatedAt}
        busy={pinpointBusy}
        error={pinpointError}
        onPinpoint={() => void pinpoint()}
      />

      {examReadiness.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Exam readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {examReadiness.map(({ profile, readiness, attempts: mockAttempts }) => (
              <div key={profile.id} className="space-y-2 border-b border-border/60 pb-4 last:border-0">
                <h3 className="font-medium">{profile.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {profile.curriculum} {profile.syllabus_code} · Pass {profile.pass_grade} · Target{' '}
                  {profile.target_grade}
                </p>
                {readiness.unlockMessage ? (
                  <p className="text-sm text-muted-foreground">{readiness.unlockMessage}</p>
                ) : (
                  <div className="grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      Avg mock score:{' '}
                      <strong>{readiness.averageScore != null ? `${readiness.averageScore}%` : '—'}</strong>
                    </div>
                    <div>
                      Pass probability:{' '}
                      <strong>
                        {readiness.passProbability != null ? `${readiness.passProbability}%` : '—'}
                      </strong>
                    </div>
                    <div>
                      Target probability:{' '}
                      <strong>
                        {readiness.targetProbability != null
                          ? `${readiness.targetProbability}%`
                          : '—'}
                      </strong>
                    </div>
                  </div>
                )}
                {readiness.recommendation ? (
                  <p className="text-sm text-muted-foreground">{readiness.recommendation}</p>
                ) : null}
                {(mockAttempts.results ?? []).length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {(mockAttempts.results ?? []).map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span>{a.title}</span>
                        <span className="tabular-nums">
                          {a.score_pct == null ? '—' : `${a.score_pct}%`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No mock exam attempts yet.</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle as="h2">AI introduction</CardTitle>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void refreshSummary()}>
            {busyKind === 'summary' ? (
              <GenerationBusyLabel
                label="Generating…"
                percent={summaryProgress.percent}
                elapsedLabel={summaryProgress.elapsedLabel}
                variant="onSurface"
              />
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Generate / refresh
              </>
            )}
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
          <CardTitle as="h2">Editable profile</CardTitle>
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
              {busyKind === 'save' ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Parent report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notes">Extra notes for the report</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button type="button" className="w-full" disabled={busy} onClick={() => void makeReport()}>
            {busyKind === 'report' ? (
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
