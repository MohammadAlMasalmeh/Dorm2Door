import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Navigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import {
  ApptCard,
  ReviewModal,
  appointmentHasConsumerReview,
  apptProviderId,
  normalizeApptStatus,
} from '../components/BookingCards'

export default function Appointments({ session, userProfile }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [reviewAppt, setReviewAppt] = useState(null)
  const [actionError, setActionError] = useState('')
  const [reviewedProviderIds, setReviewedProviderIds] = useState(() => new Set())
  const [apptTab, setApptTab] = useState('upcoming')

  const isProvider = userProfile?.role === 'provider' || session?.user?.user_metadata?.role === 'provider'

  useEffect(() => {
    if (!session?.user?.id || isProvider) {
      setLoading(false)
      return
    }
    fetchAll()
  }, [session?.user?.id, isProvider])

  const reviewFromUrl = searchParams.get('review')
  useEffect(() => {
    if (loading || !reviewFromUrl) return
    const match = bookings.find((a) => a.id === reviewFromUrl)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('review')
      return next
    }, { replace: true })
    if (!match) return
    if (normalizeApptStatus(match) !== 'completed' || appointmentHasConsumerReview(match)) return
    const pid = apptProviderId(match)
    if (pid != null && reviewedProviderIds.has(pid)) return
    setReviewAppt(match)
  }, [loading, bookings, reviewFromUrl, setSearchParams, reviewedProviderIds])

  async function fetchAll() {
    if (!session?.user?.id) return
    setLoading(true)
    const [bookRes, revRes] = await Promise.all([
      supabase
        .from('appointments')
        .select(
          'id, consumer_id, provider_id, status, scheduled_at, providers (id, location, users (display_name)), services (name, price), service_options (name, price), reviews (id)',
        )
        .eq('consumer_id', session.user.id)
        .order('scheduled_at', { ascending: false }),
      supabase.from('reviews').select('provider_id').eq('consumer_id', session.user.id),
    ])
    setBookings(bookRes.data || [])
    setReviewedProviderIds(new Set((revRes.data || []).map((r) => r.provider_id).filter(Boolean)))
    setLoading(false)
  }

  async function updateStatus(id, status) {
    setActionError('')
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (error) {
      setActionError(error.message || 'Action failed. Please try again.')
      return
    }
    fetchAll()
  }

  const pendingConsumer = useMemo(
    () => bookings.filter((a) => normalizeApptStatus(a) === 'pending'),
    [bookings],
  )
  const upcomingConsumer = useMemo(
    () => bookings.filter((a) => normalizeApptStatus(a) === 'confirmed'),
    [bookings],
  )
  const completedConsumer = useMemo(
    () => bookings.filter((a) => normalizeApptStatus(a) === 'completed'),
    [bookings],
  )
  const cancelledConsumer = useMemo(
    () => bookings.filter((a) => normalizeApptStatus(a) === 'cancelled'),
    [bookings],
  )

  if (isProvider) {
    return <Navigate to="/services" replace />
  }

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>

  return (
    <div className="bookings-page">
      <div className="bookings-main bookings-main-appointments">
        <section className="services-section services-section-appointments bookings-section-appointments">
          <h1 className="services-heading">Bookings</h1>
          {actionError ? (
            <div className="services-action-error" style={{ marginBottom: 12 }} role="alert">
              {actionError}
            </div>
          ) : null}

          <div className="services-appt-tabs services-appt-tabs--provider" role="tablist" aria-label="Bookings by status">
            <button
              type="button"
              role="tab"
              id="bookings-tab-upcoming"
              aria-selected={apptTab === 'upcoming'}
              aria-controls="bookings-panel-appt"
              className={`services-appt-tab${apptTab === 'upcoming' ? ' services-appt-tab-active' : ''}`}
              onClick={() => setApptTab('upcoming')}
            >
              Upcoming
            </button>
            <button
              type="button"
              role="tab"
              id="bookings-tab-pending"
              aria-selected={apptTab === 'pending'}
              aria-controls="bookings-panel-appt"
              className={`services-appt-tab${apptTab === 'pending' ? ' services-appt-tab-active' : ''}`}
              onClick={() => setApptTab('pending')}
            >
              Pending requests
            </button>
            <button
              type="button"
              role="tab"
              id="bookings-tab-completed"
              aria-selected={apptTab === 'completed'}
              aria-controls="bookings-panel-appt"
              className={`services-appt-tab${apptTab === 'completed' ? ' services-appt-tab-active' : ''}`}
              onClick={() => setApptTab('completed')}
            >
              Completed
            </button>
            <button
              type="button"
              role="tab"
              id="bookings-tab-cancelled"
              aria-selected={apptTab === 'cancelled'}
              aria-controls="bookings-panel-appt"
              className={`services-appt-tab${apptTab === 'cancelled' ? ' services-appt-tab-active' : ''}`}
              onClick={() => setApptTab('cancelled')}
            >
              Cancelled
            </button>
          </div>

          <div
            id="bookings-panel-appt"
            role="tabpanel"
            aria-labelledby={
              apptTab === 'pending'
                ? 'bookings-tab-pending'
                : apptTab === 'upcoming'
                  ? 'bookings-tab-upcoming'
                  : apptTab === 'completed'
                    ? 'bookings-tab-completed'
                    : 'bookings-tab-cancelled'
            }
            className="services-provider-appt-tab-panel"
          >
            <div className="services-appt-cards-row services-provider-appt-cards">
              {apptTab === 'upcoming' &&
                (upcomingConsumer.length === 0 ? (
                  <p className="bookings-empty services-provider-appt-empty">No upcoming appointments.</p>
                ) : (
                  upcomingConsumer.map((appt) => (
                    <ApptCard
                      key={appt.id}
                      appt={appt}
                      variant="upcoming"
                      helpLinkTo="/appointments"
                      onCancel={(id) => updateStatus(id, 'cancelled')}
                      onConsumerComplete={(id) => updateStatus(id, 'completed')}
                      onReview={setReviewAppt}
                      reviewedProviderIds={reviewedProviderIds}
                    />
                  ))
                ))}
              {apptTab === 'pending' &&
                (pendingConsumer.length === 0 ? (
                  <p className="bookings-empty services-provider-appt-empty">No pending requests.</p>
                ) : (
                  pendingConsumer.map((appt) => (
                    <ApptCard
                      key={appt.id}
                      appt={appt}
                      variant="upcoming"
                      helpLinkTo="/appointments"
                      onCancel={(id) => updateStatus(id, 'cancelled')}
                      onConsumerComplete={(id) => updateStatus(id, 'completed')}
                      onReview={setReviewAppt}
                      reviewedProviderIds={reviewedProviderIds}
                    />
                  ))
                ))}
              {apptTab === 'completed' &&
                (completedConsumer.length === 0 ? (
                  <p className="bookings-empty services-provider-appt-empty">No completed appointments yet.</p>
                ) : (
                  completedConsumer.map((appt) => (
                    <ApptCard
                      key={appt.id}
                      appt={appt}
                      variant="completed"
                      helpLinkTo="/appointments"
                      onReview={setReviewAppt}
                      reviewedProviderIds={reviewedProviderIds}
                    />
                  ))
                ))}
              {apptTab === 'cancelled' &&
                (cancelledConsumer.length === 0 ? (
                  <p className="bookings-empty services-provider-appt-empty">No cancelled bookings.</p>
                ) : (
                  cancelledConsumer.map((appt) => (
                    <ApptCard key={appt.id} appt={appt} variant="cancelled" helpLinkTo="/appointments" />
                  ))
                ))}
            </div>
          </div>
        </section>
      </div>

      {reviewAppt && (
        <ReviewModal
          appt={reviewAppt}
          onClose={() => setReviewAppt(null)}
          onSubmit={() => {
            setReviewAppt(null)
            fetchAll()
          }}
        />
      )}
    </div>
  )
}
