import { useState, useEffect, useMemo } from 'react'
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

// Hero illustrations from Figma landing (TPEO-New-Fellow): students left, barber right — served from public/
const HERO_IMAGE_LEFT = '/hero-illus-left.png'
const HERO_IMAGE_RIGHT = '/hero-illus-right.png'

function HeroIllustration({ side }) {
  const src = side === 'left' ? HERO_IMAGE_LEFT : HERO_IMAGE_RIGHT
  return (
    <div className={`hero-illus hero-illus-${side}`} aria-hidden>
      <img
        src={src}
        alt=""
        className="hero-illus-img"
      />
    </div>
  )
}

function normalizeForSearch(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, '')         // ignore spaces: "hair cut" vs "haircut"
    .replace(/[^a-z0-9]/g, '')   // drop punctuation
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

  useEffect(() => { setSearchInput(queryFromUrl) }, [queryFromUrl])
  useEffect(() => { fetchProviders() }, [activeTags, sortBy])

  // Fetch current user's upcoming appointments (pending/confirmed, future only)
  useEffect(() => {
    if (!session?.user?.id) { setUpcomingAppointments([]); return }
    const now = new Date().toISOString()
    supabase
      .from('appointments')
      .select('id, scheduled_at, status, providers (id, users (display_name)), services (name, price)')
      .eq('consumer_id', session.user.id)
      .in('status', ['pending', 'confirmed'])
      .gte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(5)
      .then(({ data }) => setUpcomingAppointments(data || []))
  }, [session?.user?.id])

  // Derive popular searches from actual service names + provider tags (count, then top 8; normalize key so no duplicates)
  useEffect(() => {
    Promise.all([
      supabase.from('services').select('name'),
      supabase.from('providers').select('tags'),
    ]).then(([svcRes, provRes]) => {
      const counts = {}
      const normalize = (s) => (s || '').trim().toLowerCase()
      ;(svcRes.data || []).forEach((r) => {
        const n = normalize(r.name)
        if (n) counts[n] = (counts[n] || 0) + 1
      })
      ;(provRes.data || []).forEach((r) => {
        (r.tags || []).forEach((t) => {
          const tag = normalize(t)
          if (tag) counts[tag] = (counts[tag] || 0) + 1
        })
      })
      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([term]) => term)
      setPopularSearches(sorted.length ? sorted : ALL_TAGS.slice(0, 6))
    })
  }, [])

  async function fetchProviders() {
    setLoading(true)
    let q = supabase
      .from('providers')
      .select('id, bio, tags, avg_rating, location, users (display_name, avatar_url), services (image_url, price, name)')
    if (activeTags.size > 0) q = q.overlaps('tags', [...activeTags])
    if (sortBy === 'rating') q = q.order('avg_rating', { ascending: false })
    else q = q.order('id', { ascending: false })
    const { data } = await q
    setProviders(data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (!queryFromUrl) return providers
    const normalizedQuery = normalizeForSearch(queryFromUrl)
    return providers.filter(p => {
      const name = p.users?.display_name || ''
      const tags = (p.tags || []).join(' ')
      const bio  = p.bio || ''

      const combined = `${name} ${tags} ${bio}`.toLowerCase()
      if (combined.includes(queryFromUrl.toLowerCase())) return true

      const normalizedCombined = normalizeForSearch(combined)
      return normalizedCombined.includes(normalizedQuery)
    })
  }, [providers, queryFromUrl])

  function handleSearchSubmit(e) {
    e.preventDefault()
    if (searchInput.trim()) navigate(`/?q=${encodeURIComponent(searchInput.trim())}`)
    else navigate('/')
  }

  function toggleTag(tag) {
    setActiveTags(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
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

  function cardImage(p) {
    return p.services?.find(s => s.image_url)?.image_url || null
  }

  function cardPrice(p) {
    const prices = (p.services || []).map(s => s.price).filter(Boolean)
    if (prices.length === 0) return null
    const min = Math.min(...prices.map(Number))
    const max = Math.max(...prices.map(Number))
    return max > min ? `$${min}-${max}` : `$${Number(min).toFixed(0)}`
  }

  return (
    <div className="landing-page">
      {/* Hero */}
      <section className="landing-hero">
        <h1 className="landing-hero-title">Support Students</h1>
        <p className="landing-hero-subtitle">Find services from other students</p>

        <div className="landing-hero-search-row">
          <HeroIllustration side="left" />
          <form className="landing-search-wrap" onSubmit={handleSearchSubmit}>
            <span className="landing-search-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            <input
              type="search"
              className="landing-search-input"
              placeholder='Search for "Math tutoring"'
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              aria-label="Search services"
            />
          </form>
          <HeroIllustration side="right" />
        </div>
      </section>

      {/* Upcoming Appointments strip */}
      <section className="landing-upcoming">
        <div className={`landing-upcoming-inner${upcomingAppointments.length === 0 ? ' landing-upcoming-inner--empty' : ''}`}>
          <span className="landing-upcoming-label">Upcoming Appointments</span>
          {upcomingAppointments.length === 0 ? (
            <div className="landing-upcoming-empty-state">
              <span className="landing-upcoming-empty-icon" aria-hidden>📅</span>
              <span className="landing-upcoming-empty-text">No upcoming appointments</span>
              <Link to="/discover" className="landing-upcoming-empty-cta">Find a service</Link>
            </div>
          ) : (
            <div className="landing-upcoming-cards">
              {upcomingAppointments.map((appt) => {
                const d = new Date(appt.scheduled_at)
                const dateStr = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
                const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                const providerName = appt.providers?.users?.display_name || 'Provider'
                const serviceName = appt.services?.name || 'Service'
                const price = appt.services?.price != null ? `$${Number(appt.services.price).toFixed(0)}` : ''
                return (
                  <Link key={appt.id} to="/appointments" className="landing-upcoming-card landing-upcoming-card-real">
                    <span className="landing-upcoming-card-service">{serviceName}</span>
                    <span className="landing-upcoming-card-provider">{providerName}</span>
                    <span className="landing-upcoming-card-datetime">{dateStr} · {timeStr}</span>
                    {price && <span className="landing-upcoming-card-price">{price}</span>}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Popular with friends */}
      <section className="landing-section">
        <div className="landing-section-head">
          <h2 className="landing-section-title">Popular with friends</h2>
          <div className="landing-section-head-right">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="landing-sort"
              aria-label="Sort by"
            >
              <option value="rating">Top rated</option>
              <option value="newest">Newest</option>
            </select>
            <Link to="/discover" className="landing-section-more">Discover on map</Link>
          </div>
        </div>
        {loading ? (
          <div className="landing-loading"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="landing-empty">
            <p className="landing-empty-title">No providers found</p>
            <p className="landing-empty-desc">
              {queryFromUrl || activeTags.size > 0 ? 'Try different filters or search.' : 'Be the first to offer a service!'}
            </p>
          </div>
        ) : (
          <div className="landing-cards-scroll">
            {filtered.map(p => {
              const img = cardImage(p)
              const tags = (p.tags || []).slice(0, 2)
              const priceStr = cardPrice(p)
              return (
                <Link key={p.id} to={`/provider/${p.id}`} className="landing-friend-card">
                  <div
                    className="landing-friend-card-image"
                    style={img ? { backgroundImage: `url(${img})` } : {}}
                  >
                    {!img && <span className="landing-friend-card-placeholder">{(p.users?.display_name || 'P')[0]}</span>}
                    <div className="landing-friend-card-tags">
                      {tags.map(t => (
                        <span key={t} className="landing-friend-card-tag">{t}</span>
                      ))}
                    </div>
                  </div>
                  <div className="landing-friend-card-body">
                    <h3 className="landing-friend-card-name">
                      {(p.services && p.services[0] && p.services[0].name) ? p.services[0].name : (p.users?.display_name || 'Provider')}
                    </h3>
                    <div className="landing-friend-card-provider">
                      {(p.users?.avatar_url) ? (
                        <img src={p.users.avatar_url} alt="" className="landing-friend-card-avatar" />
                      ) : (
                        <span className="landing-friend-card-avatar landing-friend-card-avatar-initials">{(p.users?.display_name || 'P')[0]}</span>
                      )}
                      <span>{p.users?.display_name || 'Provider'}</span>
                    </div>
                    <div className="landing-friend-card-rating">
                      <Stars value={p.avg_rating} />
                      <span>{p.avg_rating ? `${Number(p.avg_rating).toFixed(1)} (10)` : 'New'}</span>
                    </div>
                    <div className="landing-friend-card-meta">
                      <span className="landing-friend-card-distance">{p.location ? `${p.location} · ` : ''}</span>
                      <span className="landing-friend-card-price">{priceStr || '—'}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Popular searches — from actual service names + tags */}
      <section className="landing-section">
        <h2 className="landing-section-title">Popular searches</h2>
        <div className="landing-popular-chips">
          {popularSearches.map(term => (
            <button
              key={term}
              type="button"
              className="landing-popular-chip"
              onClick={() => applyPopularSearch(term)}
            >
              {term.replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
      </section>

      {/* Filter by category — filters the provider list above */}
      <section className="landing-section">
        <h2 className="landing-section-title landing-section-title-sm">Filter by category</h2>
        <div className="landing-category-grid">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              type="button"
              className={`landing-category-card${activeTags.has(cat.key) ? ' active' : ''}`}
              onClick={() => selectCategory(cat.key)}
            >
              <div className="landing-category-card-bg" />
              <div className="landing-category-card-icon" aria-hidden>
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="24" cy="24" r="10" />
                  <path d="M24 14v10l6 6" />
                </svg>
              </div>
              <span className="landing-category-card-label">{cat.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Filter by tag — always visible so users can filter the list above */}
      <section className="landing-filters landing-filters-minimal">
        <div className="filter-chips">
          {queryFromUrl && <span className="landing-results-label">Results for &quot;{queryFromUrl}&quot;</span>}
          {!queryFromUrl && activeTags.size === 0 && <span className="landing-results-label">Filter by tag</span>}
          {ALL_TAGS.map(t => (
            <button
              key={t}
              type="button"
              className={`chip${activeTags.has(t) ? ' chip-active' : ''}`}
              onClick={() => toggleTag(t)}
            >
              {t}
            </button>
          ))}
          {activeTags.size > 0 && (
            <button type="button" className="chip chip-clear" onClick={() => setActiveTags(new Set())}>
              Clear
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
