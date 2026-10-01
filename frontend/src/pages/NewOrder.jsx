import { Mail, MapPin, Minus, Package, Phone, Plus, ShoppingCart, Trash2, UserRound } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import Combobox from '../components/Combobox'
import { useToast } from '../components/Toast'
import { ErrorBanner, Field } from '../components/ui'
import { errorMessage, fieldErrors, formatINR } from '../utils/format'

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

/** Client-side mirror of the server calculation (the server always recomputes). */
function computeTotals(lines, discountType, discountValue) {
  const subtotal = round2(lines.reduce((sum, l) => sum + Number(l.price) * (Number(l.quantity) || 0), 0))
  const value = Number(discountValue) || 0
  let discount = discountType === 'percent' ? round2((subtotal * value) / 100) : round2(value)
  let discountError = ''
  if (value < 0) discountError = 'Discount cannot be negative.'
  else if (discountType === 'percent' && value > 100) discountError = 'Percentage cannot exceed 100%.'
  else if (discount > subtotal) discountError = 'Discount cannot exceed the subtotal.'
  if (discountError) discount = 0
  return { subtotal, discount, total: round2(subtotal - discount), discountError }
}

const initials = (name = '') =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export default function NewOrder() {
  const navigate = useNavigate()
  const notify = useToast()

  const [customer, setCustomer] = useState(null)
  const [lines, setLines] = useState([]) // {product, name, sku, price, stock, quantity}
  const [discountType, setDiscountType] = useState('amount')
  const [discountValue, setDiscountValue] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [stockIssues, setStockIssues] = useState([])
  const [busy, setBusy] = useState(false)

  const fetchCustomers = useCallback(
    (q) =>
      api
        .get('/customers/', { params: { status: 'active', search: q, page_size: 20, ordering: 'name' } })
        .then(({ data }) => data.results),
    [],
  )
  const fetchProducts = useCallback(
    (q) =>
      api
        .get('/products/', { params: { status: 'active', search: q, page_size: 20, ordering: 'name' } })
        .then(({ data }) => data.results),
    [],
  )

  const totals = useMemo(() => computeTotals(lines, discountType, discountValue), [lines, discountType, discountValue])

  const addProduct = (p) => {
    if (!p) return
    setLines((current) => {
      const existing = current.find((l) => l.product === p.id)
      if (existing) {
        return current.map((l) => (l.product === p.id ? { ...l, quantity: Math.min(Number(l.quantity) + 1, p.stock_quantity) } : l))
      }
      return [...current, { product: p.id, name: p.name, sku: p.sku, price: p.price, stock: p.stock_quantity, quantity: 1 }]
    })
  }

  const setQty = (id, value) =>
    setLines((current) =>
      current.map((l) => (l.product === id ? { ...l, quantity: value === '' ? '' : Math.max(0, parseInt(value, 10) || 0) } : l)),
    )
  const step = (id, delta) =>
    setLines((current) =>
      current.map((l) =>
        l.product === id ? { ...l, quantity: Math.min(Math.max(1, (Number(l.quantity) || 0) + delta), l.stock) } : l,
      ),
    )
  const removeLine = (id) => setLines((current) => current.filter((l) => l.product !== id))

  const lineProblems = lines.filter((l) => !l.quantity || l.quantity < 1 || l.quantity > l.stock)
  const itemCount = lines.reduce((n, l) => n + (Number(l.quantity) || 0), 0)
  const canSubmit = customer && lines.length && !lineProblems.length && !totals.discountError && !busy

  const submit = async () => {
    setBusy(true)
    setError('')
    setErrors({})
    setStockIssues([])
    try {
      const { data } = await api.post('/orders/', {
        customer: customer.id,
        items: lines.map((l) => ({ product: l.product, quantity: Number(l.quantity) })),
        discount_type: discountType,
        discount_value: discountValue || 0,
        notes,
      })
      notify(`Order ${data.order_number} created.`)
      navigate(`/orders/${data.id}`)
    } catch (err) {
      const body = err.response?.data
      if (body?.code === 'insufficient_stock') {
        // Someone else bought stock meanwhile - show live availability.
        setStockIssues(body.items)
        setLines((current) =>
          current.map((l) => {
            const issue = body.items.find((i) => i.product_id === l.product)
            return issue ? { ...l, stock: issue.available } : l
          }),
        )
      }
      setErrors(fieldErrors(err))
      setError(errorMessage(err, 'Could not create the order.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>New order</h1>
          <p className="page-subtitle">Select a customer, add products and review the totals.</p>
        </div>
      </div>
      <ErrorBanner message={error} />
      {stockIssues.length > 0 && (
        <div className="alert alert-warn">
          Stock changed while you were creating this order. Adjust the highlighted quantities and try again.
        </div>
      )}

      <div className="order-layout">
        <div className="order-main">
          <section className="card">
            <h2 className="card-title">
              <UserRound size={18} /> Customer
            </h2>
            {customer ? (
              <div className="customer-card">
                <span className="avatar-lg">{initials(customer.name)}</span>
                <div className="customer-card-body">
                  <strong>{customer.name}</strong>
                  <span>
                    <Mail size={13} /> {customer.email}
                  </span>
                  <span>
                    <Phone size={13} /> {customer.phone}
                  </span>
                  {customer.address && (
                    <span>
                      <MapPin size={13} /> {customer.address}
                    </span>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setCustomer(null)}>
                  Change
                </button>
              </div>
            ) : (
              <Combobox
                value={customer}
                onChange={setCustomer}
                fetchOptions={fetchCustomers}
                placeholder="Search customers by name, email or phone…"
                emptyText="No active customers match."
                renderOption={(c) => (
                  <div className="opt-row">
                    <span className="avatar-sm">{initials(c.name)}</span>
                    <span className="opt-main">
                      <strong>{c.name}</strong>
                      <small>
                        {c.email} · {c.phone}
                      </small>
                    </span>
                  </div>
                )}
              />
            )}
            {errors.customer && <p className="field-error">{errors.customer}</p>}
          </section>

          <section className="card">
            <h2 className="card-title">
              <Package size={18} /> Items
              {lines.length > 0 && <span className="count-pill">{itemCount}</span>}
            </h2>
            <Combobox
              value={null}
              onChange={addProduct}
              fetchOptions={fetchProducts}
              placeholder="Search products by name or SKU to add…"
              emptyText="No active products match."
              keepOpenAfterSelect
              clearOnSelect
              icon={Plus}
              isDisabled={(p) => {
                const inCart = lines.find((l) => l.product === p.id)
                return p.stock_quantity === 0 || (inCart && inCart.quantity >= p.stock_quantity)
              }}
              renderOption={(p) => {
                const inCart = lines.find((l) => l.product === p.id)
                return (
                  <div className="opt-row">
                    <span className="opt-main">
                      <strong>{p.name}</strong>
                      <small className="mono">{p.sku}</small>
                    </span>
                    <span className="opt-side">
                      <strong>{formatINR(p.price)}</strong>
                      <small className={p.stock_quantity === 0 ? 'text-danger' : p.is_low_stock ? 'text-warn' : ''}>
                        {p.stock_quantity === 0 ? 'Out of stock' : `${p.stock_quantity} in stock`}
                        {inCart ? ` · ${inCart.quantity} added` : ''}
                      </small>
                    </span>
                  </div>
                )
              }}
            />

            {lines.length ? (
              <div className="line-items">
                <div className="line-head">
                  <span>Product</span>
                  <span className="num">Price</span>
                  <span className="center">Qty</span>
                  <span className="num">Amount</span>
                  <span />
                </div>
                {lines.map((l) => {
                  const tooMany = l.quantity > l.stock
                  return (
                    <div key={l.product} className={`line ${tooMany ? 'line-error' : ''}`}>
                      <div className="line-product">
                        <strong>{l.name}</strong>
                        <small className="muted">
                          <span className="mono">{l.sku}</span> · {l.stock} available
                        </small>
                        {tooMany && <small className="field-error">Only {l.stock} in stock.</small>}
                      </div>
                      <div className="line-price num">{formatINR(l.price)}</div>
                      <div className="stepper" role="group" aria-label={`Quantity for ${l.name}`}>
                        <button type="button" onClick={() => step(l.product, -1)} disabled={Number(l.quantity) <= 1} aria-label="Decrease">
                          <Minus size={14} />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={l.stock}
                          value={l.quantity}
                          onChange={(e) => setQty(l.product, e.target.value)}
                          aria-label="Quantity"
                        />
                        <button type="button" onClick={() => step(l.product, 1)} disabled={Number(l.quantity) >= l.stock} aria-label="Increase">
                          <Plus size={14} />
                        </button>
                      </div>
                      <div className="line-total num">{formatINR(Number(l.price) * (Number(l.quantity) || 0))}</div>
                      <button className="icon-btn danger" onClick={() => removeLine(l.product)} aria-label={`Remove ${l.name}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="empty-inline">
                <ShoppingCart size={28} />
                <span>No items yet. Search above to add products.</span>
              </div>
            )}
            {errors.items && <p className="field-error">{errors.items}</p>}
          </section>
        </div>

        <aside className="card order-summary">
          <h2 className="card-title">Summary</h2>
          <div className="discount-row">
            <div className="segmented" role="radiogroup" aria-label="Discount type">
              <button type="button" className={discountType === 'amount' ? 'is-on' : ''} onClick={() => setDiscountType('amount')}>
                ₹ Flat
              </button>
              <button type="button" className={discountType === 'percent' ? 'is-on' : ''} onClick={() => setDiscountType('percent')}>
                % Percent
              </button>
            </div>
            <Field label="Discount" error={totals.discountError || errors.discount_value}>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={discountType === 'percent' ? '0 %' : '₹ 0'}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery notes, reference…" />
          </Field>
          <dl className="totals">
            <dt>
              Subtotal <span className="muted">({itemCount} items)</span>
            </dt>
            <dd>{formatINR(totals.subtotal)}</dd>
            <dt>Discount</dt>
            <dd>− {formatINR(totals.discount)}</dd>
            <dt className="grand">Total</dt>
            <dd className="grand">{formatINR(totals.total)}</dd>
          </dl>
          <button className="btn btn-primary btn-block btn-lg" disabled={!canSubmit} onClick={submit}>
            {busy ? 'Creating order…' : `Create order · ${formatINR(totals.total)}`}
          </button>
          {!customer && <p className="muted small center">Select a customer to continue.</p>}
          {customer && !lines.length && <p className="muted small center">Add at least one product.</p>}
        </aside>
      </div>
    </>
  )
}
