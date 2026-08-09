import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from './input'

describe('Input', () => {
  it('renders an input', () => {
    render(<Input placeholder="Enter name" />)
    expect(screen.getByPlaceholderText('Enter name')).toBeInTheDocument()
  })

  it('forwards refs and accepts typing', async () => {
    render(<Input placeholder="Enter name" />)
    const input = screen.getByPlaceholderText('Enter name')
    await userEvent.type(input, 'hello')
    expect(input).toHaveValue('hello')
  })

  it('is disabled when disabled prop is set', () => {
    render(<Input disabled placeholder="Enter name" />)
    expect(screen.getByPlaceholderText('Enter name')).toBeDisabled()
  })
})
