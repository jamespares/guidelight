import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Headphones, ListChecks, Timer } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LISTENING_TEST_1 } from '@/data/ielts/listeningTest1'
import { LISTENING_BAND_BOUNDARIES } from '@/data/ielts/marking'
import { ieltsHubTitle } from '@/lib/seo'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { IeltsShell } from './IeltsShell'
import { loadSavedResult, resultLabel } from './ieltsStorage'

const FORMAT_ROWS = [
  {
    icon: Headphones,
    title: 'Part 1 — Social conversation',
    text: 'Two speakers (e.g. a phone booking). Complete a form: names, numbers, dates, times.',
  },
  {
    icon: Headphones,
    title: 'Part 2 — General monologue',
    text: 'One speaker (e.g. a facilities talk). Multiple choice and matching features.',
  },
  {
    icon: Headphones,
    title: 'Part 3 — Academic discussion',
    text: 'Two or more speakers (e.g. students planning a project). Multiple choice and matching.',
  },
  {
    icon: Headphones,
    title: 'Part 4 — Academic lecture',
    text: 'One speaker on an academic topic. Complete notes — one word only.',
  },
]

export function IeltsHubPage() {
  useDocumentTitle(ieltsHubTitle)
  // Restored after mount so SSR output matches hydration (no window at prerender).
  const [lastResult, setLastResult] = useState<string | null>(null)
  useEffect(() => {
    const saved = loadSavedResult(LISTENING_TEST_1.slug)
    setLastResult(saved ? resultLabel(saved) : null)
  }, [])

  return (
    <IeltsShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Free IELTS practice · 免费雅思听力模考"
          title="IELTS listening mock exam"
          description={
            <>
              A full computer-delivered IELTS listening simulation: four recordings, 40 questions,
              about 30 minutes — marked instantly with the official band-score boundaries. No login
              required. 完整的雅思听力机考模拟：四个部分、40
              道题、约30分钟，交卷后即刻按官方分数对照表换算成雅思分数，无需登录。
            </>
          }
        />

        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="accent">4 recordings</Badge>
                <Badge variant="outline">40 questions</Badge>
                <Badge variant="outline">~30 minutes</Badge>
                <Badge variant="outline">Band 2.0–9.0</Badge>
              </div>
              <h2 className="text-lg font-semibold">{LISTENING_TEST_1.title}</h2>
              <p className="text-sm text-muted-foreground">
                Realistic computer-exam flow: time to read the questions before each recording,
                audio that plays straight through, and a final two-minute check before you submit.
              </p>
              {lastResult ? (
                <p className="text-sm font-medium text-foreground/80">Your last result: {lastResult}</p>
              ) : null}
            </div>
            <Button asChild size="lg" className="min-w-[11rem] sm:px-10">
              <Link to={`/ielts-listening/${LISTENING_TEST_1.slug}`}>Start the test 开始考试</Link>
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {FORMAT_ROWS.map((row) => (
            <Card key={row.title}>
              <CardContent className="flex gap-3 p-5">
                <row.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <h3 className="font-semibold">{row.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{row.text}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-3 p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Timer className="h-4 w-4 text-primary" aria-hidden /> How the simulation works
              考试流程
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                <strong>Before each recording</strong> you get time to read that part's questions —
                use it to predict the answers. 每段录音播放前，先浏览题目并预判答案。
              </li>
              <li>
                <strong>Exam mode</strong> plays each recording once, straight through — no pause,
                no rewind, exactly like the real computer test. Choose <strong>practice mode</strong>{' '}
                on the start screen if you need to pause. 考试模式下录音只播放一遍、不可暂停或倒退；如需暂停，请在开始页面选择练习模式。
              </li>
              <li>
                <strong>Type your answers as you listen</strong> — multiple choice, matching, and
                form/note completion, just like the real thing. 边听边作答：选择题、配对题、填空题。
              </li>
              <li>
                <strong>After each recording</strong> you get 30 seconds to check, then two minutes
                at the end to review everything before submitting. 每段录音后有30秒检查时间，最后有两分钟总检查。
              </li>
              <li>
                <strong>Spelling counts</strong> in completion questions, and answers are
                case-insensitive — the same rule as IELTS. 填空题拼写必须正确；大小写不扣分。
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <ClipboardList className="h-4 w-4 text-primary" aria-hidden /> IELTS listening band
              boundaries 分数对照
            </h2>
            <p className="text-sm text-muted-foreground">
              Your raw score out of 40 is converted to a band score using the official listening
              conversion table:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Correct answers 答对题数</th>
                    <th className="py-2 font-medium">Band 分数</th>
                  </tr>
                </thead>
                <tbody>
                  {LISTENING_BAND_BOUNDARIES.filter(({ minRaw }) => minRaw >= 4).map(
                    (row, i, arr) => (
                      <tr key={row.band} className="border-t border-border/40">
                        <td className="py-1.5 pr-4 text-foreground">
                          {i === 0 ? `${row.minRaw}–40` : `${row.minRaw}–${arr[i - 1].minRaw - 1}`}
                        </td>
                        <td className="py-1.5 font-medium text-foreground">{row.band.toFixed(1)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <ListChecks className="h-4 w-4 text-primary" aria-hidden /> Before you start 考前须知
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                Use headphones in a quiet room, and set a comfortable volume first.
                建议佩戴耳机，先调好音量。
              </li>
              <li>
                Answers are saved on this device as you go — if the page reloads, you can resume the
                test. 答案会自动保存在本设备上，刷新页面可继续作答。
              </li>
              <li>
                This is an original practice test in the style of IELTS; it is not affiliated with
                IELTS, the British Council, IDP or Cambridge.
                本站为原创模拟练习，与雅思官方机构无关。
              </li>
            </ul>
          </CardContent>
        </Card>

        <div className="mt-8 flex flex-col items-center gap-4 border-t border-border/60 pt-10 text-center">
          <p className="text-sm font-medium text-foreground/80">
            Free to use — create an account to track your students' progress across diagnostics,
            mock exams, stories and homework.
          </p>
          <Button asChild size="lg" className="min-w-[11rem] sm:px-10">
            <Link to="/get-started">Sign up to track progress</Link>
          </Button>
        </div>
      </div>
    </IeltsShell>
  )
}
