import { useMemo, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { InsightEvent } from '@/lib/api'

/** Distinct strokes for event markers — hashed by event id. */
const EVENT_COLORS = [
  '#c45c26',
  '#2a6f6f',
  '#b33b5c',
  '#3d6b3d',
  '#6b4c9a',
  '#a67c00',
  '#1f5f8b',
  '#8b4513',
]

export function eventColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return EVENT_COLORS[hash % EVENT_COLORS.length]!
}

/** Normalize ISO / SQLite datetimes to YYYY-MM-DD for categorical axis + events. */
export function toDay(value: string | null | undefined): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  return trimmed
}

export type ChartPoint = { label: string; value: number | null; date?: string }

/** Merge event dates into series so ReferenceLines land on categorical axis ticks. */
export function mergeChartWithEvents(
  series: Array<{ date: string; value: number }>,
  events: InsightEvent[],
): ChartPoint[] {
  const points: ChartPoint[] = series.map((p) => ({
    ...p,
    label: toDay(p.date),
  }))
  const labels = new Set(points.map((p) => p.label).filter(Boolean))
  for (const e of events) {
    const day = toDay(e.event_date)
    if (day && !labels.has(day)) {
      points.push({ label: day, value: null })
      labels.add(day)
    }
  }
  return points.sort((a, b) => a.label.localeCompare(b.label))
}

function EventReferenceLines({ events }: { events: InsightEvent[] }) {
  return (
    <>
      {events.map((e) => {
        const day = toDay(e.event_date)
        if (!day) return null
        const color = eventColor(e.id)
        return (
          <ReferenceLine
            key={e.id}
            x={day}
            stroke={color}
            strokeWidth={2}
            strokeDasharray="4 3"
            ifOverflow="visible"
            label={{
              value: e.name.length > 18 ? `${e.name.slice(0, 16)}…` : e.name,
              position: 'insideTop',
              fill: color,
              fontSize: 11,
            }}
          />
        )
      })}
    </>
  )
}

function EventLegend({ events }: { events: InsightEvent[] }) {
  if (!events.length) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {events.map((e) => (
        <li key={e.id} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: eventColor(e.id) }}
            aria-hidden
          />
          <span className="font-medium text-foreground/80">{e.name}</span>
          <span>{toDay(e.event_date)}</span>
        </li>
      ))}
    </ul>
  )
}

function ChartPlot({
  data,
  events,
  seriesName,
  stroke,
  showBrush,
}: {
  data: ChartPoint[]
  events: InsightEvent[]
  seriesName: string
  stroke: string
  showBrush?: boolean
}) {
  const empty = data.length === 0

  if (empty) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data points yet. Add submissions or events to begin the timeline.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 28, right: 16, left: 0, bottom: showBrush ? 8 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" minTickGap={24} tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} width={40} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <EventReferenceLines events={events} />
        <Line
          type="monotone"
          dataKey="value"
          name={seriesName}
          stroke={stroke}
          strokeWidth={2.5}
          connectNulls
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
        {showBrush ? (
          <Brush dataKey="label" height={28} stroke={stroke} travellerWidth={10} />
        ) : null}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function InsightLineChartCard({
  title,
  description,
  series,
  events,
  seriesName,
  stroke,
}: {
  title: string
  description?: string
  series: Array<{ date: string; value: number }>
  events: InsightEvent[]
  seriesName: string
  stroke: string
}) {
  const [open, setOpen] = useState(false)
  const data = useMemo(() => mergeChartWithEvents(series, events), [series, events])

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={data.length === 0}
            onClick={() => setOpen(true)}
            aria-label={`Expand ${title}`}
          >
            <Maximize2 className="h-4 w-4" />
            Expand
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ChartPlot data={data} events={events} seriesName={seriesName} stroke={stroke} />
          </div>
          <EventLegend events={events} />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] w-[min(96vw,1100px)] !max-w-none flex-col gap-4 overflow-hidden">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Drag the brush below the chart to zoom and scroll the timeline. Event markers stay
              aligned to their dates.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1" style={{ height: 'min(70vh, 560px)' }}>
            <ChartPlot
              data={data}
              events={events}
              seriesName={seriesName}
              stroke={stroke}
              showBrush
            />
          </div>
          <EventLegend events={events} />
        </DialogContent>
      </Dialog>
    </>
  )
}
