/**
 * Renderers for the three IELTS listening question formats, shared by the
 * live exam (editable) and the results review (read-only with right/wrong
 * marking and the correct answers revealed).
 */
import { CheckCircle2, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { AnswerSpec, QuestionBlock } from '@/data/ielts/listeningTest1'
import type { UserAnswer } from '@/data/ielts/marking'
import { cn } from '@/lib/utils'

const LETTERS = 'ABCDEFGH'

export interface ReviewInfo {
  correct: Record<number, boolean>
  answers: Record<number, AnswerSpec>
}

interface BlockProps {
  block: QuestionBlock
  answers: Record<number, UserAnswer>
  onAnswer: (q: number, value: UserAnswer) => void
  /** Live exam: inputs stay editable throughout (in the real computer test you type as you listen). */
  disabled: boolean
  /** When set, render read-only with marking. */
  review: ReviewInfo | null
}

function answerText(spec: AnswerSpec): string {
  if (spec.kind === 'text') return spec.accept[0]
  return LETTERS[spec.correct]
}

function QuestionNumber({ q, review }: { q: number; review: ReviewInfo | null }) {
  const verdict = review?.correct[q]
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary/10 px-1 text-xs font-semibold text-primary">
        {q}
      </span>
      {review ? (
        verdict ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Correct" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" aria-label="Incorrect" />
        )
      ) : null}
    </span>
  )
}

function GapInput({ q, props }: { q: number; props: BlockProps }) {
  const { answers, onAnswer, disabled, review } = props
  const value = typeof answers[q] === 'string' ? (answers[q] as string) : ''
  const verdict = review?.correct[q]
  const spec = review?.answers[q]
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      <QuestionNumber q={q} review={review} />
      <Input
        aria-label={`Question ${q}`}
        className={cn(
          'h-8 w-36 px-2 text-center text-sm',
          review && verdict === true && 'border-emerald-500/60 bg-emerald-500/10',
          review && verdict === false && 'border-destructive/60 bg-destructive/10',
        )}
        value={value}
        disabled={disabled || !!review}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => onAnswer(q, e.target.value)}
      />
      {review && verdict === false && spec ? (
        <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          {answerText(spec)}
        </span>
      ) : null}
    </span>
  )
}

