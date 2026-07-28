import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GraduationCap, LogIn, UserPlus, Users } from 'lucide-react'
import { GuidelightWordmark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* Soft water / sky shapes along the bottom */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-40 items-end justify-center gap-3 px-6 opacity-90" aria-hidden>
        <div className="h-28 w-24 rounded-[2rem] bg-[var(--brand-sky)]" />
        <div className="h-20 w-28 rounded-[1.5rem] bg-[var(--brand-aqua)]" />
        <div className="mb-2 h-24 w-24 rounded-full bg-[var(--brand-seafoam)]" />
        <div className="h-16 w-32 rounded-[2rem] bg-[var(--brand-periwinkle)]" />
        <div className="h-28 w-20 rounded-t-[3rem] bg-[var(--brand-mist)]" />
        <div className="h-14 w-14 rounded-full bg-[var(--brand-sky)]" />
      </div>
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  )
}

export function Landing() {
  return (
    <AuthShell>
      <Card className="border-border/80 shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">
            <GuidelightWordmark />
          </CardTitle>
          <CardDescription className="text-base">
            AI-infused homework and assessment for teachers, trainers, and learners.
          </CardDescription>
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

export function TeacherAuth() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setUser } = useAuth()
  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res =
        mode === 'login'
          ? await api.teacherLogin({ email, password })
          : await api.teacherRegister({ email, password, name })
      setUser(res.user)
      navigate('/teacher/students')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Teacher</CardTitle>
          <CardDescription>Email and password access to your dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-secondary p-1">
            <button
              type="button"
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-all',
                mode === 'login' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
              onClick={() => setMode('login')}
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
              onClick={() => setMode('register')}
            >
              <UserPlus className="h-4 w-4" />
              Register
            </button>
          </div>
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            {mode === 'register' ? (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
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
                minLength={8}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
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
      <Card className="shadow-lg">
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
