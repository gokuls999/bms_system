import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import { ConfirmDialog, EmptyState, ErrorBanner, Field, Loader, Modal, Pagination } from '../components/ui'
import useDebounce from '../hooks/useDebounce'
import useList from '../hooks/useList'
import usePage from '../hooks/usePage'
import { errorMessage, fieldErrors, formatDate } from '../utils/format'

const EMPTY = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  role: 'staff',
  can_delete: false,
  is_active: true,
  password: '',
}

function UserForm({ user, onClose, onSaved }) {
  const notify = useToast()
  const [form, setForm] = useState(user ? { ...EMPTY, ...user, password: '' } : EMPTY)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setError('')
    const payload = { ...form }
    if (!payload.password) delete payload.password
    delete payload.id
    delete payload.date_joined
    try {
      if (user) await api.patch(`/users/${user.id}/`, payload)
      else await api.post('/users/', payload)
      notify(user ? 'User updated.' : 'User created.')
      onSaved()
    } catch (err) {
      setErrors(fieldErrors(err))
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={user ? `Edit ${user.username}` : 'New user'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" form="user-form" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit}>
        <ErrorBanner message={error} />
        <div className="grid-2">
          <Field label="First name" error={errors.first_name}>
            <input value={form.first_name} onChange={set('first_name')} />
          </Field>
          <Field label="Last name" error={errors.last_name}>
            <input value={form.last_name} onChange={set('last_name')} />
          </Field>
          <Field label="Username" error={errors.username}>
            <input value={form.username} onChange={set('username')} required />
          </Field>
          <Field label="Email" error={errors.email}>
            <input type="email" value={form.email} onChange={set('email')} required />
          </Field>
          <Field label="Role" error={errors.role}>
            <select value={form.role} onChange={set('role')}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label={user ? 'New password (optional)' : 'Password'} error={errors.password}>
            <input type="password" value={form.password} onChange={set('password')} required={!user} autoComplete="new-password" />
          </Field>
        </div>
        <div className="checkbox-group">
          <label className="checkbox">
            <input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> Active (can sign in)
          </label>
          {form.role === 'staff' && (
            <label className="checkbox">
              <input type="checkbox" checked={form.can_delete} onChange={set('can_delete')} /> Can delete customers,
              products and categories
            </label>
          )}
        </div>
      </form>
    </Modal>
  )
}

export default function Users() {
  const { user: me } = useAuth()
  const notify = useToast()
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search)
  const [page, setPage] = usePage({ debounced })
  const { data, loading, error, reload } = useList('/users/', { search: debounced, page })
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  const doDelete = async () => {
    setBusy(true)
    try {
      await api.delete(`/users/${deleting.id}/`)
      notify('User deleted.')
      reload()
    } catch (err) {
      notify(errorMessage(err), 'error')
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p className="page-subtitle">Accounts, roles and delete permission.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> Add user
        </button>
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={16} />
            <input className="search" type="search" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <ErrorBanner message={error} />
        {loading && !data.results.length ? (
          <Loader />
        ) : data.results.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th className="hide-sm">Name</th>
                  <th className="hide-md">Email</th>
                  <th>Role</th>
                  <th className="hide-md">Joined</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.username}</strong>
                      {!u.is_active && <span className="badge badge-inactive">Disabled</span>}
                    </td>
                    <td className="hide-sm">{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className="hide-md">{u.email}</td>
                    <td>
                      <span className={`role role-${u.role}`}>{u.role}</span>
                      {u.role === 'staff' && u.can_delete && <span className="badge badge-active">Can delete</span>}
                    </td>
                    <td className="hide-md muted">{formatDate(u.date_joined)}</td>
                    <td className="actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        className="btn btn-ghost btn-sm text-danger"
                        disabled={u.id === me.id}
                        title={u.id === me.id ? 'You cannot delete yourself' : undefined}
                        onClick={() => setDeleting(u)}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No users found" />
        )}
        <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onChange={setPage} />
      </div>
      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete user"
          message={`Delete ${deleting.username}? Their past orders are kept.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
