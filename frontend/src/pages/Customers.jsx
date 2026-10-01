import { Eye, Pencil, Plus, Search, Trash2, UserCheck, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import RowActions from '../components/RowActions'
import { useToast } from '../components/Toast'
import { ConfirmDialog, EmptyState, ErrorBanner, Field, Loader, Modal, Pagination, StatusBadge } from '../components/ui'
import useDebounce from '../hooks/useDebounce'
import useList from '../hooks/useList'
import usePage from '../hooks/usePage'
import { errorMessage, fieldErrors, formatDate, formatDateTime, formatINR } from '../utils/format'

const initials = (name = '') =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const EMPTY = { name: '', email: '', phone: '', address: '', status: 'active' }

function CustomerForm({ customer, onClose, onSaved }) {
  const notify = useToast()
  const [form, setForm] = useState(customer ? { ...EMPTY, ...customer } : EMPTY)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setError('')
    const payload = { name: form.name, email: form.email, phone: form.phone, address: form.address, status: form.status }
    try {
      if (customer) await api.put(`/customers/${customer.id}/`, payload)
      else await api.post('/customers/', payload)
      notify(customer ? 'Customer updated.' : 'Customer created.')
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
      title={customer ? 'Edit customer' : 'New customer'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" form="customer-form" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit}>
        <ErrorBanner message={error} />
        <Field label="Name" error={errors.name}>
          <input value={form.name} onChange={set('name')} required autoFocus />
        </Field>
        <div className="grid-2">
          <Field label="Email" error={errors.email}>
            <input type="email" value={form.email} onChange={set('email')} required />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <input value={form.phone} onChange={set('phone')} required placeholder="+91 98765 43210" />
          </Field>
        </div>
        <Field label="Address" error={errors.address}>
          <textarea rows={3} value={form.address} onChange={set('address')} />
        </Field>
        <Field label="Status" error={errors.status}>
          <select value={form.status} onChange={set('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </form>
    </Modal>
  )
}

function CustomerView({ id, onClose, onEdit }) {
  const [customer, setCustomer] = useState(null)
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get(`/customers/${id}/`)
      .then(({ data }) => setCustomer(data))
      .catch((err) => setError(errorMessage(err)))
    api
      .get('/orders/', { params: { customer: id, page_size: 5 } })
      .then(({ data }) => setOrders(data))
      .catch(() => setOrders({ results: [], count: 0 }))
  }, [id])

  return (
    <Modal
      drawer
      title="Customer details"
      onClose={onClose}
      footer={
        customer && (
          <button className="btn btn-primary" onClick={() => onEdit(customer)}>
            Edit
          </button>
        )
      }
    >
      <ErrorBanner message={error} />
      {!customer && !error && <Loader />}
      {customer && (
        <>
          <dl className="details">
            <dt>Name</dt>
            <dd>{customer.name}</dd>
            <dt>Email</dt>
            <dd>{customer.email}</dd>
            <dt>Phone</dt>
            <dd>{customer.phone}</dd>
            <dt>Address</dt>
            <dd>{customer.address || '—'}</dd>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={customer.status} />
            </dd>
            <dt>Created</dt>
            <dd>{formatDateTime(customer.created_at)}</dd>
            <dt>Orders</dt>
            <dd>{customer.order_count}</dd>
          </dl>
          <h3 className="section-title">Recent orders</h3>
          {!orders ? (
            <Loader />
          ) : orders.results.length ? (
            <ul className="mini-list">
              {orders.results.map((o) => (
                <li key={o.id}>
                  <Link to={`/orders/${o.id}`}>{o.order_number}</Link>
                  <span className="muted">{formatDate(o.created_at)}</span>
                  <strong>{formatINR(o.total_amount)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No orders yet.</p>
          )}
        </>
      )}
    </Modal>
  )
}

export default function Customers() {
  const { canDelete } = useAuth()
  const notify = useToast()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const debounced = useDebounce(search)
  const [page, setPage] = usePage({ debounced, status })
  const { data, loading, error, reload } = useList('/customers/', { search: debounced, status, page })

  const [editing, setEditing] = useState(null) // null | 'new' | customer
  const [viewing, setViewing] = useState(null)
  const [confirm, setConfirm] = useState(null) // {type, customer}
  const [busy, setBusy] = useState(false)

  const runConfirm = async () => {
    const { type, customer } = confirm
    setBusy(true)
    try {
      if (type === 'delete') {
        await api.delete(`/customers/${customer.id}/`)
        notify('Customer deleted.')
      } else {
        await api.post(`/customers/${customer.id}/${type}/`)
        notify(type === 'deactivate' ? 'Customer deactivated.' : 'Customer activated.')
      }
      setConfirm(null)
      reload()
    } catch (err) {
      notify(errorMessage(err), 'error')
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <p className="page-subtitle">Manage customer records and their status.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> Add customer
        </button>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={16} />
            <input
              className="search"
              type="search"
              placeholder="Search name, email or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <ErrorBanner message={error} />
        {loading && !data.results.length ? (
          <Loader />
        ) : data.results.length ? (
          <div className={`table-wrap ${loading ? 'is-loading' : ''}`}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="hide-sm">Email</th>
                  <th className="hide-md">Phone</th>
                  <th>Status</th>
                  <th className="hide-md">Created</th>
                  <th className="actions-col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.results.map((c) => (
                  <tr key={c.id} className="row-link" onClick={() => setViewing(c.id)}>
                    <td>
                      <div className="cell-person">
                        <span className="avatar-sm">{initials(c.name)}</span>
                        <span className="cell-person-text">
                          <strong>{c.name}</strong>
                          <small className="show-sm muted">{c.email}</small>
                        </span>
                      </div>
                    </td>
                    <td className="hide-sm">{c.email}</td>
                    <td className="hide-md">{c.phone}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="hide-md muted">{formatDate(c.created_at)}</td>
                    <td className="actions">
                      <RowActions
                        label={`Actions for ${c.name}`}
                        items={[
                          { label: 'View details', icon: Eye, onClick: () => setViewing(c.id) },
                          { label: 'Edit', icon: Pencil, onClick: () => setEditing(c) },
                          c.status === 'active'
                            ? { label: 'Mark as inactive', icon: UserX, onClick: () => setConfirm({ type: 'deactivate', customer: c }) }
                            : { label: 'Mark as active', icon: UserCheck, onClick: () => setConfirm({ type: 'activate', customer: c }) },
                          'divider',
                          {
                            label: 'Delete',
                            icon: Trash2,
                            danger: true,
                            hidden: !canDelete,
                            onClick: () => setConfirm({ type: 'delete', customer: c }),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No customers found">Try a different search or filter.</EmptyState>
        )}
        <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onChange={setPage} />
      </div>

      {editing && (
        <CustomerForm
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
      {viewing && (
        <CustomerView
          id={viewing}
          onClose={() => setViewing(null)}
          onEdit={(c) => {
            setViewing(null)
            setEditing(c)
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={
            confirm.type === 'delete' ? 'Delete customer' : confirm.type === 'deactivate' ? 'Deactivate customer' : 'Activate customer'
          }
          message={
            confirm.type === 'delete'
              ? `This permanently deletes ${confirm.customer.name} and cannot be undone. Customers with orders cannot be deleted - mark them inactive instead.`
              : confirm.type === 'deactivate'
                ? `${confirm.customer.name} will no longer be selectable for new orders.`
                : `${confirm.customer.name} will be available for new orders again.`
          }
          confirmLabel={confirm.type === 'delete' ? 'Delete' : confirm.type === 'deactivate' ? 'Deactivate' : 'Activate'}
          danger={confirm.type !== 'activate'}
          requireText={confirm.type === 'delete' ? confirm.customer.name : undefined}
          busy={busy}
          onConfirm={runConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  )
}
