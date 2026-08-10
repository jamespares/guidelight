export const queryKeys = {
  auth: {
    me: ['auth', 'me'],
  },
  classes: {
    all: ['classes'],
  },
  students: {
    all: ['students'],
    detail: (id: string) => ['students', id],
    examReadiness: (id: string) => ['students', id, 'exam-readiness'],
  },
  tasks: {
    all: (type?: string) => (type ? ['tasks', { type }] : ['tasks']),
    detail: (id: string) => ['tasks', id],
    attempts: (id: string) => ['tasks', id, 'attempts'],
  },
  studentTasks: {
    all: ['student-tasks'],
  },
  lessonBatches: {
    all: ['lesson-batches'],
    detail: (id: string) => ['lesson-batches', id],
  },
  examProfiles: {
    all: (classId: string) => ['exam-profiles', classId],
    detail: (id: string) => ['exam-profiles', id],
    mocks: (id: string) => ['exam-profiles', id, 'mocks'],
  },
  insights: {
    class: (id: string) => ['insights', 'class', id],
    student: (id: string) => ['insights', 'student', id],
  },
  reports: {
    detail: (id: string) => ['reports', id],
  },
  readingMaterials: {
    all: ['reading-materials'],
    detail: (id: string) => ['reading-materials', id],
  },
  billing: {
    usage: ['billing', 'usage'],
    invoices: ['billing', 'invoices'],
  },
}
