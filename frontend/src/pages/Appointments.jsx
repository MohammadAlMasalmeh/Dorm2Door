import { useState, useEffect } from 'react'
import { Link, useSearchParams, Navigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import {
  ApptCard,
  ReviewModal,
  appointmentHasConsumerReview,
  normalizeApptStatus,
} from '../components/BookingCards'

export default function Appointments({ session, userProfile }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [reviewAppt, setReviewAppt] = useState(null)
  const [actionError, setActionError] = useState('')

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
    setReviewAppt(match)
  }, [loading, bookings, reviewFromUrl, setSearchParams])

  async function fetchAll() {
    if (!session?.user?.id) return
    setLoading(true)
    const { data: b } = await supabase
      .from('appointments')
      .select('id, consumer_id, provider_id, status, scheduled_at, providers (id, users (display_name)), services (name, price), service_options (name, price), reviews (id)')
      .eq('consumer_id', session.user.id)
      .order('scheduled_at', { ascending: false })
    setBookings(b || [])
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

  const consumerActive = bookings.filter(a => ['pending', 'confirmed'].includes(normalizeApptStatus(a)))
  const consumerCompleted = bookings.filter(a => normalizeApptStatus(a) === 'completed')
  const consumerCancelled = bookings.filter(a => normalizeApptStatus(a) === 'cancelled')
  const needsConsumerReview = consumerCompleted.filter(a => !appointmentHasConsumerReview(a))

  if (isProvider) {
    return <Navigate to="/services" replace />
  }

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>

  return (
    <div className="bookings-page">
      <aside className="bookings-sidebar">
        <h2 className="bookings-sidebar-title">Dashboard</h2>
        <nav className="bookings-sidebar-nav">
          <span className="bookings-sidebar-item active">
            <span className="bookings-sidebar-icon">📋</span>
            Overview
          </span>
          <Link to="/profile" className="bookings-sidebar-item">
            <span className="bookings-sidebar-icon">👤</span>
            Profile
          </Link>
        </nav>
      </aside>

      <div className="bookings-main">
        <h1 className="bookings-page-title">Bookings</h1>
        <p className="bookings-page-subtitle">Your appointments and activity</p>
        <p className="bookings-page-subtitle" style={{ marginTop: -12, marginBottom: 8, fontSize: '0.9rem' }}>
          After a confirmed visit, tap <strong>Mark as complete</strong>, then leave a review under <strong>Rate your experience</strong>.
        </p>
        {actionError && (
          <div className="alert alert-error" style={{ marginBottom: 16 }} role="alert">
            {actionError}
          </div>
        )}
        <div className="bookings-columns">
          <section className="bookings-col">
            {needsConsumerReview.length > 0 && (
              <>
                <h3 className="bookings-col-title">Rate your experience</h3>
                <p className="bookings-col-hint" style={{ margin: '-8px 0 16px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  These visits are complete — share feedback for your provider.
                </p>
                <div className="bookings-cards" style={{ marginBottom: 28 }}>
                  {needsConsumerReview.map(appt => (
                    <ApptCard
                      key={appt.id}
                      appt={appt}
                      variant="completed"
                      onReview={setReviewAppt}
                    />
                  ))}
                </div>
              </>
            )}

            <h3 className="bookings-col-title">Upcoming</h3>
            <div className="bookings-cards">
              {consumerActive.length === 0 ? (
                <p className="bookings-empty">No upcoming appointments.</p>
              ) : (
                consumerActive.map(appt => (
                  <ApptCard
                    key={appt.id}
                    appt={appt}
                    variant="upcoming"
                    onCancel={(id) => updateStatus(id, 'cancelled')}
                    onConsumerComplete={(id) => updateStatus(id, 'completed')}
                    onReview={setReviewAppt}
                  />
                ))
              )}
            </div>

            {consumerCompleted.length > needsConsumerReview.length && (
              <>
                <h3 className="bookings-col-title" style={{ marginTop: 28 }}>Past visits</h3>
                <div className="bookings-cards">
                  {consumerCompleted.filter(a => appointmentHasConsumerReview(a)).map(appt => (
                    <ApptCard
                      key={appt.id}
                      appt={appt}
                      variant="completed"
                      onReview={setReviewAppt}
                    />
                  ))}
                </div>
              </>
            )}

            {consumerCancelled.length > 0 && (
              <>
                <h3 className="bookings-col-title" style={{ marginTop: 28 }}>Cancelled</h3>
                <div className="bookings-cards">
                  {consumerCancelled.map(appt => (
                    <ApptCard key={appt.id} appt={appt} variant="cancelled" />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {reviewAppt && (
        <ReviewModal
          appt={reviewAppt}
          onClose={() => setReviewAppt(null)}
          onSubmit={() => { setReviewAppt(null); fetchAll() }}
        />
      )}
    </div>
  )
}
