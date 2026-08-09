import { api } from './api'

describe('api request helper', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws an error with the server message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'Bad request' }),
        } as Response),
      ),
    )

    await expect(api.me()).rejects.toThrow('Bad request')
  })

  it('attaches ai budget fields to the error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 402,
          json: () =>
            Promise.resolve({
              code: 'ai_budget_exceeded',
              message: 'AI budget exceeded',
              used_cents: 100,
              cap_cents: 100,
            }),
        } as Response),
      ),
    )

    const listener = vi.fn()
    window.addEventListener('guidelight:ai-budget-exceeded', listener)

    await expect(api.me()).rejects.toThrow('AI budget exceeded')

    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener('guidelight:ai-budget-exceeded', listener)
  })
})
