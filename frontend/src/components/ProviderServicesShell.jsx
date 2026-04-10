import { NavLink } from 'react-router-dom'

const FIGMA_BG = '#E7E4DF'

function HomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

/**
 * Shared chrome for provider dashboard: overview (/services), edit services (/my-services).
 */
export default function ProviderServicesShell({ children, whiteMain }) {
  return (
    <div
      className={`services-page${whiteMain ? ' services-page--white-main' : ''}`}
      style={{ background: FIGMA_BG, minHeight: '100vh' }}
    >
      <aside className="services-sidebar">
        <nav className="services-sidebar-nav">
          <NavLink to="/services" end className={({ isActive }) => `services-sidebar-item${isActive ? ' active' : ''}`}>
            <HomeIcon />
            <span>Overview</span>
          </NavLink>
          <NavLink to="/my-services" className={({ isActive }) => `services-sidebar-item${isActive ? ' active' : ''}`}>
            <CartIcon />
            <span>Edit services</span>
          </NavLink>
        </nav>
      </aside>
      <main className="services-main">{children}</main>
    </div>
  )
}
