import { Link, NavLink } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function StorefrontIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}
function BellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
function ProfileIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export default function Nav({ session, userProfile }) {
  const avatarUrl = userProfile?.avatar_url
  const initials = (userProfile?.display_name || session?.user?.email || '?')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <nav className="nav nav-landing">
      <div className="nav-left">
        <Link to="/" className="nav-logo-wrap">
          <span className="nav-logo-tape" aria-hidden>
            <img src="/logo-tape.png" alt="" />
          </span>
          <span className="nav-logo-text">DORM2Door</span>
        </Link>
        <span className="nav-location">Austin, TX</span>
      </div>

      <div className="nav-right nav-right-stack">
        <NavLink to="/" end className={({ isActive }) => `nav-stack-item${isActive ? ' active' : ''}`}>
          <StorefrontIcon />
          <span>Marketplace</span>
        </NavLink>
        <Link to="/" className="nav-stack-item" title="Coming soon">
          <BellIcon />
          <span>Notifications</span>
        </Link>
        <NavLink to="/profile" className={({ isActive }) => `nav-stack-item${isActive ? ' active' : ''}`}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="nav-stack-avatar" />
          ) : (
            <span className="nav-stack-avatar nav-stack-avatar-initials">{initials}</span>
          )}
          <span>Profile</span>
        </NavLink>
        <button
          type="button"
          className="nav-signout"
          onClick={() => supabase.auth.signOut()}
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
