import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AttemptView } from './AttemptView'
import type { TaskContent } from '@/lib/api'

const content: TaskContent = {
  title: 'Fractions practice',
  instructions: 'Answer every question.',
  questions: [
    {
      id: 'q1',
      type: 'mcq',
      prompt: 'What is 1/2 + 1/4?',
      topic: 'Fractions',
      options: ['1/6', '3/4', '2/4'],
    },
    {
      id: 'q2',
      type: 'cloze',
      prompt: 'The capital of France is _____.',
      topic: 'Geography',
    },
  ],
}

const taskMeta = { type: 'homework', time_limit_seconds: null, title: 'Fractions practice' }

function PreviewHarness({ preview = true }: { preview?: boolean }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  return (
    <AttemptView
      preview={preview}
      content={content}
      taskMeta={taskMeta}
      answers={answers}
      onAnswer={(qid, v) => setAnswers((prev) => ({ ...prev, [qid]: v }))}
      secondsLeft={null}
      elapsed={0}
    />
  )
}

describe('AttemptView', () => {
  it('renders title, instructions and every question prompt', () => {
    render(<PreviewHarness />)
    expect(screen.getByText('Fractions practice')).toBeInTheDocument()
    expect(screen.getByText('Answer every question.')).toBeInTheDocument()
    expect(screen.getAllByText('What is 1/2 + 1/4?').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/The capital of France is/).length).toBeGreaterThan(0)
  })

  it('lets the student answer an mcq question', async () => {
    render(<PreviewHarness />)
    await userEvent.click(screen.getByLabelText('3/4'))
    expect(screen.getByLabelText('3/4')).toBeChecked()
    expect(screen.getByText('1/2 answered')).toBeInTheDocument()
  })

  it('lets the student fill a cloze blank', async () => {
    render(<PreviewHarness />)
    await userEvent.type(screen.getByPlaceholderText('answer'), 'Paris')
    expect(screen.getByPlaceholderText('answer')).toHaveValue('Paris')
  })

  it('shows a disabled preview notice instead of a submit button in preview mode', () => {
    render(<PreviewHarness preview />)
    const button = screen.getByRole('button', { name: /Preview — submissions are disabled/ })
    expect(button).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Submit for marking/ })).not.toBeInTheDocument()
  })

  it('shows a submit button outside preview mode', () => {
    render(<PreviewHarness preview={false} />)
    expect(screen.getByRole('button', { name: /Submit for marking/ })).toBeEnabled()
  })
})
