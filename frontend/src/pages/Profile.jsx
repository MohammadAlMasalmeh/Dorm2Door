import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

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

function UserPlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  )
}

function UserCheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="16 11 18 13 22 9" />
    </svg>
  )
}

function UserMinusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  )
}

export default function Profile({ session, userProfile, onUpdate }) {
  const [displayName, setDisplayName] = useState(userProfile?.display_name ?? '')
  const [bio, setBio] = useState(userProfile?.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(userProfile?.avatar_url ?? '')
  const [bannerUrl, setBannerUrl] = useState(userProfile?.banner_url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState('friends')
  const [provider, setProvider] = useState(null)
  const [suggested, setSuggested] = useState([])
  const [friendCount, setFriendCount] = useState(0)
  const [friends, setFriends] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [sentRequests, setSentRequests] = useState([])
  const [showEditModal, setShowEditModal] = useState(false)
  const [tagsInput, setTagsInput] = useState('')
  const fileInputRef = useRef(null)
  const bannerInputRef = useRef(null)

  const uid = session?.user?.id

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
    supabase
      .from('providers')
      .select('bio, tags, location')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => setProvider(data))
  }, [uid])

  // Fetch friend count and friend list
  useEffect(() => {
    if (!uid) return
    fetchFriends()
  }, [uid])

  async function fetchFriends() {
    // Get friends where user is user_id (bidirectional rows exist)
    const { data: rows } = await supabase
      .from('friends')
      .select('user_id, friend_id')
      .or(`user_id.eq.${uid},friend_id.eq.${uid}`)

    if (!rows?.length) {
      setFriendCount(0)
      setFriends([])
      return
    }

    const friendIds = [...new Set(rows.map(r => (r.user_id === uid ? r.friend_id : r.user_id)))]
    setFriendCount(friendIds.length)

    // Fetch friend user info
    const { data: users } = await supabase
      .from('users')
      .select('id, display_name, avatar_url')
      .in('id', friendIds)
    setFriends(users || [])
  }

  // Fetch pending friend requests (received)
  useEffect(() => {
    if (!uid) return
    fetchRequests()
  }, [uid])

  async function fetchRequests() {
    const [{ data: received }, { data: sent }] = await Promise.all([
      supabase
        .from('friend_requests')
        .select('id, sender_id, created_at')
        .eq('receiver_id', uid)
        .eq('status', 'pending'),
      supabase
        .from('friend_requests')
        .select('id, receiver_id')
        .eq('sender_id', uid)
        .eq('status', 'pending'),
    ])

    setSentRequests(sent || [])

    if (!received?.length) {
      setPendingRequests([])
      return
    }

    const senderIds = received.map(r => r.sender_id)
    const { data: users } = await supabase
      .from('users')
      .select('id, display_name, avatar_url')
      .in('id', senderIds)
    const userMap = (users || []).reduce((acc, u) => ({ ...acc, [u.id]: u }), {})
    setPendingRequests(received.map(r => ({
      ...r,
      display_name: userMap[r.sender_id]?.display_name || 'User',
      avatar_url: userMap[r.sender_id]?.avatar_url,
    })))
  }

  // Fetch suggested providers (exclude friends and pending requests)
  useEffect(() => {
    if (!uid) return
    supabase
      .from('providers')
      .select('id, bio, location')
      .neq('id', uid)
      .limit(6)
      .then(async ({ data: providers }) => {
        if (!providers?.length) { setSuggested([]); return }

        // Get existing friend IDs and pending request IDs to filter out
        const friendIds = friends.map(f => f.id)
        const sentIds = sentRequests.map(r => r.receiver_id)
        const excludeIds = new Set([...friendIds, ...sentIds])

        const filtered = providers.filter(p => !excludeIds.has(p.id)).slice(0, 3)
        if (!filtered.length) { setSuggested([]); return }

        const ids = filtered.map(p => p.id)
        const { data: users } = await supabase
          .from('users')
          .select('id, display_name, avatar_url')
          .in('id', ids)
        const userMap = (users || []).reduce((acc, u) => ({ ...acc, [u.id]: u }), {})
        setSuggested(filtered.map(p => ({
          ...p,
          display_name: userMap[p.id]?.display_name ?? 'User',
          avatar_url: userMap[p.id]?.avatar_url ?? null,
        })))
      })
  }, [uid, friends.length, sentRequests.length])

  async function sendFriendRequest(friendId) {
    const { error } = await supabase.from('friend_requests').insert({
      sender_id: uid,
      receiver_id: friendId,
    })
    if (!error) {
      setSentRequests(prev => [...prev, { id: 'temp', receiver_id: friendId }])
    }
  }

  async function acceptRequest(requestId) {
    await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId)
    fetchFriends()
    fetchRequests()
  }

  async function declineRequest(requestId) {
    await supabase.from('friend_requests').update({ status: 'declined' }).eq('id', requestId)
    fetchRequests()
  }

  async function handleUnfriend(friendId) {
    await supabase.rpc('unfriend', { friend: friendId })
    fetchFriends()
    fetchRequests()
  }

  const initials = (userProfile?.display_name || session?.user?.email || '?')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const tags = (userProfile?.tags ?? []).filter(Boolean).slice(0, 5)
  const aboutText = bio || provider?.bio || ''

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
    const tagsArray = tagsInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
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
              <p className="profile-friends">{friendCount} {friendCount === 1 ? 'Friend' : 'Friends'}</p>
              <section className="profile-about">
                <h2 className="profile-about-title">About</h2>
                <p className="profile-about-text">{aboutText || 'Add a short bio in settings.'}</p>
              </section>
            </div>

            <aside className="profile-suggested">
              <h2 className="profile-suggested-title">Suggested for you</h2>
              <div className="profile-suggested-list">
                {suggested.length > 0
                  ? suggested.map((p) => {
                      const isPending = sentRequests.some(r => r.receiver_id === p.id)
                      return (
                        <div key={p.id} className="profile-suggested-card">
                          <div className="profile-suggested-avatar">
                            {p.avatar_url ? (
                              <img src={p.avatar_url} alt="" />
                            ) : (
                              <span className="profile-suggested-initials">
                                {(p.display_name || 'U').slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="profile-suggested-info">
                            <span className="profile-suggested-name">{p.display_name}</span>
                            <span className="profile-suggested-meta">{p.location || `Class '29`}</span>
                          </div>
                          {isPending ? (
                            <span className="profile-suggested-pending">
                              <UserCheckIcon />
                              <span>Pending</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="profile-suggested-add"
                              onClick={() => sendFriendRequest(p.id)}
                            >
                              <UserPlusIcon />
                              <span>Add</span>
                            </button>
                          )}
                        </div>
                      )
                    })
                  : (
                    <p className="profile-section-desc">No suggestions right now. Check back later!</p>
                  )}
              </div>
            </aside>
          </div>

          <nav className="profile-tabs" aria-label="Profile sections">
            <button
              type="button"
              className={`profile-tab${activeTab === 'friends' ? ' active' : ''}`}
              onClick={() => setActiveTab('friends')}
            >
              Friends {pendingRequests.length > 0 && <span className="profile-tab-badge">{pendingRequests.length}</span>}
            </button>
          </nav>

          <div className="profile-tab-content">
            {activeTab === 'friends' && (
              <section className="profile-section">
                {/* Pending friend requests */}
                {pendingRequests.length > 0 && (
                  <div className="friends-requests">
                    <h3 className="friends-section-title">Friend Requests</h3>
                    {pendingRequests.map(req => (
                      <div key={req.id} className="friends-request-card">
                        <div className="friends-avatar">
                          {req.avatar_url ? (
                            <img src={req.avatar_url} alt="" />
                          ) : (
                            <span className="friends-avatar-initials">
                              {(req.display_name || 'U').slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="friends-name">{req.display_name}</span>
                        <div className="friends-request-actions">
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => acceptRequest(req.id)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => declineRequest(req.id)}
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Friends list */}
                <h3 className="friends-section-title">Your Friends</h3>
                {friends.length === 0 ? (
                  <p className="profile-section-desc">No friends yet. Add people from Suggested for you.</p>
                ) : (
                  <div className="friends-list">
                    {friends.map(f => (
                      <div key={f.id} className="friends-card">
                        <Link to={`/provider/${f.id}`} className="friends-card-link">
                          <div className="friends-avatar">
                            {f.avatar_url ? (
                              <img src={f.avatar_url} alt="" />
                            ) : (
                              <span className="friends-avatar-initials">
                                {(f.display_name || 'U').slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <span className="friends-name">{f.display_name}</span>
                        </Link>
                        <button
                          type="button"
                          className="friends-unfriend-btn"
                          onClick={() => handleUnfriend(f.id)}
                          title="Unfriend"
                        >
                          <UserMinusIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
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
                    placeholder="e.g. Freshman, Economics, Dallas TX"
                    value={tagsInput}
                    onChange={e => setTagsInput(e.target.value)}
                  />
                  <span className="profile-edit-modal-hint">Comma-separated. Shown next to your profile picture.</span>
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
