import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Clock,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  LISTENING_TEST_1,
  type IeltsListeningTest,
  type IeltsPart,
} from '@/data/ielts/listeningTest1'
import { markTest, type UserAnswer } from '@/data/ielts/marking'
import { ieltsTestTitle } from '@/lib/seo'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { cn } from '@/lib/utils'
import { IeltsShell } from './IeltsShell'
import {
  clearDraft,
  loadDraft,
  resultLabel,
  saveDraft,
  saveResult,
} from './ieltsStorage'
import { QuestionBlockView, type ReviewInfo } from './QuestionBlocks'

const INTRO_SECONDS = 30
const CHECK_SECONDS = 30
const REVIEW_SECONDS = 120

type Phase =
  | { kind: 'ready' }
  | { kind: 'intro'; partIndex: number }
  | { kind: 'listening'; partIndex: number }
  | { kind: 'check'; partIndex: number }
  | { kind: 'review' }
  | { kind: 'results' }

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Self-contained countdown: calls onDone once when it reaches zero. */
function Countdown({
  seconds,
  onDone,
  label,
}: {
  seconds: number
  onDone: () => void
  label: string
}) {
  const [left, setLeft] = useState(seconds)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    if (left <= 0) {
      doneRef.current()
      return
    }
    const id = window.setTimeout(() => setLeft((v) => v - 1), 1000)
    return () => window.clearTimeout(id)
  }, [left])
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80">
      <Clock className="h-4 w-4 text-primary" aria-hidden />
      {label} {formatClock(left)}
    </span>
  )
}

