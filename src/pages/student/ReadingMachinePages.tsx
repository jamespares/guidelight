import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { clampWpm, tokenizeText, wpmToMsPerWord } from '@shared/cefr/rsvp'

export function ReadingMachineLibraryPage() {
  const [classTexts, setClassTexts] = useState<Array<{ id: string; title: string; word_count: number }>>(
    [],
  )
  const [myTexts, setMyTexts] = useState<Array<{ id: string; title: string; word_count: number }>>([])
  const [latestWpm, setLatestWpm] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await api.readingMaterials()
    setClassTexts(res.classTexts)
    setMyTexts(res.myTexts)
    setLatestWpm(res.latestWpm)
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [])

  async function onUpload(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.createReadingMaterial({ title, body })
      setTitle('')
      setBody('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this text?')) return
    await api.deleteReadingMaterial(id)
    await load()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/student/tools" className="text-sm text-muted-foreground hover:underline">
          ← Tools
        </Link>
        <PageHeader
          title="(RSVP) Focused Reading Machine"
          description="Class texts and your uploads — read one word at a time and push a little faster than comfortable."
        />
      </div>
      {latestWpm != null ? (
        <p className="text-sm text-muted-foreground">
          Last speed test: <strong>{latestWpm} wpm</strong> — machine will start a bit faster.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardContent className="space-y-3 p-6">
          <h2 className="font-semibold">Class texts</h2>
          {classTexts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No class texts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Words</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {classTexts.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.title}</TableCell>
                    <TableCell>{m.word_count}</TableCell>
                    <TableCell>
                      <Link
                        className="font-semibold underline-offset-4 hover:underline"
                        to={`/student/reading-machine/${m.id}`}
                      >
                        Read
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h2 className="font-semibold">My texts</h2>
          {myTexts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Upload your own practice texts below.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Words</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {myTexts.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.title}</TableCell>
                    <TableCell>{m.word_count}</TableCell>
                    <TableCell className="space-x-3">
                      <Link
                        className="font-semibold underline-offset-4 hover:underline"
                        to={`/student/reading-machine/${m.id}`}
                      >
                        Read
                      </Link>
                      <button
                        type="button"
                        className="text-sm text-destructive underline-offset-4 hover:underline"
                        onClick={() => void onDelete(m.id)}
                      >
                        Delete
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <form className="space-y-3 border-t border-border pt-4" onSubmit={(e) => void onUpload(e)}>
            <div className="space-y-2">
              <Label htmlFor="rm-title">Title</Label>
              <Input id="rm-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rm-body">Text</Label>
              <Textarea
                id="rm-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                className="min-h-[140px]"
                placeholder="Paste a passage to practise…"
              />
            </div>
            <Button type="submit" disabled={busy}>
              Add to My texts
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export function ReadingMachineViewerPage() {
  const { materialId } = useParams()
  const [title, setTitle] = useState('')
  const [words, setWords] = useState<string[]>([])
  const [wpm, setWpm] = useState(250)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const startedAt = useRef<number | null>(null)
  const materialIdRef = useRef(materialId)

  useEffect(() => {
    materialIdRef.current = materialId
  }, [materialId])

  useEffect(() => {
    if (!materialId) return
    void api
      .readingMaterial(materialId)
      .then((res) => {
        setTitle(res.material.title)
        const toks = tokenizeText(res.material.body).map((w) => w.text)
        setWords(toks)
        setWpm(clampWpm((res.latestWpm ?? 250) + 20))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }, [materialId])

  useEffect(() => {
    if (!playing) return
    if (startedAt.current == null) startedAt.current = Date.now()
    const ms = wpmToMsPerWord(wpm)
    const t = window.setInterval(() => {
      setIdx((i) => {
        if (i >= words.length - 1) {
          setPlaying(false)
          void logSession(true, i + 1)
          return i
        }
        return i + 1
      })
    }, ms)
    return () => window.clearInterval(t)
  }, [playing, wpm, words.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function logSession(completed: boolean, wordsRead: number) {
    if (!materialIdRef.current) return
    const duration = startedAt.current
      ? Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))
      : 1
    try {
      await api.readingMachineSession({
        material_id: materialIdRef.current,
        wpm_setting: wpm,
        words_read: wordsRead,
        word_count: words.length,
        duration_seconds: duration,
        completed,
      })
    } catch {
      /* ignore */
    }
  }

  const progress = useMemo(
    () => (words.length ? Math.round((idx / Math.max(1, words.length - 1)) * 100) : 0),
    [idx, words.length],
  )

  return (
    <div className="space-y-6">
      <div>
        <Link to="/student/reading-machine" className="text-sm text-muted-foreground hover:underline">
          ← Reading machine
        </Link>
        <PageHeader title={title || 'Reading machine'} description="Spacebar to play / pause." />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="wpm">WPM</Label>
              <Input
                id="wpm"
                type="number"
                min={150}
                max={600}
                value={wpm}
                onChange={(e) => setWpm(clampWpm(Number(e.target.value)))}
                className="w-28"
              />
            </div>
            <Button type="button" onClick={() => setPlaying((p) => !p)}>
              {playing ? 'Pause' : 'Play'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPlaying(false)
                setIdx(0)
                startedAt.current = null
              }}
            >
              Restart
            </Button>
          </div>

          <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-border bg-secondary px-6">
            <span className="text-4xl font-semibold tracking-tight sm:text-5xl">
              {words[idx] ?? '—'}
            </span>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>
                {idx + 1} / {words.length || 0}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
