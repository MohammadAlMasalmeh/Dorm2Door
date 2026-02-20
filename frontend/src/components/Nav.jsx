import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Nav({ session, userProfile }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState(searchParams.get('q') || '')

  useEffect(() => {
    setSearch(searchParams.get('q') || '')
  }, [searchParams])

  const name     = userProfile?.display_name || session?.user?.email || ''
  const initials = name
    ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'
  const avatarUrl = userProfile?.avatar_url

  function handleSearchSubmit(e) {
    e.preventDefault()
    if (search.trim()) navigate(`/?q=${encodeURIComponent(search.trim())}`)
    else navigate('/')
  }

  return (
    <nav className="nav">
      <Link to="/" className="nav-logo">
        <span>Dorm</span>2Door
      </Link>

      <form className="nav-search-wrap has-icon" onSubmit={handleSearchSubmit}>
        <span className="nav-search-icon" aria-hidden>🔍</span>
        <input
          type="search"
          className="nav-search"
          placeholder="Search providers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search providers"
        />
      </form>

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
        <NavLink to="/profile" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          Profile
        </NavLink>
      </div>

      <div className="nav-right">
        <Link to="/profile" className="nav-avatar-link" title={session?.user?.email}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="avatar avatar-img" />
          ) : (
            <div className="avatar">{initials}</div>
          )}
        </Link>
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
