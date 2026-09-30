import { useState } from 'react'

/**
 * Current page number that automatically resets to 1 whenever `filters` change,
 * without an extra render/fetch for the stale page.
 */
export default function usePage(filters) {
  const key = JSON.stringify(filters)
  const [state, setState] = useState({ key, page: 1 })
  const page = state.key === key ? state.page : 1
  return [page, (next) => setState({ key, page: next })]
}
