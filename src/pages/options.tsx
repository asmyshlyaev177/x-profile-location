import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { BLOCKED_COUNTRIES_KEY, COUNTRY_FLAGS, REGION_FLAGS } from '../scripts/countries'
import css from './options.module.css'

const ALL_FLAGS: Record<string, string> = { ...COUNTRY_FLAGS, ...REGION_FLAGS }
const ALL_LOCATIONS = Object.keys(ALL_FLAGS).sort()

function Options() {
  const [blocked, setBlocked] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    chrome.storage.local.get(BLOCKED_COUNTRIES_KEY).then((result) => {
      setBlocked((result[BLOCKED_COUNTRIES_KEY] as string[] | undefined) ?? [])
    })
  }, [])

  function save(next: string[]) {
    setBlocked(next)
    chrome.storage.local.set({ [BLOCKED_COUNTRIES_KEY]: next })
  }

  function add(country: string) {
    if (!blocked.includes(country)) save([...blocked, country])
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function remove(country: string) {
    save(blocked.filter((c) => c !== country))
  }

  const suggestions =
    query.length >= 1
      ? ALL_LOCATIONS.filter(
          (c) => !blocked.includes(c) && c.toLowerCase().includes(query.toLowerCase()),
        ).slice(0, 12)
      : []

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
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search countries..."
        />
        {open && suggestions.length > 0 && (
          <ul class={css.dropdown}>
            {suggestions.map((c) => (
              <li key={c} class={css.dropdownItem} onMouseDown={() => add(c)}>
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
