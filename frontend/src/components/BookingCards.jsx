import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

/** Supabase may embed one-to-one `reviews` as an object or as a single-element array */
export function appointmentHasConsumerReview(appt) {
  const r = appt?.reviews
  if (r == null) return false
  if (Array.isArray(r)) return r.length > 0
  if (typeof r === 'object' && r.id) return true
  return false
}

/** Provider-submitted customer rating on an appointment */
export function appointmentHasCustomerRating(appt) {
  const r = appt?.customer_reviews
  if (r == null) return false
  if (Array.isArray(r)) return r.length > 0
  if (typeof r === 'object' && r.id) return true
  return false
}

export function normalizeApptStatus(appt) {
  const s = appt?.status
  if (s == null || s === '') return ''
  return String(s).trim().toLowerCase()
}

export function ReviewModal({ appt, onClose, onSubmit }) {
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
    const { error: insertErr } = await supabase.from('reviews').insert({
      appointment_id: appt.id,
      provider_id: providerId,
      consumer_id: appt.consumer_id,
      rating,
      comment,
    })
    if (insertErr) { setError(insertErr.message); setLoading(false); return }
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

export function CustomerReviewModal({ appt, session, onClose, onSubmit }) {
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

export function ApptCard({
  appt,
  variant,
  onCancel,
  onAccept,
  onDecline,
  onReview,
  onComplete,
  onConsumerComplete,
  onRateCustomer,
  providerLocationOverride,
  helpLinkTo = '/appointments',
}) {
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

  const locationLine = variant === 'pending'
    ? (providerLocationOverride?.trim() || 'Location TBD')
    : (appt.providers?.location?.trim() || 'Location TBD')

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
          <span className="bookings-card-meta-text">{locationLine}</span>
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
            Status: {appt.status || 'unknown'}. Open <Link to={helpLinkTo}>Bookings</Link> after refreshing if this looks wrong.
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
        {variant === 'pending' && st === 'completed' && !appointmentHasCustomerRating(appt) && onRateCustomer && (
          <button type="button" className="bookings-card-btn bookings-card-btn-outline" onClick={() => onRateCustomer(appt)}>
            Rate customer
          </button>
        )}
        {variant === 'pending' && st === 'completed' && appointmentHasCustomerRating(appt) && (
          <span className="bookings-card-reviewed" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            You rated this customer
          </span>
        )}
      </div>
    </div>
  )
}
