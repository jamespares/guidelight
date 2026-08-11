import { Link } from 'react-router-dom'
import { COPYRIGHT_LINE, SUPPORT_MAILTO } from '@/lib/legal'
import { cn } from '@/lib/utils'

type LegalFooterVariant = 'overlay' | 'inline'

interface LegalFooterProps {
  variant?: LegalFooterVariant
  className?: string
}

const linkClasses =
  'underline-offset-4 hover:text-foreground hover:underline'

function FooterNav() {
  return (
    <nav className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      <Link to="/terms" className={linkClasses}>
        Terms
      </Link>
      <span aria-hidden>·</span>
      <Link to="/privacy" className={linkClasses}>
        Privacy
      </Link>
      <span aria-hidden>·</span>
      <Link to="/accessibility" className={linkClasses}>
        Accessibility
      </Link>
      <span aria-hidden>·</span>
      <a href={SUPPORT_MAILTO} className={linkClasses}>
        Contact
      </a>
    </nav>
  )
}

export function LegalFooter({ variant = 'inline', className }: LegalFooterProps) {
  const isOverlay = variant === 'overlay'

  return (
    <footer
      className={cn(
        'text-center text-xs text-muted-foreground',
        isOverlay && 'mt-6',
        className,
      )}
    >
      {isOverlay ? (
        <div className="inline-flex flex-col items-center gap-1 rounded-2xl border border-border/30 bg-card/50 px-5 py-2 shadow-sm backdrop-blur-md">
          <FooterNav />
          <p>{COPYRIGHT_LINE}</p>
        </div>
      ) : (
        <div className="inline-flex flex-col items-center gap-1">
          <FooterNav />
          <p>{COPYRIGHT_LINE}</p>
        </div>
      )}
    </footer>
  )
}
