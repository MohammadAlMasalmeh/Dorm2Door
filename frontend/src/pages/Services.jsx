import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import ProviderServicesShell from '../components/ProviderServicesShell'
import {
  ApptCard,
  CustomerReviewModal,
  normalizeApptStatus,
} from '../components/BookingCards'

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

function monthKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

/** Inclusive month range from start through endMonth (same year/month as `now`). */
function eachMonthKeyBetween(start, endCap) {
  const keys = []
  const c = new Date(start.getFullYear(), start.getMonth(), 1)
  const end = new Date(endCap.getFullYear(), endCap.getMonth(), 1)
  while (c <= end) {
    keys.push(monthKeyFromDate(c))
    c.setMonth(c.getMonth() + 1)
  }
  return keys
}

function monthKeysForRange(range, now, earliestDate) {
  if (range === 'ytd') {
    return eachMonthKeyBetween(new Date(now.getFullYear(), 0, 1), now)
  }
  if (range === '12m') {
    return eachMonthKeyBetween(new Date(now.getFullYear(), now.getMonth() - 11, 1), now)
  }
  if (earliestDate) {
    return eachMonthKeyBetween(new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1), now)
  }
  return eachMonthKeyBetween(now, now)
}

function StatTrendModal({ metric, range, onRangeChange, onClose, points, formatY: formatYAxis }) {
  const title =
    metric === 'revenue'
      ? 'Revenue'
      : metric === 'services'
        ? 'Services completed'
        : 'Average review (by month)'
  const maxVal = useMemo(() => {
    if (metric === 'rating') return 5
    if (!points.length) return 1
    return Math.max(...points.map((p) => p.value), 0.01)
  }, [points, metric])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const W = 560
  const H = 220
  const padL = 44
  const padR = 16
  const padT = 12
  const padB = 36
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = Math.max(points.length, 1)
  const barGap = 4
  const barW = Math.max(4, (innerW - barGap * (n - 1)) / n)

  return (
    <div
      className="services-stat-graph-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="services-stat-graph-title"
      onClick={onClose}
    >
      <div className="services-stat-graph-modal" onClick={(e) => e.stopPropagation()}>
        <div className="services-stat-graph-modal-head">
          <h2 id="services-stat-graph-title" className="services-stat-graph-modal-title">
            {title}
          </h2>
          <button type="button" className="services-stat-graph-close" onClick={onClose} aria-label="Close graph">
            ×
          </button>
        </div>
        <p className="services-stat-graph-hint">
          {metric === 'rating'
            ? 'Average star rating for reviews submitted in each month.'
            : 'Totals by calendar month from completed appointments (using scheduled date).'}
        </p>
        <div className="services-stat-graph-ranges" role="tablist" aria-label="Time range">
          {[
            { id: 'ytd', label: 'Year to date' },
            { id: '12m', label: 'Last 12 months' },
            { id: 'all', label: 'All time' },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={range === id}
              className={`services-stat-graph-range-btn${range === id ? ' is-active' : ''}`}
              onClick={() => onRangeChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {points.length === 0 ? (
          <p className="services-stat-graph-empty">No data in this range yet.</p>
        ) : (
          <svg
            className="services-stat-graph-svg"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
          >
            {points.map((p, i) => {
              const h = maxVal > 0 ? (p.value / maxVal) * innerH : 0
              const x = padL + i * (barW + barGap)
              const y = padT + innerH - h
              return (
                <g key={p.key}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(h, 0)}
                    rx={3}
                    className="services-stat-graph-bar"
                  />
                  <title>{`${formatMonthLabel(p.key)}: ${formatYAxis(p.value)}`}</title>
                </g>
              )
            })}
            <line
              x1={padL}
              y1={padT + innerH}
              x2={padL + innerW}
              y2={padT + innerH}
              className="services-stat-graph-axis"
            />
          </svg>
        )}
        {points.length > 0 && (
          <div className="services-stat-graph-xlabels">
            {points.map((p) => (
              <span key={p.key} className="services-stat-graph-xlabel">
                {formatMonthLabel(p.key)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Services({ session, userProfile }) {
  const isProvider = userProfile?.role === 'provider' || session?.user?.user_metadata?.role === 'provider'
  const [providerIncoming, setProviderIncoming] = useState([])
  const [myServices, setMyServices] = useState([])
  const [stats, setStats] = useState({ servicesProvided: 0, revenue: 0 })
  const [totalStats, setTotalStats] = useState({ servicesProvided: 0, revenue: 0 })
  const [avgReview, setAvgReview] = useState(null)
  const [serviceMetrics, setServiceMetrics] = useState({})
  const [serviceRatings, setServiceRatings] = useState({})
  const [serviceReviewCounts, setServiceReviewCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState('')
  const [customerReviewAppt, setCustomerReviewAppt] = useState(null)
  const [weekLabel] = useState(() => formatWeekRangeLabel())
  const [myLocation, setMyLocation] = useState('')
  const [ratedConsumerIds, setRatedConsumerIds] = useState(() => new Set())
  const [apptTab, setApptTab] = useState('upcoming')
  const [trendMetric, setTrendMetric] = useState(null)
  const [trendRange, setTrendRange] = useState('ytd')
  const [completedTimeline, setCompletedTimeline] = useState([])
  const [reviewTimeline, setReviewTimeline] = useState([])
  const location = useLocation()
  const statsSectionRef = useRef(null)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    if (location.hash !== '#stats' || !statsSectionRef.current) return
    const t = window.setTimeout(() => {
      statsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    return () => window.clearTimeout(t)
  }, [location.hash, loading])

  const loadDashboard = useCallback(async () => {
    if (!session?.user?.id || !isProvider) {
      setLoading(false)
      setRatedConsumerIds(new Set())
      setTotalStats({ revenue: 0, servicesProvided: 0 })
      setCompletedTimeline([])
      setReviewTimeline([])
      return
    }
    const uid = session.user.id
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekAgoIso = weekAgo.toISOString()

    const [
      apptRes,
      svcRes,
      statsRes,
      providerResFirst,
      completedRes,
      reviewsListRes,
      myCustomerRatingsRes,
    ] = await Promise.all([
      supabase
        .from('appointments')
        .select(
          'id, consumer_id, status, scheduled_at, users!appointments_consumer_id_fkey (display_name, avg_customer_rating, customer_review_count), services (name, price), service_options (name, price), customer_reviews (id)',
        )
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
        .select('id, service_id, scheduled_at, service_options (price), services (price)')
        .eq('provider_id', uid)
        .eq('status', 'completed'),
      supabase.from('reviews').select('rating, appointment_id, created_at').eq('provider_id', uid),
      supabase.from('customer_reviews').select('consumer_id').eq('provider_id', uid),
    ])

    let providerRes = providerResFirst
    if (providerRes.error) {
      providerRes = await supabase
        .from('providers')
        .select('avg_rating, location')
        .eq('id', uid)
        .maybeSingle()
    }

    setActionError('')
    if (apptRes.error) {
      setActionError(apptRes.error.message || 'Could not load appointments')
      setProviderIncoming([])
    } else {
      setProviderIncoming(apptRes.data || [])
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

    const completedAll = completedRes.data || []
    const metrics = {}
    let totalRevenueAll = 0
    completedAll.forEach((a) => {
      const p = a.service_options?.price != null ? a.service_options.price : a.services?.price
      if (p != null) totalRevenueAll += Number(p)
      const sid = a.service_id
      if (!sid) return
      if (!metrics[sid]) metrics[sid] = { revenue: 0, count: 0 }
      metrics[sid].count += 1
      if (p != null) metrics[sid].revenue += Number(p)
    })
    setServiceMetrics(metrics)
    setTotalStats({ revenue: totalRevenueAll, servicesProvided: completedAll.length })

    setCompletedTimeline(
      completedAll.map((a) => {
        const p = a.service_options?.price != null ? a.service_options.price : a.services?.price
        return {
          scheduled_at: a.scheduled_at,
          price: p != null ? Number(p) : null,
        }
      }),
    )

    const revRows = reviewsListRes.data || []
    setReviewTimeline(
      (reviewsListRes.data || [])
        .filter((r) => r.created_at != null && r.rating != null)
        .map((r) => ({ created_at: r.created_at, rating: Number(r.rating) })),
    )
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

    setRatedConsumerIds(
      new Set((myCustomerRatingsRes.data || []).map((r) => r.consumer_id).filter(Boolean)),
    )

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

  async function updateAppointmentStatus(id, status) {
    if (!session?.user?.id) return
    setActionError('')
    const { error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .eq('provider_id', session.user.id)
    if (error) {
      setActionError(error.message || 'Something went wrong. Try again.')
      return
    }
    await loadDashboard()
  }

  /** Hide declined/cancelled bookings from the provider dashboard */
  const dashboardAppointments = useMemo(
    () => providerIncoming.filter((a) => normalizeApptStatus(a) !== 'cancelled'),
    [providerIncoming],
  )

  const pendingQueue = useMemo(
    () => dashboardAppointments.filter((a) => normalizeApptStatus(a) === 'pending'),
    [dashboardAppointments],
  )

  /** Accepted requests: all confirmed visits until marked complete */
  const upcomingConfirmed = useMemo(
    () => dashboardAppointments.filter((a) => normalizeApptStatus(a) === 'confirmed'),
    [dashboardAppointments],
  )

  const completedIncoming = useMemo(
    () => dashboardAppointments.filter((a) => normalizeApptStatus(a) === 'completed'),
    [dashboardAppointments],
  )

  const trendPoints = useMemo(() => {
    if (!trendMetric) return []
    const now = new Date()
    let earliest = null
    if (trendMetric === 'rating') {
      const times = reviewTimeline.map((r) => new Date(r.created_at))
      earliest = times.length ? new Date(Math.min(...times)) : null
    } else {
      const times = completedTimeline.map((r) => new Date(r.scheduled_at))
      earliest = times.length ? new Date(Math.min(...times)) : null
    }
    const keys = monthKeysForRange(trendRange, now, earliest)
    const counts = {}
    keys.forEach((k) => {
      counts[k] = { revenue: 0, count: 0, rSum: 0, rN: 0 }
    })
    if (trendMetric === 'revenue' || trendMetric === 'services') {
      for (const row of completedTimeline) {
        if (!row.scheduled_at) continue
        const k = monthKeyFromDate(new Date(row.scheduled_at))
        if (!counts[k]) continue
        counts[k].count += 1
        if (row.price != null) counts[k].revenue += row.price
      }
    }
    if (trendMetric === 'rating') {
      for (const row of reviewTimeline) {
        const k = monthKeyFromDate(new Date(row.created_at))
        if (!counts[k]) continue
        counts[k].rSum += row.rating
        counts[k].rN += 1
      }
    }
    return keys.map((key) => {
      const s = counts[key]
      if (trendMetric === 'revenue') return { key, value: s.revenue }
      if (trendMetric === 'services') return { key, value: s.count }
      return { key, value: s.rN ? s.rSum / s.rN : 0 }
    })
  }, [trendMetric, trendRange, completedTimeline, reviewTimeline])

  const formatTrendY = useCallback(
    (v) => {
      if (trendMetric === 'revenue') return `$${v.toFixed(2)}`
      if (trendMetric === 'services') return String(Math.round(v))
      return v.toFixed(1)
    },
    [trendMetric],
  )

  function openTrend(metric) {
    setTrendRange('ytd')
    setTrendMetric(metric)
  }

  return (
    <ProviderServicesShell>
        <>
        <section
          ref={statsSectionRef}
          id="stats"
          className="services-section services-section-overview-stats"
          aria-label="Performance overview"
        >
          <div className="services-overview-head">
            <h1 className="services-heading services-heading--overview">Overview</h1>
            <p className="services-overview-sub">
              Past 7 days vs all time. Click a metric to open a monthly chart (year to date, last 12 months, or all time).
            </p>
          </div>
          <div className="services-overview-metrics">
            <button
              type="button"
              className="services-overview-stat-card services-stat-card-bordered"
              onClick={() => openTrend('revenue')}
            >
              <span className="services-overview-stat-label">Revenue</span>
              <div className="services-overview-stat-rows">
                <div className="services-overview-stat-row">
                  <span className="services-overview-stat-period">{weekLabel}</span>
                  <span className="services-overview-stat-figure">${stats.revenue.toFixed(2)}</span>
                </div>
                <div className="services-overview-stat-row">
                  <span className="services-overview-stat-period">All time</span>
                  <span className="services-overview-stat-figure">${totalStats.revenue.toFixed(2)}</span>
                </div>
              </div>
              <span className="services-overview-stat-cta">View trend</span>
            </button>
            <button
              type="button"
              className="services-overview-stat-card services-stat-card-bordered"
              onClick={() => openTrend('services')}
            >
              <span className="services-overview-stat-label">Services provided</span>
              <div className="services-overview-stat-rows">
                <div className="services-overview-stat-row">
                  <span className="services-overview-stat-period">{weekLabel}</span>
                  <span className="services-overview-stat-figure">{stats.servicesProvided}</span>
                </div>
                <div className="services-overview-stat-row">
                  <span className="services-overview-stat-period">All time</span>
                  <span className="services-overview-stat-figure">{totalStats.servicesProvided}</span>
                </div>
              </div>
              <span className="services-overview-stat-cta">View trend</span>
            </button>
            <button
              type="button"
              className="services-overview-stat-card services-stat-card-bordered"
              onClick={() => openTrend('rating')}
            >
              <span className="services-overview-stat-label">Average review</span>
              <div className="services-overview-stat-rows">
                <div className="services-overview-stat-row">
                  <span className="services-overview-stat-period">{weekLabel}</span>
                  <span className="services-overview-stat-figure">{avgReview != null ? avgReview.toFixed(1) : '—'}</span>
                </div>
                <div className="services-overview-stat-row">
                  <span className="services-overview-stat-period">All time</span>
                  <span className="services-overview-stat-figure">{avgReview != null ? avgReview.toFixed(1) : '—'}</span>
                </div>
              </div>
              <span className="services-overview-stat-cta">View trend</span>
            </button>
          </div>
        </section>

        <section className="services-section services-section-appointments">
          <h2 className="services-heading">Appointments</h2>
          {actionError ? <p className="services-action-error" role="alert">{actionError}</p> : null}
          {loading ? (
            <p className="services-panel-empty-dark">Loading…</p>
          ) : (
            <>
              <div className="services-appt-tabs services-appt-tabs--provider" role="tablist" aria-label="Appointments by status">
                <button
                  type="button"
                  role="tab"
                  id="services-tab-upcoming"
                  aria-selected={apptTab === 'upcoming'}
                  aria-controls="services-panel-appt"
                  className={`services-appt-tab${apptTab === 'upcoming' ? ' services-appt-tab-active' : ''}`}
                  onClick={() => setApptTab('upcoming')}
                >
                  Upcoming
                </button>
                <button
                  type="button"
                  role="tab"
                  id="services-tab-pending"
                  aria-selected={apptTab === 'pending'}
                  aria-controls="services-panel-appt"
                  className={`services-appt-tab${apptTab === 'pending' ? ' services-appt-tab-active' : ''}`}
                  onClick={() => setApptTab('pending')}
                >
                  Pending requests
                </button>
                <button
                  type="button"
                  role="tab"
                  id="services-tab-completed"
                  aria-selected={apptTab === 'completed'}
                  aria-controls="services-panel-appt"
                  className={`services-appt-tab${apptTab === 'completed' ? ' services-appt-tab-active' : ''}`}
                  onClick={() => setApptTab('completed')}
                >
                  Completed
                </button>
              </div>
              <div
                id="services-panel-appt"
                role="tabpanel"
                aria-labelledby={
                  apptTab === 'pending'
                    ? 'services-tab-pending'
                    : apptTab === 'upcoming'
                      ? 'services-tab-upcoming'
                      : 'services-tab-completed'
                }
                className="services-provider-appt-tab-panel"
              >
                <div className="services-appt-cards-row services-provider-appt-cards">
                  {apptTab === 'pending' &&
                    (pendingQueue.length === 0 ? (
                      <p className="bookings-empty services-provider-appt-empty">No pending requests.</p>
                    ) : (
                      pendingQueue.map((appt) => (
                        <ApptCard
                          key={appt.id}
                          appt={appt}
                          variant="pending"
                          helpLinkTo="/services"
                          providerLocationOverride={myLocation}
                          ratedConsumerIds={ratedConsumerIds}
                          onAccept={(id) => updateAppointmentStatus(id, 'confirmed')}
                          onDecline={(id) => updateAppointmentStatus(id, 'cancelled')}
                        />
                      ))
                    ))}
                  {apptTab === 'upcoming' &&
                    (upcomingConfirmed.length === 0 ? (
                      <p className="bookings-empty services-provider-appt-empty">No upcoming appointments.</p>
                    ) : (
                      upcomingConfirmed.map((appt) => (
                        <ApptCard
                          key={appt.id}
                          appt={appt}
                          variant="pending"
                          helpLinkTo="/services"
                          providerLocationOverride={myLocation}
                          ratedConsumerIds={ratedConsumerIds}
                          onComplete={(id) => updateAppointmentStatus(id, 'completed')}
                        />
                      ))
                    ))}
                  {apptTab === 'completed' &&
                    (completedIncoming.length === 0 ? (
                      <p className="bookings-empty services-provider-appt-empty">No completed appointments yet.</p>
                    ) : (
                      completedIncoming.map((appt) => (
                        <ApptCard
                          key={appt.id}
                          appt={appt}
                          variant="pending"
                          helpLinkTo="/services"
                          providerLocationOverride={myLocation}
                          ratedConsumerIds={ratedConsumerIds}
                          onRateCustomer={setCustomerReviewAppt}
                        />
                      ))
                    ))}
                </div>
              </div>
            </>
          )}
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
                    to={`/my-services/edit/${svc.id}`}
                    className="services-your-card-dark-edit"
                    aria-label={`Edit ${svc.name}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PencilIcon />
                  </Link>
                  <Link
                    to={`/my-services/edit/${svc.id}`}
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
        </>
      {trendMetric ? (
        <StatTrendModal
          metric={trendMetric}
          range={trendRange}
          onRangeChange={setTrendRange}
          onClose={() => setTrendMetric(null)}
          points={trendPoints}
          formatY={formatTrendY}
        />
      ) : null}

      {customerReviewAppt && (
        <CustomerReviewModal
          appt={customerReviewAppt}
          session={session}
          onClose={() => setCustomerReviewAppt(null)}
          onSubmit={() => {
            setCustomerReviewAppt(null)
            void loadDashboard()
          }}
        />
      )}
    </ProviderServicesShell>
  )
}
