import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useToast } from '../components/Toast'
import { ErrorBanner, Field } from '../components/ui'
import useDebounce from '../hooks/useDebounce'
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

export default function NewOrder() {
  const navigate = useNavigate()
  const notify = useToast()

  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState('')
  const debouncedCustomer = useDebounce(customerSearch)

  const [productSearch, setProductSearch] = useState('')
  const [products, setProducts] = useState([])
  const debouncedProduct = useDebounce(productSearch)

  const [lines, setLines] = useState([]) // {product, name, sku, price, stock, quantity}
  const [discountType, setDiscountType] = useState('amount')
  const [discountValue, setDiscountValue] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [stockIssues, setStockIssues] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .get('/customers/', { params: { status: 'active', search: debouncedCustomer, page_size: 50, ordering: 'name' } })
      .then(({ data }) => setCustomers(data.results))
      .catch(() => setCustomers([]))
  }, [debouncedCustomer])

  useEffect(() => {
    api
      .get('/products/', { params: { status: 'active', search: debouncedProduct, page_size: 8, ordering: 'name' } })
      .then(({ data }) => setProducts(data.results))
      .catch(() => setProducts([]))
  }, [debouncedProduct])

  const selectedCustomer = customers.find((c) => String(c.id) === String(customerId))
  const totals = useMemo(() => computeTotals(lines, discountType, discountValue), [lines, discountType, discountValue])

  const addProduct = (p) => {
    setLines((current) => {
      const existing = current.find((l) => l.product === p.id)
      if (existing) {
        return current.map((l) => (l.product === p.id ? { ...l, quantity: Math.min(l.quantity + 1, p.stock_quantity) } : l))
      }
      return [...current, { product: p.id, name: p.name, sku: p.sku, price: p.price, stock: p.stock_quantity, quantity: 1 }]
    })
  }

  const updateQty = (id, value) =>
    setLines((current) => current.map((l) => (l.product === id ? { ...l, quantity: value === '' ? '' : Math.max(0, parseInt(value, 10) || 0) } : l)))

  const removeLine = (id) => setLines((current) => current.filter((l) => l.product !== id))

  const lineProblems = lines.filter((l) => !l.quantity || l.quantity < 1 || l.quantity > l.stock)
  const canSubmit = customerId && lines.length && !lineProblems.length && !totals.discountError && !busy

  const submit = async () => {
    setBusy(true)
    setError('')
    setErrors({})
    setStockIssues([])
    try {
      const { data } = await api.post('/orders/', {
        customer: Number(customerId),
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
        <h1>New order</h1>
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
            <h2 className="card-title">1 · Customer</h2>
            <div className="grid-2">
              <Field label="Search customers">
                <input
                  type="search"
                  placeholder="Type a name or email…"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </Field>
              <Field label="Customer" error={errors.customer}>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Select a customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.email}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {selectedCustomer && (
              <p className="muted small">
                {selectedCustomer.phone} · {selectedCustomer.address || 'No address'}
              </p>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">2 · Products</h2>
            <input
              className="search full"
              type="search"
              placeholder="Search products by name or SKU…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            <ul className="picker">
              {products.map((p) => {
                const inCart = lines.find((l) => l.product === p.id)
                const out = p.stock_quantity === 0
                return (
                  <li key={p.id}>
                    <span>
                      <strong>{p.name}</strong>
                      <small className="muted mono"> {p.sku}</small>
                      <br />
                      <small className="muted">
                        {formatINR(p.price)} · {out ? <span className="text-danger">Out of stock</span> : `${p.stock_quantity} in stock`}
                      </small>
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={out || (inCart && inCart.quantity >= p.stock_quantity)}
                      onClick={() => addProduct(p)}
                    >
                      {inCart ? '+1' : 'Add'}
                    </button>
                  </li>
                )
              })}
              {!products.length && <li className="muted">No matching active products.</li>}
            </ul>
          </section>

          <section className="card">
            <h2 className="card-title">3 · Quantities</h2>
            {lines.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="num hide-sm">Unit price</th>
                      <th className="num">Qty</th>
                      <th className="num">Line total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const tooMany = l.quantity > l.stock
                      return (
                        <tr key={l.product} className={tooMany ? 'row-error' : ''}>
                          <td>
                            {l.name}
                            <div className="muted small">
                              {l.stock} available
                              <span className="show-sm"> · {formatINR(l.price)}</span>
                            </div>
                            {tooMany && <div className="field-error">Only {l.stock} in stock.</div>}
                          </td>
                          <td className="num hide-sm">{formatINR(l.price)}</td>
                          <td className="num">
                            <input
                              className="qty-input"
                              type="number"
                              min="1"
                              max={l.stock}
                              value={l.quantity}
                              onChange={(e) => updateQty(l.product, e.target.value)}
                              aria-label={`Quantity for ${l.name}`}
                            />
                          </td>
                          <td className="num">{formatINR(Number(l.price) * (Number(l.quantity) || 0))}</td>
                          <td>
                            <button className="icon-btn" onClick={() => removeLine(l.product)} aria-label={`Remove ${l.name}`}>
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Add products from the list above.</p>
            )}
            {errors.items && <p className="field-error">{errors.items}</p>}
          </section>
        </div>

        <aside className="card order-summary">
          <h2 className="card-title">Summary</h2>
          <div className="grid-2">
            <Field label="Discount type">
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
                <option value="amount">Flat (₹)</option>
                <option value="percent">Percent (%)</option>
              </select>
            </Field>
            <Field label="Discount" error={totals.discountError || errors.discount_value}>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <dl className="totals">
            <dt>Subtotal</dt>
            <dd>{formatINR(totals.subtotal)}</dd>
            <dt>Discount</dt>
            <dd>− {formatINR(totals.discount)}</dd>
            <dt className="grand">Total</dt>
            <dd className="grand">{formatINR(totals.total)}</dd>
          </dl>
          <button className="btn btn-primary btn-block" disabled={!canSubmit} onClick={submit}>
            {busy ? 'Creating order…' : 'Create order'}
          </button>
          {!customerId && <p className="muted small center">Select a customer to continue.</p>}
        </aside>
      </div>
    </>
  )
}