export function IeltsTestPage() {
  const test: IeltsListeningTest = LISTENING_TEST_1
  useDocumentTitle(ieltsTestTitle(test.title))

  const [phase, setPhase] = useState<Phase>({ kind: 'ready' })
  const [answers, setAnswers] = useState<Record<number, UserAnswer>>({})
  const [practiceMode, setPracticeMode] = useState(false)
  const [paused, setPaused] = useState(false)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1 of current recording
  const [elapsed, setElapsed] = useState(0)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [reviewPart, setReviewPart] = useState(0)
  const [draft, setDraft] = useState<ReturnType<typeof loadDraft>>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const result = useMemo(
    () => (phase.kind === 'results' ? markTest(test.answers, answers) : null),
    [phase.kind, test.answers, answers],
  )

  // Restore any saved draft after mount (SSR renders the clean state).
  useEffect(() => {
    setDraft(loadDraft(test.slug))
  }, [test.slug])

  // Overall elapsed clock, ticking from the moment the test starts until results.
  useEffect(() => {
    if (phase.kind === 'ready' || phase.kind === 'results') return
    if (startedAtRef.current === null) startedAtRef.current = Date.now()
    const id = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - (startedAtRef.current ?? 0)) / 1000)),
      1000,
    )
    return () => window.clearInterval(id)
  }, [phase.kind])

  const stopAudio = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    audioRef.current = null
    setPaused(false)
    setProgress(0)
  }, [])

  const playCurrentPart = useCallback(
    (part: IeltsPart) => {
      stopAudio()
      setAudioError(false)
      const audio = new Audio(part.audioFile)
      audio.preload = 'auto'
      audio.addEventListener('timeupdate', () => {
        if (audio.duration > 0) setProgress(audio.currentTime / audio.duration)
      })
      audio.addEventListener('ended', () => {
        setPhase((p) =>
          p.kind === 'listening' && p.partIndex === part.part - 1
            ? { kind: 'check', partIndex: part.part - 1 }
            : p,
        )
      })
      audio.addEventListener('error', () => setAudioError(true))
      audioRef.current = audio
      audio.play().catch(() => setNeedsGesture(true))
    },
    [stopAudio],
  )

  const beginListening = useCallback(
    (partIndex: number) => {
      setNeedsGesture(false)
      setPhase({ kind: 'listening', partIndex })
      playCurrentPart(test.parts[partIndex])
    },
    [playCurrentPart, test.parts],
  )

  function startTest(partIndex: number, practice: boolean, restored: Record<number, UserAnswer>) {
    setAnswers(restored)
    setPracticeMode(practice)
    setDraft(null)
    setElapsed(0)
    startedAtRef.current = null
    setPhase({ kind: 'intro', partIndex })
  }

  function handleAnswer(q: number, value: UserAnswer) {
    setAnswers((prev) => {
      const next = { ...prev, [q]: value }
      const partIndex =
        phase.kind === 'intro' || phase.kind === 'listening' || phase.kind === 'check'
          ? phase.partIndex
          : 3
      saveDraft(test.slug, { answers: next, partIndex, practiceMode })
      return next
    })
  }

  function goToPartIntro(partIndex: number) {
    stopAudio()
    setConfirmSubmit(false)
    setPhase({ kind: 'intro', partIndex })
    saveDraft(test.slug, { answers, partIndex, practiceMode })
  }

  function submit() {
    stopAudio()
    const marked = markTest(test.answers, answers)
    saveResult(test.slug, {
      raw: marked.raw,
      total: marked.total,
      band: marked.band,
      date: new Date().toISOString(),
    })
    clearDraft(test.slug)
    setPhase({ kind: 'results' })
  }

  function retake() {
    setAnswers({})
    setReviewPart(0)
    setConfirmSubmit(false)
    setPhase({ kind: 'ready' })
  }

  const currentPart =
    phase.kind === 'intro' || phase.kind === 'listening' || phase.kind === 'check'
      ? test.parts[phase.partIndex]
      : null

  const review: ReviewInfo | null =
    phase.kind === 'results' && result
      ? { correct: result.correct, answers: test.answers }
      : null

  return (
    <IeltsShell>
      {phase.kind === 'ready' ? (
        <ReadyScreen
          test={test}
          practiceMode={practiceMode}
          setPracticeMode={setPracticeMode}
          draft={draft}
          onStart={(partIndex, practice, restored) => startTest(partIndex, practice, restored)}
          onDiscardDraft={() => {
            clearDraft(test.slug)
            setDraft(null)
          }}
        />
      ) : (
        <div className="space-y-6">
          <PlayerBar
            test={test}
            phase={phase}
            practiceMode={practiceMode}
            paused={paused}
            progress={progress}
            elapsed={elapsed}
            audioError={audioError}
            needsGesture={needsGesture}
            onGesturePlay={() => {
              setNeedsGesture(false)
              audioRef.current?.play().catch(() => setNeedsGesture(true))
            }}
            onTogglePause={() => {
              const audio = audioRef.current
              if (!audio) return
              if (audio.paused) {
                audio.play().catch(() => setAudioError(true))
                setPaused(false)
              } else {
                audio.pause()
                setPaused(true)
              }
            }}
            onVolume={(v) => {
              if (audioRef.current) audioRef.current.volume = v
            }}
          />

          {phase.kind === 'intro' && currentPart ? (
            <PartIntro
              key={`intro-${currentPart.part}`}
              part={currentPart}
              total={test.parts.length}
              answers={answers}
              onAnswer={handleAnswer}
              onBegin={() => beginListening(currentPart.part - 1)}
            />
          ) : null}

          {phase.kind === 'listening' && currentPart ? (
            <ListeningStage part={currentPart} answers={answers} onAnswer={handleAnswer} />
          ) : null}

          {phase.kind === 'check' && currentPart ? (
            <CheckStage
              key={`check-${currentPart.part}`}
              part={currentPart}
              isLast={currentPart.part === test.parts.length}
              answers={answers}
              onAnswer={handleAnswer}
              onContinue={() =>
                currentPart.part === test.parts.length
                  ? setPhase({ kind: 'review' })
                  : goToPartIntro(currentPart.part)
              }
            />
          ) : null}

          {phase.kind === 'review' ? (
            <ReviewStage
              test={test}
              reviewPart={reviewPart}
              setReviewPart={setReviewPart}
              answers={answers}
              onAnswer={handleAnswer}
              confirmSubmit={confirmSubmit}
              setConfirmSubmit={setConfirmSubmit}
              onSubmit={submit}
            />
          ) : null}

          {phase.kind === 'results' && result ? (
            <ResultsStage test={test} answers={answers} review={review} result={result} onRetake={retake} />
          ) : null}
        </div>
      )}
    </IeltsShell>
  )
}

