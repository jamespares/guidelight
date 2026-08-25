import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { PageLoadingFallback, TeacherLayout, StudentLayout, ParentLayout } from './components/Layouts'
import { useAuth } from './lib/auth'
import { ParentAuth, StudentAuth, TeacherAuth, VerifyEmailPage, ResetPasswordPage } from './pages/auth/AuthPages'
import { Landing } from './pages/landing/LandingPage'
import { RoleSelectPage } from './pages/landing/RoleSelectPage'

// Route-level code splitting: portal pages load on demand instead of in the
// initial bundle. Entry pages (landing, auth) stay static for fast first paint.
const StudentsPage = lazy(() =>
  import('./pages/teacher/StudentsPage').then((m) => ({ default: m.StudentsPage })),
)
const StudentDetailPage = lazy(() =>
  import('./pages/teacher/StudentDetailPage').then((m) => ({ default: m.StudentDetailPage })),
)
const HomeworkPage = lazy(() =>
  import('./pages/teacher/TasksPages').then((m) => ({ default: m.HomeworkPage })),
)
const AssessmentsPage = lazy(() =>
  import('./pages/teacher/TasksPages').then((m) => ({ default: m.AssessmentsPage })),
)
const TaskReviewPage = lazy(() =>
  import('./pages/teacher/TaskReviewPage').then((m) => ({ default: m.TaskReviewPage })),
)
const TaskPreviewPage = lazy(() =>
  import('./pages/teacher/TaskPreviewPage').then((m) => ({ default: m.TaskPreviewPage })),
)
const EnglishLevelPreviewPage = lazy(() =>
  import('./pages/teacher/EnglishLevelPreviewPage').then((m) => ({
    default: m.EnglishLevelPreviewPage,
  })),
)
const ReadingSpeedPreviewPage = lazy(() =>
  import('./pages/teacher/ReadingSpeedPreviewPage').then((m) => ({
    default: m.ReadingSpeedPreviewPage,
  })),
)
const LessonsPage = lazy(() =>
  import('./pages/teacher/LessonsPages').then((m) => ({ default: m.LessonsPage })),
)
const LessonBatchPage = lazy(() =>
  import('./pages/teacher/LessonsPages').then((m) => ({ default: m.LessonBatchPage })),
)
const LessonDetailPage = lazy(() =>
  import('./pages/teacher/LessonsPages').then((m) => ({ default: m.LessonDetailPage })),
)
const ExamProfileDetailPage = lazy(() =>
  import('./pages/teacher/ExamProfilePages').then((m) => ({ default: m.ExamProfileDetailPage })),
)
const InsightsPage = lazy(() =>
  import('./pages/teacher/InsightsPage').then((m) => ({ default: m.InsightsPage })),
)
const ReportPage = lazy(() =>
  import('./pages/teacher/InsightsPage').then((m) => ({ default: m.ReportPage })),
)
const StudentTasksPage = lazy(() =>
  import('./pages/student/StudentPages').then((m) => ({ default: m.StudentTasksPage })),
)
const StudentToolsPage = lazy(() =>
  import('./pages/student/StudentPages').then((m) => ({ default: m.StudentToolsPage })),
)
const AttemptPage = lazy(() =>
  import('./pages/student/StudentPages').then((m) => ({ default: m.AttemptPage })),
)
const ReadingSpeedPage = lazy(() =>
  import('./pages/student/ReadingSpeedPage').then((m) => ({ default: m.ReadingSpeedPage })),
)
const EnglishLevelPage = lazy(() =>
  import('./pages/student/EnglishLevelPage').then((m) => ({ default: m.EnglishLevelPage })),
)
const StoriesHubPage = lazy(() =>
  import('./pages/student/StoriesPages').then((m) => ({ default: m.StoriesHubPage })),
)
const StoriesLevelPage = lazy(() =>
  import('./pages/student/StoriesPages').then((m) => ({ default: m.StoriesLevelPage })),
)
const StoryReaderPage = lazy(() =>
  import('./pages/student/StoriesPages').then((m) => ({ default: m.StoryReaderPage })),
)
const ReadingMachineLibraryPage = lazy(() =>
  import('./pages/student/ReadingMachinePages').then((m) => ({
    default: m.ReadingMachineLibraryPage,
  })),
)
const ReadingMachineViewerPage = lazy(() =>
  import('./pages/student/ReadingMachinePages').then((m) => ({
    default: m.ReadingMachineViewerPage,
  })),
)
const ParentDashboardPage = lazy(() =>
  import('./pages/parent/ParentPages').then((m) => ({ default: m.ParentDashboardPage })),
)
const ParentTasksPage = lazy(() =>
  import('./pages/parent/ParentPages').then((m) => ({ default: m.ParentTasksPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/shared/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const TeacherGuidePage = lazy(() =>
  import('./pages/shared/GuidePages').then((m) => ({ default: m.TeacherGuidePage })),
)
const StudentGuidePage = lazy(() =>
  import('./pages/shared/GuidePages').then((m) => ({ default: m.StudentGuidePage })),
)
const ParentGuidePage = lazy(() =>
  import('./pages/shared/GuidePages').then((m) => ({ default: m.ParentGuidePage })),
)
const TermsOfServicePage = lazy(() =>
  import('./pages/shared/LegalPages').then((m) => ({ default: m.TermsOfServicePage })),
)
const PrivacyPolicyPage = lazy(() =>
  import('./pages/shared/LegalPages').then((m) => ({ default: m.PrivacyPolicyPage })),
)
const AccessibilityStatementPage = lazy(() =>
  import('./pages/shared/LegalPages').then((m) => ({ default: m.AccessibilityStatementPage })),
)
const CefrLevelsPage = lazy(() =>
  import('./pages/resources/ResourcePages').then((m) => ({ default: m.CefrLevelsPage })),
)
const AiMarkingRubricsPage = lazy(() =>
  import('./pages/resources/ResourcePages').then((m) => ({ default: m.AiMarkingRubricsPage })),
)
const PublicStoriesHubPage = lazy(() =>
  import('./pages/stories/PublicStoriesPages').then((m) => ({ default: m.PublicStoriesHubPage })),
)
const PublicStoriesLevelPage = lazy(() =>
  import('./pages/stories/PublicStoriesPages').then((m) => ({ default: m.PublicStoriesLevelPage })),
)
const PublicStoryReaderPage = lazy(() =>
  import('./pages/stories/PublicStoriesPages').then((m) => ({ default: m.PublicStoryReaderPage })),
)
const FlashcardsHubPage = lazy(() =>
  import('./pages/flashcards/FlashcardsPage').then((m) => ({ default: m.FlashcardsHubPage })),
)
const FlashcardsLevelPage = lazy(() =>
  import('./pages/flashcards/FlashcardsPage').then((m) => ({ default: m.FlashcardsLevelPage })),
)

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

  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
      <Route
        path="/"
        element={
          !loading && user ? (
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
      <Route path="/get-started" element={<RoleSelectPage />} />
      <Route path="/login/teacher" element={<TeacherAuth />} />
      <Route path="/login/student" element={<StudentAuth />} />
      <Route path="/login/parent" element={<ParentAuth />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/accessibility" element={<AccessibilityStatementPage />} />
      <Route path="/resources/cefr-levels" element={<CefrLevelsPage />} />
      <Route path="/resources/ai-marking-rubrics" element={<AiMarkingRubricsPage />} />
      <Route path="/stories" element={<PublicStoriesHubPage />} />
      <Route path="/stories/read/:slug" element={<PublicStoryReaderPage />} />
      <Route path="/stories/:level" element={<PublicStoriesLevelPage />} />
      <Route path="/flashcards" element={<FlashcardsHubPage />} />
      <Route path="/flashcards/:level" element={<FlashcardsLevelPage />} />

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
        <Route path="tasks/:id/preview" element={<TaskPreviewPage />} />
        <Route path="tasks/:id/english-level-preview" element={<EnglishLevelPreviewPage />} />
        <Route path="tasks/:id/reading-speed-preview" element={<ReadingSpeedPreviewPage />} />
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
    </Suspense>
  )
}
