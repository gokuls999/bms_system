import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import { ErrorBanner, Loader } from '../components/ui'
import { errorMessage, formatDateTime, formatINR } from '../utils/format'

export default function OrderDetail() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get(`/orders/${id}/`)
      .then(({ data }) => setOrder(data))
      .catch((err) => setError(errorMessage(err, 'Could not load order.')))
  }, [id])

  if (error)
    return (
      <>
        <ErrorBanner message={error} />
        <Link to="/orders">← Back to orders</Link>
      </>
    )
  if (!order) return <Loader />

  return (
    <>
      <div className="page-header">
        <div>
          <Link to="/orders" className="muted small">
            ← Order history
          </Link>
          <h1>Order {order.order_number}</h1>
        </div>
        <button className="btn btn-ghost" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="order-layout">
        <section className="card order-main">
          <h2 className="card-title">Items</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Unit price</th>
                  <th className="num">Qty</th>
                  <th className="num">Line total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.product_name}
                      <div className="muted small mono">{item.sku}</div>
                    </td>
                    <td className="num">{formatINR(item.unit_price)}</td>
                    <td className="num">{item.quantity}</td>
                    <td className="num">{formatINR(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Unit prices are the prices at the time of purchase.</p>
        </section>

        <aside className="card order-summary">
          <h2 className="card-title">Summary</h2>
          <dl className="details">
            <dt>Customer</dt>
            <dd>
              {order.customer_name}
              <div className="muted small">{order.customer_email}</div>
              <div className="muted small">{order.customer_phone}</div>
            </dd>
            <dt>Date</dt>
            <dd>{formatDateTime(order.created_at)}</dd>
            <dt>Created by</dt>
            <dd>{order.created_by_username || '—'}</dd>
            {order.notes && (
              <>
                <dt>Notes</dt>
                <dd>{order.notes}</dd>
              </>
            )}
          </dl>
          <dl className="totals">
            <dt>Subtotal</dt>
            <dd>{formatINR(order.subtotal)}</dd>
            <dt>Discount{order.discount_type === 'percent' ? ` (${Number(order.discount_value)}%)` : ''}</dt>
            <dd>− {formatINR(order.discount_amount)}</dd>
            <dt className="grand">Total</dt>
            <dd className="grand">{formatINR(order.total_amount)}</dd>
          </dl>
        </aside>
      </div>
    </>
  )
}
