import { Link } from 'react-router-dom'
import { GraduationCap, Users, UserCheck, ArrowLeft } from 'lucide-react'
import { AuthShell } from '@/pages/auth/AuthPages'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const ROLES = [
  {
    key: 'teacher',
    label: 'Teacher',
    description: 'Create classes, assign work, and review student progress.',
    icon: GraduationCap,
    href: '/login/teacher',
  },
  {
    key: 'student',
    label: 'Student',
    description: 'See your tasks, take assessments, and practise.',
    icon: Users,
    href: '/login/student',
  },
  {
    key: 'parent',
    label: 'Parent',
    description: 'Follow your child’s tasks and progress.',
    icon: UserCheck,
    href: '/login/parent',
  },
] as const

export function RoleSelectPage() {
  return (
    <AuthShell mainClassName="max-w-lg">
      <Card className="border-border/30 bg-card/30 shadow-lg backdrop-blur-xl">
        <CardHeader>
          <CardTitle as="h1" className="text-2xl">Get started</CardTitle>
          <CardDescription>Choose how you use Guidelight.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {ROLES.map(({ key, label, description, icon: Icon, href }) => (
              <Button key={key} asChild variant="outline" className="h-auto justify-start p-4">
                <Link to={href} className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Icon className="h-5 w-5 text-primary" />
                  </span>
                  <span className="text-left">
                    <span className="block text-base font-semibold">{label}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{description}</span>
                  </span>
                </Link>
              </Button>
            ))}
          </div>

          <Button asChild variant="ghost" className="mt-4 w-full">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  )
}
