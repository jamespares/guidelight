import { resolveTaskKind, taskTypeBadgeClass, taskTypeLabel } from './taskLabels'

describe('resolveTaskKind', () => {
  it('returns homework for plain homework', () => {
    expect(resolveTaskKind('homework', null)).toBe('homework')
  })

  it('returns diagnostic for assessment diagnostic', () => {
    expect(resolveTaskKind('assessment', 'diagnostic')).toBe('diagnostic')
  })

  it('returns mock_exam for mock_exam subtype', () => {
    expect(resolveTaskKind('assessment', 'mock_exam')).toBe('mock_exam')
  })

  it('returns summative for summative subtype', () => {
    expect(resolveTaskKind('assessment', 'summative')).toBe('summative')
  })

  it('falls back to formative for unknown assessment subtype', () => {
    expect(resolveTaskKind('assessment', null)).toBe('formative')
  })
})

describe('taskTypeLabel', () => {
  it('labels english_level assessments', () => {
    expect(taskTypeLabel('assessment', 'english_level')).toBe('English level')
  })

  it('labels homework', () => {
    expect(taskTypeLabel('homework', null)).toBe('Homework')
  })
})

describe('taskTypeBadgeClass', () => {
  it('returns a non-empty class string', () => {
    expect(taskTypeBadgeClass('assessment', 'mock_exam')).toContain('bg-')
  })
})
