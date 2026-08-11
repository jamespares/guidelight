import { render, screen } from '@testing-library/react'
import { MarkingGapsBanner } from './MarkingGapsBanner'

describe('MarkingGapsBanner', () => {
  it('renders nothing when there are no gaps', () => {
    const { container } = render(<MarkingGapsBanner gaps={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists every gap and explains why answers/rubrics matter', () => {
    render(
      <MarkingGapsBanner
        gaps={[
          { questionId: 'q1', message: 'Q1 (mcq): no correct answer set' },
          { message: 'Essay task: no marking rubric — add one so marking matches the exam board' },
        ]}
      />,
    )
    expect(screen.getByText(/Marking gaps/)).toBeInTheDocument()
    expect(screen.getByText('Q1 (mcq): no correct answer set')).toBeInTheDocument()
    expect(screen.getByText(/no marking rubric/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
