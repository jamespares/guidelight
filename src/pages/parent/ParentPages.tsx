import { useQuery } from '@tanstack/react-query'
import { BookOpenCheck, TrendingUp, CheckCircle2, Clock, Award, Activity } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, type TaskRow } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { queryKeys } from '@/lib/queryKeys'
import { taskTypeBadgeClass, taskTypeLabel } from '@/lib/taskLabels'
import { weakspotLabel } from '@/components/WeakspotsPanel'

function taskStatusText(t: TaskRow): string {
  if (t.attempt_status === 'submitted') return 'Submitted'
  if (t.attempt_status === 'in_progress') return 'In progress'
  return 'Not started'
}

export function ParentDashboardPage() {
  const { user } = useAuth()

  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: queryKeys.parentInsights.all,
    queryFn: async () => {
      const res = await api.parentInsights()
      return res
    },
  })

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: queryKeys.parentTasks.all,
    queryFn: async () => {
      const res = await api.parentTasks()
      return res.tasks
    },
  })

  const submitted = tasks.filter((t) => t.attempt_status === 'submitted')
  const inProgress = tasks.filter((t) => t.attempt_status === 'in_progress')
  const outstanding = tasks.filter((t) => t.attempt_status !== 'submitted')

  const metrics = [
    {
      label: 'Avg homework score',
      value: insights?.avgScore == null ? '—' : `${insights.avgScore}%`,
      icon: TrendingUp,
    },
    {
      label: 'Homework completion',
      value: insights?.hwRate == null ? '—' : `${insights.hwRate}%`,
      icon: CheckCircle2,
    },
    {
      label: 'Exam readiness',
      value: insights?.examReadiness == null ? '—' : `${insights.examReadiness}%`,
      icon: Award,
    },
    {
      label: 'Outstanding tasks',
      value: String(outstanding.length),
      icon: Clock,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Viewing progress for ${user?.name?.replace("'s parent", '') ?? 'your child'}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                <m.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {m.label}
                </div>
                <div className="mt-1 font-display text-2xl font-semibold">
                  {insightsLoading || tasksLoading ? '—' : m.value}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <BookOpenCheck className="h-5 w-5" />
              Live tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>
                {outstanding.length} outstanding task{outstanding.length === 1 ? '' : 's'}.
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Title</TableHead>
                  <TableHead scope="col">Type</TableHead>
                  <TableHead scope="col">Subject</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Last score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasksLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : tasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No tasks assigned yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  tasks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.title}</TableCell>
                      <TableCell>
                        <Badge className={taskTypeBadgeClass(t.type, t.subtype)}>
                          {taskTypeLabel(t.type, t.subtype)}
                        </Badge>
                      </TableCell>
                      <TableCell>{t.subject}</TableCell>
                      <TableCell>{taskStatusText(t)}</TableCell>
                      <TableCell>{t.last_score == null ? '—' : `${t.last_score}%`}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Focus areas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {insightsLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : insights?.weakspots?.length ? (
                <ul className="space-y-2 text-sm">
                  {insights.weakspots.slice(0, 6).map((w, i) => (
                    <li key={i} className="flex items-start justify-between gap-2">
                      <span>{weakspotLabel(w)}</span>
                      {w.count ? (
                        <span className="shrink-0 text-xs text-muted-foreground">{w.count}×</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No weakspots identified yet.</p>
              )}
              {insights?.weakspotsSummary ? (
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {insights.weakspotsSummary}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">At a glance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Submitted:</span>{' '}
                <strong>{submitted.length}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">In progress:</span>{' '}
                <strong>{inProgress.length}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">Outstanding:</span>{' '}
                <strong>{outstanding.length}</strong>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export function ParentTasksPage() {
  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: queryKeys.parentTasks.all,
    queryFn: async () => {
      const res = await api.parentTasks()
      return res.tasks
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description={`${tasks.length} assigned task${tasks.length === 1 ? '' : 's'}`}
      />

      {error?.message ? (
        <div aria-live="polite" role="status">
          <p className="text-sm text-destructive">{error.message}</p>
        </div>
      ) : null}

      <Table>
        <TableCaption>All assigned tasks and their current status.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Title</TableHead>
            <TableHead scope="col">Type</TableHead>
            <TableHead scope="col">Subject</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Last score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No tasks yet.
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.title}</TableCell>
                <TableCell>
                  <Badge className={taskTypeBadgeClass(t.type, t.subtype)}>
                    {taskTypeLabel(t.type, t.subtype)}
                  </Badge>
                </TableCell>
                <TableCell>{t.subject}</TableCell>
                <TableCell>{taskStatusText(t)}</TableCell>
                <TableCell>{t.last_score == null ? '—' : `${t.last_score}%`}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
