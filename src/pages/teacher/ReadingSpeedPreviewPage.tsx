import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Teacher preview of a reading speed assessment, rendered as students see it.
 * Read-only: no attempt rows are created, the preview is not timed, answers
 * stay local and nothing is submitted. Copying is left enabled here —
 * students have it disabled during the reading step.
 */
export function ReadingSpeedPreviewPage() {
  const { id } = useParams()
  const [phase, setPhase] = useState<'start' | 'reading' | 'checks' | 'result'>('start')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [canFinish, setCanFinish] = useState(false)
  const passageRef = useRef<HTMLPreElement>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.tasks.detail(id ?? ''), 'reading-speed-preview'],
    queryFn: async () => {
      if (!id) throw new Error('No task id')
      return api.readingSpeedTaskPreview(id)
    },
    enabled: !!id,
  })

  // Students can only finish once they have scrolled to the bottom — mirrored
  // here for fidelity.
  useEffect(() => {
    if (phase !== 'reading') return
    const el = passageRef.current
    if (!el) return
    const onScroll = () => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8
      setCanFinish(atBottom)
    }
    el.addEventListener('scroll', onScroll)
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [phase, data])

  if (isLoading) return <p className="text-muted-foreground">Loading preview…</p>
  if (!data) {
    return (
      <p className="text-muted-foreground">
        {error instanceof Error ? error.message : 'Task not found'}
      </p>
    )
  }

  const checks = data.checks ?? []

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/teacher/tasks/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to review
        </Link>
        <PageHeader
          title={`Preview: ${data.title || 'Reading speed'}`}
          description="Timed natural-pace reading with spot-checks."
        />
      </div>

      <Card className="border border-primary/30 bg-primary/5">
        <CardContent className="p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Eye className="h-4 w-4" />
            Student preview — this is what students see. Nothing is timed, saved or submitted.
          </p>
        </CardContent>
      </Card>

      {phase === 'start' ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-muted-foreground">
              You will read a passage of about {data.wordCount} words at your normal pace. When you
              finish, you will answer {data.passNeed}+ of {checks.length || 3} quick questions about
              words in the text.
            </p>
            <Button type="button" onClick={() => setPhase('reading')}>
              Start reading
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {phase === 'reading' ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-muted-foreground">
              Scroll to the bottom, then finish. Copying is disabled.
            </p>
            <pre
              ref={passageRef}
              className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary p-4 text-base leading-relaxed select-none"
            >
              {data.body}
            </pre>
            <Button type="button" disabled={!canFinish} onClick={() => setPhase('checks')}>
              Finish reading
            </Button>
            <p className="text-xs text-muted-foreground">
              Students' reading time is measured between Start and Finish and converted to WPM
              ({data.wordCount} words ÷ minutes). This preview is not timed, and copying is left
              enabled for you.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {phase === 'checks' ? (
        <Card>
          <CardContent className="space-y-6 p-6">
            <p className="text-sm text-muted-foreground">
              Answer these questions about the passage. You need at least {data.passNeed} correct.
            </p>
            {checks.map((ch, i) => (
              <fieldset key={ch.id} className="space-y-2">
                <legend className="text-sm font-medium">
                  {i + 1}. {ch.prompt}
                </legend>
                {ch.options.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={ch.id}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={answers[ch.id] === opt}
                      onChange={() => setAnswers((a) => ({ ...a, [ch.id]: opt }))}
                    />
                    {opt}
                  </label>
                ))}
                {ch.answer ? (
                  <p className="text-xs text-muted-foreground">
                    Teacher note: correct answer is “{ch.answer}” (students never see this).
                  </p>
                ) : null}
              </fieldset>
            ))}
            <Button
              type="button"
              disabled={checks.some((c) => !answers[c.id])}
              onClick={() => setPhase('result')}
            >
              Submit checks
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {phase === 'result' ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-lg font-semibold">
              Students see their reading speed (WPM) and spot-check score here.
            </p>
            <p className="text-sm text-muted-foreground">
              Attempts implying over 500 wpm or under 80 wpm, or failing at least {data.passNeed}{' '}
              spot-checks, are rejected and the student is asked to start again.
            </p>
            <Button asChild variant="outline">
              <Link to={`/teacher/tasks/${id}`}>Back to review</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
