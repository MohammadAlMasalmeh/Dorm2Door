import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function Stars({ value, size = '1rem' }) {
  const n = Math.round(value || 0)
  return <span className="listing-stars" style={{ fontSize: size }}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

export default function ProviderProfile({ session }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [provider, setProvider] = useState(null)
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState(0)

  useEffect(() => {
    fetchProvider()
    fetchReviews()
  }, [id])

  async function fetchProvider() {
    const { data } = await supabase
      .from('providers')
      .select('*, users (display_name, email, avatar_url), services (*)')
      .eq('id', id)
      .single()
    setProvider(data)
    setLoading(false)
  }

  async function fetchReviews() {
    const { data } = await supabase
      .from('reviews')
      .select('rating, comment, created_at, users!reviews_consumer_id_fkey (display_name, avatar_url)')
      .eq('provider_id', id)
      .order('created_at', { ascending: false })
    setReviews(data || [])
  }

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>
  if (!provider) return <div className="empty-state"><h3>Provider not found</h3></div>

  const name = provider.users?.display_name || 'Provider'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const services = provider.services || []
  const isOwn = session?.user?.id === id
  const firstService = services[0]
  const portfolioImages = services.filter(s => s.image_url).map(s => s.image_url)
  const mainImage = portfolioImages[selectedImage] || portfolioImages[0]
  const reviewCount = reviews.length
  const avgRating = provider.avg_rating ? Number(provider.avg_rating).toFixed(1) : null

  return (
    <div className="listing-page">
      {/* Left: gallery */}
      <div className="listing-gallery">
        <Link to="/" className="listing-back" aria-label="Back">
          ‹
        </Link>
        <div
          className="listing-gallery-main"
          style={mainImage ? { backgroundImage: `url(${mainImage})` } : {}}
        >
          {!mainImage && (
            <div className="listing-gallery-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </div>
          )}
        </div>
        <div className="listing-gallery-thumbs">
          {[0, 1, 2].map(i => (
            <button
              key={i}
              type="button"
              className={`listing-gallery-thumb${selectedImage === i ? ' active' : ''}`}
              onClick={() => setSelectedImage(i)}
              style={portfolioImages[i] ? { backgroundImage: `url(${portfolioImages[i]})` } : {}}
            >
              {!portfolioImages[i] && <span />}
            </button>
          ))}
        </div>
      </div>

      {/* Right: content */}
      <div className="listing-content">
        <div className="listing-header-actions">
          <button type="button" className="listing-icon-btn" aria-label="Share">⎘</button>
          <button type="button" className="listing-icon-btn" aria-label="Save">♡</button>
        </div>
        <h1 className="listing-title">
          {firstService?.name || name}
        </h1>
        <div className="listing-tags">
          <span className="listing-tag">Responds Fast</span>
          <span className="listing-tag">Responds Fast</span>
          <span className="listing-tag">Responds Fast</span>
        </div>

        <div className="listing-provider-row">
          {provider.users?.avatar_url ? (
            <img src={provider.users.avatar_url} alt="" className="listing-provider-avatar" />
          ) : (
            <span className="listing-provider-avatar listing-provider-avatar-initials">{initials}</span>
          )}
          <span className="listing-provider-name">{name}</span>
          {(provider.tags && provider.tags.length > 0) && (
            <span className="listing-provider-meta">{(provider.tags || []).slice(0, 2).join(' · ')}</span>
          )}
          <span className="listing-provider-location">
            {provider.location ? `${provider.location} · ` : ''}~30min
          </span>
        </div>

        {provider.bio && (
          <>
            <h2 className="listing-heading">Overview</h2>
            <p className="listing-overview">{provider.bio}</p>
          </>
        )}

        <div className="listing-divider" />

        <h2 className="listing-heading">Services</h2>
        <div className="listing-services">
          {services.length === 0 ? (
            <p className="listing-empty">No services listed yet.</p>
          ) : (
            services.map(svc => (
              <div key={svc.id} className="listing-service-row">
                <span className="listing-service-name">{svc.name}</span>
                <div className="listing-service-right">
                  <div className="listing-service-price-block">
                    <span className="listing-service-price">${Number(svc.price).toFixed(0)}+</span>
                    <span className="listing-service-duration">{svc.duration_minutes ? `${svc.duration_minutes} min` : '—'}</span>
                  </div>
                  {!isOwn && session && (
                    <Link to={`/book/${id}/${svc.id}`} className="listing-service-select">Select</Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="listing-divider" />

        <h2 className="listing-heading">Reviews</h2>
        <div className="listing-reviews-summary">
          <div className="listing-reviews-score">
            <span className="listing-reviews-number">{avgRating || '—'}</span>
            <Stars value={provider.avg_rating} size="1.25rem" />
            <span className="listing-reviews-count">{reviewCount} Reviews</span>
          </div>
        </div>
        {reviews.length > 0 && (
          <div className="listing-reviews-list">
            {reviews.slice(0, 3).map((r, i) => (
              <div key={i} className="listing-review-card">
                <div className="listing-review-header">
                  {r.users?.avatar_url ? (
                    <img src={r.users.avatar_url} alt="" className="listing-review-avatar" />
                  ) : (
                    <span className="listing-review-avatar listing-review-avatar-initials">
                      {(r.users?.display_name || '?')[0]}
                    </span>
                  )}
                  <span className="listing-review-name">{r.users?.display_name || 'Anonymous'}</span>
                  <Stars value={r.rating} size="0.85rem" />
                </div>
                {r.comment && <p className="listing-review-comment">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}

        {!isOwn && session && firstService && (
          <Link to={`/book/${id}/${firstService.id}`} className="listing-book-cta">
            BOOK
          </Link>
        )}
      </div>
    </div>
  )
}
