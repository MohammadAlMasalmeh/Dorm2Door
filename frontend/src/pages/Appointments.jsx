import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function DateBlock({ iso }) {
  const d = new Date(iso)
  return (
    <div className="appt-date-block">
      <div className="month">{MONTHS_SHORT[d.getMonth()]}</div>
      <div className="day">{d.getDate()}</div>
    </div>
  )
}

function ReviewModal({ appt, onClose, onSubmit }) {
  const [rating, setRating]   = useState(5)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.from('reviews').insert({
      appointment_id: appt.id,
      provider_id:    appt.providers?.id,
      rating,
      comment,
    })
    if (error) { setError(error.message); setLoading(false); return }
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
            <label className="form-label">Comment <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
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

export default function Appointments({ session, userProfile }) {
  const [tab, setTab]           = useState('consumer')
  const [bookings, setBookings] = useState([])
  const [incoming, setIncoming] = useState([])
  const [loading, setLoading]   = useState(true)
  const [reviewAppt, setReviewAppt] = useState(null)

  const isProvider = userProfile?.role === 'provider'

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: b }, { data: i }] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, status, scheduled_at, providers (id, users (display_name)), services (name, price), reviews (id)')
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
    await supabase.from('appointments').update({ status }).eq('id', id)
    fetchAll()
  }

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>

  const list = tab === 'consumer' ? bookings : incoming

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Appointments</h1>
        <p className="page-subtitle">
          {tab === 'consumer'
            ? `${bookings.length} booking${bookings.length !== 1 ? 's' : ''}`
            : `${incoming.length} incoming request${incoming.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {isProvider && (
        <div className="tabs">
          <button className={`tab-btn${tab === 'consumer' ? ' active' : ''}`} onClick={() => setTab('consumer')}>
            My Bookings
          </button>
          <button className={`tab-btn${tab === 'provider' ? ' active' : ''}`} onClick={() => setTab('provider')}>
            Incoming
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📅</div>
          <h3>{tab === 'consumer' ? 'No bookings yet' : 'No incoming requests'}</h3>
          <p style={{ marginTop: 6 }}>
            {tab === 'consumer'
              ? <Link to="/" style={{ color: 'var(--orange)', fontWeight: 600 }}>Browse providers →</Link>
              : "When consumers book your services, they'll appear here."}
          </p>
        </div>
      ) : (
        list.map(appt => (
          <div key={appt.id} className="appointment-card">
            <DateBlock iso={appt.scheduled_at} />

            <div className="appt-info">
              {tab === 'consumer' ? (
                <>
                  <div className="appt-provider">
                    <Link to={`/provider/${appt.providers?.id}`}
                      style={{ color: 'inherit', textDecoration: 'none' }}>
                      {appt.providers?.users?.display_name}
                    </Link>
                  </div>
                  <div className="appt-service">
                    {appt.services?.name}
                    {appt.services?.price && ` · $${Number(appt.services.price).toFixed(2)}`}
                  </div>
                </>
              ) : (
                <>
                  <div className="appt-provider">{appt.users?.display_name || 'Consumer'}</div>
                  <div className="appt-service">
                    {appt.services?.name}
                    {appt.services?.price && ` · $${Number(appt.services.price).toFixed(2)}`}
                  </div>
                </>
              )}
              <div className="appt-time">
                {new Date(appt.scheduled_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
              <span className={`status-badge status-${appt.status}`}>{appt.status}</span>

              {tab === 'consumer' && appt.status === 'completed' && !appt.reviews?.length && (
                <button className="btn btn-sm btn-outline" onClick={() => setReviewAppt(appt)}>
                  Review
                </button>
              )}
              {tab === 'consumer' && appt.reviews?.length > 0 && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>✓ Reviewed</span>
              )}

              {tab === 'provider' && appt.status === 'pending' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => updateStatus(appt.id, 'confirmed')}>Confirm</button>
                  <button className="btn btn-sm btn-outline" onClick={() => updateStatus(appt.id, 'completed')}>Complete</button>
                </div>
              )}
              {tab === 'provider' && appt.status === 'confirmed' && (
                <button className="btn btn-sm btn-outline" onClick={() => updateStatus(appt.id, 'completed')}>
                  Mark complete
                </button>
              )}
            </div>
          </div>
        ))
      )}

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
