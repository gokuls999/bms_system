import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ErrorBanner, Field } from '../components/ui'
import { errorMessage } from '../utils/format'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const registered = location.state?.registered

  if (user) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(form.username.trim(), form.password)
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Login failed.'))
    } finally {
      setBusy(false)
    }
  }

  const fillDemo = (username, password) => setForm({ username, password })

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand brand-lg">
          <span className="brand-mark">B</span>
          <span>
            BMS<small>Business Manager</small>
          </span>
        </div>
        <h1>Sign in</h1>
        {registered && <div className="alert alert-success">Account created. You can sign in now.</div>}
        <ErrorBanner message={error} />
        <Field label="Username">
          <input
            autoFocus
            autoComplete="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="demo-creds">
          <span className="muted">Demo:</span>
          <button type="button" className="link-btn" onClick={() => fillDemo('admin', 'Admin@12345')}>
            Admin
          </button>
          <button type="button" className="link-btn" onClick={() => fillDemo('staff', 'Staff@12345')}>
            Staff
          </button>
        </div>
        <p className="muted center">
          No account? <Link to="/register">Register</Link>
        </p>
      </form>
    </div>
  )
}
