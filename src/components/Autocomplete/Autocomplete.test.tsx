import { render, screen, within } from '@testing-library/preact'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Autocomplete } from './index'

const OPTIONS = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry']

function setup(props: Partial<Parameters<typeof Autocomplete>[0]> = {}) {
  const onSelect = vi.fn()
  const user = userEvent.setup()
  render(
    <Autocomplete
      id="test"
      selected={[]}
      allOptions={OPTIONS}
      onSelect={onSelect}
      placeholder="Search..."
      {...props}
    />,
  )
  const input = screen.getByRole('combobox')
  return { input, onSelect, user }
}

describe('Autocomplete', () => {
  it('renders input', () => {
    const { input } = setup()
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('placeholder', 'Search...')
  })

  it('shows all options on click when query is empty', async () => {
    const { input, user } = setup()
    await user.click(input)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(OPTIONS.length)
  })

  it('filters options by query', async () => {
    const { input, user } = setup()
    await user.type(input, 'an')
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Banana')
  })

  it('calls onSelect and clears input when option clicked', async () => {
    const { input, onSelect, user } = setup()
    await user.type(input, 'ban')
    await user.click(screen.getByRole('option', { name: 'Banana' }))
    expect(onSelect).toHaveBeenCalledWith('Banana')
    expect(input).toHaveValue('')
  })

  it('closes dropdown after selection by default', async () => {
    const { input, user } = setup()
    await user.type(input, 'ban')
    await user.click(screen.getByRole('option', { name: 'Banana' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('keeps dropdown open and clears input after selection when closeOnSelect is false', async () => {
    const { input, user } = setup({ closeOnSelect: false })
    await user.type(input, 'a')
    await user.click(screen.getByRole('option', { name: 'Apple' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('selects active option with Enter key', async () => {
    const { input, onSelect, user } = setup()
    await user.type(input, 'ch')
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('Cherry')
  })

  it('commits free text input on Enter when allowFreeInput', async () => {
    const { input, onSelect, user } = setup({ allowFreeInput: true })
    await user.type(input, 'custom tag{Enter}')
    expect(onSelect).toHaveBeenCalledWith('custom tag')
    expect(input).toHaveValue('')
  })

  it('does not commit free text on Enter without allowFreeInput', async () => {
    const { input, onSelect, user } = setup()
    await user.type(input, 'custom tag{Enter}')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('closes dropdown on Escape', async () => {
    const { input, user } = setup()
    await user.type(input, 'app')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('excludes already-selected options', async () => {
    const { input, user } = setup({ selected: ['Apple', 'Banana'] })
    await user.type(input, 'e')
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).not.toContain('Apple')
    expect(options).not.toContain('Banana')
  })

  it('navigates options with ArrowDown/ArrowUp', async () => {
    const { input, onSelect, user } = setup()
    await user.type(input, 'e')
    const listbox = screen.getByRole('listbox')
    const options = within(listbox).getAllByRole('option')

    await user.keyboard('{ArrowDown}')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowUp}')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith(options[0].textContent)
  })

  it('renders custom renderOption', async () => {
    const { input, user } = setup({ renderOption: (opt) => <b data-testid="custom">{opt}</b> })
    await user.type(input, 'app')
    expect(screen.getByTestId('custom')).toBeInTheDocument()
  })
})
