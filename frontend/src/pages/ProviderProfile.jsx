import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
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

/** Ordered unique slides; each image maps to the service it belongs to (for favorites). */
function buildPortfolioSlides(services) {
  if (!services?.length) return []
  const slides = []
  const seen = new Set()
  for (const s of services) {
    const urls =
      s.image_urls && s.image_urls.length > 0 ? s.image_urls : s.image_url ? [s.image_url] : []
    for (const url of urls) {
      if (!url || seen.has(url)) continue
      seen.add(url)
      slides.push({ url, serviceId: s.id })
    }
  }
  return slides
}

export default function ProviderProfile({ session }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const focusServiceId = searchParams.get('service')
  const [provider, setProvider] = useState(null)
  const [reviews, setReviews] = useState([])
  const [reviewsError, setReviewsError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState(0)
  const [hoverGalleryIndex, setHoverGalleryIndex] = useState(null)
  const [friendStatus, setFriendStatus] = useState('none')
  const [friendActionLoading, setFriendActionLoading] = useState(false)
  const [reviewsExpanded, setReviewsExpanded] = useState(false)
  const [favoriteServiceIds, setFavoriteServiceIds] = useState(() => new Set())

  useEffect(() => {
    setReviewsExpanded(false)
  }, [id])

  useEffect(() => {
    setSelectedImage(0)
  }, [focusServiceId])

  useEffect(() => {
    setHoverGalleryIndex(null)
  }, [id, focusServiceId])

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

  useEffect(() => {
    if (!session?.user?.id || session.user.id === id || !provider?.services?.length) {
      if (!session?.user?.id || session.user.id === id) setFavoriteServiceIds(new Set())
      return
    }
    const ids = provider.services.map((s) => s.id)
    let cancelled = false
    void supabase
      .from('service_favorites')
      .select('service_id')
      .eq('user_id', session.user.id)
      .in('service_id', ids)
      .then(({ data }) => {
        if (cancelled) return
        setFavoriteServiceIds(new Set((data || []).map((r) => r.service_id)))
      })
    return () => {
      cancelled = true
    }
  }, [session?.user?.id, id, provider?.services])

  const focusedServices = useMemo(() => {
    const list = provider?.services || []
    if (!focusServiceId) return list
    const match = list.find((s) => String(s.id) === String(focusServiceId))
    return match ? [match] : list
  }, [provider?.services, focusServiceId])

  const portfolioSlides = useMemo(() => buildPortfolioSlides(focusedServices), [focusedServices])

  useEffect(() => {
    if (portfolioSlides.length === 0) return
    setSelectedImage((i) => Math.min(i, portfolioSlides.length - 1))
  }, [portfolioSlides.length])

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
      navigate('/profile?providerSetup=1', { replace: true })
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
  const isOwn = session?.user?.id === id
  const galleryIndex = Math.min(selectedImage, Math.max(0, portfolioSlides.length - 1))
  const previewIndex =
    hoverGalleryIndex != null && portfolioSlides[hoverGalleryIndex]
      ? hoverGalleryIndex
      : galleryIndex
  const mainSlide = portfolioSlides[previewIndex]
  const mainImage = mainSlide?.url
  const favoriteTargetServiceId = mainSlide?.serviceId

  async function handleToggleFavorite(serviceId) {
    const sid = serviceId ?? favoriteTargetServiceId
    if (!session?.user?.id || isOwn || !sid) return
    const uid = session.user.id
    const isFav = favoriteServiceIds.has(sid)
    if (isFav) {
      const { error } = await supabase.from('service_favorites').delete().eq('user_id', uid).eq('service_id', sid)
      if (error) return
      setFavoriteServiceIds((prev) => {
        const next = new Set(prev)
        next.delete(sid)
        return next
      })
    } else {
      const { error } = await supabase.from('service_favorites').insert({ user_id: uid, service_id: sid })
      if (error) return
      setFavoriteServiceIds((prev) => new Set(prev).add(sid))
    }
  }
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

  const allOptions = focusedServices.flatMap(s =>
    (s.service_options && s.service_options.length) > 0
      ? s.service_options.map(opt => ({ ...opt, serviceName: s.name, durationMin: s.duration_minutes, serviceId: s.id }))
      : [{ id: s.id, name: s.name, price: s.price, serviceName: s.name, durationMin: s.duration_minutes, serviceId: s.id }]
  )
  const primaryTitle = allOptions[0]
    ? `${allOptions[0].serviceName || focusedServices[0]?.name || name}`
    : (focusedServices[0]?.name || name)

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
          <Link to="/" className="listing-back" aria-label="Back to home">&lsaquo;</Link>
        </div>
        <div className="listing-gallery-main" style={mainImage ? { backgroundImage: `url(${mainImage})` } : {}}>
          {!mainImage && (
            <div className="listing-gallery-placeholder">{thumbPlaceholderSvg}</div>
          )}
          {!isOwn && session && favoriteTargetServiceId ? (
            <button
              type="button"
              className={`listing-gallery-favorite-btn${favoriteServiceIds.has(favoriteTargetServiceId) ? ' listing-gallery-favorite-btn--on' : ''}`}
              onClick={() => void handleToggleFavorite()}
              aria-label={
                favoriteServiceIds.has(favoriteTargetServiceId)
                  ? 'Remove from favorites'
                  : 'Add to favorites'
              }
              aria-pressed={favoriteServiceIds.has(favoriteTargetServiceId)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                />
              </svg>
            </button>
          ) : null}
        </div>
        <div
          className="listing-gallery-thumbs"
          onMouseLeave={() => setHoverGalleryIndex(null)}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <button
              key={i}
              type="button"
              className={`listing-gallery-thumb${galleryIndex === i ? ' active' : ''}`}
              onClick={() => {
                if (!portfolioSlides[i]) return
                setSelectedImage(i)
                setHoverGalleryIndex(null)
              }}
              onMouseEnter={() => {
                if (portfolioSlides[i]) setHoverGalleryIndex(i)
              }}
              style={portfolioSlides[i] ? { backgroundImage: `url(${portfolioSlides[i].url})` } : {}}
            >
              {!portfolioSlides[i] && thumbPlaceholderSvg}
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
                  <div className="listing-service-left">
                    {!isOwn && session && opt.serviceId ? (
                      <button
                        type="button"
                        className={`listing-service-favorite-btn${favoriteServiceIds.has(opt.serviceId) ? ' listing-service-favorite-btn--on' : ''}`}
                        onClick={() => void handleToggleFavorite(opt.serviceId)}
                        aria-label={
                          favoriteServiceIds.has(opt.serviceId)
                            ? 'Remove from favorites'
                            : 'Add to favorites'
                        }
                        aria-pressed={favoriteServiceIds.has(opt.serviceId)}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                          <path
                            fill="currentColor"
                            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                          />
                        </svg>
                      </button>
                    ) : null}
                    <p className="listing-service-name">
                      {opt.serviceName && opt.name !== opt.serviceName
                        ? `${opt.serviceName} (${opt.name})`
                        : opt.name}
                    </p>
                  </div>
                  <div className="listing-service-right">
                    <div className="listing-service-price-block">
                      <span className="listing-service-price">${Number(opt.price || 0).toFixed(0)}+</span>
                      <span className="listing-service-duration">{opt.durationMin ? `${opt.durationMin} min` : '30 min'}</span>
                    </div>
                    {!isOwn && session && (
                      <Link to={`/book/${id}/${opt.id}`} className="listing-service-select">Select</Link>
                    )}
                    {isOwn && (
                      <Link to={`/my-services/edit/${opt.serviceId}`} className="listing-service-select">Edit</Link>
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
