import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { trackEvent } from '../scripts/analytics'
import { BLOCKED_COUNTRIES_KEY, COUNTRY_FLAGS, REGION_FLAGS } from '../scripts/countries'
import css from './options.module.css'

const ALL_FLAGS: Record<string, string> = { ...COUNTRY_FLAGS, ...REGION_FLAGS }
const ALL_LOCATIONS = Object.keys(ALL_FLAGS).sort()

function Options() {
  const [blocked, setBlocked] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    chrome.storage.local.get(BLOCKED_COUNTRIES_KEY).then((result) => {
      setBlocked((result[BLOCKED_COUNTRIES_KEY] as string[] | undefined) ?? [])
    })
  }, [])

  const suggestions =
    query.length >= 1
      ? ALL_LOCATIONS.filter(
          (c) => !blocked.includes(c) && c.toLowerCase().includes(query.toLowerCase()),
        ).slice(0, 12)
      : []

  // Reset active index whenever the suggestion list changes
  useEffect(() => {
    setActiveIndex(-1)
  }, [query])

  // Scroll the highlighted item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function save(next: string[]) {
    setBlocked(next)
    chrome.storage.local.set({ [BLOCKED_COUNTRIES_KEY]: next })
  }

  function add(country: string) {
    if (!blocked.includes(country)) {
      save([...blocked, country])
      trackEvent('country_blocked', { country })
    }
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  function remove(country: string) {
    save(blocked.filter((c) => c !== country))
    trackEvent('country_unblocked', { country })
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!open || suggestions.length === 0) {
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
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0) {
          add(suggestions[activeIndex])
        } else if (suggestions.length === 1) {
          add(suggestions[0])
        }
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

  const isOpen = open && suggestions.length > 0

  return (
    <div class={css.container}>
      <h2 class={css.heading}>Replace flags with ⚠️</h2>
      <p class={css.subtitle}>Profiles from selected countries will show ⚠️ instead of their flag.</p>

      {blocked.length > 0 && (
        <div class={css.chips}>
          {blocked.map((country) => (
            <span key={country} class={css.chip}>
              <span class={css.chipFlag}>{ALL_FLAGS[country] ?? '🌐'}</span>
              {country}
              <button class={css.chipRemove} onClick={() => remove(country)} title={`Remove ${country}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div class={css.autocomplete}>
        <input
          ref={inputRef}
          class={css.input}
          value={query}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls="country-listbox"
          aria-activedescendant={activeIndex >= 0 ? `country-option-${activeIndex}` : undefined}
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); setActiveIndex(-1) }, 150)}
          onKeyDown={handleKeyDown}
          placeholder="Search countries..."
        />
        {isOpen && (
          <ul
            id="country-listbox"
            ref={listRef}
            class={css.dropdown}
            role="listbox"
          >
            {suggestions.map((c, i) => (
              <li
                id={`country-option-${i}`}
                key={c}
                class={`${css.dropdownItem} ${i === activeIndex ? css.dropdownItemActive : ''}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={() => add(c)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span class={css.dropdownFlag}>{ALL_FLAGS[c] ?? '🌐'}</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {blocked.length === 0 && query.length === 0 && (
        <p class={css.empty}>No countries selected — all flags shown as-is.</p>
      )}

      <div className={css.soon}>
        More features are coming soon!
      </div>
    </div>
  )
}

render(<Options />, document.body)
