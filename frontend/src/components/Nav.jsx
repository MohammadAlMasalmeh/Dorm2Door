import { useState, useEffect, useRef } from 'react'
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
function MapIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
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
function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function Nav({ session, userProfile }) {
  const avatarUrl = userProfile?.avatar_url
  const initials = (userProfile?.display_name || session?.user?.email || '?')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  // Notifications state
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifDropdown, setShowNotifDropdown] = useState(false)
  const notifRef = useRef(null)

  // Fetch notifications and subscribe to realtime
  useEffect(() => {
    if (!session?.user?.id) return

    supabase
      .from('notifications')
      .select('id, type, title, body, data, read, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setNotifications(data || [])
        setUnreadCount((data || []).filter(n => !n.read).length)
      })

    const channel = supabase
      .channel('nav-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev].slice(0, 20))
        setUnreadCount(prev => prev + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function markAllRead() {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', unreadIds)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

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
        <NavLink to="/appointments" end className={({ isActive }) => `nav-stack-item${isActive ? ' active' : ''}`}>
          <StorefrontIcon />
          <span>Marketplace</span>
        </NavLink>

        <NavLink to="/discover" className={({ isActive }) => `nav-stack-item${isActive ? ' active' : ''}`}>
          <MapIcon />
          <span>Discover</span>
        </NavLink>

        <NavLink to="/messages" className={({ isActive }) => `nav-stack-item${isActive ? ' active' : ''}`}>
          <ChatIcon />
          <span>Messages</span>
        </NavLink>

        {/* Notifications bell with dropdown */}
        <div className="nav-notif-wrap" ref={notifRef}>
          <button
            type="button"
            className={`nav-stack-item${showNotifDropdown ? ' active' : ''}`}
            onClick={() => setShowNotifDropdown(prev => !prev)}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <BellIcon />
              {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </span>
            <span>Notifications</span>
          </button>

          {showNotifDropdown && (
            <div className="notif-dropdown">
              <div className="notif-dropdown-header">
                <h3>Notifications</h3>
                {unreadCount > 0 && (
                  <button type="button" onClick={markAllRead} className="notif-mark-read">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="notif-dropdown-list">
                {notifications.length === 0 ? (
                  <p className="notif-empty">No notifications yet.</p>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className={`notif-item${n.read ? '' : ' notif-unread'}`}>
                      <div className="notif-item-title">{n.title}</div>
                      <div className="notif-item-body">{n.body}</div>
                      <div className="notif-item-time">{timeAgo(n.created_at)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

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
