import { chunkSteps, exportLessonPptx, sanitizeFilename } from '@/lib/lessonPptx'
import type { LessonBatchRow, LessonRow } from '@/lib/api'

describe('chunkSteps', () => {
  it('splits steps into slides of at most 8 bullets', () => {
    const steps = Array.from({ length: 20 }, (_, i) => `Step ${i + 1}`)
    const chunks = chunkSteps(steps)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(8)
    expect(chunks[1]).toHaveLength(8)
    expect(chunks[2]).toHaveLength(4)
  })

  it('trims and drops blank steps', () => {
    expect(chunkSteps([' a ', '', '   ', 'b'])).toEqual([['a', 'b']])
  })

  it('returns a single empty chunk when there are no steps', () => {
    expect(chunkSteps([])).toEqual([[]])
  })
})

describe('sanitizeFilename', () => {
  it('replaces unsafe characters with underscores', () => {
    expect(sanitizeFilename('Present perfect: intro (A2)')).toBe('Present_perfect_intro_A2')
  })

  it('falls back to a default when nothing usable remains', () => {
    expect(sanitizeFilename('!!!')).toBe('lesson')
  })
})

describe('exportLessonPptx', () => {
  const batch: LessonBatchRow = {
    id: 'b1',
    teacher_id: 't1',
    class_id: 'c1',
    class_name: 'Class 7A',
    subject: 'English',
    curriculum: 'IGCSE',
    age_range: '12-13',
    duration_minutes: 45,
    weekly_frequency: 2,
    days_of_week: ['Mon', 'Wed'],
    resources: ['Whiteboard'],
    weeks: 4,
    start_date: '2026-09-01',
    title: 'English plan',
    created_at: '2026-08-01',
  }
  const lesson: LessonRow = {
    id: 'l1',
    batch_id: 'b1',
    week_index: 1,
    sequence_index: 1,
    scheduled_date: '2026-09-01',
    day_of_week: 'Mon',
    title: 'Present perfect: intro (A2)',
    plan: {
      learningObjective: 'Use the present perfect for recent events',
      materials: ['Whiteboard', 'Handout'],
      activityStyle: 'traditional',
      presentation: {
        durationMins: 10,
        steps: Array.from({ length: 10 }, (_, i) => `Present step ${i + 1}`),
        teacherNotes: 'Watch for L1 interference',
      },
      practice: { durationMins: 15, steps: ['Gap fill', 'Pair drill'] },
      production: { durationMins: 15, steps: ['Interview task'] },
      differentiation: 'Fast finishers write two extra sentences',
      plenary: 'Exit ticket',
      homeworkOptional: 'Workbook p. 12',
    },
  }

  it('builds a .pptx blob and triggers a download', async () => {
    const clicks: string[] = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push(this.download)
      })

    await exportLessonPptx(batch, lesson)

    expect(clicks).toEqual(['Present_perfect_intro_A2.pptx'])
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob
    expect(blob.size).toBeGreaterThan(1000)
    clickSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})
