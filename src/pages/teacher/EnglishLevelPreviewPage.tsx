import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'

type CefrItem = {
  id: string
  level: string
  skill: string
  type: string
  prompt: string
  options?: string[]
  audioUrl?: string
  passageId?: string
  gapIndex?: number
  maxScore: number
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Teacher preview of an English level (CEFR) assessment, rendered as students
 * see it. Read-only: no test/attempt rows are created, answers stay local,
 * and nothing can be submitted. Students receive a random parallel form —
 * the selector below lets the teacher inspect every form.
 */
export function EnglishLevelPreviewPage() {
  const { id } = useParams()
  const [form, setForm] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.tasks.detail(id ?? ''), 'cefr-preview', form],
    queryFn: async () => {
      if (!id) throw new Error('No task id')
      return api.cefrTaskPreview(id, form)
    },
    enabled: !!id,
  })

  // Different forms contain different items — drop answers from another form.
  useEffect(() => {
    setAnswers({})
  }, [form])

  const items = useMemo(() => ((data?.items ?? []) as CefrItem[]), [data])
  const passages = data?.passages ?? {}

  if (isLoading) return <p className="text-muted-foreground">Loading preview…</p>
  if (!data) {
    return (
      <p className="text-muted-foreground">
        {error instanceof Error ? error.message : 'Task not found'}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/teacher/tasks/${id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to review
        </Link>
        <PageHeader
          title={`Preview: ${data.title || 'English level assessment'}`}
          description="CEFR diagnostic — vocabulary, listening, reading, grammar and writing."
        />
      </div>

      <Card className="border border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Eye className="h-4 w-4" />
            Student preview — this is exactly what students see. Answers are not saved or submitted.
          </p>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Parallel form</span>
            <select
              aria-label="Parallel form"
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
              value={form}
              onChange={(e) => setForm(Number(e.target.value))}
            >
              {Array.from({ length: data.formCount }, (_, i) => (
                <option key={i} value={i}>
                  Form {i + 1} of {data.formCount}
                </option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <p>
            <span className="text-muted-foreground">Questions:</span> {items.length} ·{' '}
            <span className="text-muted-foreground">Time limit:</span>{' '}
            {formatTime(data.timeLimitSeconds)} (auto-submits at 0:00 for students)
          </p>
          <p className="text-xs text-muted-foreground">
            Each student is assigned a random parallel form on start; all forms cover the same
            skills at each CEFR level.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {items.map((item, i) => {
          const prev = i > 0 ? items[i - 1] : null
          const showLevel = !prev || prev.level !== item.level
          const showPassage =
            item.passageId &&
            passages[item.passageId] &&
            (!prev || prev.passageId !== item.passageId)
          return (
            <div key={item.id} className="space-y-3">
              {showLevel ? (
                <h2 className="text-lg font-semibold text-primary">Level {item.level}</h2>
              ) : null}
              {showPassage ? (
                <Card className="bg-secondary">
                  <CardContent className="whitespace-pre-wrap p-4 text-sm leading-relaxed">
                    {passages[item.passageId!]}
                  </CardContent>
                </Card>
              ) : null}
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Question {i + 1}</span>
                    <Badge variant="secondary">{item.level}</Badge>
                    <Badge variant="outline">{item.type}</Badge>
                  </div>
                  <p className="text-sm font-medium">
                    {item.type === 'reading' ? `Gap ${item.gapIndex}` : item.prompt}
                  </p>
                  {item.audioUrl ? (
                    <audio controls src={item.audioUrl} className="w-full max-w-md" />
                  ) : null}
                  {item.type === 'written' || item.type === 'dictation' ? (
                    <Textarea
                      value={answers[item.id] ?? ''}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [item.id]: e.target.value }))
                      }
                      className={item.type === 'written' ? 'min-h-[140px]' : undefined}
                      placeholder={
                        item.type === 'dictation' ? 'Type what you hear…' : 'Type your answer…'
                      }
                    />
                  ) : (
                    <fieldset className="space-y-2">
                      <legend className="sr-only">{item.prompt}</legend>
                      {(item.options ?? []).map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={item.id}
                            className="h-4 w-4 accent-[hsl(var(--primary))]"
                            checked={answers[item.id] === opt}
                            onChange={() => setAnswers((a) => ({ ...a, [item.id]: opt }))}
                          />
                          {opt}
                        </label>
                      ))}
                    </fieldset>
                  )}
                </CardContent>
              </Card>
            </div>
          )
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        End of preview — students see a “Submit test” button here; preview answers are never sent.
      </p>
    </div>
  )
}
