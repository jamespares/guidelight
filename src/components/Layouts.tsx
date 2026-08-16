import {
  BookOpenCheck,
  BookOpenText,
  CalendarDays,
  ClipboardList,
  Home,
  LayoutDashboard,
  LineChart,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Wrench,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { BrandMark } from '@/components/BrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { CapHitBanner } from '@/components/UsageDial'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { BillingProvider, SidebarUsageDial, useBilling } from '@/lib/billing'
import { SUPPORT_MAILTO } from '@/lib/legal'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'

type NavItem = { to: string; label: string; icon: LucideIcon }

/** Shown while a lazily-loaded route chunk is being fetched. */
export function PageLoadingFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
      Loading…
    </div>
  )
}

// Sidebar nav → page chunk. Hovering or focusing a link starts fetching the
// lazily-loaded page module so navigation feels instant.
const routeChunks: Record<string, () => Promise<unknown>> = {
  '/teacher/students': () => import('@/pages/teacher/StudentsPage'),
  '/teacher/lessons': () => import('@/pages/teacher/LessonsPages'),
  '/teacher/homework': () => import('@/pages/teacher/TasksPages'),
  '/teacher/assessments': () => import('@/pages/teacher/TasksPages'),
  '/teacher/insights': () => import('@/pages/teacher/InsightsPage'),
  '/teacher/guide': () => import('@/pages/shared/GuidePages'),
  '/teacher/settings': () => import('@/pages/shared/SettingsPage'),
  '/student/tasks': () => import('@/pages/student/StudentPages'),
  '/student/tools': () => import('@/pages/student/StudentPages'),
  '/student/guide': () => import('@/pages/shared/GuidePages'),
  '/student/settings': () => import('@/pages/shared/SettingsPage'),
  '/parent/dashboard': () => import('@/pages/parent/ParentPages'),
  '/parent/tasks': () => import('@/pages/parent/ParentPages'),
  '/parent/guide': () => import('@/pages/shared/GuidePages'),
  '/parent/settings': () => import('@/pages/shared/SettingsPage'),
}

function prefetchRouteChunk(to: string) {
  void routeChunks[to]?.()
}

function TeacherCapBanner() {
  const billing = useBilling()
  if (!billing?.usage?.capped) return null
  return <CapHitBanner />
}

const SIDEBAR_COLLAPSED_KEY = 'guidelight:sidebar-collapsed'

function AppShell({
  role,
  items,
  secondaryItems,
  footerTo,
  footerLabel,
  showBillingDial,
}: {
  role: string
  items: NavItem[]
  secondaryItems: NavItem[]
  footerTo: string
  footerLabel: string
  showBillingDial?: boolean
}) {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1',
  )
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // localStorage unavailable — sidebar still toggles for the session
      }
      return next
    })
  }

  const renderNavItem = ({ to, label, icon: Icon }: NavItem) => (
    <NavLink
      key={to}
      to={to}
      title={label}
      aria-label={label}
      onMouseEnter={() => prefetchRouteChunk(to)}
      onFocus={() => prefetchRouteChunk(to)}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-sidebar-accent/80 text-sidebar-accent-foreground shadow-sm'
            : 'text-sidebar-muted hover:bg-foreground/5 hover:text-sidebar-foreground',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {collapsed ? null : label}
    </NavLink>
  )

  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border/60 bg-sidebar/80 text-sidebar-foreground backdrop-blur-xl transition-[width]',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <header
          className={cn(
            'flex gap-2 border-b border-sidebar-border px-4 py-5',
            collapsed ? 'flex-col items-center' : 'items-start justify-between',
          )}
        >
          {collapsed ? null : <BrandMark role={role} />}
          <div className={cn('flex gap-1', collapsed ? 'flex-col items-center' : 'items-center')}>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-muted transition-all hover:bg-foreground/5 hover:text-sidebar-foreground"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
            <ThemeToggle className="mt-0.5" />
          </div>
        </header>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {items.map(renderNavItem)}

          <div className="my-2 border-t border-sidebar-border" />

          {secondaryItems.map(renderNavItem)}
        </nav>

        <footer className="space-y-2 border-t border-sidebar-border p-3">
          {showBillingDial && !collapsed ? <SidebarUsageDial /> : null}
          {collapsed ? null : (
            <div className="px-3 text-xs text-sidebar-muted">
              <div className="font-medium text-sidebar-foreground">{user?.name}</div>
              {user?.username ? <div>@{user.username}</div> : null}
              {user?.email ? <div className="truncate">{user.email}</div> : null}
            </div>
          )}
          <NavLink
            to={footerTo}
            title={footerLabel}
            aria-label={footerLabel}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-muted transition-all hover:bg-foreground/5 hover:text-sidebar-foreground',
              collapsed && 'justify-center px-0',
            )}
          >
            <Home className="h-4 w-4" />
            {collapsed ? null : footerLabel}
          </NavLink>
          {collapsed ? null : (
            <nav className="flex flex-wrap gap-x-2 gap-y-1 px-3 text-[11px] text-sidebar-muted">
              <NavLink to="/terms" className="hover:text-sidebar-foreground hover:underline">
                Terms
              </NavLink>
              <span aria-hidden>·</span>
              <NavLink to="/privacy" className="hover:text-sidebar-foreground hover:underline">
                Privacy
              </NavLink>
              <span aria-hidden>·</span>
              <NavLink to="/accessibility" className="hover:text-sidebar-foreground hover:underline">
                Accessibility
              </NavLink>
              <span aria-hidden>·</span>
              <a href={SUPPORT_MAILTO} className="hover:text-sidebar-foreground hover:underline">
                Contact
              </a>
            </nav>
          )}
          <Button
            type="button"
            variant="ghost"
            title="Sign out"
            aria-label="Sign out"
            className={cn(
              'w-full justify-start text-sidebar-muted hover:bg-foreground/5 hover:text-sidebar-foreground',
              collapsed && 'justify-center px-0',
            )}
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" />
            {collapsed ? null : 'Sign out'}
          </Button>
        </footer>
      </aside>

      <main
        id="main-content"
        className={cn('flex-1 p-8 transition-[margin] lg:p-10', collapsed ? 'ml-16' : 'ml-60')}
      >
        <div className="mx-auto w-full max-w-7xl motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          {showBillingDial ? <TeacherCapBanner /> : null}
          <Suspense fallback={<PageLoadingFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}