function NotesBlock({
  block,
  props,
}: {
  block: Extract<QuestionBlock, { type: 'notes' }>
  props: BlockProps
}) {
  return (
    <div className="space-y-1">
      {block.heading ? (
        <h3 className="pt-2 text-center text-sm font-semibold uppercase tracking-wide">
          {block.heading}
        </h3>
      ) : null}
      <ul className="space-y-2.5 pt-2">
        {block.lines.map((line, i) => (
          <li key={i} className="leading-loose text-foreground/90">
            {line.segments.map((seg, j) =>
              typeof seg === 'string' ? (
                <span key={j}>{seg}</span>
              ) : (
                <GapInput key={j} q={seg.q} props={props} />
              ),
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

type ChoiceReviewState = 'correct' | 'wrong-pick' | 'missed' | undefined

function ChoiceRow({
  letter,
  text,
  selected,
  reviewState,
  disabled,
  onSelect,
  name,
}: {
  letter: string
  text: string
  selected: boolean
  reviewState: ChoiceReviewState
  disabled: boolean
  onSelect: () => void
  name: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors',
        !reviewState && selected
          ? 'border-primary/60 bg-primary/5'
          : !reviewState
            ? 'border-border hover:border-primary/40'
            : undefined,
        reviewState === 'correct' && 'cursor-default border-emerald-500/60 bg-emerald-500/10',
        reviewState === 'wrong-pick' && 'cursor-default border-destructive/60 bg-destructive/10',
        reviewState === 'missed' && 'cursor-default border-border opacity-70',
        disabled && !reviewState && 'cursor-default opacity-80',
      )}
    >
      <input
        type="radio"
        name={name}
        className="mt-1 accent-primary"
        checked={selected}
        disabled={disabled || reviewState !== undefined}
        onChange={onSelect}
      />
      <span className="font-semibold text-muted-foreground">{letter}</span>
      <span className="text-foreground/90">{text}</span>
    </label>
  )
}

/**
 * In review mode the correct option is marked 'correct' and the student's
 * own wrong pick 'wrong-pick' (red); everything else is dimmed ('missed').
 */
function choiceReviewState(
  review: ReviewInfo | null,
  q: number,
  index: number,
  selected: number | null,
): ChoiceReviewState {
  if (!review) return undefined
  const spec = review.answers[q]
  if (!spec || spec.kind !== 'choice') return undefined
  if (spec.correct === index) return 'correct'
  if (selected === index && review.correct[q] === false) return 'wrong-pick'
  return 'missed'
}

function McqBlock({
  block,
  props,
}: {
  block: Extract<QuestionBlock, { type: 'mcq' }>
  props: BlockProps
}) {
  const { answers, onAnswer, disabled, review } = props
  return (
    <div className="space-y-6">
      {block.questions.map((item) => {
        const selected = typeof answers[item.q] === 'number' ? (answers[item.q] as number) : null
        return (
          <fieldset key={item.q}>
            <legend className="mb-2 flex items-center gap-2 font-medium text-foreground">
              <QuestionNumber q={item.q} review={review} />
              {item.prompt}
              {review && review.correct[item.q] === false ? (
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  Correct answer: {answerText(review.answers[item.q])}
                </span>
              ) : null}
            </legend>
            <div className="space-y-2">
              {item.options.map((opt, i) => (
                <ChoiceRow
                  key={i}
                  name={`q-${item.q}`}
                  letter={LETTERS[i]}
                  text={opt}
                  selected={selected === i}
                  reviewState={choiceReviewState(review, item.q, i, selected)}
                  disabled={disabled}
                  onSelect={() => onAnswer(item.q, i)}
                />
              ))}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}

function MatchingBlock({
  block,
  props,
}: {
  block: Extract<QuestionBlock, { type: 'matching' }>
  props: BlockProps
}) {
  const { answers, onAnswer, disabled, review } = props
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        {block.bankHeading ? (
          <h3 className="mb-2 text-sm font-semibold">{block.bankHeading}</h3>
        ) : null}
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {block.bank.map((opt, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-semibold text-muted-foreground">{LETTERS[i]}</span>
              <span className="text-foreground/90">{opt}</span>
            </li>
          ))}
        </ul>
      </div>
      <ul className="space-y-4">
        {block.items.map((item) => {
          const selected = typeof answers[item.q] === 'number' ? (answers[item.q] as number) : null
          return (
            <li key={item.q}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                <QuestionNumber q={item.q} review={review} />
                {item.prompt}
                {review && review.correct[item.q] === false ? (
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Correct answer: {answerText(review.answers[item.q])}
                  </span>
                ) : null}
              </div>
              <div
                className="flex flex-wrap gap-1.5"
                role="radiogroup"
                aria-label={`Question ${item.q}`}
              >
                {block.bank.map((_, i) => {
                  const state = choiceReviewState(review, item.q, i, selected)
                  return (
                    <label
                      key={i}
                      className={cn(
                        'flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold transition-colors',
                        !state && selected === i
                          ? 'border-primary bg-primary text-primary-foreground'
                          : !state
                            ? 'border-border hover:border-primary/50'
                            : undefined,
                        state === 'correct' &&
                          'cursor-default border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                        state === 'wrong-pick' &&
                          'cursor-default border-destructive/60 bg-destructive/10 text-destructive',
                        state === 'missed' && 'cursor-default border-border opacity-60',
                      )}
                    >
                      <input
                        type="radio"
                        name={`q-${item.q}`}
                        className="sr-only"
                        checked={selected === i}
                        disabled={disabled || state !== undefined}
                        onChange={() => onAnswer(item.q, i)}
                      />
                      {LETTERS[i]}
                    </label>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function QuestionBlockView(props: BlockProps) {
  const { block } = props
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        {block.type === 'notes' ? (
          <NotesBlock block={block} props={props} />
        ) : block.type === 'mcq' ? (
          <McqBlock block={block} props={props} />
        ) : (
          <MatchingBlock block={block} props={props} />
        )}
      </CardContent>
    </Card>
  )
}
