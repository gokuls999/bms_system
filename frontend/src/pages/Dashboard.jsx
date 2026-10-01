import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  IndianRupee,
  PackagePlus,
  Plus,
  ShoppingCart,
  Trophy,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorBanner, Loader } from '../components/ui'
import { errorMessage, formatDate, formatDateTime, formatINR, formatINRCompact } from '../utils/format'

const initials = (name = '') =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** Percentage change of the last 7 days vs the 7 days before (from the 14-day trend). */
function weekChange(trend, key) {
  const sum = (arr) => arr.reduce((t, d) => t + Number(d[key]), 0)
  const prev = sum(trend.slice(0, 7))
  const curr = sum(trend.slice(7))
  if (!prev) return curr ? 100 : 0
  return ((curr - prev) / prev) * 100
}

function Trend({ value }) {
  if (value === null || Number.isNaN(value)) return null
  const up = value >= 0
  return (
    <span className={`trend-chip ${up ? 'is-up' : 'is-down'}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(value).toFixed(0)}%
    </span>
  )
}

function KpiCard({ label, value, sub, icon: Icon, tone = 'blue', trend = null, to }) {
  const body = (
    <>
      <div className="kpi-top">
        <span className={`kpi-icon tone-${tone}`}>
          <Icon size={18} />
        </span>
        <Trend value={trend} />
      </div>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </>
  )
  return to ? (
    <Link to={to} className="kpi-card">
      {body}
    </Link>
  ) : (
    <div className="kpi-card">{body}</div>
  )
}

/** Responsive SVG column chart with gridlines, axis labels and hover tooltip. */
function SalesChart({ data }) {
  const [hover, setHover] = useState(null)
  const wrapRef = useRef(null)
  const [W, setW] = useState(720)
  // Draw at the real pixel width so text never stretches (responsive without distortion).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = W < 480 ? 200 : 260
  const pad = { top: 16, right: 8, bottom: 28, left: W < 480 ? 44 : 56 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom
  const values = data.map((d) => Number(d.sales))
  const rawMax = Math.max(...values, 1)
  const step = 10 ** Math.floor(Math.log10(rawMax))
  const max = Math.ceil(rawMax / step) * step
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const slot = innerW / data.length
  const barW = Math.min(28, slot * 0.6)

  return (
    <div className="chart" ref={wrapRef}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily sales for the last 14 days">
        {ticks.map((t) => {
          const y = pad.top + innerH - (t / max) * innerH
          return (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} className="chart-grid" />
              <text x={pad.left - 8} y={y + 4} className="chart-axis" textAnchor="end">
                {formatINRCompact(t)}
              </text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const v = Number(d.sales)
          const h = (v / max) * innerH
          const x = pad.left + i * slot + (slot - barW) / 2
          const y = pad.top + innerH - h
          const isToday = i === data.length - 1
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.left + i * slot} y={pad.top} width={slot} height={innerH} fill="transparent" />
              <rect
                x={x}
                y={v ? y : pad.top + innerH - 2}
                width={barW}
                height={v ? h : 2}
                rx="4"
                className={`chart-bar ${hover === i ? 'is-hover' : ''} ${isToday ? 'is-today' : ''}`}
              />
              {(data.length <= 7 || i % (W < 480 ? 3 : 2) === (W < 480 ? 1 : 1)) && (
                <text x={pad.left + i * slot + slot / 2} y={H - 8} className="chart-axis" textAnchor="middle">
                  {new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tooltip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
          <strong>{formatINR(data[hover].sales)}</strong>
          <span>
            {formatDate(data[hover].date)} · {data[hover].orders} order{data[hover].orders === 1 ? '' : 's'}
          </span>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/dashboard/')
      .then(({ data }) => setData(data))
      .catch((err) => setError(errorMessage(err, 'Could not load dashboard.')))
  }, [])

  const stats = useMemo(() => {
    if (!data) return null
    const trend = data.sales_trend
    const periodSales = trend.reduce((t, d) => t + Number(d.sales), 0)
    const periodOrders = trend.reduce((t, d) => t + d.orders, 0)
    return {
      salesChange: weekChange(trend, 'sales'),
      ordersChange: weekChange(trend, 'orders'),
      periodSales,
      periodOrders,
      avgOrder: periodOrders ? periodSales / periodOrders : 0,
    }
  }, [data])

  if (error) return <ErrorBanner message={error} />
  if (!data) return <Loader />

  const name = user?.first_name || user?.username
  const topMax = Math.max(...data.top_products.map((p) => Number(p.revenue)), 1)

  return (
    <div className="dashboard">
      <div className="dash-hero">
        <div>
          <p className="dash-date">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1>
            {greeting()}, {name}
          </h1>
          <p className="page-subtitle">Here is what is happening with your business today.</p>
        </div>
        <div className="quick-actions">
          <Link to="/customers" className="btn btn-ghost">
            <UserPlus size={16} /> Customer
          </Link>
          <Link to="/products" className="btn btn-ghost">
            <PackagePlus size={16} /> Product
          </Link>
          <Link to="/orders/new" className="btn btn-primary">
            <Plus size={16} /> New order
          </Link>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Total sales"
          value={formatINRCompact(data.total_sales)}
          sub={formatINR(data.total_sales)}
          icon={IndianRupee}
          tone="green"
          trend={stats.salesChange}
          to="/orders"
        />
        <KpiCard
          label="Orders"
          value={data.total_orders}
          sub={`Avg. ${formatINR(stats.avgOrder)} per order`}
          icon={ShoppingCart}
          tone="blue"
          trend={stats.ordersChange}
          to="/orders"
        />
        <KpiCard
          label="Customers"
          value={data.total_customers}
          sub={`${data.active_customers} active`}
          icon={UsersRound}
          tone="violet"
          to="/customers"
        />
        <KpiCard label="Products" value={data.total_products} sub="In catalogue" icon={Boxes} tone="cyan" to="/products" />
        <KpiCard
          label="Low stock"
          value={data.low_stock_count}
          sub={`At or below ${data.low_stock_threshold} units`}
          icon={AlertTriangle}
          tone={data.low_stock_count ? 'amber' : 'green'}
          to="/products?low_stock=true"
        />
      </div>

      <div className="dash-row">
        <section className="card panel panel-wide">
          <div className="panel-head">
            <div>
              <h2>Sales overview</h2>
              <p className="muted small">Last 14 days</p>
            </div>
            <div className="panel-figures">
              <div>
                <span className="muted small">Revenue</span>
                <strong>{formatINR(stats.periodSales)}</strong>
              </div>
              <div>
                <span className="muted small">Orders</span>
                <strong>{stats.periodOrders}</strong>
              </div>
            </div>
          </div>
          <SalesChart data={data.sales_trend} />
        </section>

        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Top selling products</h2>
              <p className="muted small">By revenue, all time</p>
            </div>
            <Trophy size={18} className="panel-icon" />
          </div>
          {data.top_products.length ? (
            <ol className="rank-list">
              {data.top_products.map((p, i) => (
                <li key={p.product_id}>
                  <span className="rank">{i + 1}</span>
                  <div className="rank-body">
                    <div className="rank-line">
                      <strong>{p.product_name}</strong>
                      <span>{formatINR(p.revenue)}</span>
                    </div>
                    <div className="bar-track">
                      <span style={{ width: `${(Number(p.revenue) / topMax) * 100}%` }} />
                    </div>
                    <small className="muted">
                      {p.quantity} sold · <span className="mono">{p.sku}</span>
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="No sales yet" />
          )}
        </section>
      </div>

      <div className="dash-row">
        <section className="card panel panel-wide">
          <div className="panel-head">
            <div>
              <h2>Recent orders</h2>
              <p className="muted small">Latest 5 orders</p>
            </div>
            <Link to="/orders" className="panel-link">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {data.recent_orders.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th className="hide-sm">Date</th>
                    <th className="num hide-sm">Items</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_orders.map((o) => (
                    <tr key={o.id} className="row-link" onClick={() => navigate(`/orders/${o.id}`)}>
                      <td>
                        <span className="order-no">{o.order_number}</span>
                      </td>
                      <td>
                        <div className="cell-person">
                          <span className="avatar-sm">{initials(o.customer_name)}</span>
                          <span className="cell-person-text">
                            <strong>{o.customer_name}</strong>
                            <small className="show-sm muted">{formatDate(o.created_at)}</small>
                          </span>
                        </div>
                      </td>
                      <td className="hide-sm muted">{formatDateTime(o.created_at)}</td>
                      <td className="num hide-sm">{o.item_count}</td>
                      <td className="num strong">{formatINR(o.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No orders yet" />
          )}
        </section>

        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Low stock alerts</h2>
              <p className="muted small">{data.low_stock_count} product(s) need restocking</p>
            </div>
            <Link to="/products?low_stock=true" className="panel-link">
              View <ArrowRight size={14} />
            </Link>
          </div>
          {data.low_stock_products.length ? (
            <ul className="stock-alerts">
              {data.low_stock_products.slice(0, 6).map((p) => {
                const pct = Math.min(100, (p.stock_quantity / Math.max(data.low_stock_threshold, 1)) * 100)
                const level = p.stock_quantity === 0 ? 'out' : pct <= 40 ? 'critical' : 'low'
                return (
                  <li key={p.id}>
                    <div className="rank-line">
                      <strong>{p.name}</strong>
                      <span className={`stock-tag tag-${level}`}>
                        {p.stock_quantity === 0 ? 'Out of stock' : `${p.stock_quantity} left`}
                      </span>
                    </div>
                    <div className={`bar-track level-${level}`}>
                      <span style={{ width: `${Math.max(pct, 3)}%` }} />
                    </div>
                    <small className="muted">
                      <span className="mono">{p.sku}</span> · {p.category_name}
                    </small>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState title="All products are well stocked" />
          )}
        </section>
      </div>
    </div>
  )
}
