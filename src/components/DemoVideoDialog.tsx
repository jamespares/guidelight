import { useRef, useState, type ReactNode } from 'react'
import { Film } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DEMO_VIDEO_POSTER, DEMO_VIDEO_URL } from '@/lib/demo'

interface DemoVideoDialogProps {
  trigger: ReactNode
  title?: string
}

export function DemoVideoDialog({ trigger, title = 'Watch demo' }: DemoVideoDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [open, setOpen] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
    setOpen(nextOpen)
  }

  const hasVideo = DEMO_VIDEO_URL.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>See how Guidelight works in the classroom.</DialogDescription>
        </DialogHeader>

        {hasVideo ? (
          <video
            ref={videoRef}
            src={DEMO_VIDEO_URL}
            poster={DEMO_VIDEO_POSTER || undefined}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-md"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-md border border-dashed border-border bg-secondary/50 py-16 text-center">
            <Film className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">Demo video coming soon</p>
              <p className="text-sm text-muted-foreground">
                Add a video URL in <code className="rounded bg-secondary px-1 py-0.5 text-xs">src/lib/demo.ts</code>.
              </p>
            </div>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
