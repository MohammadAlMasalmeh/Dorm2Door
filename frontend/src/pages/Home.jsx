import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const ALL_TAGS = ['delivery', 'groceries', 'tutoring', 'cleaning', 'laundry', 'errands', 'photography', 'tech support']

const TAG_EMOJI = {
  delivery: '🚗', groceries: '🛒', tutoring: '📚', cleaning: '🧹',
  laundry: '👕', errands: '✉️', photography: '📷', 'tech support': '💻',
}

function tagEmoji(tag) { return TAG_EMOJI[tag] || '🎓' }

function Stars({ value }) {
  const n = Math.round(value || 0)
  return <span className="rating-stars">{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

export default function Home() {
  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') || '').trim().toLowerCase()

  const [providers, setProviders]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [activeTags, setActiveTags] = useState(new Set())
  const [sortBy, setSortBy]         = useState('rating')

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
    <div className="with-sidebar">
      <aside className="sidebar">
        <p className="sidebar-title">Filter by</p>
        <div className="sidebar-filters">
          {ALL_TAGS.map(t => (
            <button
              key={t}
              type="button"
              className={`sidebar-filter-btn${activeTags.has(t) ? ' active' : ''}`}
              onClick={() => toggleTag(t)}
            >
              {t}
            </button>
          ))}
          {activeTags.size > 0 && (
            <button type="button" className="sidebar-filter-btn clear" onClick={() => setActiveTags(new Set())}>
              Clear filters
            </button>
          )}
        </div>
      </aside>

      <div className="main-content-main">
        <div className="banner">
          <h2 className="banner-title">Discover campus services</h2>
          <p className="banner-desc">Find students offering delivery, tutoring, cleaning, and more near you.</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 className="page-title" style={{ marginBottom: 0 }}>
            {query ? `Results for "${query}"` : 'Popular providers'}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sort</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="sort-select"
            >
              <option value="rating">Top rated</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No providers found</h3>
            <p>
              {query || activeTags.size > 0 ? 'Try different filters or search.' : 'Be the first to offer a service!'}
            </p>
          </div>
        ) : (
          <div className="provider-grid">
            {filtered.map(p => {
              const img = cardImage(p)
              const desc = p.bio ? p.bio.slice(0, 60) + (p.bio.length > 60 ? '…' : '') : (p.tags || []).slice(0, 2).join(', ')
              return (
                <Link key={p.id} to={`/provider/${p.id}`} className="provider-card">
                  <div className="provider-card-img" style={img ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
                    {!img && tagEmoji(p.tags?.[0])}
                  </div>
                  <div className="provider-card-body">
                    <div className="provider-card-name">{p.users?.display_name || 'Provider'}</div>
                    {desc && <div className="provider-card-desc">{desc}</div>}
                    <div className="rating" style={{ marginTop: 8 }}>
                      <Stars value={p.avg_rating} />
                      <span style={{ marginLeft: 4, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {p.avg_rating ? Number(p.avg_rating).toFixed(1) : 'New'}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
