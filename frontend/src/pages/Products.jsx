import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import { ConfirmDialog, EmptyState, ErrorBanner, Field, Loader, Modal, Pagination, StatusBadge } from '../components/ui'
import useDebounce from '../hooks/useDebounce'
import useList from '../hooks/useList'
import usePage from '../hooks/usePage'
import { errorMessage, fieldErrors, formatINR } from '../utils/format'

const EMPTY = { name: '', sku: '', category: '', price: '', stock_quantity: 0, status: 'active' }

function ProductForm({ product, categories, onClose, onSaved }) {
  const notify = useToast()
  const [form, setForm] = useState(product ? { ...EMPTY, ...product } : { ...EMPTY, category: categories[0]?.id || '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    const localErrors = {}
    if (Number(form.price) <= 0) localErrors.price = 'Price must be greater than zero.'
    if (!Number.isInteger(Number(form.stock_quantity)) || Number(form.stock_quantity) < 0)
      localErrors.stock_quantity = 'Stock must be a whole number ≥ 0.'
    if (Object.keys(localErrors).length) return setErrors(localErrors)

    setBusy(true)
    setErrors({})
    setError('')
    const payload = {
      name: form.name,
      sku: form.sku,
      category: form.category,
      price: form.price,
      stock_quantity: Number(form.stock_quantity),
      status: form.status,
    }
    try {
      if (product) await api.put(`/products/${product.id}/`, payload)
      else await api.post('/products/', payload)
      notify(product ? 'Product updated.' : 'Product created.')
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
      title={product ? 'Edit product' : 'New product'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" form="product-form" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} noValidate>
        <ErrorBanner message={error} />
        <Field label="Product name" error={errors.name}>
          <input value={form.name} onChange={set('name')} required autoFocus />
        </Field>
        <div className="grid-2">
          <Field label="SKU" error={errors.sku} hint="Unique. Letters, digits, - and _.">
            <input value={form.sku} onChange={set('sku')} required className="mono" />
          </Field>
          <Field label="Category" error={errors.category}>
            <select value={form.category} onChange={set('category')} required>
              <option value="" disabled>
                Select…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid-3">
          <Field label="Price (₹)" error={errors.price}>
            <input type="number" min="0.01" step="0.01" value={form.price} onChange={set('price')} required />
          </Field>
          <Field label="Stock quantity" error={errors.stock_quantity}>
            <input type="number" min="0" step="1" value={form.stock_quantity} onChange={set('stock_quantity')} required />
          </Field>
          <Field label="Status" error={errors.status}>
            <select value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
      </form>
    </Modal>
  )
}

function CategoryManager({ categories, onClose, onChanged }) {
  const notify = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const add = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/categories/', { name })
      setName('')
      notify('Category added.')
      onChanged()
    } catch (err) {
      setError(fieldErrors(err).name || errorMessage(err))
    }
  }

  const remove = async (category) => {
    try {
      await api.delete(`/categories/${category.id}/`)
      notify('Category deleted.')
      onChanged()
    } catch (err) {
      notify(errorMessage(err), 'error')
    }
  }

  return (
    <Modal title="Categories" onClose={onClose}>
      <form className="inline-form" onSubmit={add}>
        <input placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="btn btn-primary">Add</button>
      </form>
      <ErrorBanner message={error} />
      <ul className="mini-list">
        {categories.map((c) => (
          <li key={c.id}>
            <span>{c.name}</span>
            <span className="muted">{c.product_count} products</span>
            <button className="btn btn-ghost btn-sm text-danger" onClick={() => remove(c)} disabled={c.product_count > 0}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

export default function Products() {
  const { isAdmin } = useAuth()
  const notify = useToast()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [lowStock, setLowStock] = useState(searchParams.get('low_stock') === 'true')
  const debounced = useDebounce(search)
  const [page, setPage] = usePage({ debounced, category, status, lowStock })
  const { data, loading, error, reload } = useList('/products/', {
    search: debounced,
    category,
    status,
    low_stock: lowStock ? 'true' : '',
    page,
  })

  const [categories, setCategories] = useState([])
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [managingCategories, setManagingCategories] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadCategories = useCallback(() => api.get('/categories/').then(({ data }) => setCategories(data)), [])
  useEffect(() => {
    loadCategories()
  }, [loadCategories])
  const doDelete = async () => {
    setBusy(true)
    try {
      await api.delete(`/products/${deleting.id}/`)
      notify('Product deleted.')
      reload()
      loadCategories()
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
        <h1>Products</h1>
        {isAdmin && (
          <div className="header-actions">
            <button className="btn btn-ghost" onClick={() => setManagingCategories(true)}>
              Categories
            </button>
            <button className="btn btn-primary" onClick={() => setEditing('new')} disabled={!categories.length}>
              + Add product
            </button>
          </div>
        )}
      </div>
      {!isAdmin && <div className="alert alert-info">Staff have read-only access to products. Ask an admin to make changes.</div>}

      <div className="card">
        <div className="toolbar">
          <input
            className="search"
            type="search"
            placeholder="Search name, SKU or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <label className="checkbox">
            <input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} /> Low stock only
          </label>
        </div>
        <ErrorBanner message={error} />
        {loading && !data.results.length ? (
          <Loader />
        ) : data.results.length ? (
          <div className={`table-wrap ${loading ? 'is-loading' : ''}`}>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="hide-sm">SKU</th>
                  <th className="hide-md">Category</th>
                  <th className="num">Price</th>
                  <th className="num">Stock</th>
                  <th className="hide-sm">Status</th>
                  {isAdmin && <th className="actions-col">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.results.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="show-sm muted small mono">{p.sku}</div>
                    </td>
                    <td className="hide-sm mono">{p.sku}</td>
                    <td className="hide-md">{p.category_name}</td>
                    <td className="num">{formatINR(p.price)}</td>
                    <td className="num">
                      <span className={p.stock_quantity === 0 ? 'qty qty-out' : p.is_low_stock ? 'qty qty-low' : ''}>
                        {p.stock_quantity}
                      </span>
                    </td>
                    <td className="hide-sm">
                      <StatusBadge status={p.status} />
                    </td>
                    {isAdmin && (
                      <td className="actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>
                          Edit
                        </button>
                        <button className="btn btn-ghost btn-sm text-danger" onClick={() => setDeleting(p)}>
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No products found">Try a different search or filter.</EmptyState>
        )}
        <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onChange={setPage} />
      </div>

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
            loadCategories()
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete product"
          message={`Delete ${deleting.name} (${deleting.sku})? Products that appear in orders cannot be deleted - mark them inactive instead.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setDeleting(null)}
        />
      )}
      {managingCategories && (
        <CategoryManager
          categories={categories}
          onClose={() => setManagingCategories(false)}
          onChanged={loadCategories}
        />
      )}
      {!categories.length && isAdmin && !loading && (
        <p className="muted">Create a category first to start adding products.</p>
      )}
    </>
  )
}
