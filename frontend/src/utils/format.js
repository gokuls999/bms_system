const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

export const formatINR = (value) => inr.format(Number(value || 0))

/** Indian compact notation: ₹4.2L, ₹1.3Cr, ₹12,500 */
export function formatINRCompact(value) {
  const n = Number(value || 0)
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)}Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

/** Best human-readable message from an API error. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error?.response) return error?.message === 'Network Error' ? 'Cannot reach the server.' : fallback
  const data = error.response.data
  if (typeof data === 'string') return fallback
  return data?.detail || fallback
}

/** Field errors map ({field: "message"}) from a 400 validation response. */
export function fieldErrors(error) {
  const errors = error?.response?.data?.errors
  if (!errors || typeof errors !== 'object') return {}
  return Object.fromEntries(
    Object.entries(errors).map(([key, value]) => [key, Array.isArray(value) ? String(value[0]) : String(value)]),
  )
}
