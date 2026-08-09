import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Click me</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click me</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders as a link when asChild is used with an anchor', () => {
    render(
      <Button asChild>
        <a href="/test">Link button</a>
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'Link button' })).toBeInTheDocument()
  })
})
