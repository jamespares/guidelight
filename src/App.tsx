import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { TeacherLayout, StudentLayout } from './components/Layouts'
import { useAuth } from './lib/auth'
import { Landing, StudentAuth, TeacherAuth, VerifyEmailPage, ResetPasswordPage } from './pages/auth/AuthPages'
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
import { TeacherDojoPage, TeacherDojoReviewPage } from './pages/teacher/ExamDojoPages'
import { AttemptPage, StudentTasksPage, StudentToolsPage } from './pages/student/StudentPages'
import { ExamDojoHubPage, ExamDojoSitPage } from './pages/student/ExamDojoPages'
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
import { StudentGuidePage, TeacherGuidePage } from './pages/shared/GuidePages'

function RequireAuth({ role, children }: { role: 'teacher' | 'student'; children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to={role === 'teacher' ? '/login/teacher' : '/login/student'} replace />
  if (user.role !== role) {
    return <Navigate to={user.role === 'teacher' ? '/teacher/students' : '/student/tasks'} replace />
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
            <Navigate to={user.role === 'teacher' ? '/teacher/students' : '/student/tasks'} replace />
          ) : (
            <Landing />
          )
        }
      />
      <Route path="/login/teacher" element={<TeacherAuth />} />
      <Route path="/login/student" element={<StudentAuth />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

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
        <Route path="exam-dojo" element={<TeacherDojoPage />} />
        <Route path="exam-dojo/:id" element={<TeacherDojoReviewPage />} />
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
        <Route path="exam-dojo" element={<ExamDojoHubPage />} />
        <Route path="exam-dojo/sit/:paperId" element={<ExamDojoSitPage />} />
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
