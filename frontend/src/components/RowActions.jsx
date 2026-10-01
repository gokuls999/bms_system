import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * Zoho-style row action menu: a single "⋯" button that opens a small menu.
 * items: [{ label, icon: Icon, onClick, danger?, hidden? } | 'divider']
 */
export default function RowActions({ items, label = 'Actions' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const visible = items.filter((i) => i === 'divider' || !i.hidden)
  // Drop dividers that would end up first, last or doubled.
  const cleaned = visible.filter(
    (item, idx) => item !== 'divider' || (idx > 0 && idx < visible.length - 1 && visible[idx - 1] !== 'divider'),
  )

  return (
    <div className="row-actions" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`kebab ${open ? 'is-open' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {cleaned.map((item, idx) =>
            item === 'divider' ? (
              <div key={`d${idx}`} className="menu-divider" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`menu-item ${item.danger ? 'is-danger' : ''}`}
                onClick={() => {
                  setOpen(false)
                  item.onClick()
                }}
              >
                {item.icon && <item.icon size={15} />}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
