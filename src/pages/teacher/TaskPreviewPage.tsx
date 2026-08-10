import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { AttemptView } from '@/components/AttemptView'
import { Card, CardContent } from '@/components/ui/card'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Teacher preview of a task, rendered exactly as students see it.
 * No attempt is created; answers stay local and submission is disabled.
 */
export function TaskPreviewPage() {
  const { id } = useParams()
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(Date.now())

  const {
    data: task,
    isLoading,
    error,
  } = useQuery({
    queryKey: [...queryKeys.tasks.detail(id ?? ''), 'preview'],
    queryFn: async () => {
      if (!id) throw new Error('No task id')
      const res = await api.taskPreview(id)
      return res.task
    },
    enabled: !!id,
  })

  useEffect(() => {
    if (task?.time_limit_seconds != null) setSecondsLeft(task.time_limit_seconds)
    startedAt.current = Date.now()
  }, [task?.id, task?.time_limit_seconds])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed(Date.now() - startedAt.current)
      setSecondsLeft((s) => (s == null || s <= 0 ? s : s - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (isLoading) return <p className="text-muted-foreground">Loading preview…</p>
  if (!task) {
    return (
      <p className="text-muted-foreground">
        {error instanceof Error ? error.message : 'Task not found'}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="border border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Eye className="h-4 w-4" />
            Student preview — this is exactly what students see. Answers are not saved.
          </p>
          <Link
            to={`/teacher/tasks/${task.id}`}
            className="font-semibold underline-offset-4 hover:underline"
          >
            ← Back to review
          </Link>
        </CardContent>
      </Card>
      {task.rubric_text ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Marking criteria — students see this before writing
            </p>
            <p className="text-sm whitespace-pre-wrap">{task.rubric_text}</p>
          </CardContent>
        </Card>
      ) : null}
      {task.model_essay ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Model essay — students see this after submitting
            </p>
            <p className="text-sm whitespace-pre-wrap">{task.model_essay}</p>
          </CardContent>
        </Card>
      ) : null}
      <AttemptView
        preview
        content={task.content}
        taskMeta={{
          type: task.type,
          time_limit_seconds: task.time_limit_seconds,
          title: task.title,
          reading_text: task.reading_text,
        }}
        answers={answers}
        onAnswer={(qid, v) => setAnswers((prev) => ({ ...prev, [qid]: v }))}
        secondsLeft={secondsLeft}
        elapsed={elapsed}
      />
    </div>
  )
}
