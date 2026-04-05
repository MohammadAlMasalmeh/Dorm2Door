import { useState, useEffect } from 'react'
import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

/** Supabase may embed one-to-one `reviews` as an object or as a single-element array */
function appointmentHasConsumerReview(appt) {
  const r = appt?.reviews
  if (r == null) return false
  if (Array.isArray(r)) return r.length > 0
  if (typeof r === 'object' && r.id) return true
  return false
}

function normalizeApptStatus(appt) {
  const s = appt?.status
  if (s == null || s === '') return ''
  return String(s).trim().toLowerCase()
}

function ReviewModal({ appt, onClose, onSubmit }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { data: row, error: statusErr } = await supabase
      .from('appointments')
      .select('status, provider_id')
      .eq('id', appt.id)
      .eq('consumer_id', appt.consumer_id)
      .single()
    if (statusErr || !row) {
      setError(statusErr?.message || 'Could not verify this booking.')
      setLoading(false)
      return
    }
    if (String(row.status || '').trim().toLowerCase() !== 'completed') {
      setError('You can only leave a review after the appointment is marked complete.')
      setLoading(false)
      return
    }
    const providerId = appt.providers?.id ?? row.provider_id
    const { error } = await supabase.from('reviews').insert({
      appointment_id: appt.id,
      provider_id: providerId,
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
          {appt.providers?.users?.display_name} · {appt.service_options ? `${appt.services?.name} · ${appt.service_options.name}` : appt.services?.name}
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

function CustomerReviewModal({ appt, session, onClose, onSubmit }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const consumerName = appt?.users?.display_name || 'Customer'

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error: err } = await supabase.from('customer_reviews').insert({
      appointment_id: appt.id,
      consumer_id: appt.consumer_id,
      provider_id: session?.user?.id,
      rating,
      comment: comment.trim() || null,
    })
    if (err) { setError(err.message); setLoading(false); return }
    setLoading(false)
    onSubmit()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3 className="modal-title">Rate customer</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20, marginTop: -14 }}>
          {consumerName} · How was working with them?
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Rating</label>
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
            <textarea className="form-input" rows={3} placeholder="Optional note about this customer"
              value={comment} onChange={e => setComment(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
              {loading ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ApptCard({ appt, variant, onCancel, onAccept, onDecline, onReview, onComplete, onConsumerComplete, onRateCustomer }) {
  const st = normalizeApptStatus(appt)
  const d = new Date(appt.scheduled_at)
  const dateStr = d.toLocaleString([], { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const providerName = appt.providers?.users?.display_name || appt.users?.display_name || '—'
  const consumerName = appt.users?.display_name || '—'
  const consumerRating = appt.users?.avg_customer_rating != null ? Number(appt.users.avg_customer_rating).toFixed(1) : null
  const consumerReviewCount = appt.users?.customer_review_count ?? 0
  const serviceName = appt.service_options
    ? `${appt.services?.name || ''} · ${appt.service_options.name}`.trim() || '—'
    : (appt.services?.name || '—')
  const price = (appt.service_options?.price != null ? appt.service_options.price : appt.services?.price) != null
    ? `$${Number(appt.service_options?.price ?? appt.services?.price).toFixed(0)}`
    : ''

  return (
    <div className="bookings-card">
      <div className="bookings-card-top">
        <div className="bookings-card-row">
          <span className="bookings-card-service">{serviceName}</span>
          {price && <span className="bookings-card-price">{price}</span>}
        </div>
        <div className="bookings-card-meta">
          <span className="bookings-card-avatar-wrap" />
          <span className="bookings-card-meta-text">{variant === 'pending' ? consumerName : providerName}</span>
          {variant === 'pending' && (consumerRating || consumerReviewCount === 0) && (
            <span className="bookings-card-meta-rating" title="Customer rating (visible in request context)">
              {consumerRating ? ` ★ ${consumerRating} (${consumerReviewCount})` : ' · New customer'}
            </span>
          )}
        </div>
        <div className="bookings-card-meta">
          <span className="bookings-card-icon bookings-card-icon-clock" aria-hidden>🕐</span>
          <span className="bookings-card-meta-text">{dateStr}</span>
        </div>
        <div className="bookings-card-meta">
          <span className="bookings-card-icon bookings-card-icon-pin" aria-hidden>📍</span>
          <span className="bookings-card-meta-text">
            {variant === 'pending'
              ? 'Location TBD'
              : (appt.providers?.location?.trim() || 'Location TBD')}
          </span>
        </div>
      </div>
      <div className="bookings-card-actions">
        {variant === 'upcoming' && st === 'pending' && (
          <>
            <p className="bookings-card-hint" style={{ width: '100%', margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Waiting for the provider to accept. You can cancel if plans change.
            </p>
            <button type="button" className="bookings-card-btn bookings-card-btn-outline" onClick={() => onCancel(appt.id)}>
              Cancel request
            </button>
          </>
        )}
        {variant === 'upcoming' && st === 'confirmed' && (
          <>
            <p className="bookings-card-hint" style={{ width: '100%', margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              After your visit, mark complete — then you can leave a review for your provider.
            </p>
            <button type="button" className="bookings-card-btn bookings-card-btn-outline" onClick={() => onCancel(appt.id)}>
              Cancel
            </button>
            {onConsumerComplete && (
              <button type="button" className="bookings-card-btn bookings-card-btn-confirm" onClick={() => onConsumerComplete(appt.id)}>
                Mark as complete
              </button>
            )}
          </>
        )}
        {variant === 'upcoming' && st !== 'pending' && st !== 'confirmed' && st !== '' && (
          <p className="bookings-card-hint" style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Status: {appt.status || 'unknown'}. Open <Link to="/appointments">Bookings</Link> after refreshing if this looks wrong.
          </p>
        )}
        {variant === 'completed' && st === 'completed' && !appointmentHasConsumerReview(appt) && onReview && (
          <button type="button" className="bookings-card-btn bookings-card-btn-confirm" onClick={() => onReview(appt)}>
            Leave a review
          </button>
        )}
        {variant === 'completed' && st === 'completed' && appointmentHasConsumerReview(appt) && (
          <span className="bookings-card-reviewed" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Thanks — you left a review
          </span>
        )}
        {variant === 'pending' && st === 'pending' && (
          <>
            <button type="button" className="bookings-card-btn bookings-card-btn-accept" onClick={() => onAccept(appt.id)}>Accept</button>
            <button type="button" className="bookings-card-btn bookings-card-btn-decline" onClick={() => onDecline(appt.id)}>Decline</button>
          </>
        )}
        {variant === 'pending' && st === 'confirmed' && onComplete && (
          <button type="button" className="bookings-card-btn bookings-card-btn-confirm" onClick={() => onComplete(appt.id)}>Mark complete</button>
        )}
        {variant === 'pending' && st === 'completed' && !(appt.customer_reviews?.length) && onRateCustomer && (
          <button type="button" className="bookings-card-btn bookings-card-btn-outline" onClick={() => onRateCustomer(appt)}>
            Rate customer
          </button>
        )}
      </div>
    </div>
  )
}

export default function Appointments({ session, userProfile }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [bookings, setBookings] = useState([])
  const [incoming, setIncoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [reviewAppt, setReviewAppt] = useState(null)
  const [customerReviewAppt, setCustomerReviewAppt] = useState(null)
  const [actionError, setActionError] = useState('')

  const isProvider = userProfile?.role === 'provider' || session?.user?.user_metadata?.role === 'provider'

  useEffect(() => {
    if (!session?.user?.id) return
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
    const [{ data: b }, { data: i }] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, consumer_id, provider_id, status, scheduled_at, providers (id, users (display_name)), services (name, price), service_options (name, price), reviews (id)')
        .eq('consumer_id', session.user.id)
        .order('scheduled_at', { ascending: false }),
      isProvider
        ? supabase
            .from('appointments')
            .select('id, consumer_id, status, scheduled_at, users!appointments_consumer_id_fkey (display_name, avg_customer_rating, customer_review_count), services (name, price), service_options (name, price), customer_reviews (id)')
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

  const consumerActive = bookings.filter(a => ['pending', 'confirmed'].includes(normalizeApptStatus(a)))
  const consumerCompleted = bookings.filter(a => normalizeApptStatus(a) === 'completed')
  const consumerCancelled = bookings.filter(a => normalizeApptStatus(a) === 'cancelled')
  const needsConsumerReview = consumerCompleted.filter(a => !appointmentHasConsumerReview(a))

  const pending = incoming.filter(a => normalizeApptStatus(a) === 'pending')
  const confirmedIncoming = incoming.filter(a => normalizeApptStatus(a) === 'confirmed')
  const completedIncoming = incoming.filter(a => normalizeApptStatus(a) === 'completed')

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>

  return (
    <div className="bookings-page">
      <aside className="bookings-sidebar">
        <h2 className="bookings-sidebar-title">Dashboard</h2>
        <nav className="bookings-sidebar-nav">
          <NavLink to="/appointments" end className={({ isActive }) => `bookings-sidebar-item${isActive ? ' active' : ''}`}>
            <span className="bookings-sidebar-icon">📋</span>
            Overview
          </NavLink>
          <Link to="/profile" className="bookings-sidebar-item">
            <span className="bookings-sidebar-icon">👤</span>
            Profile
          </Link>
          {isProvider && (
            <>
              <Link to="/my-services" className="bookings-sidebar-item">
                <span className="bookings-sidebar-icon">🛠</span>
                Services
              </Link>
              <Link to="/messages" className="bookings-sidebar-item">
                <span className="bookings-sidebar-icon">✉</span>
                Inbox
              </Link>
              <Link to="/my-services" className="bookings-sidebar-item">
                <span className="bookings-sidebar-icon">📅</span>
                Availability
              </Link>
              <Link to="/my-services" className="bookings-sidebar-item bookings-sidebar-add">
                + Add Service
              </Link>
            </>
          )}
        </nav>
      </aside>

      <div className="bookings-main">
        <h1 className="bookings-page-title">Dashboard</h1>
        <p className="bookings-page-subtitle">Your appointments and activity</p>
        {!isProvider && (
          <p className="bookings-page-subtitle" style={{ marginTop: -12, marginBottom: 8, fontSize: '0.9rem' }}>
            After a confirmed visit, tap <strong>Mark as complete</strong>, then leave a review under <strong>Rate your experience</strong>.
          </p>
        )}
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
          {isProvider && (
            <section className="bookings-col">
              <h3 className="bookings-col-title">Pending</h3>
              <div className="bookings-cards">
                {pending.length === 0 && confirmedIncoming.length === 0 && completedIncoming.length === 0 ? (
                  <p className="bookings-empty">No pending requests.</p>
                ) : (
                  <>
                    {pending.map(appt => (
                      <ApptCard
                        key={appt.id}
                        appt={appt}
                        variant="pending"
                        onAccept={(id) => updateStatus(id, 'confirmed')}
                        onDecline={(id) => updateStatus(id, 'cancelled')}
                        onComplete={(id) => updateStatus(id, 'completed')}
                        onRateCustomer={setCustomerReviewAppt}
                      />
                    ))}
                    {confirmedIncoming.map(appt => (
                      <ApptCard
                        key={appt.id}
                        appt={appt}
                        variant="pending"
                        onComplete={(id) => updateStatus(id, 'completed')}
                        onRateCustomer={setCustomerReviewAppt}
                      />
                    ))}
                    {completedIncoming.map(appt => (
                      <ApptCard
                        key={appt.id}
                        appt={appt}
                        variant="pending"
                        onRateCustomer={setCustomerReviewAppt}
                      />
                    ))}
                  </>
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
                <span className="bookings-stat-label">Service Rendered</span>
                <span className="bookings-stat-value">{confirmedIncoming.length + incoming.filter(a => a.status === 'completed').length}</span>
                <span className="bookings-stat-period">This week</span>
              </div>
              <div className="bookings-stat-card">
                <span className="bookings-stat-label">Amount</span>
                <span className="bookings-stat-value">
                  ${incoming
                    .filter(a => a.status === 'completed')
                    .reduce((sum, a) => sum + Number(a.services?.price || 0), 0)
                    .toFixed(0)}
                </span>
                <span className="bookings-stat-period">This week</span>
              </div>
              <div className="bookings-stat-card">
                <span className="bookings-stat-label">New Requests</span>
                <span className="bookings-stat-value">{pending.length}</span>
                <span className="bookings-stat-period">Pending</span>
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
      {customerReviewAppt && (
        <CustomerReviewModal
          appt={customerReviewAppt}
          session={session}
          onClose={() => setCustomerReviewAppt(null)}
          onSubmit={() => { setCustomerReviewAppt(null); fetchAll() }}
        />
      )}
    </div>
  )
}
