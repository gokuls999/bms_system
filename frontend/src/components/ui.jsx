import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

export function Modal({ title, onClose, children, footer, wide = false, drawer = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={`modal-backdrop ${drawer ? 'is-drawer' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`modal ${wide ? 'modal-wide' : ''} ${drawer ? 'modal-drawer' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

/**
 * Confirmation dialog. Pass `requireText` (e.g. the record's name) to make the
 * user type it before the confirm button unlocks - used for permanent deletes.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  busy,
  onConfirm,
  onClose,
  requireText,
}) {
  const [typed, setTyped] = useState('')
  const locked = Boolean(requireText) && typed.trim().toLowerCase() !== requireText.trim().toLowerCase()
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy || locked}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
      {requireText && (
        <label className="field confirm-type">
          <span className="field-label">
            Type <strong>{requireText}</strong> to confirm
          </span>
          <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={requireText} />
        </label>
      )}
    </Modal>
  )
}

export function Pagination({ page, totalPages, count, onChange }) {
  if (!count) return null
  return (
    <div className="pagination">
      <span className="muted">
        {count} record{count === 1 ? '' : 's'} · page {page} of {totalPages}
      </span>
      <div className="pagination-buttons">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ‹ Prev
        </button>
        <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next ›
        </button>
      </div>
    </div>
  )
}

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status === 'active' ? 'Active' : 'Inactive'}</span>
}

export function Field({ label, error, children, hint }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Loader({ label = 'Loading…' }) {
  return (
    <div className="loader">
      <span className="spinner" aria-hidden="true" /> {label}
    </div>
  )
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
    </div>
  )
}

export function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div className="alert alert-error" role="alert">
      {message}
    </div>
  )
}
