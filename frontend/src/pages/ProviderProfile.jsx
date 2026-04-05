import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function Stars({ value, size = '1rem' }) {
  const n = Math.round(value || 0)
  return <span className="listing-stars" style={{ fontSize: size }}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

const thumbPlaceholderSvg = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
)

function formatReviewDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ProviderProfile({ session }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [provider, setProvider] = useState(null)
  const [reviews, setReviews] = useState([])
  const [reviewsError, setReviewsError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState(0)
  const [friendStatus, setFriendStatus] = useState('none')
  const [friendActionLoading, setFriendActionLoading] = useState(false)
  const [reviewsExpanded, setReviewsExpanded] = useState(false)

  useEffect(() => {
    setReviewsExpanded(false)
  }, [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setReviewsError('')
    Promise.all([
      supabase
        .from('providers')
        .select('*, users (display_name, email, avatar_url, avg_customer_rating, customer_review_count), services (*, service_options (*))')
        .eq('id', id)
        .single(),
      supabase
        .from('reviews')
        .select('id, rating, comment, created_at, consumer_id, users!reviews_consumer_id_fkey(display_name, avatar_url)')
        .eq('provider_id', id)
        .order('created_at', { ascending: false }),
    ]).then(([provRes, revRes]) => {
      if (cancelled) return
      if (revRes.error) {
        setReviewsError(revRes.error.message || 'Could not load reviews')
        setReviews([])
      } else {
        setReviews(revRes.data || [])
      }
      setProvider(provRes.data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!session?.user?.id || session.user.id === id) return
    checkFriendship()
  }, [id, session?.user?.id])

  async function checkFriendship() {
    const uid = session.user.id
    const [{ data: friend }, { data: request }] = await Promise.all([
      supabase.from('friends').select('user_id').eq('user_id', uid).eq('friend_id', id).maybeSingle(),
      supabase
        .from('friend_requests')
        .select('sender_id, status')
        .or(`and(sender_id.eq.${uid},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${uid})`)
        .eq('status', 'pending')
        .maybeSingle(),
    ])
    if (friend) setFriendStatus('friends')
    else if (request?.sender_id === uid) setFriendStatus('pending_sent')
    else if (request) setFriendStatus('pending_received')
    else setFriendStatus('none')
  }

  async function handleFriendAction() {
    setFriendActionLoading(true)
    if (friendStatus === 'none') {
      await supabase.from('friend_requests').insert({ sender_id: session.user.id, receiver_id: id })
      setFriendStatus('pending_sent')
    } else if (friendStatus === 'pending_received') {
      const { data: req } = await supabase.from('friend_requests').select('id').eq('sender_id', id).eq('receiver_id', session.user.id).eq('status', 'pending').maybeSingle()
      if (req) {
        await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', req.id)
        setFriendStatus('friends')
      }
    } else if (friendStatus === 'friends') {
      await supabase.rpc('unfriend', { friend: id })
      setFriendStatus('none')
    }
    setFriendActionLoading(false)
  }

  async function handleMessage() {
    const { data: convId } = await supabase.rpc('get_or_create_conversation', { other_user: id })
    if (convId) navigate(`/messages/${convId}`)
  }

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>
  if (!provider) {
    if (session?.user?.id === id) {
      navigate('/my-services?setup=1', { replace: true })
      return null
    }
    return (
      <div className="empty-state">
        <h3>Provider not found</h3>
        <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>This profile may have been removed or the link might be outdated.</p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Back to home</Link>
      </div>
    )
  }

  const name = provider.users?.display_name || 'Provider'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const services = provider.services || []
  const isOwn = session?.user?.id === id
  const portfolioImages = Array.from(new Set(
    services.flatMap(s => {
      const urls = (s.image_urls && s.image_urls.length > 0) ? s.image_urls : (s.image_url ? [s.image_url] : [])
      return urls
    }).filter(Boolean)
  ))
  const mainImage = portfolioImages[selectedImage] || portfolioImages[0]
  const reviewCount = reviews.length
  const avgFromReviews = reviewCount > 0
    ? reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviewCount
    : null
  const avgNumeric = avgFromReviews != null
    ? avgFromReviews
    : (provider.avg_rating != null && Number(provider.avg_rating) > 0 ? Number(provider.avg_rating) : null)
  const avgRating = avgNumeric != null ? avgNumeric.toFixed(1) : null
  const u = provider.users
  const customerReviewCount = u?.customer_review_count ?? 0
  const customerAvg =
    u?.avg_customer_rating != null && Number(u.avg_customer_rating) > 0
      ? Number(u.avg_customer_rating).toFixed(1)
      : null
  const tags = (provider.tags || []).slice(0, 3)
  const visibleReviews = reviewsExpanded ? reviews : reviews.slice(0, 3)

  const ratingBuckets = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
  }))
  const maxBucket = Math.max(...ratingBuckets.map(b => b.count), 1)

  const allOptions = services.flatMap(s =>
    (s.service_options && s.service_options.length) > 0
      ? s.service_options.map(opt => ({ ...opt, serviceName: s.name, durationMin: s.duration_minutes }))
      : [{ id: s.id, name: s.name, price: s.price, serviceName: s.name, durationMin: s.duration_minutes }]
  )
  const primaryTitle = allOptions[0]
    ? `${allOptions[0].serviceName || services[0]?.name || name}`
    : (services[0]?.name || name)

  const friendBtnLabel = {
    none: 'Add Friend',
    pending_sent: 'Pending',
    pending_received: 'Accept Request',
    friends: 'Friends',
  }[friendStatus]

  return (
    <div className="listing-page figma-listing">
      {/* Left: gallery */}
      <div className="listing-gallery">
        <div className="listing-back-row">
          <Link to="/" className="listing-back" aria-label="Back">&lsaquo;</Link>
          <Link to={`/user/${id}`} className="listing-back listing-back-profile">Profile</Link>
        </div>
        <div className="listing-gallery-main" style={mainImage ? { backgroundImage: `url(${mainImage})` } : {}}>
          {!mainImage && (
            <div className="listing-gallery-placeholder">{thumbPlaceholderSvg}</div>
          )}
        </div>
        <div className="listing-gallery-thumbs">
          {[0, 1, 2].map(i => (
            <button
              key={i}
              type="button"
              className={`listing-gallery-thumb${selectedImage === i ? ' active' : ''}`}
              onClick={() => portfolioImages[i] && setSelectedImage(i)}
              style={portfolioImages[i] ? { backgroundImage: `url(${portfolioImages[i]})` } : {}}
            >
              {!portfolioImages[i] && thumbPlaceholderSvg}
            </button>
          ))}
        </div>
      </div>

      {/* Right: content */}
      <div className="listing-content">
        <div className="listing-header-row">
          <div className="listing-header-actions">
            {!isOwn && session && (
              <>
                <button
                  type="button"
                  className={`listing-friend-btn${friendStatus === 'friends' ? ' listing-friend-btn-active' : ''}${friendStatus === 'pending_sent' ? ' listing-friend-btn-pending' : ''}`}
                  onClick={handleFriendAction}
                  disabled={friendActionLoading || friendStatus === 'pending_sent'}
                >
                  {friendBtnLabel}
                </button>
                <button type="button" className="listing-message-btn-inline" onClick={handleMessage}>
                  Message
                </button>
              </>
            )}
            <button type="button" className="listing-icon-btn" aria-label="Share">&loz;</button>
            <button type="button" className="listing-icon-btn" aria-label="Save">&hearts;</button>
          </div>
          <h1 className="listing-title">{primaryTitle}</h1>
          <div className="listing-tags">
            <span className="listing-tag listing-tag-verified">Verified</span>
            {tags.map((t, i) => (
              <span key={i} className="listing-tag">{t}</span>
            ))}
          </div>
        </div>

        {/* Provider row — click avatar/name to go to profile */}
        <div className="listing-provider-row">
          <Link to={`/user/${id}`} className="listing-provider-link" aria-label={`View ${name}'s profile`}>
            {provider.users?.avatar_url ? (
              <img src={provider.users.avatar_url} alt="" className="listing-provider-avatar" />
            ) : (
              <span className="listing-provider-avatar listing-provider-avatar-initials">{initials}</span>
            )}
            <span className="listing-provider-name">{name}</span>
          </Link>
          {provider.location && (
            <span className="listing-provider-location">
              {provider.location} &middot; ~30min
            </span>
          )}
        </div>
        <div className="listing-customer-rating" aria-label="Customer rating">
          <span className="listing-customer-rating-label">Customer rating</span>
          {customerReviewCount > 0 && customerAvg ? (
            <>
              <Stars value={u?.avg_customer_rating} size="0.85rem" />
              <span className="listing-customer-rating-score">{customerAvg}</span>
              <span className="listing-customer-rating-count">
                ({customerReviewCount} {customerReviewCount === 1 ? 'review' : 'reviews'})
              </span>
            </>
          ) : (
            <span className="listing-customer-rating-empty">No customer reviews yet</span>
          )}
        </div>

        {/* Overview */}
        {provider.bio && (
          <div>
            <h2 className="listing-heading">Overview</h2>
            <p className="listing-overview">{provider.bio}</p>
          </div>
        )}

        <div className="listing-divider" />

        {/* Services */}
        <div>
          <h2 className="listing-heading">Services</h2>
          <div className="listing-services">
            {allOptions.length === 0 ? (
              <p className="listing-empty">No services listed yet.</p>
            ) : (
              allOptions.map(opt => (
                <div key={opt.id} className="listing-service-card">
                  <p className="listing-service-name">
                    {opt.serviceName && opt.name !== opt.serviceName
                      ? `${opt.serviceName} (${opt.name})`
                      : opt.name}
                  </p>
                  <div className="listing-service-right">
                    <div className="listing-service-price-block">
                      <span className="listing-service-price">${Number(opt.price || 0).toFixed(0)}+</span>
                      <span className="listing-service-duration">{opt.durationMin ? `${opt.durationMin} min` : '30 min'}</span>
                    </div>
                    {!isOwn && session && (
                      <Link to={`/book/${id}/${opt.id}`} className="listing-service-select">Select</Link>
                    )}
                    {isOwn && (
                      <Link to={`/my-services?edit=${opt.id}`} className="listing-service-select">Edit</Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="listing-divider" />

        {/* Reviews */}
        <div>
          <h2 className="listing-heading">Reviews</h2>
          <div className="listing-reviews-section">
            <div className="listing-reviews-summary">
              <div className="listing-reviews-score">
                <span className="listing-reviews-number">{avgRating || '—'}</span>
                <Stars value={avgNumeric} size="1rem" />
                <span className="listing-reviews-count">{reviewCount} {reviewCount === 1 ? 'Review' : 'Reviews'}</span>
              </div>
              <div className="listing-reviews-bars">
                {ratingBuckets.map(b => (
                  <div key={b.star} className="listing-reviews-bar-row">
                    <span className="listing-reviews-bar-label">{b.star}</span>
                    <div className="listing-reviews-bar-track">
                      <div
                        className="listing-reviews-bar-fill"
                        style={{ width: `${b.count ? (b.count / maxBucket) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {reviewsError && (
              <p className="listing-empty" style={{ marginTop: 12 }} role="alert">{reviewsError}</p>
            )}
            {reviewCount === 0 && !reviewsError && (
              <p className="listing-empty" style={{ marginTop: 12 }}>No reviews yet. Book a service and leave the first one after your appointment.</p>
            )}
            {reviewCount > 0 && (
              <div className="listing-reviews-list">
                {visibleReviews.map((r) => (
                  <div key={r.id} className="listing-review-card">
                    <div className="listing-review-header">
                      {r.users?.avatar_url ? (
                        <img src={r.users.avatar_url} alt="" className="listing-review-avatar" />
                      ) : (
                        <span className="listing-review-avatar listing-review-avatar-initials">{(r.users?.display_name || '?')[0]}</span>
                      )}
                      <span className="listing-review-name">{r.users?.display_name || 'Anonymous'}</span>
                      <Stars value={r.rating} size="0.85rem" />
                      {r.created_at && (
                        <span className="listing-review-date" style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {formatReviewDate(r.created_at)}
                        </span>
                      )}
                    </div>
                    {r.comment && <p className="listing-review-comment">{r.comment}</p>}
                  </div>
                ))}
                {reviewCount > 3 && (
                  <button
                    type="button"
                    className="listing-service-select"
                    style={{ marginTop: 12, alignSelf: 'flex-start', border: 'none', cursor: 'pointer', background: 'transparent', padding: 0 }}
                    onClick={() => setReviewsExpanded(e => !e)}
                  >
                    {reviewsExpanded ? 'Show fewer' : `Show all ${reviewCount} reviews`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom CTAs */}
        {!isOwn && session && (
          <>
            <button type="button" className="listing-send-message-btn" onClick={handleMessage}>
              Send a Message
            </button>
          </>
        )}
      </div>
    </div>
  )
}
