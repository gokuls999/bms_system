import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import useDebounce from '../hooks/useDebounce'

/**
 * Searchable, keyboard-friendly async select (like Zoho / Linear pickers).
 *
 * - `fetchOptions(query)` returns a Promise of options (called on open and as the user types)
 * - `renderOption(option)` renders a row; `getKey(option)` gives a stable key
 * - `value` is the selected option (or null); `onChange(option)` fires on pick
 * - `keepOpenAfterSelect` keeps the list open (used for adding several products)
 */
export default function Combobox({
  value,
  onChange,
  fetchOptions,
  renderOption,
  getKey = (o) => o.id,
  getLabel = (o) => o?.name ?? '',
  placeholder = 'Search…',
  emptyText = 'No matches found.',
  isDisabled = () => false,
  keepOpenAfterSelect = false,
  clearOnSelect = false,
  icon: Icon = Search,
  autoFocus = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const debounced = useDebounce(query, 200)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()

  // Load options whenever the list is open and the (debounced) query changes.
  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setLoading(true)
    fetchOptions(debounced)
      .then((list) => {
        if (!cancelled) {
          setOptions(list)
          setActive(0)
        }
      })
      .catch(() => !cancelled && setOptions([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, debounced, fetchOptions])

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keep the highlighted row visible while using the arrow keys.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (option) => {
    if (!option || isDisabled(option)) return
    onChange(option)
    if (clearOnSelect) setQuery('')
    if (!keepOpenAfterSelect) {
      setOpen(false)
      setQuery('')
    } else {
      inputRef.current?.focus()
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && options[active]) {
        e.preventDefault()
        pick(options[active])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showValue = value && !open && !clearOnSelect

  return (
    <div className={`combo ${open ? 'is-open' : ''}`} ref={rootRef}>
      <div className="combo-control" onClick={() => inputRef.current?.focus()}>
        <Icon size={16} className="combo-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoFocus={autoFocus}
          placeholder={showValue ? getLabel(value) : placeholder}
          className={showValue ? 'has-value' : ''}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {loading ? (
          <Loader2 size={16} className="combo-trailing spin" aria-hidden="true" />
        ) : value && !clearOnSelect ? (
          <button
            type="button"
            className="combo-clear"
            aria-label="Clear selection"
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
              setQuery('')
            }}
          >
            <X size={15} />
          </button>
        ) : (
          <ChevronDown size={16} className="combo-trailing" aria-hidden="true" />
        )}
      </div>

      {open && (
        <ul className="combo-list" id={listId} role="listbox" ref={listRef}>
          {!loading && options.length === 0 && <li className="combo-empty">{emptyText}</li>}
          {options.map((option, index) => {
            const disabled = isDisabled(option)
            const selected = value && getKey(value) === getKey(option)
            return (
              <li
                key={getKey(option)}
                data-index={index}
                role="option"
                aria-selected={selected}
                aria-disabled={disabled}
                className={`combo-option ${index === active ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(option)
                }}
              >
                <div className="combo-option-body">{renderOption(option)}</div>
                {selected && <Check size={16} className="combo-check" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
