import { AlertTriangle, IndianRupee, Package, Plus, ShoppingCart, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { EmptyState, ErrorBanner, Loader } from '../components/ui'
import { errorMessage, formatDate, formatDateTime, formatINR, formatINRCompact } from '../utils/format'

function StatCard({ label, value, sub, tone, icon: Icon }) {
  return (
    <div className={`stat-card ${tone ? `stat-${tone}` : ''}`}>
      {Icon && (
        <span className="stat-icon">
          <Icon size={18} />
        </span>
      )}
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

function SalesTrend({ data }) {
  const max = Math.max(...data.map((d) => Number(d.sales)), 1)
  return (
    <div className="trend" role="img" aria-label="Daily sales for the last 14 days">
      {data.map((d) => (
        <div key={d.date} className="trend-col" title={`${formatDate(d.date)}: ${formatINR(d.sales)} (${d.orders} orders)`}>
          <div className="trend-bar" style={{ height: `${(Number(d.sales) / max) * 100}%` }} />
          <span className="trend-label">{new Date(d.date).getDate()}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/dashboard/')
      .then(({ data }) => setData(data))
      .catch((err) => setError(errorMessage(err, 'Could not load dashboard.')))
  }, [])

  if (error) return <ErrorBanner message={error} />
  if (!data) return <Loader />

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">Overview of customers, stock and sales.</p>
        </div>
        <Link className="btn btn-primary" to="/orders/new">
          <Plus size={16} /> New order
        </Link>
      </div>

      <div className="stats">
        <StatCard icon={UsersRound} label="Customers" value={data.total_customers} sub={`${data.active_customers} active`} />
        <StatCard icon={Package} label="Products" value={data.total_products} />
        <StatCard
          icon={AlertTriangle}
          label="Low stock"
          value={data.low_stock_count}
          sub={`≤ ${data.low_stock_threshold} units`}
          tone={data.low_stock_count ? 'warn' : undefined}
        />
        <StatCard icon={ShoppingCart} label="Orders" value={data.total_orders} />
        <StatCard icon={IndianRupee} label="Total sales" value={formatINRCompact(data.total_sales)} sub={formatINR(data.total_sales)} tone="accent" />
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="card-header">
            <h2>Recent orders</h2>
            <Link to="/orders">View all</Link>
          </div>
          {data.recent_orders.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th className="hide-sm">Date</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/orders/${o.id}`}>{o.order_number}</Link>
                      </td>
                      <td>{o.customer_name}</td>
                      <td className="hide-sm muted">{formatDateTime(o.created_at)}</td>
                      <td className="num">{formatINR(o.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No orders yet" />
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Low-stock products</h2>
            <Link to="/products?low_stock=true">View all</Link>
          </div>
          {data.low_stock_products.length ? (
            <ul className="stock-list">
              {data.low_stock_products.map((p) => (
                <li key={p.id}>
                  <span>
                    {p.name}
                    <small className="muted"> · {p.sku}</small>
                  </span>
                  <span className={`qty ${p.stock_quantity === 0 ? 'qty-out' : 'qty-low'}`}>
                    {p.stock_quantity === 0 ? 'Out of stock' : `${p.stock_quantity} left`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="All products are well stocked" />
          )}
        </section>

        <section className="card span-2">
          <div className="card-header">
            <h2>Sales · last 14 days</h2>
          </div>
          <SalesTrend data={data.sales_trend} />
        </section>
      </div>
    </>
  )
}
