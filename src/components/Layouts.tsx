import {
  BookOpenCheck,
  BookOpenText,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  Home,
  LineChart,
  LogOut,
  Settings,
  Wrench,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

type NavItem = { to: string; label: string; icon: LucideIcon }

function AppShell({
  role,
  items,
  secondaryItems,
  footerTo,
  footerLabel,
}: {
  role: string
  items: NavItem[]
  secondaryItems: NavItem[]
  footerTo: string
  footerLabel: string
}) {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-start justify-between gap-2 border-b border-sidebar-border px-4 py-5">
          <BrandMark role={role} />
          <ThemeToggle className="mt-0.5" />
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-muted hover:bg-foreground/5 hover:text-sidebar-foreground',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}

          <div className="my-2 border-t border-sidebar-border" />

          {secondaryItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-muted hover:bg-foreground/5 hover:text-sidebar-foreground',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-sidebar-border p-3">
          <div className="px-3 text-xs text-sidebar-muted">
            <div className="font-medium text-sidebar-foreground">{user?.name}</div>
            {user?.username ? <div>@{user.username}</div> : null}
            {user?.email ? <div className="truncate">{user.email}</div> : null}
          </div>
          <NavLink
            to={footerTo}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-muted transition-all hover:bg-foreground/5 hover:text-sidebar-foreground"
          >
            <Home className="h-4 w-4" />
            {footerLabel}
          </NavLink>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-sidebar-muted hover:bg-foreground/5 hover:text-sidebar-foreground"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="ml-60 flex-1 p-8">
        <Outlet />
      </main>
    </div>
  )
}

const teacherNav: NavItem[] = [
  { to: '/teacher/students', label: 'Students', icon: Users },
  { to: '/teacher/lessons', label: 'Lessons', icon: CalendarDays },
  { to: '/teacher/homework', label: 'Homework', icon: BookOpenCheck },
  { to: '/teacher/assessments', label: 'Assessments', icon: ClipboardList },
  { to: '/teacher/exam-dojo', label: 'Exam Dojo', icon: Dumbbell },
  { to: '/teacher/insights', label: 'Insights', icon: LineChart },
]

const teacherSecondary: NavItem[] = [
  { to: '/teacher/settings', label: 'Settings', icon: Settings },
  { to: '/teacher/guide', label: 'How to use', icon: BookOpenText },
]

const studentNav: NavItem[] = [
  { to: '/student/tasks', label: 'Tasks', icon: BookOpenCheck },
  { to: '/student/tools', label: 'Tools', icon: Wrench },
]

const studentSecondary: NavItem[] = [
  { to: '/student/settings', label: 'Settings', icon: Settings },
  { to: '/student/guide', label: 'How to use', icon: BookOpenText },
]

export function TeacherLayout() {
  return (
    <AppShell
      role="Teacher"
      items={teacherNav}
      secondaryItems={teacherSecondary}
      footerTo="/"
      footerLabel="Switch portal"
    />
  )
}

export function StudentLayout() {
  return (
    <AppShell
      role="Student"
      items={studentNav}
      secondaryItems={studentSecondary}
      footerTo="/"
      footerLabel="Switch portal"
    />
  )
}
