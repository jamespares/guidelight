import type { ReactNode } from 'react'
import { Eye, Play, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Question, TaskContent } from '@/lib/api'

export interface AttemptTaskMeta {
  type: string
  time_limit_seconds: number | null
  title: string
  reading_text?: string
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: Question
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (q.type === 'mcq' || q.type === 'bloom') {
    return (
      <fieldset className="space-y-2">
        <legend className="sr-only">{q.prompt}</legend>
        {(q.options ?? []).map((opt) => (
          <label
            key={opt}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-secondary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <input
              type="radio"
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              name={q.id}
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            <span className="text-sm">{opt}</span>
          </label>
        ))}
      </fieldset>
    )
  }

  if (q.type === 'cloze') {
    const parts = q.prompt.split('_____')
    const vals = (value as string[]) ?? Array(parts.length - 1).fill('')
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Fill in each blank.</p>
        <div className="flex flex-wrap items-center gap-2 text-sm leading-relaxed">
          {parts.map((part, i) => (
            <span key={i} className="flex items-center gap-2">
              <span>{part}</span>
              {i < parts.length - 1 ? (
                <Input
                  className="w-40"
                  value={vals[i] ?? ''}
                  onChange={(e) => {
                    const next = [...vals]
                    next[i] = e.target.value
                    onChange(next)
                  }}
                  placeholder="answer"
                />
              ) : null}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (q.type === 'frayer') {
    const v = (value as Record<string, string>) || {}
    const set = (k: string, val: string) => onChange({ ...v, [k]: val })
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Term: <strong>{q.frayer?.term || q.prompt}</strong>
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {['definition', 'characteristics', 'examples', 'nonExamples'].map((k) => (
            <div key={k} className="rounded-lg border border-border p-2">
              <div className="mb-1 text-xs uppercase text-muted-foreground">{k}</div>
              <Textarea value={v[k] || ''} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (q.type === 'listen_respond') {
    return (
      <div className="space-y-3">
        {q.audioUrl ? (
          <audio controls src={q.audioUrl} className="w-full max-w-md" />
        ) : (
          <Button type="button" variant="outline" onClick={() => speak(q.audioScript || q.prompt)}>
            <Play className="h-4 w-4" />
            Play audio
          </Button>
        )}
        <Textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your response…"
        />
      </div>
    )
  }

  if (q.type === 'image_analysis') {
    return (
      <div className="space-y-3">
        {q.imageUrl ? (
          <Card className="bg-secondary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Image stimulus</CardTitle>
            </CardHeader>
            <CardContent>
              <img
                src={q.imageUrl}
                alt=""
                className="max-h-80 rounded-md border border-border object-contain"
                onError={(e) => {
                  const target = e.currentTarget
                  target.style.display = 'none'
                  target.nextElementSibling?.classList.remove('hidden')
                }}
              />
              <p className="hidden text-sm text-muted-foreground">
                Image could not be loaded: {q.imageUrl}
              </p>
            </CardContent>
          </Card>
        ) : null}
        <Textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Analyse the stimulus and explain what it shows…"
        />
      </div>
    )
  }

  return (
    <Textarea
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Write your answer…"
      className={q.type === 'extended_written' ? 'min-h-[180px]' : undefined}
    />
  )
}

/**
 * The answering screen exactly as students see it. Purely presentational:
 * the caller owns the timer, answers state and submission. In `preview`
 * mode (teacher preview) the submit button is disabled.
 */
export function AttemptView({
  content,
  taskMeta,
  answers,
  onAnswer,
  secondsLeft,
  elapsed,
  error,
  timeAnnouncement,
  preview = false,
  busy = false,
  submitLabel,
  onSubmit,
}: {
  content: TaskContent
  taskMeta: AttemptTaskMeta
  answers: Record<string, unknown>
  onAnswer: (qid: string, v: unknown) => void
  secondsLeft: number | null
  elapsed: number
  error?: string
  timeAnnouncement?: string
  preview?: boolean
  busy?: boolean
  submitLabel?: ReactNode
  onSubmit?: () => void
}) {
  const elapsedMin = Math.floor(elapsed / 60000)
  const elapsedSec = Math.floor((elapsed % 60000) / 1000)

  const answeredCount = content.questions.filter((q) => {
    const v = answers[q.id]
    if (v == null) return false
    if (typeof v === 'string') return v.trim().length > 0
    if (Array.isArray(v)) return v.some((s) => String(s).trim().length > 0)
    if (typeof v === 'object') return Object.keys(v).length > 0
    return true
  }).length

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div aria-live="polite" className="sr-only">
        {timeAnnouncement}
      </div>
      <div className="sticky top-0 z-10 space-y-2 rounded-lg border border-border bg-primary px-4 py-3 text-primary-foreground shadow-sm">
        <div className="flex items-center justify-between">
          <strong>{content.title || taskMeta.title}</strong>
          <span className="text-sm text-primary-foreground/85">
            Time spent {elapsedMin}:{String(elapsedSec).padStart(2, '0')}
            {secondsLeft != null &&
              ` · Remaining ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-primary-foreground/85">
          <span>
            Question {Math.min(answeredCount + 1, content.questions.length)} of {content.questions.length}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-primary-foreground/20">
            <div
              className="h-full bg-primary-foreground transition-all duration-300"
              style={{ width: `${(answeredCount / content.questions.length) * 100}%` }}
            />
          </div>
          <span>{answeredCount}/{content.questions.length} answered</span>
        </div>
      </div>
      {error ? (
        <div aria-live="polite" role="status">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">{content.instructions}</p>
      <Card className="border border-warning-foreground/30 bg-warning text-warning-foreground">
        <CardContent className="p-3 text-sm">
          Copy and paste are disabled for this task.
        </CardContent>
      </Card>

      {taskMeta.reading_text ? (
        <Card className="bg-secondary">
          <CardHeader className="pb-2">
            <CardTitle as="h2" className="text-base">Reading passage</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm leading-relaxed">
            {taskMeta.reading_text}
          </CardContent>
        </Card>
      ) : null}

      {content.questions.map((q, i) => (
        <Card key={q.id}>
          <CardHeader className="pb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Question {i + 1} · {q.type} · {q.marks ?? 1} mark(s)
              {q.topic ? ` · ${q.topic}` : ''}
            </p>
            <CardTitle className="text-base font-semibold">{q.prompt}</CardTitle>
            {q.learningObjective ? (
              <p className="text-sm font-normal text-muted-foreground">{q.learningObjective}</p>
            ) : null}
          </CardHeader>
          <CardContent>
            <QuestionInput
              q={q}
              value={answers[q.id]}
              onChange={(v) => onAnswer(q.id, v)}
            />
          </CardContent>
        </Card>
      ))}

      {preview ? (
        <Button type="button" className="w-full" disabled>
          <Eye className="h-4 w-4" />
          Preview — submissions are disabled
        </Button>
      ) : (
        <Button type="button" className="w-full" disabled={busy} onClick={onSubmit}>
          {submitLabel ?? (
            <>
              <Send className="h-4 w-4" />
              Submit for marking
            </>
          )}
        </Button>
      )}
    </div>
  )
}
