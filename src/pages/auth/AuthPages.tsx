import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, LogIn, Mail, UserPlus } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'

const NightGuideScene = lazy(() =>
  import('@/components/NightGuideScene').then((m) => ({ default: m.NightGuideScene })),
)
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { COPYRIGHT_LINE, SUPPORT_MAILTO } from '@/lib/legal'
import { TRUST_LANDING } from '@/lib/trustCopy'
import { cn } from '@/lib/utils'

export function AuthLegalFooter() {
  // Sits directly on the ocean scene — dark text over the day sea, light over the night sea.
  const linkHover = 'underline-offset-4 hover:text-slate-900 hover:underline dark:hover:text-white'
  return (
    <footer className="mt-6 space-y-1 text-center text-xs text-slate-600 [text-shadow:0_1px_2px_rgba(255,255,255,0.4)] dark:text-white/85 dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">
      <nav className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <Link to="/terms" className={linkHover}>
          Terms
        </Link>
        <span aria-hidden>·</span>
        <Link to="/privacy" className={linkHover}>
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <a href={SUPPORT_MAILTO} className={linkHover}>
          Contact
        </a>
      </nav>
      <p>{COPYRIGHT_LINE}</p>
    </footer>
  )
}

function AuthShell({
  children,
  mainClassName,
}: {
  children: ReactNode
  mainClassName?: string
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6">
      <Suspense fallback={null}>
        <NightGuideScene className="z-0" />
      </Suspense>
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle className="border-border/40 bg-card/30 shadow-sm backdrop-blur-xl hover:bg-card/45" />
      </div>
      <main
        id="main-content"
        className={cn('relative z-10 w-full max-w-md', mainClassName)}
      >
        {children}
      </main>
      <div className="relative z-10 w-full max-w-md">
        <AuthLegalFooter />
      </div>
    </div>
  )
}

type TeacherMode = 'login' | 'register' | 'magic' | 'forgot'

