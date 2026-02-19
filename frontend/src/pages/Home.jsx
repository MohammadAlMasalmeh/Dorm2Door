import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const ALL_TAGS = ['delivery', 'groceries', 'tutoring', 'cleaning', 'laundry', 'errands', 'photography', 'tech support']

const TAG_EMOJI = {
  delivery: '🚗', groceries: '🛒', tutoring: '📚', cleaning: '🧹',
  laundry: '👕', errands: '✉️', photography: '📷', 'tech support': '💻',
}

function tagEmoji(tag) { return TAG_EMOJI[tag] || '🎓' }

function Stars({ value }) {
  const n = Math.round(value || 0)
  return <span style={{ color: '#f0a500', fontSize: '0.8rem' }}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

export default function Home() {
  const [providers, setProviders]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [activeTags, setActiveTags] = useState(new Set()) // multi-select
  const [sortBy, setSortBy]         = useState('rating')  // rating | newest

  useEffect(() => { fetchProviders() }, [activeTags, sortBy])

  async function fetchProviders() {
    setLoading(true)

    let q = supabase
      .from('providers')
      .select('id, bio, tags, avg_rating, location, users (display_name), services (image_url)')

    // Multi-tag filter: providers who offer ANY of the selected tags
    if (activeTags.size > 0) {
      q = q.overlaps('tags', [...activeTags])
    }

    // Sort
    if (sortBy === 'rating') {
      q = q.order('avg_rating', { ascending: false })
    } else {
      q = q.order('id', { ascending: false })
    }

    const { data } = await q
    setProviders(data || [])
    setLoading(false)
  }

  function toggleTag(tag) {
    setActiveTags(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  function clearFilters() { setActiveTags(new Set()) }

  // Pick the first service image for the card hero
  function cardImage(p) {
    const img = p.services?.find(s => s.image_url)?.image_url
    return img || null
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Browse Providers</h1>
        <p className="page-subtitle">Find students offering services near you</p>
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        {/* Multi-tag filter */}
        <div className="filter-bar" style={{ marginBottom: 0, flex: 1 }}>
          {ALL_TAGS.map(t => (
            <span
              key={t}
              className={`tag filter-tag${activeTags.has(t) ? ' active' : ''}`}
              onClick={() => toggleTag(t)}
            >
              {t}
            </span>
          ))}
          {activeTags.size > 0 && (
            <span
              className="tag filter-tag"
              onClick={clearFilters}
              style={{ borderColor: 'var(--danger)', color: 'var(--danger)', background: 'rgba(224,82,82,0.1)' }}
            >
              ✕ Clear ({activeTags.size})
            </span>
          )}
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted-dark)' }}>Sort</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              background: 'var(--surface)', color: 'var(--text-on-dark)',
              border: '1px solid var(--border-dark)', borderRadius: 6,
              padding: '6px 10px', fontSize: '0.82rem', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="rating">Top Rated</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {/* Active filter summary */}
      {activeTags.size > 0 && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted-dark)', marginBottom: 16 }}>
          Showing providers offering:{' '}
          <strong style={{ color: 'var(--text-on-dark)' }}>{[...activeTags].join(', ')}</strong>
        </div>
      )}

      {loading ? (
        <div className="loading-wrap"><div className="spinner" /></div>
      ) : providers.length === 0 ? (
        <div className="empty-state">
          <h3>No providers found</h3>
          <p>
            {activeTags.size > 0
              ? `No one is offering those services yet.`
              : 'Be the first to offer a service!'}
          </p>
          {activeTags.size > 0 && (
            <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="provider-grid">
          {providers.map(p => {
            const img = cardImage(p)
            return (
              <Link key={p.id} to={`/provider/${p.id}`} className="provider-card">
                <div className="provider-card-img" style={img ? {
                  backgroundImage: `url(${img})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                } : {}}>
                  {!img && tagEmoji(p.tags?.[0])}
                </div>
                <div className="provider-card-body">
                  <div className="provider-card-name">{p.users?.display_name || 'Provider'}</div>
                  {p.location && (
                    <div className="provider-card-location">📍 {p.location}</div>
                  )}
                  <div className="provider-card-tags">
                    {(p.tags || []).slice(0, 3).map(t => (
                      <span
                        key={t}
                        className={`tag${activeTags.has(t) ? '' : ''}`}
                        style={activeTags.has(t) ? { background: 'var(--accent)', color: 'white' } : {}}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="rating">
                    <Stars value={p.avg_rating} />
                    <span style={{ marginLeft: 5, color: '#888', fontSize: '0.78rem' }}>
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
  )
}
