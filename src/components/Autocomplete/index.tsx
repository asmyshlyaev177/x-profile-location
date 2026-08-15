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
  /** Close the dropdown after an option is selected (default: true) */
  closeOnSelect?: boolean
  /** A search aid only — the value committed is always the option itself. */
  aliases?: Record<string, string[]>
  renderOption?: (opt: string, matchedAlias?: string) => ComponentChild
}

// Lower is better: whole-string beats prefix beats substring, and a name beats
// an alias at each tier — so "us" offers United States before Belarus.
function score(name: string, aliases: string[], query: string) {
  if (name === query) return 0
  if (aliases.includes(query)) return 1
  if (name.startsWith(query)) return 2
  if (aliases.some((a) => a.startsWith(query))) return 3
  if (name.includes(query)) return 4
  if (aliases.some((a) => a.includes(query))) return 5
  return -1
}

// Matches first, best first. Sort is stable, so options that score the same
// keep the order they were given in (alphabetical, for the country list).
function rankMatches(
  options: string[],
  aliases: Record<string, string[]> | undefined,
  rawQuery: string,
): string[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return options
  return options
    .map((opt) => ({
      opt,
      score: score(
        opt.toLowerCase(),
        (aliases?.[opt] ?? []).map((a) => a.toLowerCase()),
        query,
      ),
    }))
    .filter((m) => m.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map((m) => m.opt)
}

export function Autocomplete({
  id,
  selected,
  allOptions,
  onSelect,
  placeholder,
  allowFreeInput,
  closeOnSelect = true,
  aliases,
  renderOption,
}: AutocompleteProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selectedLower = new Set(selected.map((s) => s.toLowerCase()))
  const available = allOptions.filter(
    (o) => !selectedLower.has(o.toLowerCase()),
  )
  const q = query.trim().toLowerCase()
  const suggestions =
    query.length === 0 ? available : rankMatches(available, aliases, query)

  // Which alias earned an option its place, so the row can show why it matched.
  // Nothing to explain when the name itself matched.
  function matchedAlias(opt: string): string | undefined {
    if (!aliases || !q || opt.toLowerCase().includes(q)) return undefined
    return aliases[opt]?.find((a) => a.toLowerCase().includes(q))
  }

  function isExactMatch(opt: string): boolean {
    if (!q) return false
    return (
      opt.toLowerCase() === q ||
      (aliases?.[opt] ?? []).some((a) => a.toLowerCase() === q)
    )
  }

  useEffect(() => {
    setActiveIndex(-1)
  }, [query])

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const item = listRef.current.children[activeIndex] as
      | HTMLElement
      | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function commit(value: string) {
    onSelect(value)
    setQuery('')
    if (closeOnSelect) setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  const isOpen = open && suggestions.length > 0

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && isOpen) {
        commit(suggestions[activeIndex])
      } else if (
        !allowFreeInput &&
        isOpen &&
        (suggestions.length === 1 || isExactMatch(suggestions[0]))
      ) {
        // An exact name or alias always sorts first, so "usa" can commit
        // United States on Enter without arrowing past the other matches.
        commit(suggestions[0])
      } else if (allowFreeInput && query.trim()) {
        commit(query.trim())
      }
      return
    }
    if (!isOpen) {
      if (e.key === 'Escape') {
        setOpen(false)
        setActiveIndex(-1)
      }
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
      {/* No aria-haspopup: a combobox implies `listbox`, and the popup below is
          one — so stating it is redundant (ARIA: combobox role). */}
      <input
        ref={inputRef}
        class={css.input}
        value={query}
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
        aria-activedescendant={
          activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
        }
        onInput={(e) => {
          setQuery((e.target as HTMLInputElement).value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false)
            setActiveIndex(-1)
          }, 150)
        }
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {isOpen && (
        <ul
          id={`${id}-listbox`}
          ref={listRef}
          class={css.dropdown}
          role="listbox"
        >
          {suggestions.map((opt, i) => (
            <li
              id={`${id}-option-${i}`}
              key={opt}
              class={`${css.dropdownItem} ${i === activeIndex ? css.dropdownItemActive : ''}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault()
                commit(opt)
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {renderOption ? renderOption(opt, matchedAlias(opt)) : opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
