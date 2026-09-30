import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { setAuthFailureHandler, tokenStore } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (tokenStore.access ? tokenStore.user : null))

  const clearSession = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    setAuthFailureHandler(clearSession)
  }, [clearSession])

  // Refresh the cached profile (role may have changed server-side).
  useEffect(() => {
    if (!tokenStore.access) return
    api
      .get('/auth/me')
      .then(({ data }) => {
        tokenStore.save({ user: data })
        setUser(data)
      })
      .catch(() => {})
  }, [])

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password })
    tokenStore.save(data)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (payload) => {
    await api.post('/auth/register', payload)
  }, [])

  const logout = useCallback(async () => {
    const refresh = tokenStore.refresh
    clearSession()
    if (refresh) {
      try {
        await api.post('/auth/logout', { refresh })
      } catch {
        /* token may already be invalid - nothing to do */
      }
    }
  }, [clearSession])

  const value = useMemo(
    () => ({ user, isAdmin: user?.role === 'admin', login, register, logout }),
    [user, login, register, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
