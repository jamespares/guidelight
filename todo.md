1. ensure the system is storing everything about the student' performance (except their personal details or name/surnames) and ensure it is exportable so if the system fails I can use the data to make analyses elsewhere using AI and produced highly detailed reports - the more data, in the most AI-readable format, the better
2. start testing and using it with work email, keep improving it, use it loads, then sell it

## Next session — remaining work from the 2026-08-16 batch

3. **Teacher to-do list + attendance register (F2 — not started, agent was cut off)**. Full spec ready:
   - New `migrations/0018_todos_attendance.sql`: `teacher_todos(id, teacher_id FK cascade, title, description default '', due_date nullable, done 0/1, created_at)` + `attendance_records(id, class_id FK, student_id FK, date, status in present/late/absent, UNIQUE(class_id, student_id, date))`, indexes `(class_id, date)`.
   - Worker: new `worker/lib/teacherTools.ts` sub-router (`GET/POST /api/todos`, `PATCH/DELETE /api/todos/:id`, `GET /api/attendance?classId=&date=`, `PUT /api/attendance` bulk upsert guarded by `classOwned`, `GET /api/attendance/stats?classId=` with per-day counts + per-student rates). No AI, no metering needed.
   - Frontend: `TodoPage` (`/teacher/todo`: add dialog w/ title+due date+description, row click → detail/edit dialog, done checkbox) and `AttendancePage` (`/teacher/attendance`: "Take register" → class+date dialog → register modal w/ present/late/absent per student; analytics below w/ recharts daily chart + per-student rate table; EmptyState if no classes). Follow `StudentsPage.tsx` patterns; add api methods + queryKeys; nav entries "To-do" (`ListTodo`), "Attendance" (`ClipboardCheck`) in `teacherNav` + `routeChunks` in `src/components/Layouts.tsx`; routes in `src/App.tsx`.
   - GDPR: add both tables to `deleteTeacherAccount` (worker/index.ts ~2640) + account export (`worker/lib/audit.ts`) + check `compliance/gdpr-encryption.md`.
   - Then `npm run db:migrate` locally and `npx wrangler d1 migrations apply guidelight --remote` after deploy.
4. **Manual runtime checks** (code passes all gates but wasn't browser-verified): insights expanded graph dialog on `/teacher/insights`; collapsible sidebar toggle + persistence; public `/stories` pages logged-out (audio + karaoke); Create PPT download flow.
5. Optional: dynamic `import('pptxgenjs')` in `src/lib/lessonPptx.ts` to shrink the LessonsPages chunk (~733 KB).

## Shipped 2026-08-16 (this batch)

- Public `/stories/*` (hub/levels/readers, audio + karaoke) w/ prerendered SEO pages, sitemap + llms.txt entries, "Graded stories" footer link
- Teacher to-do list — NOT shipped, see item 3
- Collapsible sidebar (localStorage-persisted)
- Auth email delay notice (server messages + hint on register/magic/forgot)
- Homework/Assessments: Created column + sortable headers
- Insights expanded-graph fix (definite dialog height)
- Diagnostic homework removed; banner now recommends a diagnostic assessment (`hasDiagnostic` counts assessments only)
- Lessons: "Create PPT" per-lesson .pptx export (browser-side pptxgenjs)
