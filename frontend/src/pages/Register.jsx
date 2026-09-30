import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ErrorBanner, Field } from '../components/ui'
import { errorMessage, fieldErrors } from '../utils/format'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', first_name: '', last_name: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) {
      setErrors({ confirm: 'Passwords do not match.' })
      return
    }
    setBusy(true)
    setErrors({})
    setError('')
    try {
      // eslint-disable-next-line no-unused-vars
      const { confirm, ...payload } = form
      await register(payload)
      navigate('/login', { state: { registered: true } })
    } catch (err) {
      setErrors(fieldErrors(err))
      setError(errorMessage(err, 'Registration failed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Create an account</h1>
        <p className="muted">New accounts get the Staff role. An admin can promote you later.</p>
        <ErrorBanner message={error} />
        <div className="grid-2">
          <Field label="First name" error={errors.first_name}>
            <input value={form.first_name} onChange={set('first_name')} />
          </Field>
          <Field label="Last name" error={errors.last_name}>
            <input value={form.last_name} onChange={set('last_name')} />
          </Field>
        </div>
        <Field label="Username" error={errors.username}>
          <input value={form.username} onChange={set('username')} required autoComplete="username" />
        </Field>
        <Field label="Email" error={errors.email}>
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters, not entirely numeric.">
          <input type="password" value={form.password} onChange={set('password')} required autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          <input type="password" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating…' : 'Register'}
        </button>
        <p className="muted center">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