const teacherNav: NavItem[] = [
  { to: '/teacher/students', label: 'Students', icon: Users },
  { to: '/teacher/lessons', label: 'Lessons', icon: CalendarDays },
  { to: '/teacher/homework', label: 'Homework', icon: BookOpenCheck },
  { to: '/teacher/assessments', label: 'Assessments', icon: ClipboardList },
  { to: '/teacher/insights', label: 'Insights', icon: LineChart },
]

const teacherSecondary: NavItem[] = [
  { to: '/teacher/guide', label: 'Info', icon: BookOpenText },
  { to: '/teacher/settings', label: 'Settings', icon: Settings },
]

const studentNav: NavItem[] = [
  { to: '/student/tasks', label: 'Tasks', icon: BookOpenCheck },
  { to: '/student/tools', label: 'Tools', icon: Wrench },
]

const studentSecondary: NavItem[] = [
  { to: '/student/guide', label: 'Info', icon: BookOpenText },
  { to: '/student/settings', label: 'Settings', icon: Settings },
]

const parentNav: NavItem[] = [
  { to: '/parent/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/parent/tasks', label: 'Tasks', icon: BookOpenCheck },
]

const parentSecondary: NavItem[] = [
  { to: '/parent/guide', label: 'Info', icon: BookOpenText },
  { to: '/parent/settings', label: 'Settings', icon: Settings },
]

// Warm the React Query cache for the pages a role is most likely to visit,
// so first navigation renders from cache instead of waiting on the network.
function TeacherPrefetch() {
  const queryClient = useQueryClient()
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.classes.all,
      queryFn: async () => (await api.classes()).classes,
      staleTime: 5 * 60_000,
    })
    void queryClient.prefetchQuery({
      queryKey: queryKeys.students.all,
      queryFn: async () => (await api.students()).students,
      staleTime: 5 * 60_000,
    })
    void queryClient.prefetchQuery({
      queryKey: queryKeys.tasks.all('homework'),
      queryFn: async () => (await api.tasks('homework')).tasks,
    })
    void queryClient.prefetchQuery({
      queryKey: queryKeys.tasks.all('assessment'),
      queryFn: async () => (await api.tasks('assessment')).tasks,
    })
  }, [queryClient])
  return null
}

function StudentPrefetch() {
  const queryClient = useQueryClient()
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.studentTasks.all,
      queryFn: async () => (await api.studentTasks()).tasks,
    })
  }, [queryClient])
  return null
}

function ParentPrefetch() {
  const queryClient = useQueryClient()
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.parentTasks.all,
      queryFn: async () => (await api.parentTasks()).tasks,
    })
    void queryClient.prefetchQuery({
      queryKey: queryKeys.parentInsights.all,
      queryFn: () => api.parentInsights(),
    })
  }, [queryClient])
  return null
}

export function TeacherLayout() {
  return (
    <BillingProvider>
      <TeacherPrefetch />
      <AppShell
        role="Teacher"
        items={teacherNav}
        secondaryItems={teacherSecondary}
        footerTo="/"
        footerLabel="Switch portal"
        showBillingDial
      />
    </BillingProvider>
  )
}

export function StudentLayout() {
  return (
    <BillingProvider>
      <StudentPrefetch />
      <AppShell
        role="Student"
        items={studentNav}
        secondaryItems={studentSecondary}
        footerTo="/"
        footerLabel="Switch portal"
      />
    </BillingProvider>
  )
}

export function ParentLayout() {
  return (
    <BillingProvider>
      <ParentPrefetch />
      <AppShell
        role="Parent"
        items={parentNav}
        secondaryItems={parentSecondary}
        footerTo="/"
        footerLabel="Switch portal"
      />
    </BillingProvider>
  )
}
