import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// ── Custom Calendar ──────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function Calendar({ value, onChange }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const [view, setView] = useState(() => {
    const d = value ? new Date(value + 'T00:00:00') : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const year      = view.getFullYear()
  const month     = view.getMonth()
  const firstDay  = new Date(year, month, 1).getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()

  function prev() { setView(new Date(year, month - 1, 1)) }
  function next() { setView(new Date(year, month + 1, 1)) }

  function select(day) {
    const d = new Date(year, month, day)
    if (d < today) return
    const iso = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    onChange(iso)
  }

  function isSelected(day) {
    if (!value) return false
    const [sy, sm, sd] = value.split('-').map(Number)
    return sy === year && sm - 1 === month && sd === day
  }

  function isPast(day) {
    return new Date(year, month, day) < today
  }

  function isToday(day) {
    return new Date(year, month, day).getTime() === today.getTime()
  }

  // Disable navigating before current month
  const atMin = year === today.getFullYear() && month === today.getMonth()

  return (
    <div className="cal-wrap">
      <div className="cal-header">
        <button className="cal-nav-btn" onClick={prev} disabled={atMin} style={atMin ? { opacity: 0.3, cursor: 'default' } : {}}>
          ‹
        </button>
        <span className="cal-month-label">{MONTHS[month]} {year}</span>
        <button className="cal-nav-btn" onClick={next}>›</button>
      </div>

      <div className="cal-grid">
        {DAY_LABELS.map(d => (
          <div key={d} className="cal-day-label">{d}</div>
        ))}
        {/* offset for first day */}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {/* day cells */}
        {Array.from({ length: totalDays }).map((_, i) => {
          const day  = i + 1
          const past = isPast(day)
          const sel  = isSelected(day)
          const tod  = isToday(day) && !sel
          return (
            <div
              key={day}
              className={`cal-day${past ? ' cal-day-past' : ''}${sel ? ' cal-day-selected' : ''}${tod ? ' cal-day-today' : ''}`}
              onClick={() => select(day)}
            >
              {day}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Time slots ───────────────────────────────────────────────────────────────
const SLOTS = [
  '8:00 AM','9:00 AM','10:00 AM','11:00 AM',
  '12:00 PM','1:00 PM','2:00 PM','3:00 PM',
  '4:00 PM','5:00 PM','6:00 PM','7:00 PM',
]

function to24(slot) {
  const [time, ampm] = slot.split(' ')
  let [h, m] = time.split(':').map(Number)
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function BookAppointment({ session }) {
  const { providerId, serviceId } = useParams()
  const navigate = useNavigate()

  const [service, setService]   = useState(null)
  const [provider, setProvider] = useState(null)
  const [date, setDate]         = useState('')
  const [slot, setSlot]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('services').select('*').eq('id', serviceId).single(),
      supabase.from('providers').select('*, users (display_name)').eq('id', providerId).single(),
    ]).then(([{ data: svc }, { data: prov }]) => {
      setService(svc); setProvider(prov)
    })
  }, [serviceId, providerId])

  async function handleBook(e) {
    e.preventDefault()
    if (!date || !slot) { setError('Please pick a date and time.'); return }
    setError(''); setLoading(true)

    const { error } = await supabase.from('appointments').insert({
      consumer_id:  session.user.id,
      provider_id:  providerId,
      service_id:   serviceId,
      status:       'pending',
      scheduled_at: new Date(`${date}T${to24(slot)}:00`).toISOString(),
    })

    if (error) { setError(error.message); setLoading(false); return }
    setDone(true)
    setTimeout(() => navigate('/appointments'), 2000)
  }

  if (!service || !provider) return <div className="loading-wrap"><div className="spinner" /></div>

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'var(--orange-light)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: '1.8rem',
        }}>✓</div>
        <h2 style={{ fontWeight: 800, marginBottom: 8, letterSpacing: '-0.3px' }}>You're booked!</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Heading to your appointments…</p>
      </div>
    )
  }

  const providerName = provider.users?.display_name || 'Provider'
  const selectedDate = date ? new Date(date + 'T00:00:00') : null

  return (
    <div>
      <Link to={`/provider/${providerId}`} className="back-btn">← Back to profile</Link>

      <div className="page-header">
        <h1 className="page-title">Book an appointment</h1>
        <p className="page-subtitle">{providerName} · {service.name}</p>
      </div>

      <div className="booking-layout">
        {/* Left: date + time */}
        <div>
          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

          <div style={{ marginBottom: 8 }}>
            <p className="section-title">Select a date</p>
            <Calendar value={date} onChange={setDate} />
          </div>

          {date && (
            <div style={{ marginTop: 24 }}>
              <p className="section-title">Select a time</p>
              <div className="time-slots-wrap">
                {SLOTS.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`time-slot-btn${slot === s ? ' active' : ''}`}
                    onClick={() => setSlot(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {date && slot && (
            <button
              className="btn btn-primary"
              style={{ marginTop: 28, padding: '13px 32px', fontSize: '0.95rem', borderRadius: 'var(--radius-lg)' }}
              onClick={handleBook}
              disabled={loading}
            >
              {loading ? 'Booking…' : 'Confirm booking'}
            </button>
          )}
        </div>

        {/* Right: summary */}
        <div className="booking-summary">
          <div className="booking-summary-header">
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.75, marginBottom: 6 }}>
              Booking summary
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 2 }}>{providerName}</div>
            {provider.location && (
              <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>📍 {provider.location}</div>
            )}
          </div>

          <div className="booking-summary-body">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 4 }}>
                Service
              </div>
              <div style={{ fontWeight: 700 }}>{service.name}</div>
              {service.description && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{service.description}</div>
              )}
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Price</span>
              <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--orange)' }}>
                ${Number(service.price).toFixed(2)}
              </span>
            </div>

            {selectedDate && (
              <>
                <div className="divider" />
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 8 }}>
                  Appointment
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
                {slot && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 2 }}>{slot}</div>
                )}
              </>
            )}

            {(!date || !slot) && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                Select a date and time to continue
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
