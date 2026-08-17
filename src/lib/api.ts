  cefrSubmit: (testId: string, answers: Record<string, string>) =>
    request<{
      cefr_level: string
      total_score: number
      max_score: number
      ieltsBand: string
      over_time_seconds: number
    }>(`/api/cefr/tests/${testId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),
  // Teacher-only read-only preview of one parallel form (no attempt created)
  cefrTaskPreview: (taskId: string, form?: number) =>
    request<{
      title: string
      timeLimitSeconds: number
      formIndex: number
      formCount: number
      items?: Array<Record<string, unknown>>
      passages?: Record<string, string>
    }>(`/api/cefr/tests/task/${taskId}/preview${form != null ? `?form=${form}` : ''}`),
