import type { ComponentChild } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import css from './Autocomplete.module.css'

export interface AutocompleteProps {
  id: string
  selected: string[]
  allOptions: string[]
  onSelect: (value: string) => void
  placeholder?: string
  /** Allow committing arbitrary typed text on Enter, not just suggestions */
  allowFreeInput?: boolean
  /** Show suggestions even when the query is empty */
  showWhenEmpty?: boolean
  renderOption?: (opt: string) => ComponentChild
}

export function Autocomplete({
  id,
  selected,
  allOptions,
  onSelect,
  placeholder,
  allowFreeInput,
  showWhenEmpty,
  renderOption,
}: AutocompleteProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selectedLower = selected.map((s) => s.toLowerCase())
  const available = allOptions.filter((o) => !selectedLower.includes(o.toLowerCase()))
  const suggestions =
    query.length === 0
      ? showWhenEmpty ? available : []
      : available.filter((o) => o.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => { setActiveIndex(-1) }, [query])

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function commit(value: string) {
    onSelect(value)
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  const isOpen = open && suggestions.length > 0

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && isOpen) {
        commit(suggestions[activeIndex])
      } else if (!allowFreeInput && isOpen && suggestions.length === 1) {
        commit(suggestions[0])
      } else if (allowFreeInput && query.trim()) {
        commit(query.trim())
      }
      return
    }
    if (!isOpen) {
      if (e.key === 'Escape') { setOpen(false); setActiveIndex(-1) }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setActiveIndex(-1)
        break
      case 'Tab':
        setOpen(false)
        setActiveIndex(-1)
        break
    }
  }

  return (
    <div class={css.autocomplete}>
      <input
        ref={inputRef}
        class={css.input}
        value={query}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
        aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setActiveIndex(-1) }, 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {isOpen && (
        <ul id={`${id}-listbox`} ref={listRef} class={css.dropdown} role="listbox">
          {suggestions.map((opt, i) => (
            <li
              id={`${id}-option-${i}`}
              key={opt}
              class={`${css.dropdownItem} ${i === activeIndex ? css.dropdownItemActive : ''}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={() => commit(opt)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {renderOption ? renderOption(opt) : opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
