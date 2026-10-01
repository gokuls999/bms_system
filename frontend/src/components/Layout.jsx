import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  ShieldCheck,
  Users,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Customers', short: 'Customers', icon: UsersRound },
  { to: '/products', label: 'Products', short: 'Products', icon: Boxes },
  { to: '/orders/new', label: 'New Order', short: 'New', icon: PlusCircle },
  { to: '/orders', label: 'Order History', short: 'Orders', icon: ClipboardList, end: true },
  { to: '/users', label: 'Users', short: 'Users', icon: Users, adminOnly: true },
]

export default function Layout() {
  const { user, isAdmin, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const items = NAV.filter((item) => !item.adminOnly || isAdmin)
  const displayName = user?.first_name ? `${user.first_name} ${user.last_name}`.trim() : user?.username

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
          <span className="nav-section">Workspace</span>
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-link" onClick={() => setOpen(false)}>
              <Icon size={18} strokeWidth={2} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="avatar">{(displayName || '?')[0].toUpperCase()}</span>
            <span className="user-chip-text">
              <strong>{displayName}</strong>
              <small className={`role role-${user?.role}`}>
                {user?.role === 'admin' && <ShieldCheck size={11} />} {user?.role}
              </small>
            </span>
          </div>
          <button className="btn btn-ghost-dark btn-block" onClick={handleLogout}>
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen((v) => !v)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <span className="topbar-brand">
            <span className="brand-mark sm">B</span> BMS
          </span>
          <span className="avatar sm">{(displayName || '?')[0].toUpperCase()}</span>
        </header>
        <main className="content">
          <Outlet />
        </main>
        {/* Mobile bottom tab bar (app-style navigation) */}
        <nav className="tabbar" aria-label="Primary">
          {items
            .filter((i) => !i.adminOnly)
            .map(({ to, short, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className="tab">
                <Icon size={20} aria-hidden="true" />
                <span>{short}</span>
              </NavLink>
            ))}
        </nav>
      </div>
    </div>
  )
}
