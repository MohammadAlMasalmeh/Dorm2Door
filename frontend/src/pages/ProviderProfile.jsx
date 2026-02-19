import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function Stars({ value, size = '0.95rem' }) {
  const n = Math.round(value || 0)
  return <span style={{ color: '#f0a500', fontSize: size }}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

export default function ProviderProfile({ session }) {
  const { id } = useParams()
  const [provider, setProvider] = useState(null)
  const [reviews, setReviews]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [lightbox, setLightbox] = useState(null) // image URL for full-screen view

  useEffect(() => { fetchProvider(); fetchReviews() }, [id])

  async function fetchProvider() {
    const { data } = await supabase
      .from('providers')
      .select('*, users (display_name, email), services (*)')
      .eq('id', id)
      .single()
    setProvider(data)
    setLoading(false)
  }

  async function fetchReviews() {
    const { data } = await supabase
      .from('reviews')
      .select('rating, comment, created_at')
      .eq('provider_id', id)
      .order('created_at', { ascending: false })
    setReviews(data || [])
  }

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>
  if (!provider) return <div className="empty-state"><h3>Provider not found</h3></div>

  const name     = provider.users?.display_name || 'Provider'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const services = provider.services || []
  const isOwn    = session?.user?.id === id

  // Services with images go to portfolio grid; all services also show in the list
  const portfolioImages = services.filter(s => s.image_url)

  return (
    <div>
      <Link to="/" className="back-btn">← Browse</Link>

      {/* Profile header */}
      <div className="profile-header">
        <div className="profile-avatar">{initials}</div>
        <div style={{ flex: 1 }}>
          <div className="profile-name">{name}</div>
          {provider.location && (
            <div className="profile-location">📍 {provider.location}</div>
          )}
          <div className="rating" style={{ marginBottom: 10 }}>
            <Stars value={provider.avg_rating} />
            <span style={{ marginLeft: 6, color: '#888', fontSize: '0.8rem' }}>
              {provider.avg_rating ? Number(provider.avg_rating).toFixed(1) : 'No ratings yet'}
              {reviews.length > 0 && ` · ${reviews.length} review${reviews.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          {provider.bio && <p className="profile-bio">{provider.bio}</p>}
          <div className="provider-card-tags" style={{ marginTop: 10 }}>
            {(provider.tags || []).map(t => <span key={t} className="tag">{t}</span>)}
          </div>
        </div>
      </div>

      {/* Portfolio image grid */}
      {portfolioImages.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <p className="section-title">Portfolio</p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: portfolioImages.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 10,
          }}>
            {portfolioImages.map(svc => (
              <div
                key={svc.id}
                onClick={() => setLightbox(svc.image_url)}
                style={{
                  borderRadius: 10, overflow: 'hidden', cursor: 'zoom-in',
                  aspectRatio: '4/3', position: 'relative',
                }}
              >
                <img
                  src={svc.image_url}
                  alt={svc.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
                  padding: '24px 10px 8px',
                }}>
                  <div style={{ color: 'white', fontWeight: 600, fontSize: '0.82rem' }}>{svc.name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem' }}>
                    ${Number(svc.price).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Services list */}
      <p className="section-title">Services</p>
      {services.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: '#888', fontSize: '0.875rem', padding: 28 }}>
          No services listed yet.
        </div>
      ) : (
        services.map(svc => (
          <div key={svc.id} style={{
            background: 'var(--card)', borderRadius: 'var(--radius)',
            overflow: 'hidden', marginBottom: 10, boxShadow: 'var(--shadow)',
          }}>
            {svc.image_url && (
              <div
                onClick={() => setLightbox(svc.image_url)}
                style={{
                  height: 160, backgroundImage: `url(${svc.image_url})`,
                  backgroundSize: 'cover', backgroundPosition: 'center', cursor: 'zoom-in',
                }}
              />
            )}
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div className="service-name">{svc.name}</div>
                {svc.description && <div className="service-desc">{svc.description}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <span className="service-price">${Number(svc.price).toFixed(2)}</span>
                {!isOwn && session && (
                  <Link to={`/book/${id}/${svc.id}`} className="btn btn-primary btn-sm">
                    Book
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      {/* Reviews */}
      {reviews.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <p className="section-title">Reviews ({reviews.length})</p>
          {reviews.map((r, i) => (
            <div key={i} className="review-card">
              <div className="review-header">
                <Stars value={r.rating} size="0.9rem" />
                <span style={{ fontSize: '0.75rem', color: '#aaa' }}>
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              {r.comment && <p className="review-comment">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300, cursor: 'zoom-out', padding: 24,
          }}
        >
          <img
            src={lightbox}
            alt="Portfolio"
            style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain' }}
          />
        </div>
      )}
    </div>
  )
}
