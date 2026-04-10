import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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
  const location = useLocation()
  const navigate = useNavigate()
  const isStatsView = location.pathname === '/services/stats'

  useEffect(() => {
    if (location.pathname === '/services' && location.hash === '#stats') {
      navigate('/services/stats', { replace: true })
    }
  }, [location.pathname, location.hash, navigate])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  const loadDashboard = useCallback(async () => {
    if (!session?.user?.id || !isProvider) {
      setLoading(false)
      setRatedConsumerIds(new Set())
      setTotalStats({ revenue: 0, servicesProvided: 0 })
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
        .select('id, service_id, service_options (price), services (price)')
        .eq('provider_id', uid)
        .eq('status', 'completed'),
      supabase.from('reviews').select('rating, appointment_id').eq('provider_id', uid),
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

  const statsSections = (
    <>
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
      <section className="services-section services-section-stats services-section-total-stats" aria-labelledby="total-stats-heading">
        <h2 id="total-stats-heading" className="services-heading">
          Total Stats
        </h2>
        <div className="services-stats-row">
          <div className="services-stat-card services-stat-card-bordered">
            <p className="services-stat-label-dark">Revenue</p>
            <p className="services-stat-value-dark">${totalStats.revenue.toFixed(2)}</p>
            <p className="services-stat-date-dark">All time</p>
          </div>
          <div className="services-stat-card services-stat-card-bordered">
            <p className="services-stat-label-dark">Services Provided</p>
            <p className="services-stat-value-dark">{totalStats.servicesProvided}</p>
            <p className="services-stat-date-dark">All time</p>
          </div>
          <div className="services-stat-card services-stat-card-bordered">
            <p className="services-stat-label-dark">Average Review</p>
            <p className="services-stat-value-dark">{avgReview != null ? avgReview.toFixed(1) : '—'}</p>
            <p className="services-stat-date-dark">All time</p>
          </div>
        </div>
      </section>
    </>
  )

  return (
    <ProviderServicesShell>
      {isStatsView ? (
        statsSections
      ) : (
        <>
        <section className="services-section services-section-appointments">
          <h1 className="services-heading">Appointments</h1>
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
      )}

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
