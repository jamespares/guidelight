import { Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Weakspot } from '@/lib/api'

export function weakspotLabel(w: Weakspot): string {
  return w.skill || w.topic || 'Unknown'
}

export function WeakspotsPanel({
  title = 'Weakspots',
  weakspots,
  summary,
  updatedAt,
  busy,
  error,
  onPinpoint,
}: {
  title?: string
  weakspots: Weakspot[]
  summary?: string | null
  updatedAt?: string | null
  busy?: boolean
  error?: string
  onPinpoint: () => void
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {updatedAt ? (
            <p className="text-xs text-muted-foreground">
              Last pinpointed {updatedAt.slice(0, 16).replace('T', ' ')}
            </p>
          ) : null}
        </div>
        <Button type="button" variant="outline" disabled={busy} onClick={onPinpoint}>
          <Crosshair className="h-4 w-4" />
          {busy ? 'Analysing…' : 'Pinpoint weakspots'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {summary ? (
          <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed">
            {summary}
          </p>
        ) : null}
        {weakspots.length ? (
          <ul className="space-y-3">
            {weakspots.map((w, i) => (
              <li
                key={`${weakspotLabel(w)}-${i}`}
                className="rounded-lg border border-border p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-foreground">{weakspotLabel(w)}</span>
                  <span className="text-xs text-muted-foreground">
                    {w.severity ? `${w.severity}` : ''}
                    {w.count != null || w.frequency != null
                      ? ` · ${w.count ?? w.frequency}×`
                      : ''}
                  </span>
                </div>
                {w.objective ? (
                  <p className="mt-1 text-muted-foreground">{w.objective}</p>
                ) : null}
                {w.evidence ? (
                  <p className="mt-1 text-xs text-muted-foreground">Evidence: {w.evidence}</p>
                ) : null}
                {w.remediation ? (
                  <p className="mt-1 text-xs">Next step: {w.remediation}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No weakspots yet. Run Pinpoint after students submit attempts — it reads full attempt
            archives, not just topic counts.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
