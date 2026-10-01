import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * Zoho-style row action menu: a single "⋯" button that opens a small menu.
 * items: [{ label, icon: Icon, onClick, danger?, hidden? } | 'divider']
 */
const MENU_HEIGHT_ESTIMATE = 200

export default function RowActions({ items, label = 'Actions' }) {
  const [pos, setPos] = useState(null) // null = closed; otherwise fixed-position coordinates
  const ref = useRef(null)
  const open = pos !== null

  // The menu is fixed-positioned against the viewport so scrollable tables can never clip it.
  const toggle = (e) => {
    if (open) return setPos(null)
    const rect = e.currentTarget.getBoundingClientRect()
    const right = window.innerWidth - rect.right
    const flipUp = window.innerHeight - rect.bottom < MENU_HEIGHT_ESTIMATE
    setPos(flipUp ? { right, bottom: window.innerHeight - rect.top + 4 } : { right, top: rect.bottom + 4 })
  }

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => ref.current && !ref.current.contains(e.target) && setPos(null)
    const onKey = (e) => e.key === 'Escape' && setPos(null)
    const dismiss = () => setPos(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
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
        onClick={toggle}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="menu" role="menu" style={pos}>
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
                  setPos(null)
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
