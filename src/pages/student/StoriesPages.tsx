import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { STORIES, type Story } from '@shared/cefr/stories'
import {
  prepareKaraoke,
  type Cue,
  type StoryBlock,
  type WordTiming,
} from '@shared/cefr/karaoke'
import { api } from '@/lib/api'
import { storiesHubTitle, storyLevelTitle, storyReaderTitle } from '@/lib/seo'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

const STUDENT_BASE = '/student/stories'

const LEVEL_BLURBS: Record<(typeof LEVELS)[number], string> = {
  A1: 'Very simple stories — short sentences about everyday life.',
  A2: 'Everyday stories — past events and future plans, shopping, travel.',
  B1: 'Connected stories — experiences, opinions, hopes and decisions.',
  B2: 'Detailed stories — abstract ideas, argument and nuance.',
  C1: 'Complex stories — subtle meaning, style and specialised topics.',
  C2: 'Near-native texts — irony, precision and sophisticated argument.',
}

export function StoriesHubPage({ base = STUDENT_BASE }: { base?: string }) {
  useDocumentTitle(storiesHubTitle)
  return (
    <div className="space-y-6">
      <div>
        {base === STUDENT_BASE ? (
          <Link to="/student/tools" className="text-sm text-muted-foreground hover:underline">
            ← Tools
          </Link>
        ) : null}
        <PageHeader
          title="A1–C2 English Stories"
          description="Twelve graded stories — download, listen, copy out, and know them inside out."
        />
      </div>

      <Card>
        <CardContent className="space-y-2 p-6">
          <h2 className="font-semibold">How to use these stories</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              <strong>Download</strong> your stories (DOCX, PDF or Markdown) and keep them on your
              device.
            </li>
            <li>
              <strong>Listen</strong> while you follow the highlight — tap a word to jump in the
              audio.
            </li>
            <li>
              <strong>Copy out</strong> by hand, then read aloud until it feels natural.
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LEVELS.map((level) => (
          <Link
            key={level}
            to={`${base}/${level.toLowerCase()}`}
            className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm"
          >
            <Badge variant="accent">{level}</Badge>
            <h2 className="mt-3 text-lg font-semibold">{level} stories</h2>
            <p className="mt-1 text-sm text-muted-foreground">{LEVEL_BLURBS[level]}</p>
            <p className="mt-3 text-xs text-muted-foreground">2 stories</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function StoriesLevelPage({ base = STUDENT_BASE }: { base?: string }) {
  const { level } = useParams()
  const band = (level ?? '').toUpperCase()
  const stories = STORIES.filter((s) => s.level === band)
  useDocumentTitle(storyLevelTitle(band))

  return (
    <div className="space-y-6">
      <div>
        <Link to={base} className="text-sm text-muted-foreground hover:underline">
          ← A1–C2 English Stories
        </Link>
        <PageHeader
          title={`${band} stories`}
          description={LEVEL_BLURBS[band as (typeof LEVELS)[number]] ?? ''}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {stories.map((story) => (
          <Link
            key={story.slug}
            to={`${base}/read/${story.slug}`}
            className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40"
          >
            <Badge variant="secondary">{story.level}</Badge>
            <h2 className="mt-3 text-lg font-semibold">{story.title}</h2>
            <p className="text-sm text-muted-foreground">{story.zhTitle}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {story.words} words · {story.accent}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function StoryReaderPage({ base = STUDENT_BASE }: { base?: string }) {
  const { slug } = useParams()
  const story = STORIES.find((s) => s.slug === slug) as Story | undefined
  const audioRef = useRef<HTMLAudioElement>(null)
  // Initialise blocks synchronously (no timings) so the story text is present
  // on first render — including in the prerendered static HTML — and upgrade
  // to timed karaoke cues once the timings JSON loads.
  const [blocks, setBlocks] = useState<StoryBlock[]>(() =>
    story ? prepareKaraoke(story.title, story.paragraphs.map((p) => p.en), []).blocks : [],
  )
  const [cues, setCues] = useState<Cue[] | null>(null)
  const [activeSpan, setActiveSpan] = useState(-1)
  const [showZh, setShowZh] = useState(false)
  const [rate, setRate] = useState(1)
  useDocumentTitle(story ? storyReaderTitle(story) : 'Story not found — Guidelight')

  useEffect(() => {
    if (!story) return
    void api.storyEvent(story.slug, 'open').catch(() => undefined)
    const enParas = story.paragraphs.map((p) => p.en)
    void fetch(`/stories/timings/${story.slug}.json`)
      .then(async (r) => (r.ok ? ((await r.json()) as WordTiming[] | null) : null))
      .then((timings: WordTiming[] | null) => {
        if (!timings) {
          const prepared = prepareKaraoke(story.title, enParas, [])
          setBlocks(prepared.blocks)
          setCues(null)
          return
        }
        const prepared = prepareKaraoke(story.title, enParas, timings)
        setBlocks(prepared.blocks)
        setCues(prepared.cues)
      })
      .catch(() => {
        const prepared = prepareKaraoke(story.title, enParas, [])
        setBlocks(prepared.blocks)
        setCues(null)
      })
  }, [story])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !cues?.length) return
    const onTime = () => {
      const t = audio.currentTime
      let span = -1
      for (let i = cues.length - 1; i >= 0; i--) {
        if (t >= cues[i].t) {
          span = cues[i].span
          break
        }
      }
      setActiveSpan(span)
    }
    audio.addEventListener('timeupdate', onTime)
    return () => audio.removeEventListener('timeupdate', onTime)
  }, [cues])

  if (!story) {
    return <p className="text-muted-foreground">Story not found.</p>
  }

  function seekToSpan(spanIdx: number) {
    if (!cues || !audioRef.current) return
    const cue = cues.find((c) => c.span === spanIdx)
    if (!cue) return
    audioRef.current.currentTime = cue.t
    void audioRef.current.play()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`${base}/${story.level.toLowerCase()}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {story.level} stories
        </Link>
        <PageHeader title={story.title} description={`${story.zhTitle} · ${story.words} words`} />
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          {story.hasAudio ? (
            <div className="space-y-2">
              <audio
                ref={audioRef}
                controls
                src={story.audio}
                className="w-full"
                onPlay={() => void api.storyEvent(story.slug, 'play').catch(() => undefined)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground">
                  Speed{' '}
                  <select
                    className="rounded border border-input bg-background px-2 py-1"
                    value={rate}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setRate(v)
                      if (audioRef.current) audioRef.current.playbackRate = v
                    }}
                  >
                    {[0.75, 1, 1.25].map((r) => (
                      <option key={r} value={r}>
                        {r}×
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowZh((z) => !z)}>
                  {showZh ? 'Hide 中文' : 'Show 中文'}
                </Button>
              </div>
              {!cues ? (
                <p className="text-xs text-muted-foreground">
                  Live highlight unavailable for this story — the audio still works fine.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 text-sm">
            {story.hasAudio ? (
              <a className="underline-offset-4 hover:underline" href={story.audio} download>
                Audio
              </a>
            ) : null}
            <a className="underline-offset-4 hover:underline" href={story.md} download>
              Markdown
            </a>
            <a className="underline-offset-4 hover:underline" href={story.docx} download>
              DOCX
            </a>
            <a className="underline-offset-4 hover:underline" href={story.pdf} download>
              PDF
            </a>
          </div>

          <div className="space-y-4 text-base leading-relaxed">
            {blocks.map((block, bi) => (
              <p
                key={bi}
                className={block.kind === 'title' ? 'text-xl font-semibold' : undefined}
              >
                {block.words.map((w, wi) => (
                  <button
                    type="button"
                    key={`${bi}-${wi}`}
                    className={
                      w.idx === activeSpan
                        ? 'rounded bg-primary/20 px-0.5 font-semibold text-primary'
                        : 'px-0.5'
                    }
                    onClick={() => seekToSpan(w.idx)}
                  >
                    {w.text}{' '}
                  </button>
                ))}
              </p>
            ))}
            {showZh
              ? story.paragraphs.map((p, i) => (
                  <p key={`zh-${i}`} className="text-sm text-muted-foreground">
                    {p.zh}
                  </p>
                ))
              : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
