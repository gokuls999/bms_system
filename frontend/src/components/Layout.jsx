import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/customers', label: 'Customers', icon: '☺' },
  { to: '/products', label: 'Products', icon: '▣' },
  { to: '/orders/new', label: 'New Order', icon: '+' },
  { to: '/orders', label: 'Order History', icon: '≡', end: true },
  { to: '/users', label: 'Users', icon: '⚙', adminOnly: true },
]

export default function Layout() {
  const { user, isAdmin, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">B</span>
          <span>
            BMS<small>Business Manager</small>
          </span>
        </div>
        <nav>
          {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-link" onClick={() => setOpen(false)}>
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="avatar">{(user?.first_name || user?.username || '?')[0].toUpperCase()}</span>
            <span>
              <strong>{user?.first_name ? `${user.first_name} ${user.last_name}` : user?.username}</strong>
              <small className={`role role-${user?.role}`}>{user?.role}</small>
            </span>
          </div>
          <button className="btn btn-ghost btn-block" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation">
            ☰
          </button>
          <span className="topbar-title">Mini Business Management System</span>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
