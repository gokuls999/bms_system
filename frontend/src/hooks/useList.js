import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'
import { errorMessage } from '../utils/format'

/**
 * Fetches a paginated DRF list endpoint whenever `params` change.
 * Empty-string params are dropped so they don't act as filters.
 */
export default function useList(url, params) {
  const [data, setData] = useState({ results: [], count: 0, total_pages: 1, page: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const key = JSON.stringify(params)

  useEffect(() => {
    let cancelled = false
    const query = Object.fromEntries(Object.entries(JSON.parse(key)).filter(([, v]) => v !== '' && v != null))
    setLoading(true)
    api
      .get(url, { params: query })
      .then(({ data }) => {
        if (!cancelled) {
          setData(data)
          setError('')
        }
      })
      .catch((err) => !cancelled && setError(errorMessage(err, 'Could not load data.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [url, key, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, loading, error, reload }
}
