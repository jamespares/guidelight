import { TriangleAlert } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { TaskGap } from '@/lib/taskGaps'

/** Warning banner listing a task's marking gaps (missing answers/rubrics). */
export function MarkingGapsBanner({ gaps }: { gaps: TaskGap[] }) {
  if (gaps.length === 0) return null
  return (
    <div aria-live="polite" role="status">
      <Card className="border border-warning-foreground/30 bg-warning text-warning-foreground">
        <CardContent className="space-y-2 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="h-4 w-4" />
            Marking gaps — the AI marker needs these answers/rubrics to mark reliably
          </p>
          <ul className="list-disc space-y-0.5 pl-6">
            {gaps.map((g) => (
              <li key={g.questionId ?? g.message}>{g.message}</li>
            ))}
          </ul>
          <p className="text-xs opacity-80">
            Fill these in below before publishing. You can publish without them, but marking will be
            approximate.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
