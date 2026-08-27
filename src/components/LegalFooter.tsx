import { Link } from 'react-router-dom'
import { COPYRIGHT_LINE, SUPPORT_MAILTO } from '@/lib/legal'
import { cn } from '@/lib/utils'

type LegalFooterVariant = 'overlay' | 'inline'

interface LegalFooterProps {
  variant?: LegalFooterVariant
  className?: string
  linkClassName?: string
}

const linkClasses =
  'underline-offset-4 hover:text-foreground hover:underline'

function FooterNav({ linkClassName }: { linkClassName?: string }) {
  return (
    <nav className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      <Link to="/resources/cefr-levels" className={cn(linkClasses, linkClassName)}>
        CEFR guide
      </Link>
      <span aria-hidden>·</span>
      <Link to="/stories" className={cn(linkClasses, linkClassName)}>
        Graded stories
      </Link>
      <span aria-hidden>·</span>
      <Link to="/flashcards" className={cn(linkClasses, linkClassName)}>
        Word flashcards
      </Link>
      <span aria-hidden>·</span>
      <Link to="/ielts-listening" className={cn(linkClasses, linkClassName)}>
        IELTS listening mock
      </Link>
      <span aria-hidden>·</span>
      <Link to="/resources/ai-marking-rubrics" className={cn(linkClasses, linkClassName)}>
        AI marking
      </Link>
      <span aria-hidden>·</span>
      <Link to="/terms" className={cn(linkClasses, linkClassName)}>
        Terms
      </Link>
      <span aria-hidden>·</span>
      <Link to="/privacy" className={cn(linkClasses, linkClassName)}>
        Privacy
      </Link>
      <span aria-hidden>·</span>
      <Link to="/accessibility" className={cn(linkClasses, linkClassName)}>
        Accessibility
      </Link>
      <span aria-hidden>·</span>
      <a href={SUPPORT_MAILTO} className={cn(linkClasses, linkClassName)}>
        Contact
      </a>
    </nav>
  )
}

export function LegalFooter({ variant = 'inline', className, linkClassName }: LegalFooterProps) {
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
        <div className="inline-flex flex-col items-center gap-1 rounded-2xl border border-border/20 bg-card/30 px-5 py-2 shadow-none backdrop-blur-md">
          <FooterNav linkClassName={linkClassName} />
          <p>{COPYRIGHT_LINE}</p>
        </div>
      ) : (
        <div className="inline-flex flex-col items-center gap-1">
          <FooterNav linkClassName={linkClassName} />
          <p>{COPYRIGHT_LINE}</p>
        </div>
      )}
    </footer>
  )
}
