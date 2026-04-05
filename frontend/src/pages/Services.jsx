import { useState, useEffect, useCallback } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const FIGMA = {
  bg: '#E7E4DF',
  dark: '#3E4E47',
  white: '#F4F7F4',
  accent: '#CC6D00',
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
function PencilIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

function formatWeekRangeLabel() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 7)
  const o = { day: 'numeric', month: 'short', year: 'numeric' }
  return `${start.toLocaleDateString('en-GB', o)} - ${end.toLocaleDateString('en-GB', o)}`
}

function serviceLine(appt) {
  if (appt.service_options) {
    const base = appt.services?.name || ''
    const opt = appt.service_options.name || ''
    return `${base} · ${opt}`.trim() || 'Service'
  }
  return appt.services?.name || 'Service'
}

function priceStr(appt) {
  const p = appt.service_options?.price != null ? appt.service_options.price : appt.services?.price
  if (p == null) return ''
  return `$${Number(p).toFixed(0)}`
}

function normalizeApptStatus(a) {
  const s = a?.status
  if (s == null || s === '') return ''
  return String(s).trim().toLowerCase()
}

export default function Services({ session, userProfile }) {
  const isProvider = userProfile?.role === 'provider' || session?.user?.user_metadata?.role === 'provider'
  const [upcoming, setUpcoming] = useState([])
  const [pending, setPending] = useState([])
  const [myServices, setMyServices] = useState([])
  const [stats, setStats] = useState({ servicesProvided: 0, revenue: 0 })
  const [avgReview, setAvgReview] = useState(null)
  const [serviceMetrics, setServiceMetrics] = useState({})
  const [serviceRatings, setServiceRatings] = useState({})
  const [serviceReviewCounts, setServiceReviewCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [consumerNames, setConsumerNames] = useState({})
  const [apptTab, setApptTab] = useState('upcoming')
  const [actionError, setActionError] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const [weekLabel] = useState(() => formatWeekRangeLabel())
  const [myLocation, setMyLocation] = useState('')

  const loadDashboard = useCallback(async () => {
    if (!session?.user?.id || !isProvider) {
      setLoading(false)
      return
    }
    const uid = session.user.id
    const now = new Date().toISOString()
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekAgoIso = weekAgo.toISOString()

    const [
      apptRes,
      svcRes,
      statsRes,
      providerRes,
      completedRes,
      reviewsListRes,
    ] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, scheduled_at, status, consumer_id, services (name, price), service_options (name, price)')
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
      supabase.from('providers').select('avg_rating, review_count, location').eq('id', uid).maybeSingle(),
      supabase
        .from('appointments')
        .select('id, service_id, service_options (price), services (price)')
        .eq('provider_id', uid)
        .eq('status', 'completed'),
      supabase.from('reviews').select('rating, appointment_id').eq('provider_id', uid),
    ])

    setActionError('')
    if (apptRes.error) {
      setActionError(apptRes.error.message || 'Could not load appointments')
      setUpcoming([])
      setPending([])
    } else {
      const list = apptRes.data || []
      const pend = list.filter((a) => normalizeApptStatus(a) === 'pending')
      const up = list.filter(
        (a) => normalizeApptStatus(a) === 'confirmed' && a.scheduled_at >= now
      )
      setPending(pend)
      setUpcoming(up)
    }

    setMyServices(svcRes.data || [])

    const statsList = statsRes.data || []
    let revenue = 0
    statsList.forEach((a) => {
      const p = a.service_options?.price != null ? a.service_options.price : a.services?.price
      if (p != null) revenue += Number(p)
    })
    setStats({ servicesProvided: statsList.length, revenue })

    const pr = providerRes.data
    setMyLocation((pr?.location || '').trim())
    const ar = pr?.avg_rating
    setAvgReview(ar != null && Number(ar) > 0 ? Number(ar) : null)

    const metrics = {}
    ;(completedRes.data || []).forEach((a) => {
      const sid = a.service_id
      if (!sid) return
      if (!metrics[sid]) metrics[sid] = { revenue: 0, count: 0 }
      metrics[sid].count += 1
      const p = a.service_options?.price != null ? a.service_options.price : a.services?.price
      if (p != null) metrics[sid].revenue += Number(p)
    })
    setServiceMetrics(metrics)

    const revRows = reviewsListRes.data || []
    const apptIds = [...new Set(revRows.map((r) => r.appointment_id).filter(Boolean))]
    const apptToService = {}
    if (apptIds.length) {
      const { data: apRows } = await supabase.from('appointments').select('id, service_id').in('id', apptIds)
      ;(apRows || []).forEach((a) => { apptToService[a.id] = a.service_id })
    }
    const ratings = {}
    const reviewCounts = {}
    revRows.forEach((r) => {
      const sid = apptToService[r.appointment_id]
      if (!sid) return
      if (!ratings[sid]) ratings[sid] = []
      ratings[sid].push(Number(r.rating))
      reviewCounts[sid] = (reviewCounts[sid] || 0) + 1
    })
    const avgByService = {}
    Object.keys(ratings).forEach((sid) => {
      const arr = ratings[sid]
      avgByService[sid] = arr.reduce((s, x) => s + x, 0) / arr.length
    })
    setServiceRatings(avgByService)
    setServiceReviewCounts(reviewCounts)

    setLoading(false)
  }, [session?.user?.id, isProvider])

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    void loadDashboard()
  }, [session?.user?.id, loadDashboard])

  useEffect(() => {
    const ids = [...upcoming, ...pending].map((a) => a.consumer_id).filter(Boolean)
    if (ids.length === 0) return
    const uniqueIds = [...new Set(ids)]
    supabase.from('users').select('id, display_name, avatar_url').in('id', uniqueIds).then(({ data }) => {
      const map = {}
      ;(data || []).forEach((u) => { map[u.id] = u })
      setConsumerNames(map)
    })
  }, [upcoming, pending])

  async function updateAppointmentStatus(id, status) {
    if (!session?.user?.id) return
    setUpdatingId(id)
    setActionError('')
    const { error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .eq('provider_id', session.user.id)
    setUpdatingId(null)
    if (error) {
      setActionError(error.message || 'Something went wrong. Try again.')
      return
    }
    await loadDashboard()
  }

  const consumerName = (appt) => appt?.consumer_id ? (consumerNames[appt.consumer_id]?.display_name || 'Customer') : 'Customer'
  const consumerAvatar = (appt) => appt?.consumer_id ? consumerNames[appt.consumer_id]?.avatar_url : null

  function AppointmentFigmaCard({ appt, mode }) {
    const d = new Date(appt.scheduled_at)
    const dateShort = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    const timeShort = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const name = consumerName(appt)
    const avatar = consumerAvatar(appt)
    const title = serviceLine(appt)
    const price = priceStr(appt)
    const loc = myLocation || 'TBD'
    const busy = updatingId === appt.id

    return (
      <div className="services-appt-figma-card">
        <div className="services-appt-figma-head">
          <span className="services-appt-figma-title">{title}</span>
          <span className="services-appt-figma-date">{dateShort}</span>
        </div>
        {price ? <p className="services-appt-figma-price">{price}</p> : null}
        <div className="services-appt-figma-meta-row">
          <div className="services-appt-figma-meta">
            <PinIcon />
            <span>{loc}</span>
          </div>
          <div className="services-appt-figma-meta">
            <ClockIcon />
            <span>{timeShort}</span>
          </div>
        </div>
        <div className="services-appt-figma-customer">
          {avatar ? <img src={avatar} alt="" className="services-appt-figma-avatar" /> : <span className="services-appt-figma-avatar services-appt-figma-avatar-placeholder">{(name || '?')[0]}</span>}
          <span>{name}</span>
        </div>
        {mode === 'upcoming' && (
          <div className="services-appt-figma-actions">
            <Link to="/appointments" className="services-appt-figma-btn-solid">
              More Details
            </Link>
          </div>
        )}
        {mode === 'pending' && (
          <div className="services-appt-figma-pending-actions">
            <button
              type="button"
              className="services-appt-figma-btn-solid"
              disabled={busy}
              onClick={() => updateAppointmentStatus(appt.id, 'confirmed')}
            >
              Accept
            </button>
            <button
              type="button"
              className="services-appt-figma-btn-outline"
              disabled={busy}
              onClick={() => updateAppointmentStatus(appt.id, 'cancelled')}
            >
              Decline
            </button>
          </div>
        )}
      </div>
    )
  }

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
        <section id="stats" className="services-section services-section-stats">
          <h1 className="services-heading">Weekly Stats</h1>
          <div className="services-stats-row">
            <div className="services-stat-card services-stat-card-bordered">
              <p className="services-stat-label-dark">Revenue</p>
              <p className="services-stat-value-dark">${stats.revenue.toFixed(2)}</p>
              <p className="services-stat-date-dark">{weekLabel}</p>
            </div>
            <div className="services-stat-card services-stat-card-bordered">
              <p className="services-stat-label-dark">Services Provided</p>
              <p className="services-stat-value-dark">{stats.servicesProvided}</p>
              <p className="services-stat-date-dark">{weekLabel}</p>
            </div>
            <div className="services-stat-card services-stat-card-bordered">
              <p className="services-stat-label-dark">Average Review</p>
              <p className="services-stat-value-dark">{avgReview != null ? avgReview.toFixed(1) : '—'}</p>
              <p className="services-stat-date-dark">{weekLabel}</p>
            </div>
          </div>
        </section>

        <section className="services-section services-section-appointments">
          <h1 className="services-heading">Appointments</h1>
          <p
            className="services-dashboard-hint"
            style={{ fontSize: 15, color: FIGMA.text, opacity: 0.75, margin: '0 0 12px', maxWidth: 640 }}
          >
            Accept requests in <strong>Pending</strong> or on{' '}
            <Link to="/appointments" style={{ color: FIGMA.dark, fontWeight: 600 }}>Bookings</Link>
            . Mark visits complete there so customers can leave reviews.
          </p>
          {actionError ? <p className="services-action-error" role="alert">{actionError}</p> : null}
          <div className="services-appt-tabs">
            <button
              type="button"
              className={`services-appt-tab${apptTab === 'upcoming' ? ' services-appt-tab-active' : ''}`}
              onClick={() => setApptTab('upcoming')}
            >
              Upcoming
            </button>
            <button
              type="button"
              className={`services-appt-tab${apptTab === 'pending' ? ' services-appt-tab-active' : ''}`}
              onClick={() => setApptTab('pending')}
            >
              Pending
            </button>
          </div>

          <div className="services-appt-cards-row">
            {loading && <p className="services-panel-empty-dark">Loading…</p>}
            {!loading && apptTab === 'upcoming' && upcoming.length === 0 && (
              <p className="services-panel-empty-dark">No upcoming appointments</p>
            )}
            {!loading && apptTab === 'upcoming' && upcoming.map((appt) => (
              <AppointmentFigmaCard key={appt.id} appt={appt} mode="upcoming" />
            ))}
            {!loading && apptTab === 'pending' && pending.length === 0 && (
              <p className="services-panel-empty-dark">No pending requests. If you have booking notifications, open Bookings or refresh.</p>
            )}
            {!loading && apptTab === 'pending' && pending.map((appt) => (
              <AppointmentFigmaCard key={appt.id} appt={appt} mode="pending" />
            ))}
          </div>
        </section>

        <section className="services-section">
          <h2 className="services-heading">Your Services</h2>
          <div className="services-your-list">
            {!isProvider && (
              <p className="services-empty-msg">You’re not a provider yet. <Link to="/my-services">Add a service</Link> to start earning.</p>
            )}
            {isProvider && myServices.length === 0 && !loading && (
              <p className="services-empty-msg">No services yet. <Link to="/my-services">Add your first service</Link>.</p>
            )}
            {isProvider && myServices.map((svc) => {
              const m = serviceMetrics[svc.id] || { revenue: 0, count: 0 }
              const rAvg = serviceRatings[svc.id]
              const nRev = serviceReviewCounts[svc.id] || 0
              const reviewLabel = rAvg != null && nRev > 0 ? `${rAvg.toFixed(1)} (${nRev})` : '—'
              return (
                <div key={svc.id} className="services-your-card-dark">
                  <div
                    className="services-your-card-dark-img"
                    style={svc.image_url ? { backgroundImage: `url(${svc.image_url})` } : {}}
                  >
                    {!svc.image_url && <span>{(svc.name || 'S')[0]}</span>}
                  </div>
                  <div className="services-your-card-dark-body">
                    <p className="services-your-card-dark-name">{svc.name}</p>
                    {(svc.service_options && svc.service_options.length > 0) && (
                      <p className="services-your-card-dark-options">
                        {(svc.service_options || []).map((opt) => `${opt.name} $${Number(opt.price).toFixed(0)}`).join(' · ')}
                      </p>
                    )}
                    <div className="services-your-card-dark-rating">
                      <StarIcon />
                      <span>{reviewLabel}</span>
                    </div>
                    <div className="services-your-card-dark-footer">
                      <span>${Number(m.revenue).toFixed(0)} Earned</span>
                      <span>{m.count} Appointments Completed</span>
                    </div>
                  </div>
                  <Link
                    to={`/my-services?edit=${svc.id}`}
                    className="services-your-card-dark-edit"
                    aria-label={`Edit ${svc.name}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PencilIcon />
                  </Link>
                  <Link
                    to={`/my-services?edit=${svc.id}`}
                    className="services-your-card-dark-more"
                    onClick={(e) => e.stopPropagation()}
                  >
                    More Details
                  </Link>
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}