export function TeacherAuth() {
  const [mode, setMode] = useState<TeacherMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [needsVerify, setNeedsVerify] = useState(false)
  const [loading, setLoading] = useState(false)
  const [magicBusy, setMagicBusy] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // Consume magic link from email (?magic=…)
  useEffect(() => {
    const token = params.get('magic')
    if (!token) return
    let cancelled = false
    void (async () => {
      setMagicBusy(true)
      setError('')
      try {
        const res = await api.teacherConsumeMagicLink({ token })
        if (cancelled) return
        setUser(res.user)
        navigate('/teacher/students', { replace: true })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Invalid sign-in link')
        }
      } finally {
        if (!cancelled) setMagicBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params, setUser, navigate])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setNeedsVerify(false)
    if (mode === 'register' && !acceptedTerms) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.')
      return
    }
    setLoading(true)
    try {
      if (mode === 'register') {
        const res = await api.teacherRegister({ email, password, name })
        setInfo(res.message)
        setMode('login')
        setNeedsVerify(true)
        return
      }
      if (mode === 'magic') {
        const res = await api.teacherMagicLink({ email })
        setInfo(res.message)
        return
      }
      if (mode === 'forgot') {
        const res = await api.teacherForgotPassword({ email })
        setInfo(res.message)
        return
      }
      const res = await api.teacherLogin({ email, password })
      setUser(res.user)
      navigate('/teacher/students')
    } catch (err) {
      const e = err as Error & { code?: string }
      if (e.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerify(true)
        setError(e.message)
      } else {
        setError(e.message || 'Failed')
      }
    } finally {
      setLoading(false)
    }
  }

  async function resendVerification() {
    setLoading(true)
    setError('')
    setInfo('')
    try {
      const res = await api.teacherResendVerification({ email })
      setInfo(res.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  if (magicBusy) {
    return (
      <AuthShell>
        <Card className="border-border/30 bg-card/30 shadow-lg backdrop-blur-xl">
          <CardContent className="p-8 text-center text-muted-foreground">
            Signing you in…
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  const title =
    mode === 'register'
      ? 'Create teacher account'
      : mode === 'magic'
        ? 'Email me a link'
        : mode === 'forgot'
          ? 'Reset password'
          : 'Teacher sign in'

  const description =
    mode === 'register'
      ? 'We will email you a verification link before you can sign in.'
      : mode === 'magic'
        ? 'We will send a one-time sign-in link to your email.'
        : mode === 'forgot'
          ? 'Enter your email and we will send a reset link.'
          : 'Email and password access to your dashboard.'

  return (
    <AuthShell>
      <Card className="border-border/30 bg-card/30 shadow-lg backdrop-blur-xl">
        <CardHeader>
          <CardTitle as="h1" className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {mode === 'login' || mode === 'register' ? (
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-secondary p-1">
              <button
                type="button"
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-all',
                  mode === 'login' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
                )}
                onClick={() => {
                  setMode('login')
                  setError('')
                  setInfo('')
                  setAcceptedTerms(false)
                }}
              >
                <LogIn className="h-4 w-4" />
                Sign in
              </button>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-all',
                  mode === 'register' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
                )}
                onClick={() => {
                  setMode('register')
                  setError('')
                  setInfo('')
                }}
              >
                <UserPlus className="h-4 w-4" />
                Register
              </button>
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            {mode === 'register' ? (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                <p className="text-xs text-muted-foreground">
                  {TRUST_LANDING} Includes free starter AI credit — no subscription.
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {mode === 'login' || mode === 'register' ? (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
              </div>
            ) : null}
            {mode === 'register' ? (
              <div className="flex items-start gap-3">
                <Checkbox
                  id="accept-terms"
                  checked={acceptedTerms}
                  onCheckedChange={(v) => setAcceptedTerms(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="accept-terms" className="text-sm font-normal leading-snug text-muted-foreground">
                  I agree to the{' '}
                  <Link to="/terms" className="text-foreground underline-offset-4 hover:underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" className="text-foreground underline-offset-4 hover:underline">
                    Privacy Policy
                  </Link>
                </Label>
              </div>
            ) : null}
            {error ? (
              <div aria-live="polite" role="status">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : null}
            {info ? (
              <div aria-live="polite" role="status">
                <p className="text-sm text-foreground">{info}</p>
              </div>
            ) : null}
            {needsVerify && email ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={() => void resendVerification()}
              >
                <Mail className="h-4 w-4" />
                Resend verification email
              </Button>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || (mode === 'register' && !acceptedTerms)}
            >              {loading
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : mode === 'register'
                    ? 'Create account'
                    : mode === 'magic'
                      ? 'Send sign-in link'
                      : 'Send reset link'}
            </Button>
          </form>

          <div className="mt-4 space-y-2 text-center text-sm">
            {mode === 'login' ? (
              <>
                <button
                  type="button"
                  className="block w-full text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => {
                    setMode('magic')
                    setError('')
                    setInfo('')
                  }}
                >
                  Email me a sign-in link
                </button>
                <button
                  type="button"
                  className="block w-full text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => {
                    setMode('forgot')
                    setError('')
                    setInfo('')
                  }}
                >
                  Forgot password?
                </button>
              </>
            ) : (
              <button
                type="button"
                className="block w-full text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setMode('login')
                  setError('')
                  setInfo('')
                }}
              >
                Back to sign in
              </button>
            )}
          </div>

          <Button asChild variant="ghost" className="mt-2 w-full">
            <Link to="/">Back</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  )
}

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const { setUser } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      setStatus('error')
      setMessage('Missing verification token.')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await api.teacherVerifyEmail({ token })
        if (cancelled) return
        setUser(res.user)
        setStatus('ok')
        navigate('/teacher/students', { replace: true })
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setMessage(err instanceof Error ? err.message : 'Verification failed')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params, setUser, navigate])

  return (
    <AuthShell>
      <Card className="border-border/30 bg-card/30 shadow-lg backdrop-blur-xl">
        <CardHeader>
          <CardTitle as="h1" className="text-2xl">Verify email</CardTitle>
          <CardDescription>
            {status === 'loading'
              ? 'Confirming your email…'
              : status === 'ok'
                ? 'Verified — redirecting…'
                : message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'error' ? (
            <div className="space-y-3">
              <Button asChild className="w-full">
                <Link to="/login/teacher">Back to sign in</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setUser } = useAuth()
  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (!token) {
      setError('Missing reset token')
      return
    }
    setLoading(true)
    try {
      const res = await api.teacherResetPassword({ token, password })
      if (res.user) {
        setUser(res.user)
        navigate('/teacher/students')
      } else {
        navigate('/login/teacher')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <Card className="border-border/30 bg-card/30 shadow-lg backdrop-blur-xl">
        <CardHeader>
          <CardTitle as="h1" className="flex items-center gap-2 text-2xl">
            <KeyRound className="h-6 w-6" />
            Set new password
          </CardTitle>
          <CardDescription>Choose a new password for your teacher account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {error ? (
              <div aria-live="polite" role="status">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading || !token}>
              {loading ? 'Saving…' : 'Update password'}
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/login/teacher">Back to sign in</Link>
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  )
}

export function StudentAuth() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setUser } = useAuth()
  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.studentLogin({ username, password })
      setUser(res.user)
      navigate('/student/tasks')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <Card className="border-border/30 bg-card/30 shadow-lg backdrop-blur-xl">
        <CardHeader>
          <CardTitle as="h1" className="text-2xl">Student</CardTitle>
          <CardDescription>Use the username and password your teacher gave you.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error ? (
              <div aria-live="polite" role="status">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Please wait…' : 'Sign in'}
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/">Back</Link>
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  )
}
