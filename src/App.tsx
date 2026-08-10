import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { TeacherLayout, StudentLayout, ParentLayout } from './components/Layouts'
import { useAuth } from './lib/auth'
import { ParentAuth, StudentAuth, TeacherAuth, VerifyEmailPage, ResetPasswordPage } from './pages/auth/AuthPages'
import { Landing } from './pages/landing/LandingPage'
import { InsightsPage, ReportPage } from './pages/teacher/InsightsPage'
import { StudentDetailPage } from './pages/teacher/StudentDetailPage'
import { StudentsPage } from './pages/teacher/StudentsPage'
import { AssessmentsPage, HomeworkPage } from './pages/teacher/TasksPages'
import { TaskReviewPage } from './pages/teacher/TaskReviewPage'
import {
  LessonBatchPage,
  LessonDetailPage,
  LessonsPage,
} from './pages/teacher/LessonsPages'
import { ExamProfileDetailPage } from './pages/teacher/ExamProfilePages'
import { AttemptPage, StudentTasksPage, StudentToolsPage } from './pages/student/StudentPages'
import {
  ParentDashboardPage,
  ParentTasksPage,
} from './pages/parent/ParentPages'
import { ReadingSpeedPage } from './pages/student/ReadingSpeedPage'
import { EnglishLevelPage } from './pages/student/EnglishLevelPage'
import {
  StoriesHubPage,
  StoriesLevelPage,
  StoryReaderPage,
} from './pages/student/StoriesPages'
import {
  ReadingMachineLibraryPage,
  ReadingMachineViewerPage,
} from './pages/student/ReadingMachinePages'
import { SettingsPage } from './pages/shared/SettingsPage'
import { ParentGuidePage, StudentGuidePage, TeacherGuidePage } from './pages/shared/GuidePages'
import { AccessibilityStatementPage, PrivacyPolicyPage, TermsOfServicePage } from './pages/shared/LegalPages'

function RequireAuth({ role, children }: { role: 'teacher' | 'student' | 'parent'; children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!user) {
    const loginPath =
      role === 'teacher' ? '/login/teacher' : role === 'student' ? '/login/student' : '/login/parent'
    return <Navigate to={loginPath} replace />
  }
  if (user.role !== role) {
    const homePath =
      user.role === 'teacher'
        ? '/teacher/students'
        : user.role === 'student'
          ? '/student/tasks'
          : '/parent/dashboard'
    return <Navigate to={homePath} replace />
  }
  return children
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          user ? (
            <Navigate
              to={
                user.role === 'teacher'
                  ? '/teacher/students'
                  : user.role === 'student'
                    ? '/student/tasks'
                    : '/parent/dashboard'
              }
              replace
            />
          ) : (
            <Landing />
          )
        }
      />
      <Route path="/login/teacher" element={<TeacherAuth />} />
      <Route path="/login/student" element={<StudentAuth />} />
      <Route path="/login/parent" element={<ParentAuth />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/accessibility" element={<AccessibilityStatementPage />} />

      <Route
        path="/teacher"
        element={
          <RequireAuth role="teacher">
            <TeacherLayout />
          </RequireAuth>
        }
      >
        <Route path="students" element={<StudentsPage />} />
        <Route path="students/:id" element={<StudentDetailPage />} />
        <Route path="homework" element={<HomeworkPage />} />
        <Route path="assessments" element={<AssessmentsPage />} />
        <Route path="tasks/:id" element={<TaskReviewPage />} />
        <Route path="lessons" element={<LessonsPage />} />
        <Route path="lessons/:batchId" element={<LessonBatchPage />} />
        <Route path="lessons/:batchId/:lessonId" element={<LessonDetailPage />} />
        <Route path="exam-profiles" element={<Navigate to="/teacher/assessments" replace />} />
        <Route path="exam-profiles/:id" element={<ExamProfileDetailPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="reports/:id" element={<ReportPage />} />
        <Route path="settings" element={<SettingsPage role="teacher" />} />
        <Route path="guide" element={<TeacherGuidePage />} />
      </Route>

      <Route
        path="/student"
        element={
          <RequireAuth role="student">
            <StudentLayout />
          </RequireAuth>
        }
      >
        <Route path="tasks" element={<StudentTasksPage />} />
        <Route path="tools" element={<StudentToolsPage />} />
        <Route path="attempt/:taskId" element={<AttemptPage />} />
        <Route path="reading-speed/:taskId" element={<ReadingSpeedPage />} />
        <Route path="english-level/:taskId" element={<EnglishLevelPage />} />
        <Route path="stories" element={<StoriesHubPage />} />
        <Route path="stories/read/:slug" element={<StoryReaderPage />} />
        <Route path="stories/:level" element={<StoriesLevelPage />} />
        <Route path="reading-machine" element={<ReadingMachineLibraryPage />} />
        <Route path="reading-machine/:materialId" element={<ReadingMachineViewerPage />} />
        <Route path="settings" element={<SettingsPage role="student" />} />
        <Route path="guide" element={<StudentGuidePage />} />
      </Route>

      <Route
        path="/parent"
        element={
          <RequireAuth role="parent">
            <ParentLayout />
          </RequireAuth>
        }
      >
        <Route path="dashboard" element={<ParentDashboardPage />} />
        <Route path="tasks" element={<ParentTasksPage />} />
        <Route path="settings" element={<SettingsPage role="parent" />} />
        <Route path="guide" element={<ParentGuidePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
