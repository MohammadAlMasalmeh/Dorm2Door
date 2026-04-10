import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const ALL_TAGS = ['delivery', 'groceries', 'tutoring', 'haircuts', 'cleaning', 'laundry', 'errands', 'photography', 'tech support']

const CATEGORIES = [
  { key: 'photography', label: 'Photography' },
  { key: 'tutoring', label: 'Tutoring' },
  { key: 'haircuts', label: 'Haircuts' },
  { key: 'errands', label: 'Nails' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'tech support', label: 'Tech Support' },
]

function Stars({ value }) {
  const n = Math.round(value || 0)
  return <span className="stars">{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

function normalizeForSearch(text) {
  return (text || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
}

export default function Home({ session }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryFromUrl = (searchParams.get('q') || '').trim()
  const [searchInput, setSearchInput] = useState(queryFromUrl)

  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTags, setActiveTags] = useState(new Set())
  const [sortBy, setSortBy] = useState('rating')
  const [upcomingAppointments, setUpcomingAppointments] = useState([])
  const [popularSearches, setPopularSearches] = useState([])
  const [homeApptBusy, setHomeApptBusy] = useState(null)
  const [homeApptError, setHomeApptError] = useState('')

  useEffect(() => { setSearchInput(queryFromUrl) }, [queryFromUrl])
  useEffect(() => { fetchProviders() }, [activeTags, sortBy])

  const fetchUpcomingAppointments = useCallback(async () => {
    if (!session?.user?.id) {
      setUpcomingAppointments([])
      return
    }
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('appointments')
      .select('id, scheduled_at, status, providers (id, location, users (display_name)), services (name, price), service_options (name, price)')
      .eq('consumer_id', session.user.id)
      .in('status', ['pending', 'confirmed'])
      .gte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(5)
    setUpcomingAppointments(data || [])
  }, [session?.user?.id])

  useEffect(() => {
    fetchUpcomingAppointments()
  }, [fetchUpcomingAppointments])

  async function consumerAppointmentUpdate(apptId, nextStatus) {
    if (!session?.user?.id) return
    setHomeApptError('')
    setHomeApptBusy(apptId)
    const { error } = await supabase
      .from('appointments')
      .update({ status: nextStatus })
      .eq('id', apptId)
      .eq('consumer_id', session.user.id)
    setHomeApptBusy(null)
    if (error) {
      setHomeApptError(error.message || 'Update failed')
      return
    }
    await fetchUpcomingAppointments()
  }

  useEffect(() => {
    Promise.all([
      supabase.from('services').select('name'),
      supabase.from('providers').select('tags'),
    ]).then(([svcRes, provRes]) => {
      const counts = {}
      const normalize = (s) => (s || '').trim().toLowerCase()
      ;(svcRes.data || []).forEach((r) => { const n = normalize(r.name); if (n) counts[n] = (counts[n] || 0) + 1 })
      ;(provRes.data || []).forEach((r) => {
        (r.tags || []).forEach((t) => { const tag = normalize(t); if (tag) counts[tag] = (counts[tag] || 0) + 1 })
      })
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([term]) => term)
      setPopularSearches(sorted.length ? sorted : ['House Party DJ', 'Tutoring', 'Haircut', 'Moving Help', 'Cleaning', 'Dog Walking'])
    })
  }, [])

  async function fetchProviders() {
    setLoading(true)
    const fieldsWithCount =
      'id, bio, tags, avg_rating, review_count, location, users (display_name, avatar_url), services (id, image_url, price, name, service_options (id, name, price))'
    const fieldsLegacy =
      'id, bio, tags, avg_rating, location, users (display_name, avatar_url), services (id, image_url, price, name, service_options (id, name, price))'
    function providersQuery(fields) {
      let q = supabase.from('providers').select(fields)
      if (activeTags.size > 0) q = q.overlaps('tags', [...activeTags])
      if (sortBy === 'rating') q = q.order('avg_rating', { ascending: false })
      else q = q.order('id', { ascending: false })
      return q
    }
    let { data, error } = await providersQuery(fieldsWithCount)
    if (error) {
      const retry = await providersQuery(fieldsLegacy)
      data = retry.data
    }
    // Only show providers that have at least one service so we don't link to "Provider not found"
    setProviders((data || []).filter(p => p?.id && Array.isArray(p.services) && p.services.length > 0))
    setLoading(false)
  }

  const serviceCards = useMemo(() => {
    const rows = []
    for (const p of providers) {
      for (const s of (p.services || [])) {
        rows.push({
          provider: p,
          service: s,
          key: `${p.id}:${s.id || s.name}`,
        })
      }
    }

    if (!queryFromUrl) return rows
    const qLower = queryFromUrl.toLowerCase()
    const qNorm = normalizeForSearch(queryFromUrl)
    return rows.filter(({ provider: p, service: s }) => {
      const name = (p.users?.display_name || '').toLowerCase()
      const tags = (p.tags || []).join(' ').toLowerCase()
      const bio = (p.bio || '').toLowerCase()
      const serviceName = (s.name || '').toLowerCase()
      const optionNames = (s.service_options || []).map(o => o.name || '').join(' ').toLowerCase()
      const combined = `${name} ${tags} ${bio} ${serviceName} ${optionNames}`
      if (combined.includes(qLower)) return true
      return normalizeForSearch(combined).includes(qNorm)
    })
  }, [providers, queryFromUrl])

  function handleSearchSubmit(e) {
    e.preventDefault()
    if (searchInput.trim()) navigate(`/?q=${encodeURIComponent(searchInput.trim())}`)
    else navigate('/')
  }

  function selectCategory(catKey) {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(catKey)) next.delete(catKey)
      else next.add(catKey)
      return next
    })
  }

  function applyPopularSearch(term) {
    const lower = term.toLowerCase().replace(/"/g, '')
    const match = ALL_TAGS.find(t => lower.includes(t)) || lower.replace(/\s+/g, '')
    if (match) setActiveTags(prev => new Set(prev).add(match))
    setSearchInput(term)
    navigate(`/?q=${encodeURIComponent(term)}`)
  }

  function cardImage(service) {
    return service?.image_url || null
  }

  function cardPrice(service) {
    const prices = []
    if (service?.price != null) prices.push(Number(service.price))
    ;(service?.service_options || []).forEach((opt) => {
      if (opt.price != null) prices.push(Number(opt.price))
    })
    if (prices.length === 0) return null
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    return max > min ? `$${min}-${max}` : `$${Number(min).toFixed(0)}`
  }

  function handleSeeMore(sectionKey) {
    const params = new URLSearchParams({ section: sectionKey })
    if (queryFromUrl) params.set('q', queryFromUrl)
    navigate(`/search?${params.toString()}`, {
      state: {
        section: sectionKey,
        q: queryFromUrl,
        activeTags: [...activeTags],
      },
    })
  }

  function renderServiceCard(card) {
    const p = card.provider
    const s = card.service
    const img = cardImage(s)
    const tags = (p.tags || []).slice(0, 2)
    const priceStr = cardPrice(s)
    const serviceName = s?.name || (p.users?.display_name || 'Provider')
    const displayName = p.users?.display_name || 'Provider'
    const avatarUrl = p.users?.avatar_url
    const initials = (displayName || 'P').slice(0, 2).toUpperCase()

    return (
      <Link
        key={card.key}
        to={`/provider/${p.id}?service=${encodeURIComponent(s.id)}`}
        className="figma-service-card"
      >
        <div className="figma-service-card-img" style={img ? { backgroundImage: `url(${img})` } : {}}>
          {!img && <div style={{ width: '100%', height: '100%', background: '#c4c4c4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 48 }}>{(displayName || 'P')[0]}</div>}
        </div>
        <div className="figma-service-card-body">
          <div className="figma-service-card-tags">
            {tags.map(t => <span key={t} className="figma-service-card-tag">{t}</span>)}
          </div>
          <h3 className="figma-service-card-name">{serviceName}</h3>
          <div className="figma-service-card-provider">
            {avatarUrl ? <img src={avatarUrl} alt="" className="figma-service-card-avatar" /> : <span className="figma-service-card-avatar-initials">{initials}</span>}
            <span>{displayName}</span>
          </div>
          <div className="figma-service-card-rating">
            <Stars value={p.avg_rating} />
            <span>
              {(p.review_count ?? 0) > 0 && p.avg_rating != null
                ? `${Number(p.avg_rating).toFixed(1)} (${p.review_count})`
                : 'New'}
            </span>
          </div>
          <div className="figma-service-card-meta">
            <span className="figma-service-card-distance">{p.location ? `${p.location}` : '.5 mi away'}</span>
            <span className="figma-service-card-price">{priceStr || '$10-50'}</span>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <div className="figma-landing">
      <section className="figma-hero">
        <div className="figma-hero-bg-char" aria-hidden>
          <img src="/haircut-illustration.png" alt="" />
        </div>
        <div className="figma-hero-inner">
          <h1 className="figma-hero-title">Find Services from Fellow Students</h1>
          <form className="figma-search-wrap" onSubmit={handleSearchSubmit}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="search"
              className="figma-search-input"
              placeholder='Search for "Math tutoring"'
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              aria-label="Search services"
            />
          </form>
        </div>
        <div className="figma-location">
          <svg width="19" height="27" viewBox="0 0 19 27" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9.5 0C4.253 0 0 4.253 0 9.5c0 7.125 9.5 17.5 9.5 17.5s9.5-10.375 9.5-17.5C19 4.253 14.747 0 9.5 0zm0 12.875a3.375 3.375 0 1 1 0-6.75 3.375 3.375 0 0 1 0 6.75z" />
          </svg>
          <span>Austin, Texas</span>
        </div>
      </section>

      <div className="figma-upcoming-wrap">
        <div className="figma-upcoming-box">
          <h2 className="figma-upcoming-title">Upcoming Appointments</h2>
          {homeApptError && (
            <p className="figma-empty figma-upcoming-alert" role="alert">{homeApptError}</p>
          )}
          {upcomingAppointments.length === 0 ? (
            <p className="figma-empty">No upcoming appointments. <Link to="/services/all">Find a service</Link></p>
          ) : (
            <div className="figma-upcoming-cards">
              {upcomingAppointments.map((appt) => {
                const d = new Date(appt.scheduled_at)
                const dateStr = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
                const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                const providerName = appt.providers?.users?.display_name || 'John Guy'
                const opt = appt.service_options
                const serviceName = opt
                  ? `${appt.services?.name || ''} · ${opt.name}`.trim() || appt.services?.name || 'Service'
                  : (appt.services?.name || 'Service')
                const priceVal = opt?.price != null ? opt.price : appt.services?.price
                const price = priceVal != null ? `$${Number(priceVal).toFixed(0)}` : ''
                const st = (appt.status || '').toString().trim().toLowerCase()
                const busy = homeApptBusy === appt.id
                return (
                  <div key={appt.id} className="figma-upcoming-card">
                    <div className="figma-upcoming-card-top">
                      <span className="figma-upcoming-card-service">{serviceName}</span>
                      {price && <span className="figma-upcoming-card-price">{price}</span>}
                    </div>
                    <div className="figma-upcoming-card-meta">
                      <span>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="7" r="3.5" /><path d="M3 18c0-3.5 3.5-6 7-6s7 2.5 7 6" /></svg>
                        {providerName}
                      </span>
                      <span>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="8" /><path d="M10 6v4l3 3" /></svg>
                        {dateStr} @ {timeStr}
                      </span>
                      <span>
                        <svg width="14" height="20" viewBox="0 0 14 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 0C3.13 0 0 3.13 0 7c0 5.25 7 13 7 13s7-7.75 7-13C14 3.13 10.87 0 7 0z" /></svg>
                        {appt.providers?.location?.trim() || 'TBD'}
                      </span>
                    </div>
                    <p className="figma-upcoming-card-hint">
                      {st === 'pending'
                        ? 'Waiting for the provider to accept. After they confirm and you meet, mark the booking complete — then leave a review under Bookings.'
                        : 'When the visit is finished, mark complete. You’ll be prompted to rate your provider on the Bookings page.'}
                    </p>
                    <div className="figma-upcoming-card-actions">
                      <button
                        type="button"
                        className="figma-upcoming-card-cancel"
                        disabled={busy}
                        onClick={() => consumerAppointmentUpdate(appt.id, 'cancelled')}
                      >
                        {st === 'pending' ? 'Cancel request' : 'Cancel booking'}
                      </button>
                      {st === 'confirmed' && (
                        <button
                          type="button"
                          className="figma-upcoming-card-complete"
                          disabled={busy}
                          onClick={() => consumerAppointmentUpdate(appt.id, 'completed')}
                        >
                          {busy ? 'Saving…' : 'Mark complete'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {upcomingAppointments.length > 0 && (
          <div className="figma-upcoming-nav">
            <button type="button" className="figma-upcoming-nav-btn" aria-label="Previous">‹</button>
            <button type="button" className="figma-upcoming-nav-btn" aria-label="Next">›</button>
          </div>
        )}
      </div>

      <div className="figma-content">
        <section className="figma-section">
          <div className="figma-section-head">
            <h2 className="figma-section-title">Popular with friends</h2>
            <button type="button" className="figma-section-more" onClick={() => handleSeeMore('popular')}>See more</button>
          </div>
          {loading ? <div className="figma-loading"><div className="spinner" /></div> : serviceCards.length === 0 ? (
            <p className="figma-empty">No providers found. Try different filters or be the first to offer a service!</p>
          ) : (
            <div className="figma-cards-scroll">
              {serviceCards.map(card => renderServiceCard(card))}
            </div>
          )}
        </section>

        {/* Popular searches */}
        <section className="figma-section">
          <h2 className="figma-section-title">Popular searches</h2>
          <div className="figma-popular-chips">
            {(popularSearches.length ? popularSearches : ['House Party DJ', 'Tutoring', 'Haircut', 'Moving Help', 'Cleaning']).map(term => (
              <button key={term} type="button" className="figma-popular-chip" onClick={() => applyPopularSearch(term)}>
                &quot;{term.replace(/\b\w/g, c => c.toUpperCase())}&quot;
              </button>
            ))}
          </div>
        </section>

        {/* Suggested For you */}
        <section className="figma-section figma-section-tight">
          <div className="figma-section-head">
            <h2 className="figma-section-title">Suggested For you</h2>
            <button type="button" className="figma-section-more" onClick={() => handleSeeMore('suggested')}>See more</button>
          </div>
          {!loading && serviceCards.length > 0 && (
            <div className="figma-cards-scroll">
              {serviceCards.slice(0, 6).map(card => renderServiceCard(card))}
            </div>
          )}
        </section>

        {/* Recently Viewed */}
        <section className="figma-section figma-section-tight">
          <div className="figma-section-head">
            <h2 className="figma-section-title">Recently Viewed</h2>
            <button type="button" className="figma-section-more" onClick={() => handleSeeMore('recent')}>See more</button>
          </div>
          {!loading && serviceCards.length > 0 && (
            <div className="figma-cards-scroll">
              {serviceCards.slice(2, 8).map(card => renderServiceCard(card))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
