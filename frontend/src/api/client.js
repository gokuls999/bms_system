import axios from 'axios'

// By default the API is same-origin: the Vite dev server proxies /api to Django
// (see vite.config.js). Set VITE_API_URL to call a separately hosted backend.
export const API_URL = import.meta.env.VITE_API_URL || '/api'

const ACCESS_KEY = 'bms_access'
const REFRESH_KEY = 'bms_refresh'
const USER_KEY = 'bms_user'

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  get user() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY))
    } catch {
      return null
    }
  },
  save({ access, refresh, user }) {
    if (access) localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
  },
}

const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  const token = tokenStore.access
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On a 401, try once to refresh the access token, then replay the request.
// Concurrent 401s share a single refresh call.
let refreshPromise = null
let onAuthFailure = () => {}
export const setAuthFailureHandler = (fn) => {
  onAuthFailure = fn
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const status = error.response?.status
    const isAuthCall = original?.url?.includes('/auth/')
    if (status !== 401 || original?._retried || isAuthCall || !tokenStore.refresh) {
      if (status === 401 && !isAuthCall) onAuthFailure()
      return Promise.reject(error)
    }
    original._retried = true
    try {
      refreshPromise ||= axios
        .post(`${API_URL}/auth/refresh`, { refresh: tokenStore.refresh })
        .then(({ data }) => tokenStore.save(data))
        .finally(() => {
          refreshPromise = null
        })
      await refreshPromise
      original.headers.Authorization = `Bearer ${tokenStore.access}`
      return api(original)
    } catch (refreshError) {
      onAuthFailure()
      return Promise.reject(refreshError)
    }
  },
)

export default api
