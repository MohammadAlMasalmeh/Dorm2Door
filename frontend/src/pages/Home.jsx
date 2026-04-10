import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function normalizeForSearch(text) {
  return (text || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
}

function CarouselChevron({ dir }) {
  return (
    <svg
      className="figma-cards-scroll-nav-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {dir === 'left' ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  )
}

/** Horizontal row of service cards — overlay arrows (retail-style), optically centered chevrons. */
function ServiceCardsScroller({ children, label = 'services' }) {
  const scrollerRef = useRef(null)

  const scrollByCards = (direction) => {
    const el = scrollerRef.current
    if (!el) return
    const card = el.querySelector('.figma-service-card--cube')
    const gap = 24
    const step = card ? card.getBoundingClientRect().width + gap : 256
    el.scrollBy({ left: direction * step, behavior: 'smooth' })
  }

  return (
    <div className="figma-cards-scroll-wrap">
      <button
        type="button"
        className="figma-cards-scroll-nav figma-cards-scroll-nav--prev"
        aria-label={`Scroll ${label} left`}
        onClick={() => scrollByCards(-1)}
      >
        <CarouselChevron dir="left" />
      </button>
      <div ref={scrollerRef} className="figma-cards-scroll">
        {children}
      </div>
      <button
        type="button"
        className="figma-cards-scroll-nav figma-cards-scroll-nav--next"
        aria-label={`Scroll ${label} right`}
        onClick={() => scrollByCards(1)}
      >
        <CarouselChevron dir="right" />
      </button>
    </div>
  )
}

export default function Home({ session }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryFromUrl = (searchParams.get('q') || '').trim()
  const [searchInput, setSearchInput] = useState(queryFromUrl)

  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('rating')
  const [upcomingAppointments, setUpcomingAppointments] = useState([])
  const [homeApptBusy, setHomeApptBusy] = useState(null)
  const [homeApptError, setHomeApptError] = useState('')

  useEffect(() => { setSearchInput(queryFromUrl) }, [queryFromUrl])
  useEffect(() => { fetchProviders() }, [sortBy])

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

  async function fetchProviders() {
    setLoading(true)
    const fieldsWithCount =
      'id, bio, tags, avg_rating, review_count, location, users (display_name, avatar_url), services (id, image_url, price, name, service_options (id, name, price))'
    const fieldsLegacy =
      'id, bio, tags, avg_rating, location, users (display_name, avatar_url), services (id, image_url, price, name, service_options (id, name, price))'
    function providersQuery(fields) {
      let q = supabase.from('providers').select(fields)
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

  /** Prefer listing photo; fall back to provider avatar so cards aren’t empty greys. */
  function cardImage(service, provider) {
    const u = (service?.image_url || '').trim()
    if (u) return u
    const av = (provider?.users?.avatar_url || '').trim()
    return av || null
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

  /** Figma-style “From $70–$100” line */
  function cardPriceFromLabel(service) {
    const raw = cardPrice(service)
    if (!raw) return null
    const inner = raw.replace(/^\$/, '')
    return inner.includes('-') ? `From $${inner}` : `From $${inner}`
  }

  function subserviceLine(service) {
    const names = (service?.service_options || []).map((o) => (o.name || '').trim()).filter(Boolean)
    if (names.length < 2) return null
    return `Add-ons: ${names.slice(0, 6).join(', ')}`
  }

  function handleSeeMore(sectionKey) {
    const params = new URLSearchParams({ section: sectionKey })
    if (queryFromUrl) params.set('q', queryFromUrl)
    navigate(`/search?${params.toString()}`, {
      state: {
        section: sectionKey,
        q: queryFromUrl,
      },
    })
  }

  function renderServiceCard(card) {
    const p = card.provider
    const s = card.service
    const img = cardImage(s, p)
    const tags = (p.tags || []).slice(0, 2)
    const priceFrom = cardPriceFromLabel(s)
    const subsLine = subserviceLine(s)
    const serviceName = s?.name || (p.users?.display_name || 'Provider')
    const displayName = p.users?.display_name || 'Provider'
    const avatarUrl = p.users?.avatar_url
    const initials = (displayName || 'P').slice(0, 2).toUpperCase()
    const ratingNum =
      (p.review_count ?? 0) > 0 && p.avg_rating != null ? Number(p.avg_rating).toFixed(2) : null

    const thumbPositions = ['50% 45%', '15% 50%', '50% 50%', '85% 50%', '50% 75%']

    return (
      <Link
        key={card.key}
        to={`/provider/${p.id}?service=${encodeURIComponent(s.id)}`}
        className="figma-service-card figma-service-card--cube"
      >
        <div className="figma-service-card-visual" aria-hidden>
          <div
            className={`figma-service-card-main-img${!img ? ' figma-service-card-main-img--placeholder' : ''}`}
            style={img ? { backgroundImage: `url(${img})` } : undefined}
          >
            {!img && (
              <span className="figma-service-card-main-fallback" aria-hidden>
                {(serviceName || displayName || 'P').slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="figma-service-card-thumbs">
            {thumbPositions.map((pos, i) => (
              <div
                key={i}
                className={`figma-service-card-thumb${img ? ' figma-service-card-thumb--img' : ''}`}
                style={
                  img
                    ? { backgroundImage: `url(${img})`, backgroundPosition: pos }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
        <div className="figma-service-card-body figma-service-card-body--light">
          {tags.length > 0 && (
            <div className="figma-service-card-tags figma-service-card-tags--compact">
              {tags.map((t) => (
                <span key={t} className="figma-service-card-tag figma-service-card-tag--outline">
                  {t}
                </span>
              ))}
            </div>
          )}
          <h3 className="figma-service-card-name figma-service-card-name--dark">{serviceName}</h3>
          <div className="figma-service-card-price-row">
            <span className="figma-service-card-from-price">{priceFrom || 'From $10'}</span>
            {ratingNum != null && (
              <span className="figma-service-card-rating-inline">
                <span className="figma-service-card-star" aria-hidden>★</span>
                <span>{ratingNum}</span>
              </span>
            )}
          </div>
          {subsLine && <p className="figma-service-card-subs">{subsLine}</p>}
          <div className="figma-service-card-provider figma-service-card-provider--dark">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="figma-service-card-avatar" />
            ) : (
              <span className="figma-service-card-avatar-initials figma-service-card-avatar-initials--dark">
                {initials}
              </span>
            )}
            <span>{displayName}</span>
          </div>
          <div className="figma-service-card-meta figma-service-card-meta--dark">
            <span className="figma-service-card-distance">{p.location || '.5 mi away'}</span>
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
            <p className="figma-empty">No upcoming appointments. <Link to="/discover">Discover nearby</Link></p>
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
            <ServiceCardsScroller label="popular services">
              {serviceCards.map((card) => renderServiceCard(card))}
            </ServiceCardsScroller>
          )}
        </section>

        {/* Suggested For you */}
        <section className="figma-section figma-section-tight">
          <div className="figma-section-head">
            <h2 className="figma-section-title">Suggested For you</h2>
            <button type="button" className="figma-section-more" onClick={() => handleSeeMore('suggested')}>See more</button>
          </div>
          {!loading && serviceCards.length > 0 && (
            <ServiceCardsScroller label="suggested services">
              {serviceCards.slice(0, 6).map((card) => renderServiceCard(card))}
            </ServiceCardsScroller>
          )}
        </section>

        {/* Recently Viewed */}
        <section className="figma-section figma-section-tight">
          <div className="figma-section-head">
            <h2 className="figma-section-title">Recently Viewed</h2>
            <button type="button" className="figma-section-more" onClick={() => handleSeeMore('recent')}>See more</button>
          </div>
          {!loading && serviceCards.length > 0 && (
            <ServiceCardsScroller label="recently viewed services">
              {serviceCards.slice(2, 8).map((card) => renderServiceCard(card))}
            </ServiceCardsScroller>
          )}
        </section>
      </div>
    </div>
  )
}
