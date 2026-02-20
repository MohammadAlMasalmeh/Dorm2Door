import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const ALL_TAGS = ['delivery', 'groceries', 'tutoring', 'cleaning', 'laundry', 'errands', 'photography', 'tech support']

function Stars({ value }) {
  const n = Math.round(value || 0)
  return <span className="stars">{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

function IllustrationCircle({ type }) {
  return (
    <div className="hero-illus">
      <div className="hero-illus-circle">
        {type === 'left' && (
          <svg className="hero-illus-svg" viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="60" cy="55" r="18" />
            <circle cx="60" cy="55" r="12" />
            <path d="M35 75 Q60 65 85 75" />
            <path d="M42 58 L38 48 M78 58 L82 48" />
            <path d="M50 40 L55 32 M70 40 L65 32" />
          </svg>
        )}
        {type === 'right' && (
          <svg className="hero-illus-svg" viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="45" cy="55" r="20" />
            <path d="M25 75 L65 75 L65 95 L25 95 Z" />
            <path d="M75 45 L95 35 L95 75 L75 65 Z" />
            <path d="M70 50 L90 42 M72 62 L88 58" />
          </svg>
        )}
      </div>
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
      .select('id, bio, tags, avg_rating, location, users (display_name, avatar_url), services (image_url)')
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

  function cardImage(p) {
    return p.services?.find(s => s.image_url)?.image_url || null
  }

  return (
    <div className="landing-page">
      <section className="landing-hero">
        <h1 className="landing-hero-title">Support Students</h1>
        <p className="landing-hero-subtitle">Find services from other students</p>

        <div className="landing-hero-search-row">
          <IllustrationCircle type="left" />
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
          <IllustrationCircle type="right" />
        </div>
      </section>

      <section className="landing-filters">
        <div className="filter-chips">
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

      <section className="landing-list">
        <div className="landing-list-header">
          <h2 className="landing-list-title">
            {query ? `Results for "${query}"` : 'Popular providers'}
          </h2>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="landing-sort"
            aria-label="Sort by"
          >
            <option value="rating">Top rated</option>
            <option value="newest">Newest</option>
          </select>
        </div>

        {loading ? (
          <div className="landing-loading">
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="landing-empty">
            <p className="landing-empty-title">No providers found</p>
            <p className="landing-empty-desc">
              {query || activeTags.size > 0 ? 'Try different filters or search.' : 'Be the first to offer a service!'}
            </p>
          </div>
        ) : (
          <div className="landing-grid">
            {filtered.map(p => {
              const img = cardImage(p)
              const desc = p.bio ? p.bio.slice(0, 72) + (p.bio.length > 72 ? '…' : '') : (p.tags || []).slice(0, 2).join(' · ')
              return (
                <Link key={p.id} to={`/provider/${p.id}`} className="landing-card">
                  <div
                    className="landing-card-image"
                    style={img ? { backgroundImage: `url(${img})` } : {}}
                  >
                    {!img && <span className="landing-card-placeholder">{(p.users?.display_name || 'P')[0]}</span>}
                  </div>
                  <div className="landing-card-body">
                    <h3 className="landing-card-name">{p.users?.display_name || 'Provider'}</h3>
                    {desc && <p className="landing-card-desc">{desc}</p>}
                    <div className="landing-card-meta">
                      <Stars value={p.avg_rating} />
                      <span>{p.avg_rating ? Number(p.avg_rating).toFixed(1) : 'New'}</span>
                      {p.location && <span> · {p.location}</span>}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
