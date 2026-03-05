import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function UserProfile({ session }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [provider, setProvider] = useState(null)
  const [friendCount, setFriendCount] = useState(0)
  const [friendStatus, setFriendStatus] = useState('none')
  const [friendActionLoading, setFriendActionLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  const uid = session?.user?.id
  const isOwn = uid === id

  useEffect(() => {
    if (isOwn) {
      navigate('/profile', { replace: true })
      return
    }
    async function load() {
      const { data: userData } = await supabase.from('users').select('id, display_name, avatar_url, banner_url, bio, tags').eq('id', id).single()
      setUser(userData)
      if (userData) {
        const { data: provData } = await supabase.from('providers').select('id, bio, location').eq('id', id).maybeSingle()
        setProvider(provData)
        const { count } = await supabase.from('friends').select('*', { count: 'exact', head: true }).or(`user_id.eq.${id},friend_id.eq.${id}`)
        setFriendCount(count ?? 0)
      }
      setLoading(false)
    }
    load()
  }, [id, isOwn, navigate])

  useEffect(() => {
    if (!uid || !id || uid === id) return
    checkFriendship()
  }, [id, uid])

  async function checkFriendship() {
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
      await supabase.from('friend_requests').insert({ sender_id: uid, receiver_id: id })
      setFriendStatus('pending_sent')
    } else if (friendStatus === 'pending_received') {
      const { data: req } = await supabase.from('friend_requests').select('id').eq('sender_id', id).eq('receiver_id', uid).eq('status', 'pending').maybeSingle()
      if (req) {
        await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', req.id)
        setFriendStatus('friends')
        setFriendCount(c => c + 1)
      }
    } else if (friendStatus === 'friends') {
      await supabase.rpc('unfriend', { friend: id })
      setFriendStatus('none')
      setFriendCount(c => Math.max(0, c - 1))
    }
    setFriendActionLoading(false)
  }

  async function handleMessage() {
    const { data: convId } = await supabase.rpc('get_or_create_conversation', { other_user: id })
    if (convId) navigate(`/messages/${convId}`)
  }

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>
  if (!user) {
    return (
      <div className="empty-state">
        <h3>Profile not found</h3>
        <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>This user may not exist or the link might be outdated.</p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Back to home</Link>
      </div>
    )
  }

  const name = user.display_name || 'User'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const tags = (user.tags ?? []).filter(Boolean).slice(0, 5)
  const aboutText = user.bio || provider?.bio || ''

  const friendBtnLabel = {
    none: 'Add Friend',
    pending_sent: 'Pending',
    pending_received: 'Accept Request',
    friends: 'Friends',
  }[friendStatus]

  return (
    <div className="profile-page">
      <div className="profile-page-layout">
        <div className="profile-main">
          <div className="profile-banner-wrap">
            <div className="profile-banner profile-banner-readonly">
              {user.banner_url ? (
                <img src={user.banner_url} alt="" className="profile-banner-img" />
              ) : (
                <span className="profile-banner-placeholder" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }} />
              )}
            </div>
            <div className="profile-avatar-tags-row">
              <div className="profile-avatar-large profile-avatar-readonly">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" />
                ) : (
                  <span className="profile-avatar-initials">{initials}</span>
                )}
              </div>
              <div className="profile-tags-wrap">
                {tags.map((tag, i) => (
                  <span key={i} className="profile-tag">{tag}</span>
                ))}
                {!isOwn && session && (
                  <>
                    <button
                      type="button"
                      className={`listing-friend-btn${friendStatus === 'friends' ? ' listing-friend-btn-active' : ''}${friendStatus === 'pending_sent' ? ' listing-friend-btn-pending' : ''}`}
                      style={{ marginLeft: 8 }}
                      onClick={handleFriendAction}
                      disabled={friendActionLoading || friendStatus === 'pending_sent'}
                    >
                      {friendBtnLabel}
                    </button>
                    <button type="button" className="listing-message-btn-inline" onClick={handleMessage} style={{ marginLeft: 6 }}>
                      Message
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="profile-about-row">
            <div className="profile-info-block">
              <h1 className="profile-display-name">{name}</h1>
              <p className="profile-friends">{friendCount} {friendCount === 1 ? 'Friend' : 'Friends'}</p>
              <section className="profile-about">
                <h2 className="profile-about-title">About</h2>
                <p className="profile-about-text">{aboutText || 'No bio yet.'}</p>
              </section>
              {provider && (
                <Link to={`/provider/${id}`} className="btn btn-primary" style={{ marginTop: 16, display: 'inline-flex' }}>
                  View services
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
