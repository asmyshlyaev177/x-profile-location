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

  it('matches options by alias', async () => {
    const { input, onSelect, user } = setup({
      allOptions: ['United States', 'Uruguay'],
      aliases: { 'United States': ['USA', 'America'] },
    })
    await user.type(input, 'america')
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    await user.click(options[0])
    // The alias is only a way in — what gets committed is the option itself.
    expect(onSelect).toHaveBeenCalledWith('United States')
  })

  it('ranks an alias hit above an incidental substring hit', async () => {
    const { input, user } = setup({
      allOptions: ['Belarus', 'Cyprus', 'United States'],
      aliases: { 'United States': ['US', 'USA'] },
    })
    await user.type(input, 'us')
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options[0]).toBe('United States')
    expect(options).toContain('Belarus')
  })

  it('puts a whole-alias hit above an option merely starting with the query', async () => {
    const { input, user } = setup({
      allOptions: ['Ukraine', 'United Kingdom'],
      aliases: { 'United Kingdom': ['UK', 'Britain'] },
    })
    await user.type(input, 'uk')
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['United Kingdom', 'Ukraine'])
  })

  it('still lets an option win on its own name', async () => {
    const { input, user } = setup({
      allOptions: ['Chad', 'Georgia'],
      aliases: { Georgia: ['Chad-adjacent'] },
    })
    await user.type(input, 'chad')
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Chad')
  })

  it('commits the exact alias match on Enter without arrowing', async () => {
    const { input, onSelect, user } = setup({
      allOptions: ['Australia', 'Austria', 'United States'],
      aliases: { 'United States': ['US'] },
    })
    await user.type(input, 'us{Enter}')
    expect(onSelect).toHaveBeenCalledWith('United States')
  })

  it('tells renderOption which alias matched, and only then', async () => {
    const seen: Array<[string, string | undefined]> = []
    const { input, user } = setup({
      allOptions: ['United States'],
      aliases: { 'United States': ['USA', 'America'] },
      renderOption: (opt, alias) => {
        seen.push([opt, alias])
        return opt
      },
    })
    await user.type(input, 'america')
    expect(seen.at(-1)).toEqual(['United States', 'America'])

    seen.length = 0
    await user.clear(input)
    await user.type(input, 'united')
    expect(seen.at(-1)).toEqual(['United States', undefined])
  })

  it('renders custom renderOption', async () => {
    const { input, user } = setup({
      renderOption: (opt) => <b data-testid="custom">{opt}</b>,
    })
    await user.type(input, 'app')
    expect(screen.getByTestId('custom')).toBeInTheDocument()
  })
})
