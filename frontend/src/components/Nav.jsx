import { useState, useEffect, useRef } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function CalendarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
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
/** Stroke icons for light dropdown — nav PNG/SVG assets are filled light for the dark bar */
function MessagesMenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 7.5 7.5 0 0 1 .9-3.8 8.38 8.38 0 0 1 3.8-3.8 8.5 8.5 0 0 1 7.6 0 8.38 8.38 0 0 1 3.8 3.8 7.5 7.5 0 0 1 .9 3.8z" />
    </svg>
  )
}
function ServicesMenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" />
      <path d="M3 9V7a2 2 0 0 1 1-1l7-3 7 3a2 2 0 0 1 1 1v2" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  )
}
function BellIcon({ size = 32, className, menuStyle }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 7-3 7h18s-3 0-3-7" />
      {menuStyle ? (
        <circle cx="12" cy="21" r="1.25" fill="currentColor" stroke="none" />
      ) : (
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      )}
    </svg>
  )
}
function ChevronDownIcon() {
  return (
    <svg className="nav-profile-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function LogOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function parseNotifData(data) {
  if (data == null) return {}
  if (typeof data === 'object' && !Array.isArray(data)) return data
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return {}
    }
  }
  return {}
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
  const location = useLocation()
  const isProvider = userProfile?.role === 'provider' || session?.user?.user_metadata?.role === 'provider'
  const avatarUrl = userProfile?.avatar_url
  const initials = (userProfile?.display_name || session?.user?.email || '?')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  // Notifications state
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifDropdown, setShowNotifDropdown] = useState(false)
  const notifRef = useRef(null)

  const [showProfileDropdown, setShowProfileDropdown] = useState(false)
  const profileRef = useRef(null)

  const profileMenuRouteActive =
    location.pathname.startsWith('/profile') ||
    location.pathname.startsWith('/discover') ||
    location.pathname.startsWith('/messages') ||
    location.pathname.startsWith('/appointments') ||
    (isProvider && location.pathname.startsWith('/services') && !location.pathname.startsWith('/services/all'))

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

  useEffect(() => {
    setShowProfileDropdown(false)
  }, [location.pathname])

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifDropdown(false)
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileDropdown(false)
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

  async function markNotificationRead(notificationId) {
    await supabase.from('notifications').update({ read: true }).eq('id', notificationId)
    setNotifications(prev => prev.map(n => (n.id === notificationId ? { ...n, read: true } : n)))
    setUnreadCount(c => Math.max(0, c - 1))
  }

  return (
    <nav className="nav nav-landing">
      <div className="nav-left">
        <Link to="/" className="nav-logo-wrap">
          <span className="nav-logo-tape" aria-hidden>
            <img src="/logo-tape.png" alt="" />
          </span>
          <span className="nav-logo-text">DORM2DOOR</span>
        </Link>
        <span className="nav-location">Austin, TX</span>
      </div>

      <div className="nav-right nav-right-stack">
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
                      notifications.map((n) => {
                        const data = parseNotifData(n.data)
                        const apptId = data.appointment_id
                        let cta = null
                        if (n.type === 'appointment_completed' && apptId) {
                          cta = (
                            <Link
                              to={`/appointments?review=${apptId}`}
                              className="notif-item-cta"
                              onClick={() => {
                                markNotificationRead(n.id)
                                setShowNotifDropdown(false)
                              }}
                            >
                              Leave a review
                            </Link>
                          )
                        } else if (n.type === 'customer_rated') {
                          cta = (
                            <Link
                              to="/profile"
                              className="notif-item-cta"
                              onClick={() => {
                                markNotificationRead(n.id)
                                setShowNotifDropdown(false)
                              }}
                            >
                              View your rating
                            </Link>
                          )
                        } else if (n.type === 'new_review' && session?.user?.id) {
                          cta = (
                            <Link
                              to={`/provider/${session.user.id}`}
                              className="notif-item-cta"
                              onClick={() => {
                                markNotificationRead(n.id)
                                setShowNotifDropdown(false)
                              }}
                            >
                              View on your listing
                            </Link>
                          )
                        }
                        return (
                          <div key={n.id} className={`notif-item${n.read ? '' : ' notif-unread'}`}>
                            <div className="notif-item-title">{n.title}</div>
                            <div className="notif-item-body">{n.body}</div>
                            {cta}
                            <div className="notif-item-time">{timeAgo(n.created_at)}</div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
        </div>

        <div className={`nav-profile-wrap${showProfileDropdown ? ' nav-profile-wrap-open' : ''}`} ref={profileRef}>
          <button
            type="button"
            className={`nav-stack-item nav-stack-item--profile${showProfileDropdown || profileMenuRouteActive ? ' active' : ''}`}
            aria-expanded={showProfileDropdown}
            aria-haspopup="menu"
            onClick={() => setShowProfileDropdown((p) => !p)}
          >
            <span className="nav-profile-avatar-wrap">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="nav-stack-avatar" />
              ) : (
                <span className="nav-stack-avatar nav-stack-avatar-initials">{initials}</span>
              )}
              <span className="nav-profile-chevron-fab" aria-hidden>
                <ChevronDownIcon />
              </span>
            </span>
            <span className="nav-profile-trigger-label">Profile</span>
          </button>

          {showProfileDropdown && (
            <div className="nav-profile-dropdown" role="menu">
              <NavLink
                to="/profile"
                role="menuitem"
                className={({ isActive }) =>
                  `nav-profile-dropdown-item nav-profile-dropdown-item--profile${isActive ? ' active' : ''}`
                }
                onClick={() => setShowProfileDropdown(false)}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="nav-profile-dropdown-avatar-lg" />
                ) : (
                  <span className="nav-profile-dropdown-avatar-lg nav-stack-avatar-initials">{initials}</span>
                )}
                <span className="nav-profile-dropdown-profile-text">
                  <span className="nav-profile-dropdown-name">{userProfile?.display_name || 'Your profile'}</span>
                  <span className="nav-profile-dropdown-sub">View profile</span>
                </span>
              </NavLink>
              <NavLink
                to="/discover"
                role="menuitem"
                className={({ isActive }) => `nav-profile-dropdown-item${isActive ? ' active' : ''}`}
                onClick={() => setShowProfileDropdown(false)}
              >
                <span className="nav-profile-dropdown-icon" aria-hidden>
                  <MapIcon />
                </span>
                Discover
              </NavLink>
              <NavLink
                to="/appointments"
                role="menuitem"
                className={({ isActive }) => `nav-profile-dropdown-item${isActive ? ' active' : ''}`}
                onClick={() => setShowProfileDropdown(false)}
              >
                <span className="nav-profile-dropdown-icon" aria-hidden>
                  <CalendarIcon />
                </span>
                Bookings
              </NavLink>
              <NavLink
                to="/messages"
                role="menuitem"
                className={({ isActive }) => `nav-profile-dropdown-item${isActive ? ' active' : ''}`}
                onClick={() => setShowProfileDropdown(false)}
              >
                <span className="nav-profile-dropdown-icon" aria-hidden>
                  <MessagesMenuIcon />
                </span>
                Messages
              </NavLink>
              {isProvider && (
                <NavLink
                  to="/services"
                  role="menuitem"
                  className={({ isActive }) => `nav-profile-dropdown-item${isActive ? ' active' : ''}`}
                  onClick={() => setShowProfileDropdown(false)}
                >
                  <span className="nav-profile-dropdown-icon" aria-hidden>
                    <ServicesMenuIcon />
                  </span>
                  Services
                </NavLink>
              )}
              <button
                type="button"
                role="menuitem"
                className="nav-profile-dropdown-item"
                onClick={() => {
                  setShowProfileDropdown(false)
                  setShowNotifDropdown(true)
                }}
              >
                <span className="nav-profile-dropdown-icon" aria-hidden>
                  <BellIcon size={22} menuStyle />
                </span>
                Notifications
              </button>
              <div className="nav-profile-dropdown-sep" role="presentation" />
              <button
                type="button"
                role="menuitem"
                className="nav-profile-dropdown-item nav-profile-dropdown-item--danger"
                onClick={() => {
                  setShowProfileDropdown(false)
                  supabase.auth.signOut()
                }}
              >
                <span className="nav-profile-dropdown-icon" aria-hidden>
                  <LogOutIcon />
                </span>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
