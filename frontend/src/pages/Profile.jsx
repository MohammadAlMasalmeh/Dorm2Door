import { useState, useRef, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { normalizeServiceCategories } from '../constants/serviceCategories'
import ProviderProfileForm from '../components/ProviderProfileForm'
import ServiceListingCard from '../components/ServiceListingCard'
import { galleryUrlsForService, priceLabelForService } from '../serviceListingUtils'

const AVATAR_BUCKET = 'avatars'
const MAX_SIZE_MB = 2
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function ImagePlaceholderIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function AddFriendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </svg>
  )
}

function formatReviewDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRelativeTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = Date.now()
  const diffMs = now - d.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 45) return 'Just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const days = Math.floor(hr / 24)
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatReviewDate(iso)
}

function starsForAverage(avg) {
  if (avg == null || Number.isNaN(Number(avg))) return '☆☆☆☆☆'
  const n = Math.min(5, Math.max(0, Math.round(Number(avg))))
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`
}

export default function Profile({ session, userProfile, onUpdate }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [displayName, setDisplayName] = useState(userProfile?.display_name ?? '')
  const [bio, setBio] = useState(userProfile?.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(userProfile?.avatar_url ?? '')
  const [bannerUrl, setBannerUrl] = useState(userProfile?.banner_url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState('favorited')
  const [provider, setProvider] = useState(null)
  const [providerServices, setProviderServices] = useState([])
  const [serviceStats, setServiceStats] = useState({})
  const [providerReviews, setProviderReviews] = useState([])
  const [favoritedServices, setFavoritedServices] = useState([])
  /** Reviews providers left for this user (`customer_reviews`), shown on the consumer Reviews tab */
  const [customerReviews, setCustomerReviews] = useState([])
  const [contentLoading, setContentLoading] = useState(true)
  const [friendCount, setFriendCount] = useState(0)
  const [suggestedFriend, setSuggestedFriend] = useState(null)
  const [suggestedFriendStatus, setSuggestedFriendStatus] = useState('none')
  const [suggestedFriendLoading, setSuggestedFriendLoading] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [tagsInput, setTagsInput] = useState('')
  const fileInputRef = useRef(null)
  const bannerInputRef = useRef(null)

  const uid = session?.user?.id

  useEffect(() => {
    if (searchParams.get('providerSetup') !== '1') return
    setShowEditModal(true)
    const next = new URLSearchParams(searchParams)
    next.delete('providerSetup')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    setDisplayName(userProfile?.display_name ?? '')
    setBio(userProfile?.bio ?? '')
    setAvatarUrl(userProfile?.avatar_url ?? '')
    setBannerUrl(userProfile?.banner_url ?? '')
  }, [userProfile?.display_name, userProfile?.bio, userProfile?.avatar_url, userProfile?.banner_url])

  useEffect(() => {
    const arr = userProfile?.tags ?? []
    setTagsInput(Array.isArray(arr) ? arr.filter(Boolean).join(', ') : '')
  }, [userProfile?.tags])

  // Fetch provider data
  useEffect(() => {
    if (!uid) return
    void (async () => {
      const { data } = await supabase
        .from('providers')
        .select('bio, tags, location, avg_rating')
        .eq('id', uid)
        .maybeSingle()
      setProvider(data)
    })()
  }, [uid])

  // Fetch friend/follower count
  useEffect(() => {
    if (!uid) return
    void (async () => {
      const { data: rows } = await supabase
        .from('friends')
        .select('user_id, friend_id')
        .or(`user_id.eq.${uid},friend_id.eq.${uid}`)
      if (!rows?.length) {
        setFriendCount(0)
        return
      }
      const friendIds = [...new Set(rows.map((r) => (r.user_id === uid ? r.friend_id : r.user_id)))]
      setFriendCount(friendIds.length)
    })()
  }, [uid])

  // Fetch tab content
  useEffect(() => {
    if (!uid) return
    setContentLoading(true)
    void (async () => {
      const [
        providerServicesRes,
        providerReviewsRes,
        customerReviewsRes,
        favoritedIdsRes,
        completedApptsRes,
      ] = await Promise.all([
        supabase
          .from('services')
          .select('id, name, description, image_url, image_urls, service_options(id, name, price)')
          .eq('provider_id', uid),
        supabase
          .from('reviews')
          .select(
            'id, rating, comment, created_at, appointment_id, consumer_id, users!reviews_consumer_id_fkey(display_name, avatar_url)',
          )
          .eq('provider_id', uid)
          .order('created_at', { ascending: false }),
        supabase
          .from('customer_reviews')
          .select('id, rating, comment, created_at, provider_id, appointment_id')
          .eq('consumer_id', uid)
          .order('created_at', { ascending: false }),
        supabase
          .from('service_favorites')
          .select('service_id, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: false }),
        supabase
          .from('appointments')
          .select('service_id, service_options(price), services(price)')
          .eq('provider_id', uid)
          .eq('status', 'completed'),
      ])

      const servicesList = providerServicesRes.data || []
      setProviderServices(servicesList)

      const reviewRows = providerReviewsRes.data || []
      const apptIds = [...new Set(reviewRows.map((r) => r.appointment_id).filter(Boolean))]
      let apptToService = {}
      if (apptIds.length) {
        const { data: apRows } = await supabase.from('appointments').select('id, service_id').in('id', apptIds)
        ;(apRows || []).forEach((a) => {
          apptToService[a.id] = a.service_id
        })
      }
      const ratingsByService = {}
      reviewRows.forEach((r) => {
        const sid = apptToService[r.appointment_id]
        if (!sid) return
        if (!ratingsByService[sid]) ratingsByService[sid] = []
        ratingsByService[sid].push(Number(r.rating) || 0)
      })

      const stats = {}
      ;(completedApptsRes.data || []).forEach((a) => {
        const sid = a.service_id
        if (!sid) return
        if (!stats[sid]) stats[sid] = { revenue: 0, bookings: 0, avgRating: null, reviewCount: 0 }
        stats[sid].bookings += 1
        const p = a.service_options?.price != null ? a.service_options.price : a.services?.price
        if (p != null) stats[sid].revenue += Number(p)
      })
      Object.keys(ratingsByService).forEach((sid) => {
        const arr = ratingsByService[sid]
        const avg = arr.reduce((s, x) => s + x, 0) / arr.length
        if (!stats[sid]) stats[sid] = { revenue: 0, bookings: 0, avgRating: null, reviewCount: 0 }
        stats[sid].avgRating = avg
        stats[sid].reviewCount = arr.length
      })
      servicesList.forEach((s) => {
        if (!stats[s.id]) stats[s.id] = { revenue: 0, bookings: 0, avgRating: null, reviewCount: 0 }
      })
      setServiceStats(stats)

      setProviderReviews(reviewRows)

      const customerReviewRows = customerReviewsRes.data || []
      if (customerReviewRows.length > 0) {
        const providerIds = [...new Set(customerReviewRows.map((r) => r.provider_id).filter(Boolean))]
        const { data: provRows } = await supabase
          .from('providers')
          .select('id, users(display_name, avatar_url)')
          .in('id', providerIds)
        const providerMap = Object.fromEntries(
          (provRows || []).map((p) => [
            p.id,
            {
              name: p.users?.display_name || 'Provider',
              avatar_url: p.users?.avatar_url || null,
            },
          ]),
        )
        setCustomerReviews(
          customerReviewRows.map((r) => ({
            ...r,
            provider_name: providerMap[r.provider_id]?.name || 'Provider',
            provider_avatar: providerMap[r.provider_id]?.avatar_url || null,
          })),
        )
      } else {
        setCustomerReviews([])
      }

      const favIdRows = favoritedIdsRes.data || []
      const favServiceIds = [...new Set(favIdRows.map((r) => r.service_id).filter(Boolean))]
      let servicesById = {}
      if (favServiceIds.length > 0) {
        const { data: favSvcRows } = await supabase
          .from('services')
          .select(
            `id, name, description, image_url, image_urls, provider_id,
             service_options (id, name, price),
             providers ( location, avg_rating, users (display_name, avatar_url) )`,
          )
          .in('id', favServiceIds)
        servicesById = Object.fromEntries((favSvcRows || []).map((s) => [s.id, s]))
      }
      const favList = favIdRows
        .map((row) => {
          const s = servicesById[row.service_id]
          if (!s?.id) return null
          const opts = s.service_options || []
          return {
            id: s.id,
            name: s.name,
            description: s.description,
            image_url: s.image_url,
            image_urls: s.image_urls,
            provider_id: s.provider_id,
            provider_name: s.providers?.users?.display_name || 'Provider',
            provider_avatar: s.providers?.users?.avatar_url,
            provider_avg_rating: s.providers?.avg_rating != null ? Number(s.providers.avg_rating) : 0,
            location: (s.providers?.location || '').trim(),
            service_options: opts,
          }
        })
        .filter(Boolean)
      setFavoritedServices(favList)
      setContentLoading(false)
    })()
  }, [uid])

  async function fetchFriendshipStatus(currentUserId, otherUserId) {
    const [{ data: friend }, { data: request }] = await Promise.all([
      supabase
        .from('friends')
        .select('user_id')
        .or(`and(user_id.eq.${currentUserId},friend_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},friend_id.eq.${currentUserId})`)
        .maybeSingle(),
      supabase
        .from('friend_requests')
        .select('sender_id, status')
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`)
        .eq('status', 'pending')
        .maybeSingle(),
    ])
    if (friend) return 'friends'
    if (request?.sender_id === currentUserId) return 'pending_sent'
    if (request) return 'pending_received'
    return 'none'
  }

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    void (async () => {
      const { data: users } = await supabase
        .from('users')
        .select('id, display_name, avatar_url')
        .neq('id', uid)
        .limit(1)
      const candidate = users?.[0] ?? null
      if (!candidate || cancelled) {
        if (!cancelled) {
          setSuggestedFriend(null)
          setSuggestedFriendStatus('none')
        }
        return
      }

      const [{ data: providerRow }, status] = await Promise.all([
        supabase.from('providers').select('location').eq('id', candidate.id).maybeSingle(),
        fetchFriendshipStatus(uid, candidate.id),
      ])
      if (cancelled) return
      setSuggestedFriend({
        ...candidate,
        location: providerRow?.location || 'Nearby campus',
      })
      setSuggestedFriendStatus(status)
    })()
    return () => {
      cancelled = true
    }
  }, [uid])

  async function handleSuggestedFriendAction() {
    if (!uid || !suggestedFriend?.id || suggestedFriendLoading) return
    const targetId = suggestedFriend.id
    setSuggestedFriendLoading(true)
    const priorStatus = suggestedFriendStatus

    if (suggestedFriendStatus === 'none') {
      const { error: insertError } = await supabase
        .from('friend_requests')
        .insert({ sender_id: uid, receiver_id: targetId })
      if (insertError && insertError.code !== '23505') {
        setSuggestedFriendLoading(false)
        return
      }
    } else if (suggestedFriendStatus === 'pending_received') {
      const { data: req } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('sender_id', targetId)
        .eq('receiver_id', uid)
        .eq('status', 'pending')
        .maybeSingle()
      if (req?.id) {
        await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', req.id)
      }
    }

    const nextStatus = await fetchFriendshipStatus(uid, targetId)
    setSuggestedFriendStatus(nextStatus)
    if (priorStatus !== 'friends' && nextStatus === 'friends') {
      setFriendCount((c) => c + 1)
    }
    setSuggestedFriendLoading(false)
  }

  const initials = (userProfile?.display_name || session?.user?.email || '?')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const tags = (userProfile?.tags ?? []).filter(Boolean).slice(0, 5)
  const aboutText = bio || provider?.bio || ''
  const isProviderProfile =
    userProfile?.role === 'provider' ||
    session?.user?.user_metadata?.role === 'provider'
  const visibleTabs = isProviderProfile
    ? [
        { id: 'services', label: 'Services' },
        { id: 'reviews', label: 'Reviews' },
      ]
    : [
        { id: 'favorited', label: 'Favorited' },
        { id: 'reviews', label: 'Reviews' },
      ]
  const providerReviewAverage = providerReviews.length
    ? providerReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / providerReviews.length
    : null
  const providerRatingBuckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: providerReviews.filter((r) => Number(r.rating) === star).length,
  }))
  const maxBucket = Math.max(...providerRatingBuckets.map((b) => b.count), 1)

  const consumerReviewAverage = customerReviews.length
    ? customerReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / customerReviews.length
    : null
  const consumerRatingBuckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: customerReviews.filter((r) => Number(r.rating) === star).length,
  }))
  const consumerMaxBucket = Math.max(...consumerRatingBuckets.map((b) => b.count), 1)

  useEffect(() => {
    const defaultTab = isProviderProfile ? 'services' : 'favorited'
    if (!visibleTabs.some((t) => t.id === activeTab)) setActiveTab(defaultTab)
  }, [isProviderProfile, activeTab, visibleTabs])

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Image must be under ${MAX_SIZE_MB} MB`)
      return
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please use JPEG, PNG, WebP, or GIF')
      return
    }
    setError('')
    setSaving(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${session.user.id}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { upsert: true })
    if (uploadError) {
      setError(uploadError.message)
      setSaving(false)
      return
    }
    const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: publicUrl })
      .eq('id', session.user.id)
    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }
    setAvatarUrl(publicUrl)
    onUpdate?.()
    setSaving(false)
  }

  async function handleBannerChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Image must be under ${MAX_SIZE_MB} MB`)
      return
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please use JPEG, PNG, WebP, or GIF')
      return
    }
    setError('')
    setSaving(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${session.user.id}/banner.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { upsert: true })
    if (uploadError) {
      setError(uploadError.message)
      setSaving(false)
      return
    }
    const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
    const { error: updateError } = await supabase
      .from('users')
      .update({ banner_url: publicUrl })
      .eq('id', session.user.id)
    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }
    setBannerUrl(publicUrl)
    onUpdate?.()
    setSaving(false)
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setSaving(true)
    const tagsArray = normalizeServiceCategories(tagsInput.split(',').map((s) => s.trim()).filter(Boolean))
    const { error: updateError } = await supabase
      .from('users')
      .update({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        tags: tagsArray,
      })
      .eq('id', session.user.id)
    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }
    onUpdate?.()
    setSuccess(true)
    setSaving(false)
    setShowEditModal(false)
  }

  return (
    <div className="profile-page">
      <div className="profile-page-layout">
        <div className="profile-main">
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleAvatarChange}
            style={{ display: 'none' }}
          />
          <input
            ref={bannerInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleBannerChange}
            style={{ display: 'none' }}
          />

          <div className="profile-banner-wrap">
            <button
              type="button"
              className="profile-banner"
              onClick={() => bannerInputRef.current?.click()}
              disabled={saving}
              aria-label="Change cover photo"
            >
              {bannerUrl ? (
                <img src={bannerUrl} alt="" className="profile-banner-img" />
              ) : (
                <span className="profile-banner-placeholder">
                  <ImagePlaceholderIcon />
                </span>
              )}
            </button>
            <div className="profile-avatar-tags-row">
              <button
                type="button"
                className="profile-avatar-large"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                aria-label="Change profile photo"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" />
                ) : (
                  <span className="profile-avatar-initials">{initials}</span>
                )}
              </button>
              <div className="profile-tags-wrap">
                {tags.map((tag, i) => (
                  <span key={i} className="profile-tag">{tag}</span>
                ))}
                <button
                  type="button"
                  className="profile-edit-icon"
                  onClick={() => setShowEditModal(true)}
                  aria-label="Edit profile"
                >
                  <EditIcon />
                </button>
              </div>
            </div>
          </div>

          <div className="profile-about-row">
            <div className="profile-info-block">
              <h1 className="profile-display-name">{userProfile?.display_name || 'User'}</h1>
              <p className="profile-friends">{friendCount} Following  {friendCount} Followers</p>
              <section className="profile-about">
                <h2 className="profile-about-title">About</h2>
                <p className="profile-about-text">{aboutText || 'Add a short bio in settings.'}</p>
              </section>
            </div>
            <aside className="profile-friends-panel" aria-label="Friends and suggestions">
              <h2 className="profile-friends-panel-title">Suggested for you</h2>
              {suggestedFriend ? (
                <article className="profile-friend-suggestion-card">
                  <div className="profile-friend-suggestion-avatar" aria-hidden>
                    {suggestedFriend.avatar_url ? (
                      <img src={suggestedFriend.avatar_url} alt="" className="profile-friend-suggestion-avatar-img" />
                    ) : (
                      (suggestedFriend.display_name || 'ST')
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)
                    )}
                  </div>
                  <div className="profile-friend-suggestion-main">
                    <p className="profile-friend-suggestion-name">{suggestedFriend.display_name || 'New friend'}</p>
                    <p className="profile-friend-suggestion-subtitle">{suggestedFriend.location || 'Nearby campus'}</p>
                  </div>
                  <button
                    type="button"
                    className={`profile-friend-suggestion-add-btn${suggestedFriendStatus === 'friends' ? ' profile-friend-suggestion-add-btn-active' : ''}${suggestedFriendStatus === 'pending_sent' ? ' profile-friend-suggestion-add-btn-pending' : ''}`}
                    aria-label="Add suggested friend"
                    onClick={handleSuggestedFriendAction}
                    disabled={suggestedFriendLoading || suggestedFriendStatus === 'pending_sent' || suggestedFriendStatus === 'friends'}
                  >
                    <AddFriendIcon />
                    <span>{{
                      none: 'Add',
                      pending_sent: 'Pending',
                      pending_received: 'Accept',
                      friends: 'Friends',
                    }[suggestedFriendStatus]}</span>
                  </button>
                </article>
              ) : (
                <article className="profile-friend-suggestion-card">
                  <div className="profile-friend-suggestion-main">
                    <p className="profile-friend-suggestion-name">No suggestions right now</p>
                    <p className="profile-friend-suggestion-subtitle">Check back later for new people to connect with.</p>
                  </div>
                </article>
              )}
            </aside>
          </div>

          <nav className="profile-tabs profile-tabs-below-about" aria-label="Profile sections">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`profile-tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="profile-tab-content">
            {contentLoading ? <p className="profile-section-desc">Loading…</p> : null}

            {!contentLoading && isProviderProfile && activeTab === 'services' && (
              <section className="profile-section">
                {providerServices.length === 0 ? (
                  <p className="profile-section-desc">No services added yet.</p>
                ) : (
                  <div className="profile-services-grid">
                    {providerServices.map((svc) => {
                      const st = serviceStats[svc.id] || {
                        revenue: 0,
                        bookings: 0,
                        avgRating: null,
                        reviewCount: 0,
                      }
                      const rating =
                        st.avgRating != null ? st.avgRating : Number(provider?.avg_rating || 0)
                      return (
                        <ServiceListingCard
                          key={svc.id}
                          resetKey={svc.id}
                          portfolioUrls={galleryUrlsForService(svc)}
                          serviceName={svc.name}
                          priceLabel={priceLabelForService(svc)}
                          rating={rating}
                          providerName={userProfile?.display_name || 'You'}
                          providerAvatarUrl={userProfile?.avatar_url || null}
                        />
                      )
                    })}
                  </div>
                )}
              </section>
            )}

            {!contentLoading && !isProviderProfile && activeTab === 'favorited' && (
              <section className="profile-section">
                {favoritedServices.length === 0 ? (
                  <p className="profile-section-desc">
                    No favorited services yet. Tap the heart on a service row or listing photo to save it here.
                  </p>
                ) : (
                  <div className="profile-services-grid">
                    {favoritedServices.map((svc) => (
                      <ServiceListingCard
                        key={svc.id}
                        resetKey={svc.id}
                        portfolioUrls={galleryUrlsForService(svc)}
                        serviceName={svc.name}
                        priceLabel={priceLabelForService(svc)}
                        rating={svc.provider_avg_rating ?? 0}
                        providerName={svc.provider_name}
                        providerAvatarUrl={svc.provider_avatar || null}
                        linkTo={`/provider/${svc.provider_id}?service=${encodeURIComponent(svc.id)}`}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {!contentLoading && activeTab === 'reviews' && (
              <section className="profile-section">
                {isProviderProfile ? (
                  <>
                    <div className="profile-reviews-summary">
                      <div className="profile-reviews-score">
                        <p className="profile-reviews-score-num">
                          {providerReviewAverage != null ? providerReviewAverage.toFixed(1) : '—'}
                        </p>
                        <div className="profile-reviews-score-stars" aria-hidden>
                          {starsForAverage(providerReviewAverage)}
                        </div>
                        <span className="profile-reviews-score-count">({providerReviews.length})</span>
                      </div>
                      <div className="profile-reviews-bars-wrap">
                        <div className="profile-reviews-bars">
                          {providerRatingBuckets.map((b) => (
                            <div key={b.star} className="profile-reviews-bar-row">
                              <span className="profile-reviews-bar-label">{b.star}</span>
                              <div className="profile-reviews-bar-track">
                                <div
                                  className="profile-reviews-bar-fill"
                                  style={{ width: `${b.count ? (b.count / maxBucket) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="profile-reviews-list">
                      {providerReviews.length === 0 ? (
                        <p className="profile-section-desc">No reviews yet.</p>
                      ) : (
                        providerReviews.map((r) => {
                          const name = r.users?.display_name || 'Anonymous'
                          const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
                          return (
                            <article key={r.id} className="profile-review-card">
                              <div className="profile-review-stars-row" aria-hidden>
                                {'★'.repeat(Number(r.rating) || 0)}
                                {'☆'.repeat(5 - (Number(r.rating) || 0))}
                              </div>
                              {r.comment ? <p className="profile-review-comment">{r.comment}</p> : null}
                              <div className="profile-review-footer">
                                <div className="profile-review-user">
                                  {r.users?.avatar_url ? (
                                    <img src={r.users.avatar_url} alt="" className="profile-review-avatar" />
                                  ) : (
                                    <span className="profile-review-avatar profile-review-avatar-initials">{initials}</span>
                                  )}
                                  <div className="profile-review-user-text">
                                    <span className="profile-review-name">{name}</span>
                                  </div>
                                </div>
                                <span className="profile-review-relative">{formatRelativeTime(r.created_at)}</span>
                              </div>
                            </article>
                          )
                        })
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="profile-reviews-summary">
                      <div className="profile-reviews-score">
                        <p className="profile-reviews-score-num">
                          {consumerReviewAverage != null ? consumerReviewAverage.toFixed(1) : '—'}
                        </p>
                        <div className="profile-reviews-score-stars" aria-hidden>
                          {starsForAverage(consumerReviewAverage)}
                        </div>
                        <span className="profile-reviews-score-count">({customerReviews.length})</span>
                      </div>
                      <div className="profile-reviews-bars-wrap">
                        <div className="profile-reviews-bars">
                          {consumerRatingBuckets.map((b) => (
                            <div key={b.star} className="profile-reviews-bar-row">
                              <span className="profile-reviews-bar-label">{b.star}</span>
                              <div className="profile-reviews-bar-track">
                                <div
                                  className="profile-reviews-bar-fill"
                                  style={{ width: `${b.count ? (b.count / consumerMaxBucket) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="profile-reviews-list">
                      {customerReviews.length === 0 ? (
                        <p className="profile-section-desc">
                          No reviews from providers yet. They appear here after a provider rates you following a completed visit.
                        </p>
                      ) : (
                        customerReviews.map((r) => {
                          const pname = r.provider_name || 'Provider'
                          const pinitials = pname
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)
                          return (
                            <article key={r.id} className="profile-review-card">
                              <div className="profile-review-stars-row" aria-hidden>
                                {'★'.repeat(Number(r.rating) || 0)}
                                {'☆'.repeat(5 - (Number(r.rating) || 0))}
                              </div>
                              {r.comment ? <p className="profile-review-comment">{r.comment}</p> : null}
                              <div className="profile-review-footer">
                                <div className="profile-review-user">
                                  {r.provider_avatar ? (
                                    <img src={r.provider_avatar} alt="" className="profile-review-avatar" />
                                  ) : (
                                    <span className="profile-review-avatar profile-review-avatar-initials">{pinitials}</span>
                                  )}
                                  <div className="profile-review-user-text">
                                    <span className="profile-review-name">{pname}</span>
                                  </div>
                                </div>
                                <span className="profile-review-relative">{formatRelativeTime(r.created_at)}</span>
                              </div>
                            </article>
                          )
                        })
                      )}
                    </div>
                  </>
                )}
              </section>
            )}
          </div>

          <div className="profile-sign-out-wrap">
            <button
              type="button"
              className="profile-sign-out-btn"
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      {showEditModal && (
        <div className="profile-edit-modal-overlay" onClick={() => !saving && setShowEditModal(false)} aria-hidden={!showEditModal}>
          <div className="profile-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="profile-edit-modal-header">
              <h2 className="profile-edit-modal-title">Edit profile</h2>
              <button type="button" className="profile-edit-modal-close" onClick={() => !saving && setShowEditModal(false)} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="profile-edit-modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              {success && <div className="alert alert-success">Profile updated.</div>}
              <div className="profile-edit-modal-photo-row">
                <button
                  type="button"
                  className="profile-edit-modal-avatar"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" />
                  ) : (
                    <span className="profile-edit-modal-avatar-initials">{initials}</span>
                  )}
                </button>
                <div className="profile-edit-modal-photo-actions">
                  <button type="button" className="profile-edit-modal-photo-link" onClick={() => fileInputRef.current?.click()} disabled={saving}>
                    Change photo
                  </button>
                  <span className="profile-edit-modal-hint">JPEG, PNG, WebP or GIF. Max {MAX_SIZE_MB} MB.</span>
                </div>
              </div>
              <div className="profile-edit-modal-field">
                <label className="profile-edit-modal-label">Banner photo</label>
                <button
                  type="button"
                  className="profile-edit-modal-cover-btn"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={saving}
                >
                  {bannerUrl ? 'Change banner' : 'Add banner photo'}
                </button>
              </div>
              <form onSubmit={handleSaveProfile} className="profile-edit-modal-form">
                <div className="profile-edit-modal-field">
                  <label className="profile-edit-modal-label" htmlFor="profile-display-name">Display name</label>
                  <input
                    id="profile-display-name"
                    type="text"
                    className="profile-edit-modal-input"
                    placeholder="Your name"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="profile-edit-modal-field">
                  <label className="profile-edit-modal-label" htmlFor="profile-bio">Bio</label>
                  <textarea
                    id="profile-bio"
                    className="profile-edit-modal-input profile-edit-modal-textarea"
                    placeholder="A short bio for your profile"
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="profile-edit-modal-field">
                  <label className="profile-edit-modal-label" htmlFor="profile-tags">Tags</label>
                  <input
                    id="profile-tags"
                    type="text"
                    className="profile-edit-modal-input"
                    placeholder="academic, creative, beauty (comma-separated)"
                    value={tagsInput}
                    onChange={e => setTagsInput(e.target.value)}
                  />
                  <span className="profile-edit-modal-hint">Only academic, creative, or beauty — comma-separated.</span>
                </div>
                <div className="profile-edit-modal-actions">
                  <button type="button" className="profile-edit-modal-btn profile-edit-modal-btn-secondary" onClick={() => setShowEditModal(false)} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" className="profile-edit-modal-btn profile-edit-modal-btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </form>
              {isProviderProfile && session && (
                <ProviderProfileForm session={session} onSaved={onUpdate} compact />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
