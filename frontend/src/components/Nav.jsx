import { Link, NavLink } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Nav({ session, userProfile }) {
  const name     = userProfile?.display_name || session?.user?.email || ''
  const initials = name
    ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <nav className="nav">
      <Link to="/" className="nav-logo">
        <span>Dorm</span>2Door
      </Link>

      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          Browse
        </NavLink>
        <NavLink to="/appointments" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          Appointments
        </NavLink>
        <NavLink to="/my-services" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          My Services
        </NavLink>
      </div>

      <div className="nav-right">
        <div className="avatar" title={session?.user?.email}>{initials}</div>
        <button
          className="btn btn-ghost nav-ghost btn-sm"
          onClick={() => supabase.auth.signOut()}
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
