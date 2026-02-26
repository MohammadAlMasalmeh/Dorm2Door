import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function ReviewModal({ appt, onClose, onSubmit }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.from('reviews').insert({
      appointment_id: appt.id,
      provider_id: appt.providers?.id,
      consumer_id: appt.consumer_id,
      rating,
      comment,
    })
    if (error) { setError(error.message); setLoading(false); return }
    setLoading(false)
    onSubmit()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3 className="modal-title">Leave a Review</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20, marginTop: -14 }}>
          {appt.providers?.users?.display_name} · {appt.services?.name}
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Your rating</label>
            <div className="stars-input">
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button"
                  className={`star-btn${n <= rating ? ' filled' : ''}`}
                  onClick={() => setRating(n)}>★</button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Comment (optional)</label>
            <textarea className="form-input" rows={3} placeholder="How was the experience?"
              value={comment} onChange={e => setComment(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
              {loading ? 'Submitting…' : 'Submit review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ApptCard({ appt, variant, onCancel, onAccept, onDecline, onReview, onComplete }) {
  const d = new Date(appt.scheduled_at)
  const dateStr = d.toLocaleString([], { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const providerName = appt.providers?.users?.display_name || appt.users?.display_name || '—'
  const serviceName = appt.services?.name || '—'
  const price = appt.services?.price != null ? `$${Number(appt.services.price).toFixed(0)}` : ''

  return (
    <div className="bookings-card">
      <div className="bookings-card-top">
        <div className="bookings-card-row">
          <span className="bookings-card-service">{serviceName}</span>
          {price && <span className="bookings-card-price">{price}</span>}
        </div>
        <div className="bookings-card-meta">
          <span className="bookings-card-avatar-wrap" />
          <span className="bookings-card-meta-text">{providerName}</span>
        </div>
        <div className="bookings-card-meta">
          <span className="bookings-card-icon bookings-card-icon-clock" aria-hidden>🕐</span>
          <span className="bookings-card-meta-text">{dateStr}</span>
        </div>
        <div className="bookings-card-meta">
          <span className="bookings-card-icon bookings-card-icon-pin" aria-hidden>📍</span>
          <span className="bookings-card-meta-text">Location TBD</span>
        </div>
      </div>
      <div className="bookings-card-actions">
        {variant === 'upcoming' && (appt.status === 'pending' || appt.status === 'confirmed') && (
          <button type="button" className="bookings-card-btn bookings-card-btn-outline" onClick={() => onCancel(appt.id)}>
            Cancel Appointment
          </button>
        )}
        {variant === 'upcoming' && appt.status === 'completed' && !appt.reviews?.length && onReview && (
          <button type="button" className="bookings-card-btn bookings-card-btn-outline" onClick={() => onReview(appt)}>
            Leave Review
          </button>
        )}
        {variant === 'pending' && appt.status === 'pending' && (
          <>
            <button type="button" className="bookings-card-btn bookings-card-btn-accept" onClick={() => onAccept(appt.id)}>Accept</button>
            <button type="button" className="bookings-card-btn bookings-card-btn-outline" onClick={() => onDecline(appt.id)}>Decline</button>
          </>
        )}
        {variant === 'pending' && appt.status === 'confirmed' && onComplete && (
          <button type="button" className="bookings-card-btn bookings-card-btn-outline" onClick={() => onComplete(appt.id)}>Mark complete</button>
        )}
      </div>
    </div>
  )
}

export default function Appointments({ session, userProfile }) {
  const [bookings, setBookings] = useState([])
  const [incoming, setIncoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [reviewAppt, setReviewAppt] = useState(null)
  const [actionError, setActionError] = useState('')

  const isProvider = userProfile?.role === 'provider'

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: b }, { data: i }] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, consumer_id, status, scheduled_at, providers (id, users (display_name)), services (name, price), reviews (id)')
        .eq('consumer_id', session.user.id)
        .order('scheduled_at', { ascending: false }),
      isProvider
        ? supabase
            .from('appointments')
            .select('id, status, scheduled_at, users!appointments_consumer_id_fkey (display_name), services (name, price)')
            .eq('provider_id', session.user.id)
            .order('scheduled_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])
    setBookings(b || [])
    setIncoming(i || [])
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

  const upcoming = bookings.filter(a => a.status !== 'cancelled')
  const pending = incoming.filter(a => a.status === 'pending')
  const confirmedIncoming = incoming.filter(a => a.status === 'confirmed')

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>

  return (
    <div className="bookings-page">
      <aside className="bookings-sidebar">
        <h2 className="bookings-sidebar-title">Dashboard</h2>
        <nav className="bookings-sidebar-nav">
          <Link to="/" className="bookings-sidebar-item">
            <span className="bookings-sidebar-icon">⌂</span>
            Home
          </Link>
          <Link to="/profile" className="bookings-sidebar-item">
            <span className="bookings-sidebar-icon">👤</span>
            Profile
          </Link>
          {isProvider && (
            <Link to="/my-services" className="bookings-sidebar-item">
              <span className="bookings-sidebar-icon">🛠</span>
              My Services
            </Link>
          )}
        </nav>
      </aside>

      <div className="bookings-main">
        <h1 className="bookings-page-title">Dashboard</h1>
        <p className="bookings-page-subtitle">Your appointments and activity</p>
        {actionError && (
          <div className="alert alert-error" style={{ marginBottom: 16 }} role="alert">
            {actionError}
          </div>
        )}
        <div className="bookings-columns">
          <section className="bookings-col">
            <h3 className="bookings-col-title">Upcoming</h3>
            <div className="bookings-cards">
              {upcoming.length === 0 ? (
                <p className="bookings-empty">No upcoming appointments.</p>
              ) : (
                upcoming.map(appt => (
                  <ApptCard
                    key={appt.id}
                    appt={appt}
                    variant="upcoming"
                    onCancel={(id) => updateStatus(id, 'cancelled')}
                    onReview={setReviewAppt}
                  />
                ))
              )}
            </div>
          </section>
          {isProvider && (
            <section className="bookings-col">
              <h3 className="bookings-col-title">Pending</h3>
              <div className="bookings-cards">
                {pending.length === 0 ? (
                  <p className="bookings-empty">No pending requests.</p>
                ) : (
                  pending.map(appt => (
                    <ApptCard
                      key={appt.id}
                      appt={appt}
                      variant="pending"
                      onAccept={(id) => updateStatus(id, 'confirmed')}
                      onDecline={(id) => updateStatus(id, 'cancelled')}
                      onComplete={(id) => updateStatus(id, 'completed')}
                    />
                  ))
                )}
              </div>
            </section>
          )}
        </div>

        {isProvider && (
          <>
            <h2 className="bookings-section-title">Weekly Stats</h2>
            <div className="bookings-stats">
              <div className="bookings-stat-card">
                <span className="bookings-stat-label">Services Provided</span>
                <span className="bookings-stat-value">{confirmedIncoming.length + incoming.filter(a => a.status === 'completed').length}</span>
                <span className="bookings-stat-period">This week</span>
              </div>
              <div className="bookings-stat-card">
                <span className="bookings-stat-label">Revenue</span>
                <span className="bookings-stat-value">
                  ${incoming
                    .filter(a => a.status === 'completed')
                    .reduce((sum, a) => sum + Number(a.services?.price || 0), 0)
                    .toFixed(0)}
                </span>
                <span className="bookings-stat-period">This week</span>
              </div>
              <div className="bookings-stat-card">
                <span className="bookings-stat-label">Bookings</span>
                <span className="bookings-stat-value">{incoming.length}</span>
                <span className="bookings-stat-period">Total</span>
              </div>
            </div>
            <h2 className="bookings-section-title">Your Services</h2>
            <p className="bookings-empty" style={{ marginBottom: 24 }}>
              <Link to="/my-services" className="btn btn-primary">Manage services</Link>
            </p>
          </>
        )}
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
