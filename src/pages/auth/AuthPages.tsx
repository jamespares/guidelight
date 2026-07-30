import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GraduationCap, KeyRound, LogIn, Mail, UserPlus, Users } from 'lucide-react'
import { GuidelightWordmark } from '@/components/BrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'

const NightGuideScene = lazy(() =>
  import('@/components/NightGuideScene').then((m) => ({ default: m.NightGuideScene })),
)
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { TRUST_LANDING } from '@/lib/trustCopy'
import { cn } from '@/lib/utils'

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <Suspense fallback={null}>
        <NightGuideScene className="z-0" />
      </Suspense>
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle className="border-border/40 bg-card/30 shadow-sm backdrop-blur-xl hover:bg-card/45" />
      </div>
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  )
}

export function Landing() {
  return (
    <AuthShell>
      <Card className="border-border/30 bg-card/30 shadow-lg backdrop-blur-xl">
        <CardHeader className="space-y-4 px-6 pb-6 pt-4 text-center">
          <CardTitle className="flex justify-center text-3xl">
            <GuidelightWordmark />
          </CardTitle>
          <CardDescription className="text-base">
            Lead your students to excellence with AI-powered homework and assessments
          </CardDescription>
          <p className="text-sm text-muted-foreground">{TRUST_LANDING}</p>
          <p className="text-xs text-muted-foreground">
            No subscription — teachers pay only for the AI they use.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="flex-1">
            <Link to="/login/teacher">
              <GraduationCap className="h-4 w-4" />
              Teacher sign in
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link to="/login/student">
              <Users className="h-4 w-4" />
              Student sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
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
          <CardTitle className="text-2xl">{title}</CardTitle>
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
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {info ? <p className="text-sm text-foreground">{info}</p> : null}
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
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
          <CardTitle className="text-2xl">Verify email</CardTitle>
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
          <CardTitle className="flex items-center gap-2 text-2xl">
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
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
          <CardTitle className="text-2xl">Student</CardTitle>
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
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
