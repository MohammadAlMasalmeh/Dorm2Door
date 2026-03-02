import { useState, useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const FIGMA = {
  bg: '#E8EFE9',
  dark: '#3E4E47',
  white: '#F4F7F4',
  accent: '#C67C4E',
  text: '#212121',
}

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
function StatsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
function PinIcon() {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 0C3.13 0 0 3.13 0 7c0 5.25 7 13 7 13s7-7.75 7-13C14 3.13 10.87 0 7 0z" />
      <circle cx="7" cy="7" r="2.5" />
    </svg>
  )
}
function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

export default function Services({ session, userProfile }) {
  const isProvider = userProfile?.role === 'provider' || session?.user?.user_metadata?.role === 'provider'
  const [upcoming, setUpcoming] = useState([])
  const [pending, setPending] = useState([])
  const [myServices, setMyServices] = useState([])
  const [stats, setStats] = useState({ servicesProvided: 0, revenue: 0 })
  const [loading, setLoading] = useState(true)
  const [consumerNames, setConsumerNames] = useState({})

  useEffect(() => {
    if (!session?.user?.id) { setLoading(false); return }
    const uid = session.user.id

    if (isProvider) {
      const now = new Date().toISOString()
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      const weekAgoIso = weekAgo.toISOString()

      Promise.all([
        supabase
          .from('appointments')
          .select('id, scheduled_at, status, consumer_id, providers (location), services (name, price), service_options (name, price)')
          .eq('provider_id', uid)
          .order('scheduled_at', { ascending: true }),
        supabase
          .from('services')
          .select('id, name, image_url, service_options (id, name, price)')
          .eq('provider_id', uid),
        supabase
          .from('appointments')
          .select('id, status, services (price), service_options (price)')
          .eq('provider_id', uid)
          .gte('scheduled_at', weekAgoIso)
          .in('status', ['confirmed', 'completed']),
      ]).then(([apptRes, svcRes, statsRes]) => {
        const list = apptRes.data || []
        const up = list.filter(a => ['pending', 'confirmed'].includes(a.status) && a.scheduled_at >= now)
        const pend = list.filter(a => a.status === 'pending')
        setUpcoming(up)
        setPending(pend)

        setMyServices(svcRes.data || [])

        const statsList = statsRes.data || []
        let revenue = 0
        statsList.forEach(a => {
          const p = a.service_options?.price != null ? a.service_options.price : a.services?.price
          if (p != null) revenue += Number(p)
        })
        setStats({ servicesProvided: statsList.length, revenue })

        setLoading(false)
      })
    } else {
      setMyServices([])
      setLoading(false)
    }
  }, [session?.user?.id, isProvider])

  useEffect(() => {
    const ids = [...upcoming, ...pending].map(a => a.consumer_id).filter(Boolean)
    if (ids.length === 0) return
    const uniqueIds = [...new Set(ids)]
    supabase.from('users').select('id, display_name, avatar_url').in('id', uniqueIds).then(({ data }) => {
      const map = {}
      ;(data || []).forEach(u => { map[u.id] = u })
      setConsumerNames(map)
    })
  }, [upcoming, pending])

  const consumerName = (appt) => appt?.consumer_id ? (consumerNames[appt.consumer_id]?.display_name || 'Customer') : 'Customer'
  const consumerAvatar = (appt) => appt?.consumer_id ? consumerNames[appt.consumer_id]?.avatar_url : null

  return (
    <div className="services-page" style={{ background: FIGMA.bg, minHeight: '100vh' }}>
      <aside className="services-sidebar">
        <nav className="services-sidebar-nav">
          <NavLink to="/services" end className={({ isActive }) => `services-sidebar-item${isActive ? ' active' : ''}`}>
            <HomeIcon />
            <span>Overview</span>
          </NavLink>
          <NavLink to="/my-services" end className={({ isActive }) => `services-sidebar-item${isActive ? ' active' : ''}`}>
            <CartIcon />
            <span>Services</span>
          </NavLink>
          <Link to="/services#stats" className="services-sidebar-item">
            <StatsIcon />
            <span>Stats</span>
          </Link>
          <Link to="/my-services#availability" className="services-sidebar-item">
            <CalendarIcon />
            <span>Availability</span>
          </Link>
        </nav>
        <Link to="/my-services?add=1" className="services-add-btn">
          <PlusIcon />
          <span>Add Service</span>
        </Link>
      </aside>

      <main className="services-main">
        <h1 className="services-title">Appointments</h1>

        <div className="services-appointments-grid">
          <div className="services-panel" style={{ background: FIGMA.dark }}>
            <h2 className="services-panel-title">Upcoming</h2>
            <div className="services-panel-cards">
              {loading && <p className="services-panel-empty">Loading…</p>}
              {!loading && upcoming.length === 0 && <p className="services-panel-empty">No upcoming appointments</p>}
              {!loading && upcoming.slice(0, 3).map(appt => {
                const d = new Date(appt.scheduled_at)
                const dateStr = d.toLocaleString([], { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                const name = consumerName(appt)
                const avatar = consumerAvatar(appt)
                const serviceName = appt.service_options
                  ? `${appt.services?.name || ''} · ${appt.service_options.name}`.trim() || 'Service'
                  : (appt.services?.name || 'Service')
                const price = (appt.service_options?.price != null ? appt.service_options.price : appt.services?.price) != null
                  ? `$${Number(appt.service_options?.price ?? appt.services?.price).toFixed(0)}`
                  : ''
                return (
                  <div key={appt.id} className="services-appt-card">
                    <div className="services-appt-row">
                      <span className="services-appt-service">{serviceName}</span>
                      {price && <span className="services-appt-price">{price}</span>}
                    </div>
                    <div className="services-appt-meta">
                      {avatar ? <img src={avatar} alt="" className="services-appt-avatar" /> : <span className="services-appt-avatar services-appt-avatar-initials">{(name || '?')[0]}</span>}
                      <span>{name}</span>
                    </div>
                    <div className="services-appt-meta">
                      <ClockIcon />
                      <span>{dateStr}</span>
                    </div>
                    <div className="services-appt-meta">
                      <PinIcon />
                      <span>{appt.providers?.location?.trim() || 'TBD'}</span>
                    </div>
                    <Link to="/appointments" className="services-appt-btn-outline">Cancel Appointment</Link>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="services-panel" style={{ background: FIGMA.dark }}>
            <h2 className="services-panel-title">Pending</h2>
            <div className="services-panel-cards">
              {!loading && pending.length === 0 && <p className="services-panel-empty">No pending requests</p>}
              {!loading && pending.slice(0, 3).map(appt => {
                const d = new Date(appt.scheduled_at)
                const dateStr = d.toLocaleString([], { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                const name = consumerName(appt)
                const avatar = consumerAvatar(appt)
                const serviceName = appt.service_options
                  ? `${appt.services?.name || ''} · ${appt.service_options.name}`.trim() || 'Service'
                  : (appt.services?.name || 'Service')
                const price = (appt.service_options?.price != null ? appt.service_options.price : appt.services?.price) != null
                  ? `$${Number(appt.service_options?.price ?? appt.services?.price).toFixed(0)}`
                  : ''
                return (
                  <div key={appt.id} className="services-appt-card">
                    <div className="services-appt-row">
                      <span className="services-appt-service">{serviceName}</span>
                      {price && <span className="services-appt-price">{price}</span>}
                    </div>
                    <div className="services-appt-meta">
                      {avatar ? <img src={avatar} alt="" className="services-appt-avatar" /> : <span className="services-appt-avatar services-appt-avatar-initials">{(name || '?')[0]}</span>}
                      <span>{name}</span>
                    </div>
                    <div className="services-appt-meta">
                      <ClockIcon />
                      <span>{dateStr}</span>
                    </div>
                    <div className="services-appt-meta">
                      <PinIcon />
                      <span>{appt.providers?.location?.trim() || 'TBD'}</span>
                    </div>
                    <div className="services-appt-actions">
                      <button type="button" className="services-appt-btn-outline">Accept</button>
                      <button type="button" className="services-appt-btn-outline">Decline</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <h1 className="services-title services-title-spaced">Weekly Stats</h1>
        <div id="stats" className="services-stats-row">
          <div className="services-stat-card" style={{ background: FIGMA.dark }}>
            <p className="services-stat-label">Services Provided</p>
            <p className="services-stat-value">{stats.servicesProvided}</p>
            <p className="services-stat-date">15 Feb 2026 - 22 Feb 2026</p>
          </div>
          <div className="services-stat-card" style={{ background: FIGMA.dark }}>
            <p className="services-stat-label">Revenue</p>
            <p className="services-stat-value">${stats.revenue}</p>
            <p className="services-stat-date">15 Feb 2026 - 22 Feb 2026</p>
          </div>
          <div className="services-stat-card" style={{ background: FIGMA.dark }}>
            <p className="services-stat-label">Bookings</p>
            <p className="services-stat-value">{pending.length}</p>
            <p className="services-stat-date">15 Feb 2026 - 22 Feb 2026</p>
          </div>
        </div>

        <h2 className="services-section-title">Your Services</h2>
        <div className="services-your-list">
          {!isProvider && (
            <p className="services-empty-msg">You’re not a provider yet. <Link to="/my-services">Add a service</Link> to start earning.</p>
          )}
          {isProvider && myServices.length === 0 && !loading && (
            <p className="services-empty-msg">No services yet. <Link to="/my-services">Add your first service</Link>.</p>
          )}
          {isProvider && myServices.map(svc => (
            <div key={svc.id} className="services-your-card" style={{ position: 'relative' }}>
              <Link to={`/provider/${session?.user?.id}`} style={{ display: 'contents' }}>
                <div
                  className="services-your-card-img"
                  style={svc.image_url ? { backgroundImage: `url(${svc.image_url})` } : {}}
                >
                  {!svc.image_url && <span>{(svc.name || 'S')[0]}</span>}
                </div>
                <div className="services-your-card-body">
                  <p className="services-your-card-name">{svc.name}</p>
                  {(svc.service_options && svc.service_options.length) > 0 && (
                    <p className="services-your-card-options">
                      {(svc.service_options || []).map(opt => `${opt.name} $${Number(opt.price).toFixed(0)}`).join(' · ')}
                    </p>
                  )}
                  <div className="services-your-card-meta">
                    <span className="services-your-card-avatar" />
                    <span>{userProfile?.display_name || 'You'}</span>
                  </div>
                  <div className="services-your-card-rating">
                    <StarIcon />
                    <span>4.8 (10)</span>
                  </div>
                </div>
              </Link>
              <Link
                to={`/my-services?edit=${svc.id}`}
                className="services-your-card-edit"
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'rgba(255,255,255,0.9)', color: FIGMA.dark,
                  padding: '4px 12px', borderRadius: 6, fontSize: '0.8rem',
                  fontWeight: 600, textDecoration: 'none',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }}
                onClick={e => e.stopPropagation()}
              >
                Edit
              </Link>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
