import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// ── Custom Calendar ──────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function Calendar({ value, onChange, disabledDays = [] }) {
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
    if (d < today || disabledDays.includes(d.getDay())) return
    const iso = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    onChange(iso)
  }

  function isSelected(day) {
    if (!value) return false
    const [sy, sm, sd] = value.split('-').map(Number)
    return sy === year && sm - 1 === month && sd === day
  }

  function isDisabled(day) {
    const d = new Date(year, month, day)
    return d < today || disabledDays.includes(d.getDay())
  }

  function isToday(day) {
    return new Date(year, month, day).getTime() === today.getTime()
  }

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
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: totalDays }).map((_, i) => {
          const day  = i + 1
          const disabled = isDisabled(day)
          const sel  = isSelected(day)
          const tod  = isToday(day) && !sel
          return (
            <div
              key={day}
              className={`cal-day${disabled ? ' cal-day-past' : ''}${sel ? ' cal-day-selected' : ''}${tod ? ' cal-day-today' : ''}`}
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

// Default fallback time slots
const DEFAULT_SLOTS = [
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

function parseTime(timeStr) {
  const [time, ampm] = timeStr.split(' ')
  let [h] = time.split(':').map(Number)
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return h
}

function generateSlots(availability) {
  if (!availability?.startTime || !availability?.endTime) return DEFAULT_SLOTS
  const startH = parseTime(availability.startTime)
  const endH = parseTime(availability.endTime)
  if (startH >= endH) return DEFAULT_SLOTS
  const slots = []
  for (let h = startH; h < endH; h++) {
    const ampm = h >= 12 ? 'PM' : 'AM'
    const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h)
    slots.push(`${displayH}:00 ${ampm}`)
  }
  return slots
}

export default function BookAppointment({ session }) {
  const { providerId, serviceId } = useParams()
  const navigate = useNavigate()

  const [service, setService]   = useState(null)
  const [provider, setProvider] = useState(null)
  const [date, setDate]         = useState('')
  const [slot, setSlot]         = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)
  const [takenSlots, setTakenSlots] = useState(new Set())

  useEffect(() => {
    Promise.all([
      supabase.from('services').select('*').eq('id', serviceId).single(),
      supabase.from('providers').select('*, users (display_name, avatar_url)').eq('id', providerId).single(),
    ]).then(([{ data: svc }, { data: prov }]) => {
      setService(svc); setProvider(prov)
    })
  }, [serviceId, providerId])

  // Fetch booked slots when date changes
  useEffect(() => {
    if (!date || !providerId) { setTakenSlots(new Set()); return }
    supabase.rpc('get_booked_slots', {
      p_provider_id: providerId,
      p_date: date,
    }).then(({ data }) => {
      const taken = (data || []).map(row => {
        const d = new Date(row.scheduled_at)
        const h = d.getHours()
        const ampm = h >= 12 ? 'PM' : 'AM'
        const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h)
        return `${displayH}:00 ${ampm}`
      })
      setTakenSlots(new Set(taken))
    })
  }, [date, providerId])

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

    if (error) {
      if (error.message.includes('idx_no_double_booking') || error.message.includes('duplicate')) {
        setError('This time slot was just booked. Please choose another time.')
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }
    setDone(true)
    setTimeout(() => navigate('/appointments'), 2000)
  }

  if (!service || !provider) return <div className="loading-wrap"><div className="spinner" /></div>

  if (done) {
    return (
      <div className="booking-done">
        <div className="booking-done-icon">✓</div>
        <h2 className="booking-done-title">You're booked!</h2>
        <p className="booking-done-desc">Heading to your appointments...</p>
      </div>
    )
  }

  const providerName = provider.users?.display_name || 'Provider'
  const providerAvatar = provider.users?.avatar_url
  const initials = (providerName || 'P').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const selectedDate = date ? new Date(date + 'T00:00:00') : null
  const duration = service.duration_minutes ? `${service.duration_minutes} min` : '—'

  // Dynamic availability
  const availability = provider.availability
  const availableDays = availability?.days ?? [0, 1, 2, 3, 4, 5, 6]
  const allDays = [0, 1, 2, 3, 4, 5, 6]
  const disabledDays = allDays.filter(d => !availableDays.includes(d))
  const slots = generateSlots(availability)

  return (
    <div className="booking-listing">
      {/* Left: image gallery */}
      <div className="booking-gallery">
        <div
          className="booking-gallery-main"
          style={service.image_url ? { backgroundImage: `url(${service.image_url})` } : {}}
        >
          {!service.image_url && (
            <div className="booking-gallery-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </div>
          )}
        </div>
        <div className="booking-gallery-thumbs">
          <div className="booking-gallery-thumb booking-gallery-thumb-placeholder" />
          <div className="booking-gallery-thumb booking-gallery-thumb-placeholder" />
          <div className="booking-gallery-thumb booking-gallery-thumb-placeholder" />
        </div>
      </div>

      {/* Right: content */}
      <div className="booking-content">
        <Link to={`/provider/${providerId}`} className="back-btn booking-back-link">← Back to profile</Link>

        <h1 className="booking-title">{service.name}</h1>

        <div className="booking-tags">
          <span className="booking-tag">Responds Fast</span>
        </div>

        <div className="booking-provider-row">
          {providerAvatar ? (
            <img src={providerAvatar} alt="" className="booking-provider-avatar" />
          ) : (
            <span className="booking-provider-avatar booking-provider-avatar-initials">{initials}</span>
          )}
          <div className="booking-provider-info">
            <span className="booking-provider-name">{providerName}</span>
            {(provider.tags && provider.tags.length > 0) && (
              <span className="booking-provider-meta">{(provider.tags || []).slice(0, 2).join(' · ')}</span>
            )}
          </div>
          {(provider.location || duration) && (
            <span className="booking-provider-location">
              {provider.location ? `${provider.location} · ` : ''}{duration}
            </span>
          )}
        </div>

        {service.description && (
          <>
            <h2 className="booking-heading">Overview</h2>
            <p className="booking-overview">{service.description}</p>
          </>
        )}

        <div className="booking-divider" />

        <h2 className="booking-heading">Services</h2>
        <div className="booking-service-row booking-service-row-selected">
          <span className="booking-service-name">{service.name}</span>
          <div className="booking-service-right">
            <div className="booking-service-price-block">
              <span className="booking-service-price">${Number(service.price).toFixed(0)}+</span>
              <span className="booking-service-duration">{duration}</span>
            </div>
            <span className="booking-service-select">Select</span>
          </div>
        </div>

        <div className="booking-divider" />

        <h2 className="booking-heading">Select a date</h2>
        {error && <div className="alert alert-error booking-alert">{error}</div>}
        <Calendar value={date} onChange={d => { setDate(d); setSlot('') }} disabledDays={disabledDays} />

        {date && (
          <>
            <h2 className="booking-heading booking-heading-spaced">Select a time</h2>
            <div className="time-slots-wrap">
              {slots.map(s => {
                const isTaken = takenSlots.has(s)
                return (
                  <button
                    key={s}
                    type="button"
                    className={`time-slot-btn${slot === s ? ' active' : ''}${isTaken ? ' time-slot-taken' : ''}`}
                    onClick={() => !isTaken && setSlot(s)}
                    disabled={isTaken}
                  >
                    {s}{isTaken ? ' (Booked)' : ''}
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div className="booking-description-wrap">
          <label htmlFor="booking-desc" className="booking-description-label">Add a description (optional)</label>
          <textarea
            id="booking-desc"
            className="booking-description-input"
            placeholder="Add a description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <button
          type="button"
          className="booking-cta booking-cta-book"
          onClick={handleBook}
          disabled={loading || !date || !slot}
        >
          {loading ? 'Booking...' : 'Book!'}
        </button>

        <div className="booking-summary-inline">
          <div className="booking-summary-inline-row">
            <span>Price</span>
            <span className="booking-summary-price">${Number(service.price).toFixed(2)}</span>
          </div>
          {selectedDate && slot && (
            <div className="booking-summary-inline-row">
              <span>Appointment</span>
              <span>{selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} · {slot}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
