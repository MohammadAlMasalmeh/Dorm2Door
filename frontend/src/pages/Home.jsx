import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const ALL_TAGS = ['delivery', 'groceries', 'tutoring', 'cleaning', 'laundry', 'errands', 'photography', 'tech support']

const POPULAR_SEARCHES = [
  'Eyelash Extension',
  'Moving Services',
  'House Party DJ',
  'Graphic Design',
  'Calculus Tutor',
  'Marketing Video',
]

const CATEGORIES = [
  { key: 'photography', label: 'Photography' },
  { key: 'tutoring', label: 'Tutoring' },
  { key: 'cleaning', label: 'Haircuts' },
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

export default function Home() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const query = (searchParams.get('q') || '').trim().toLowerCase()
  const [searchInput, setSearchInput] = useState(query)

  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTags, setActiveTags] = useState(new Set())
  const [sortBy, setSortBy] = useState('rating')

  useEffect(() => { setSearchInput(query) }, [query])
  useEffect(() => { fetchProviders() }, [activeTags, sortBy])

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
    if (!query) return providers
    return providers.filter(p => {
      const name = (p.users?.display_name || '').toLowerCase()
      const tagStr = (p.tags || []).join(' ').toLowerCase()
      const bio = (p.bio || '').toLowerCase()
      return name.includes(query) || tagStr.includes(query) || bio.includes(query)
    })
  }, [providers, query])

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
        <div className="landing-upcoming-inner">
          <span className="landing-upcoming-label">Upcoming Appointments</span>
          <div className="landing-upcoming-nav">
            <button type="button" className="landing-upcoming-arrow" aria-label="Previous">‹</button>
            <button type="button" className="landing-upcoming-arrow" aria-label="Next">›</button>
          </div>
          <Link to="/appointments" className="landing-upcoming-cards">
            <div className="landing-upcoming-card landing-upcoming-card-placeholder" />
            <div className="landing-upcoming-card landing-upcoming-card-placeholder" />
            <div className="landing-upcoming-card landing-upcoming-card-placeholder" />
          </Link>
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
            <Link to="/" className="landing-section-more">See more</Link>
          </div>
        </div>
        {loading ? (
          <div className="landing-loading"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="landing-empty">
            <p className="landing-empty-title">No providers found</p>
            <p className="landing-empty-desc">
              {query || activeTags.size > 0 ? 'Try different filters or search.' : 'Be the first to offer a service!'}
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

      {/* Popular searches */}
      <section className="landing-section">
        <h2 className="landing-section-title">Popular searches</h2>
        <div className="landing-popular-chips">
          {POPULAR_SEARCHES.map(term => (
            <button
              key={term}
              type="button"
              className="landing-popular-chip"
              onClick={() => applyPopularSearch(term)}
            >
              "{term}"
            </button>
          ))}
        </div>
      </section>

      {/* Sort By Category */}
      <section className="landing-section">
        <h2 className="landing-section-title landing-section-title-sm">Sort By Category</h2>
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

      {/* Optional filter chips (minimal) */}
      {(activeTags.size > 0 || query) && (
        <section className="landing-filters landing-filters-minimal">
          <div className="filter-chips">
            {query && <span className="landing-results-label">Results for &quot;{query}&quot;</span>}
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
      )}
    </div>
  )
}
