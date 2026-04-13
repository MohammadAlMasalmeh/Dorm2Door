import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import {
  ApptCard,
  ReviewModal,
  CustomerReviewModal,
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
  const [myLocation, setMyLocation] = useState('')
  const [ratedConsumerIds, setRatedConsumerIds] = useState(() => new Set())
  const [customerReviewAppt, setCustomerReviewAppt] = useState(null)

  const isProvider = userProfile?.role === 'provider' || session?.user?.user_metadata?.role === 'provider'

  const fetchConsumerBookings = useCallback(async () => {
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
    setMyLocation('')
    setRatedConsumerIds(new Set())
    setLoading(false)
  }, [session?.user?.id])

  const fetchProviderBookings = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    setActionError('')
    const uid = session.user.id
    const [apptRes, providerRes, ratingsRes] = await Promise.all([
      supabase
        .from('appointments')
        .select(
          'id, consumer_id, status, scheduled_at, users!appointments_consumer_id_fkey (display_name, avg_customer_rating, customer_review_count), services (name, price), service_options (name, price), customer_reviews (id)',
        )
        .eq('provider_id', uid)
        .order('scheduled_at', { ascending: true }),
      supabase.from('providers').select('location').eq('id', uid).maybeSingle(),
      supabase.from('customer_reviews').select('consumer_id').eq('provider_id', uid),
    ])
    if (apptRes.error) {
      setActionError(apptRes.error.message || 'Could not load appointments')
      setBookings([])
    } else {
      setBookings(apptRes.data || [])
    }
    setMyLocation((providerRes.data?.location || '').trim())
    setRatedConsumerIds(new Set((ratingsRes.data || []).map((r) => r.consumer_id).filter(Boolean)))
    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false)
      return
    }
    if (isProvider) {
      void fetchProviderBookings()
    } else {
      void fetchConsumerBookings()
    }
  }, [session?.user?.id, isProvider, fetchConsumerBookings, fetchProviderBookings])

  const reviewFromUrl = searchParams.get('review')
  useEffect(() => {
    if (isProvider || loading || !reviewFromUrl) return
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
  }, [isProvider, loading, bookings, reviewFromUrl, setSearchParams, reviewedProviderIds])

  async function updateConsumerStatus(id, status) {
    setActionError('')
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (error) {
      setActionError(error.message || 'Action failed. Please try again.')
      return
    }
    await fetchConsumerBookings()
  }

  async function updateProviderAppointmentStatus(id, status) {
    if (!session?.user?.id) return
    setActionError('')
    const { error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .eq('provider_id', session.user.id)
    if (error) {
      setActionError(error.message || 'Action failed. Please try again.')
      return
    }
    await fetchProviderBookings()
  }

  const pendingConsumer = useMemo(
    () => (!isProvider ? bookings : []).filter((a) => normalizeApptStatus(a) === 'pending'),
    [bookings, isProvider],
  )
  const upcomingConsumer = useMemo(
    () => (!isProvider ? bookings : []).filter((a) => normalizeApptStatus(a) === 'confirmed'),
    [bookings, isProvider],
  )
  const completedConsumer = useMemo(
    () => (!isProvider ? bookings : []).filter((a) => normalizeApptStatus(a) === 'completed'),
    [bookings, isProvider],
  )
  const cancelledConsumer = useMemo(
    () => (!isProvider ? bookings : []).filter((a) => normalizeApptStatus(a) === 'cancelled'),
    [bookings, isProvider],
  )

  const pendingProvider = useMemo(
    () => (isProvider ? bookings : []).filter((a) => normalizeApptStatus(a) === 'pending'),
    [bookings, isProvider],
  )
  const upcomingProvider = useMemo(
    () => (isProvider ? bookings : []).filter((a) => normalizeApptStatus(a) === 'confirmed'),
    [bookings, isProvider],
  )
  const completedProvider = useMemo(
    () => (isProvider ? bookings : []).filter((a) => normalizeApptStatus(a) === 'completed'),
    [bookings, isProvider],
  )
  const cancelledProvider = useMemo(
    () => (isProvider ? bookings : []).filter((a) => normalizeApptStatus(a) === 'cancelled'),
    [bookings, isProvider],
  )

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
              {isProvider ? (
                <>
                  {apptTab === 'upcoming' &&
                    (upcomingProvider.length === 0 ? (
                      <p className="bookings-empty services-provider-appt-empty">No upcoming appointments.</p>
                    ) : (
                      upcomingProvider.map((appt) => (
                        <ApptCard
                          key={appt.id}
                          appt={appt}
                          variant="pending"
                          helpLinkTo="/appointments"
                          providerLocationOverride={myLocation}
                          ratedConsumerIds={ratedConsumerIds}
                          onComplete={(id) => updateProviderAppointmentStatus(id, 'completed')}
                        />
                      ))
                    ))}
                  {apptTab === 'pending' &&
                    (pendingProvider.length === 0 ? (
                      <p className="bookings-empty services-provider-appt-empty">No pending requests.</p>
                    ) : (
                      pendingProvider.map((appt) => (
                        <ApptCard
                          key={appt.id}
                          appt={appt}
                          variant="pending"
                          helpLinkTo="/appointments"
                          providerLocationOverride={myLocation}
                          ratedConsumerIds={ratedConsumerIds}
                          onAccept={(id) => updateProviderAppointmentStatus(id, 'confirmed')}
                          onDecline={(id) => updateProviderAppointmentStatus(id, 'cancelled')}
                        />
                      ))
                    ))}
                  {apptTab === 'completed' &&
                    (completedProvider.length === 0 ? (
                      <p className="bookings-empty services-provider-appt-empty">No completed appointments yet.</p>
                    ) : (
                      completedProvider.map((appt) => (
                        <ApptCard
                          key={appt.id}
                          appt={appt}
                          variant="pending"
                          helpLinkTo="/appointments"
                          providerLocationOverride={myLocation}
                          ratedConsumerIds={ratedConsumerIds}
                          onRateCustomer={setCustomerReviewAppt}
                        />
                      ))
                    ))}
                  {apptTab === 'cancelled' &&
                    (cancelledProvider.length === 0 ? (
                      <p className="bookings-empty services-provider-appt-empty">No cancelled bookings.</p>
                    ) : (
                      cancelledProvider.map((appt) => (
                        <ApptCard key={appt.id} appt={appt} variant="cancelled" helpLinkTo="/appointments" />
                      ))
                    ))}
                </>
              ) : (
                <>
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
                          onCancel={(id) => updateConsumerStatus(id, 'cancelled')}
                          onConsumerComplete={(id) => updateConsumerStatus(id, 'completed')}
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
                          onCancel={(id) => updateConsumerStatus(id, 'cancelled')}
                          onConsumerComplete={(id) => updateConsumerStatus(id, 'completed')}
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
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {!isProvider && reviewAppt && (
        <ReviewModal
          appt={reviewAppt}
          onClose={() => setReviewAppt(null)}
          onSubmit={() => {
            setReviewAppt(null)
            void fetchConsumerBookings()
          }}
        />
      )}

      {isProvider && customerReviewAppt && (
        <CustomerReviewModal
          appt={customerReviewAppt}
          session={session}
          onClose={() => setCustomerReviewAppt(null)}
          onSubmit={() => {
            setCustomerReviewAppt(null)
            void fetchProviderBookings()
          }}
        />
      )}
    </div>
  )
}
