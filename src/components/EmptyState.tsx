import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 py-10">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/[0.05] text-muted-foreground">
          <Icon className="size-5" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div>{action}</div> : null}
      </CardContent>
    </Card>
  )
}