// ---------------------------------------------------------------------------
// Ready screen
// ---------------------------------------------------------------------------

function ReadyScreen({
  test,
  practiceMode,
  setPracticeMode,
  draft,
  onStart,
  onDiscardDraft,
}: {
  test: IeltsListeningTest
  practiceMode: boolean
  setPracticeMode: (v: boolean) => void
  draft: ReturnType<typeof loadDraft>
  onStart: (partIndex: number, practice: boolean, restored: Record<number, UserAnswer>) => void
  onDiscardDraft: () => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/ielts-listening" className="text-sm text-muted-foreground hover:underline">
          ← IELTS listening mock exam
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{test.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Four recordings, {test.totalQuestions} questions. You will hear each recording{' '}
          <strong>once only</strong>. Answer as you listen; you can change your answers until you
          submit. 每段录音只播放一遍，请边听边作答，交卷前可随时修改答案。
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="font-semibold">Choose your mode 选择模式</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className={cn(
                'flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors',
                !practiceMode ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40',
              )}
            >
              <input
                type="radio"
                name="mode"
                className="mt-1 accent-primary"
                checked={!practiceMode}
                onChange={() => setPracticeMode(false)}
              />
              <span>
                <span className="block font-medium">Exam mode 考试模式</span>
                <span className="block text-sm text-muted-foreground">
                  Like the real computer test: each recording plays once, straight through — no
                  pause, no rewind.
                </span>
              </span>
            </label>
            <label
              className={cn(
                'flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors',
                practiceMode ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40',
              )}
            >
              <input
                type="radio"
                name="mode"
                className="mt-1 accent-primary"
                checked={practiceMode}
                onChange={() => setPracticeMode(true)}
              />
              <span>
                <span className="block font-medium">Practice mode 练习模式</span>
                <span className="block text-sm text-muted-foreground">
                  Pause the recording if you need to. Scores still use the official band boundaries.
                </span>
              </span>
            </label>
          </div>

          {draft ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
              <p className="text-sm">
                You have an unfinished attempt at <strong>Part {draft.partIndex + 1}</strong> on
                this device.
              </p>
              <Button
                onClick={() => onStart(draft.partIndex, draft.practiceMode, draft.answers)}
              >
                Resume draft 继续作答
              </Button>
              <Button variant="outline" onClick={onDiscardDraft}>
                Discard 放弃草稿
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => onStart(0, practiceMode, {})}>
              <Headphones className="mr-2 h-4 w-4" aria-hidden /> Start the test 开始考试
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Best experienced with headphones. Your answers are saved on this device as you go.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sticky player bar
// ---------------------------------------------------------------------------

function PlayerBar({
  test,
  phase,
  practiceMode,
  paused,
  progress,
  elapsed,
  audioError,
  needsGesture,
  onGesturePlay,
  onTogglePause,
  onVolume,
}: {
  test: IeltsListeningTest
  phase: Phase
  practiceMode: boolean
  paused: boolean
  progress: number
  elapsed: number
  audioError: boolean
  needsGesture: boolean
  onGesturePlay: () => void
  onTogglePause: () => void
  onVolume: (v: number) => void
}) {
  const partNo =
    phase.kind === 'intro' || phase.kind === 'listening' || phase.kind === 'check'
      ? phase.partIndex + 1
      : null
  const status =
    phase.kind === 'intro'
      ? 'Read the questions'
      : phase.kind === 'listening'
        ? paused
          ? 'Paused'
          : 'Listening'
        : phase.kind === 'check'
          ? 'Check your answers'
          : phase.kind === 'review'
            ? 'Final review'
            : 'Results'

  return (
    <div className="sticky top-[4.5rem] z-10 -mx-2 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Badge variant="accent">
          {partNo ? `Part ${partNo} of ${test.parts.length}` : status}
        </Badge>
        {partNo ? <span className="text-sm font-medium text-foreground/80">{status}</span> : null}
        <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" aria-hidden />
          {formatClock(elapsed)}
        </span>
        {phase.kind === 'listening' && practiceMode ? (
          <Button variant="outline" size="sm" onClick={onTogglePause}>
            {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
        ) : null}
        <label className="inline-flex items-center gap-2 text-muted-foreground">
          <Volume2 className="h-4 w-4" aria-hidden />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            defaultValue={1}
            aria-label="Volume"
            className="w-20 accent-primary"
            onChange={(e) => onVolume(Number(e.target.value))}
          />
        </label>
      </div>
      {phase.kind === 'listening' ? (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Recording progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      ) : null}
      {needsGesture ? (
        <div className="mt-2 flex items-center gap-3">
          <Button size="sm" onClick={onGesturePlay}>
            <Play className="mr-1 h-4 w-4" aria-hidden /> Tap to play the recording
          </Button>
          <span className="text-xs text-muted-foreground">
            Your browser blocked autoplay — tap to continue.
          </span>
        </div>
      ) : null}
      {audioError ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden /> The recording failed to load. Check your
          connection, then reload this page — your answers are saved.
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exam stages
// ---------------------------------------------------------------------------

function PartIntro({
  part,
  total,
  answers,
  onAnswer,
  onBegin,
}: {
  part: IeltsPart
  total: number
  answers: Record<number, UserAnswer>
  onAnswer: (q: number, value: UserAnswer) => void
  onBegin: () => void
}) {
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">
              Part {part.part} of {total} — questions {part.questionRange[0]}–{part.questionRange[1]}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You will hear {part.context}
            </p>
            <p className="mt-1 text-sm font-medium text-foreground/80">{part.instruction}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <Countdown seconds={INTRO_SECONDS} onDone={onBegin} label="Recording starts in" />
            <Button onClick={onBegin}>
              <Play className="mr-1 h-4 w-4" aria-hidden /> Start listening now
            </Button>
          </div>
        </CardContent>
      </Card>
      <PartQuestions part={part} answers={answers} onAnswer={onAnswer} disabled={false} review={null} />
    </div>
  )
}

function ListeningStage({
  part,
  answers,
  onAnswer,
}: {
  part: IeltsPart
  answers: Record<number, UserAnswer>
  onAnswer: (q: number, value: UserAnswer) => void
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Questions {part.questionRange[0]}–{part.questionRange[1]} · {part.instruction}
      </p>
      <PartQuestions part={part} answers={answers} onAnswer={onAnswer} disabled={false} review={null} />
    </div>
  )
}

function CheckStage({
  part,
  isLast,
  answers,
  onAnswer,
  onContinue,
}: {
  part: IeltsPart
  isLast: boolean
  answers: Record<number, UserAnswer>
  onAnswer: (q: number, value: UserAnswer) => void
  onContinue: () => void
}) {
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            That is the end of Part {part.part}. Check your answers to questions{' '}
            {part.questionRange[0]}–{part.questionRange[1]} — you can still change them.
          </p>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <Countdown
              seconds={CHECK_SECONDS}
              onDone={onContinue}
              label={isLast ? 'Final review starts in' : 'Next part starts in'}
            />
            <Button onClick={onContinue}>
              {isLast ? 'Go to final review' : `Continue to Part ${part.part + 1}`}
            </Button>
          </div>
        </CardContent>
      </Card>
      <PartQuestions part={part} answers={answers} onAnswer={onAnswer} disabled={false} review={null} />
    </div>
  )
}

function ReviewStage({
  test,
  reviewPart,
  setReviewPart,
  answers,
  onAnswer,
  confirmSubmit,
  setConfirmSubmit,
  onSubmit,
}: {
  test: IeltsListeningTest
  reviewPart: number
  setReviewPart: (i: number) => void
  answers: Record<number, UserAnswer>
  onAnswer: (q: number, value: UserAnswer) => void
  confirmSubmit: boolean
  setConfirmSubmit: (v: boolean) => void
  onSubmit: () => void
}) {
  const part = test.parts[reviewPart]
  const answeredIn = (p: IeltsPart) => {
    const [from, to] = p.questionRange
    let n = 0
    for (let q = from; q <= to; q++) {
      const v = answers[q]
      if (v !== null && v !== undefined && String(v).trim() !== '') n += 1
    }
    return n
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Final review — check all four parts. When you submit, your answers are marked and
            cannot be changed.
          </p>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <Countdown seconds={REVIEW_SECONDS} onDone={onSubmit} label="Auto-submit in" />
            {confirmSubmit ? (
              <Button variant="destructive" onClick={onSubmit}>
                Confirm — submit and mark now
              </Button>
            ) : (
              <Button onClick={() => setConfirmSubmit(true)}>Submit test 交卷</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choose a part to review">
        {test.parts.map((p, i) => (
          <button
            key={p.part}
            role="tab"
            aria-selected={i === reviewPart}
            onClick={() => setReviewPart(i)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              i === reviewPart
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:border-primary/50',
            )}
          >
            Part {p.part} ({answeredIn(p)}/{p.questionRange[1] - p.questionRange[0] + 1})
          </button>
        ))}
      </div>

      <PartQuestions part={part} answers={answers} onAnswer={onAnswer} disabled={false} review={null} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function ResultsStage({
  test,
  answers,
  review,
  result,
  onRetake,
}: {
  test: IeltsListeningTest
  answers: Record<number, UserAnswer>
  review: ReviewInfo | null
  result: ReturnType<typeof markTest>
  onRetake: () => void
}) {
  const [openPart, setOpenPart] = useState<number | null>(null)
  const perPart = test.parts.map((p) => {
    const [from, to] = p.questionRange
    let n = 0
    for (let q = from; q <= to; q++) if (result.correct[q]) n += 1
    return { part: p.part, correct: n, total: to - from + 1 }
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <Badge variant="accent">Test complete 考试结束</Badge>
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Estimated IELTS listening band
          </p>
          <p className="font-display text-6xl font-bold text-primary">{result.band.toFixed(1)}</p>
          <p className="text-sm text-muted-foreground">
            {result.raw} of {result.total} correct — official listening band boundaries.{' '}
            {resultLabel({ raw: result.raw, total: result.total, band: result.band, date: '' })} saved
            on this device.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {perPart.map((p) => (
              <Badge key={p.part} variant="outline">
                Part {p.part}: {p.correct}/{p.total}
              </Badge>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Button onClick={onRetake}>
              <RotateCcw className="mr-1 h-4 w-4" aria-hidden /> Take the test again 再考一次
            </Button>
            <Button asChild variant="outline">
              <Link to="/ielts-listening">Back to IELTS listening</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <h2 className="text-xl font-semibold">Answer review 逐题解析</h2>
      {test.parts.map((part) => {
        const open = openPart === part.part
        return (
          <div key={part.part} className="space-y-3">
            <h3 className="font-medium text-foreground/90">
              Part {part.part} — questions {part.questionRange[0]}–{part.questionRange[1]}
            </h3>
            <div className="space-y-4">
              {part.blocks.map((block, i) => (
                <QuestionBlockView
                  key={i}
                  block={block}
                  answers={answers}
                  onAnswer={() => undefined}
                  disabled
                  review={review}
                />
              ))}
            </div>
            <details
              className="rounded-xl border border-border bg-card"
              open={open}
              onToggle={(e) => setOpenPart(e.currentTarget.open ? part.part : null)}
            >
              <summary className="cursor-pointer p-5 text-sm font-semibold">
                Part {part.part} transcript 听力原文
              </summary>
              <div className="space-y-2 border-t border-border/60 px-5 py-4 text-sm leading-relaxed">
                {part.transcript.map((line, i) => (
                  <p key={i}>
                    <span className="font-semibold text-muted-foreground">
                      {part.speakers[line.speaker] ?? line.speaker}:{' '}
                    </span>
                    <span className="text-foreground/90">{line.text}</span>
                  </p>
                ))}
              </div>
            </details>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared part renderer (live exam)
// ---------------------------------------------------------------------------

function PartQuestions({
  part,
  answers,
  onAnswer,
  disabled,
  review,
}: {
  part: IeltsPart
  answers: Record<number, UserAnswer>
  onAnswer: (q: number, value: UserAnswer) => void
  disabled: boolean
  review: ReviewInfo | null
}) {
  return (
    <div className="space-y-4">
      {part.blocks.map((block, i) => (
        <QuestionBlockView
          key={i}
          block={block}
          answers={answers}
          onAnswer={onAnswer}
          disabled={disabled}
          review={review}
        />
      ))}
    </div>
  )
}
