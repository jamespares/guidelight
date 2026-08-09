import { cn } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('handles conditional classes', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c')
  })

  it('merges tailwind conflicting classes', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })
})
