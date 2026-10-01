import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorBanner, Loader, Pagination } from '../components/ui'
import useDebounce from '../hooks/useDebounce'
import useList from '../hooks/useList'
import usePage from '../hooks/usePage'
import { formatDateTime, formatINR } from '../utils/format'

export default function Orders() {
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const debounced = useDebounce(search)
  const [page, setPage] = usePage({ debounced, dateFrom, dateTo })
  const { data, loading, error } = useList('/orders/', { search: debounced, date_from: dateFrom, date_to: dateTo, page })

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Order history</h1>
          <p className="page-subtitle">All orders with totals and who created them.</p>
        </div>
        <Link className="btn btn-primary" to="/orders/new">
          <Plus size={16} /> New order
        </Link>
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={16} />
            <input
              className="search"
              type="search"
              placeholder="Search customer, product or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="inline-label">
            From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="inline-label">
            To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
                  <th>Order #</th>
                  <th>Customer</th>
                  <th className="hide-md">Date</th>
                  <th className="num hide-sm">Items</th>
                  <th className="num hide-md">Discount</th>
                  <th className="num">Total</th>
                  <th className="hide-md">Created by</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/orders/${o.id}`} className="strong">
                        {o.order_number}
                      </Link>
                    </td>
                    <td>
                      {o.customer_name}
                      <div className="show-md muted small">{formatDateTime(o.created_at)}</div>
                    </td>
                    <td className="hide-md muted">{formatDateTime(o.created_at)}</td>
                    <td className="num hide-sm">{o.item_count}</td>
                    <td className="num hide-md">{Number(o.discount_amount) ? `− ${formatINR(o.discount_amount)}` : '—'}</td>
                    <td className="num strong">{formatINR(o.total_amount)}</td>
                    <td className="hide-md muted">{o.created_by_username || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No orders found" />
        )}
        <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onChange={setPage} />
      </div>
    </>
  )
}
