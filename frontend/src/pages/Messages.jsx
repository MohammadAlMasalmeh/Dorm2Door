import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatMessageTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDayHeader(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function Stars({ value }) {
  const n = Math.round(Number(value) || 0)
  return (
    <span className="messages-stars" aria-label={`${n} out of 5 stars`}>
      {'★'.repeat(n)}
      {'☆'.repeat(5 - n)}
    </span>
  )
}

function servicePriceLabel(service) {
  if (!service) return ''
  const opts = service.service_options || []
  if (opts.length) {
    const prices = opts.map(o => Number(o.price)).filter(Number.isFinite)
    if (prices.length) {
      const min = Math.min(...prices)
      const max = Math.max(...prices)
      if (min === max) return `$${min.toFixed(0)}`
      return `$${min.toFixed(0)} – $${max.toFixed(0)}`
    }
  }
  if (service.price != null) return `$${Number(service.price).toFixed(0)}`
  return ''
}

function firstImageUrl(service) {
  if (!service) return null
  if (service.image_urls?.length) return service.image_urls[0]
  return service.image_url || null
}

export default function Messages({ session, userProfile }) {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState([])
  const [activeConvo, setActiveConvo] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [peerDetail, setPeerDetail] = useState(null)
  const [newMsgOpen, setNewMsgOpen] = useState(false)
  const [newMsgQ, setNewMsgQ] = useState('')
  const [newMsgResults, setNewMsgResults] = useState([])
  const [newMsgBusy, setNewMsgBusy] = useState(false)
  const [newMsgErr, setNewMsgErr] = useState('')
  const [convoSearch, setConvoSearch] = useState('')
  const messagesEndRef = useRef(null)
  const newMsgSearchDebounceRef = useRef(null)
  const uid = session?.user?.id

  const loadConversations = useCallback(async () => {
    if (!uid) return
    const { data } = await supabase
      .from('conversations')
      .select('id, user_a, user_b, last_message_at')
      .or(`user_a.eq.${uid},user_b.eq.${uid}`)
      .order('last_message_at', { ascending: false })

    if (!data?.length) {
      setConversations([])
      setLoading(false)
      return
    }

    const otherIds = [...new Set(data.map(c => (c.user_a === uid ? c.user_b : c.user_a)))]
    const { data: users } = await supabase
      .from('users')
      .select('id, display_name, avatar_url')
      .in('id', otherIds)

    const userMap = (users || []).reduce((acc, u) => ({ ...acc, [u.id]: u }), {})

    const convoIds = data.map(c => c.id)
    const { data: lastMsgs } = await supabase
      .from('messages')
      .select('conversation_id, content, created_at, sender_id')
      .in('conversation_id', convoIds)
      .order('created_at', { ascending: false })

    const lastMsgMap = {}
    for (const m of lastMsgs || []) {
      if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m
    }

    setConversations(
      data.map(c => {
        const otherId = c.user_a === uid ? c.user_b : c.user_a
        const other = userMap[otherId] || { display_name: 'User', avatar_url: null }
        const last = lastMsgMap[c.id]
        const prefix = last?.sender_id === uid ? 'You: ' : ''
        return {
          ...c,
          otherId,
          otherName: other.display_name || 'User',
          otherAvatar: other.avatar_url,
          lastMessage: last ? `${prefix}${last.content}` : '',
          lastMessageAt: last?.created_at || c.last_message_at,
        }
      }),
    )
    setLoading(false)
  }, [uid])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!conversationId) {
      setActiveConvo(null)
      return
    }
    setActiveConvo(conversationId)

    async function loadMessages() {
      const { data } = await supabase
        .from('messages')
        .select('id, sender_id, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      setMessages(data || [])
    }
    loadMessages()

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        payload => {
          setMessages(prev => [...prev, payload.new])
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  const activeConvoData = conversations.find(c => c.id === activeConvo)

  useEffect(() => {
    if (!activeConvoData?.otherId) {
      setPeerDetail(null)
      return
    }
    setPeerDetail(null)
    let cancelled = false
    async function loadPeer() {
      const oid = activeConvoData.otherId
      const { data: u } = await supabase
        .from('users')
        .select('id, display_name, avatar_url, role, avg_customer_rating, customer_review_count')
        .eq('id', oid)
        .single()

      if (cancelled || !u) return

      let providerRow = null
      let service = null
      let providerReviewCount = null
      if (u.role === 'provider') {
        const { data: p } = await supabase.from('providers').select('avg_rating').eq('id', oid).maybeSingle()
        providerRow = p
        const { count: revCount } = await supabase
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .eq('provider_id', oid)
        providerReviewCount = revCount ?? 0
        const { data: svcs } = await supabase
          .from('services')
          .select('id, name, price, image_url, image_urls, description, service_options(id, name, price)')
          .eq('provider_id', oid)
          .order('created_at', { ascending: true })
          .limit(1)
        service = svcs?.[0] || null
      }

      if (!cancelled) setPeerDetail({ user: u, providerRow, service, providerReviewCount })
    }
    loadPeer()
    return () => {
      cancelled = true
    }
  }, [activeConvoData?.otherId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!newMsgOpen) return
    function onKey(e) {
      if (e.key === 'Escape') setNewMsgOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newMsgOpen])

  useEffect(() => {
    if (!newMsgOpen || !uid) return
    setNewMsgErr('')
    const q = newMsgQ.trim()
    if (q.length < 2) {
      setNewMsgResults([])
      return
    }
    if (newMsgSearchDebounceRef.current) clearTimeout(newMsgSearchDebounceRef.current)
    newMsgSearchDebounceRef.current = setTimeout(async () => {
      setNewMsgBusy(true)
      const { data, error } = await supabase
        .from('users')
        .select('id, display_name, avatar_url, role')
        .neq('id', uid)
        .ilike('display_name', `%${q}%`)
        .limit(25)
      setNewMsgBusy(false)
      if (error) {
        setNewMsgErr(error.message)
        setNewMsgResults([])
        return
      }
      setNewMsgResults(data || [])
    }, 300)
    return () => {
      if (newMsgSearchDebounceRef.current) clearTimeout(newMsgSearchDebounceRef.current)
    }
  }, [newMsgQ, newMsgOpen, uid])

  async function startConversationWith(otherId) {
    if (!otherId) return
    setNewMsgErr('')
    setNewMsgBusy(true)
    const { data: convId, error } = await supabase.rpc('get_or_create_conversation', { other_user: otherId })
    setNewMsgBusy(false)
    if (error) {
      setNewMsgErr(error.message)
      return
    }
    setNewMsgOpen(false)
    setNewMsgQ('')
    setNewMsgResults([])
    await loadConversations()
    if (convId) navigate(`/messages/${convId}`)
  }

  function openNewMessageModal() {
    setNewMsgErr('')
    setNewMsgQ('')
    setNewMsgResults([])
    setNewMsgOpen(true)
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!input.trim() || !activeConvo) return
    setSending(true)
    await supabase.from('messages').insert({
      conversation_id: activeConvo,
      sender_id: uid,
      content: input.trim(),
    })
    setInput('')
    setSending(false)
  }

  const filteredConversations = useMemo(() => {
    const q = convoSearch.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => {
      const name = (c.otherName || '').toLowerCase()
      const preview = (c.lastMessage || '').toLowerCase()
      return name.includes(q) || preview.includes(q)
    })
  }, [conversations, convoSearch])

  const messageBlocks = useMemo(() => {
    const blocks = []
    let lastDay = null
    for (const m of messages) {
      const d = new Date(m.created_at).toDateString()
      if (d !== lastDay) {
        lastDay = d
        blocks.push({ type: 'day', id: `day-${d}`, label: formatDayHeader(m.created_at) })
      }
      blocks.push({ type: 'msg', ...m })
    }
    return blocks
  }, [messages])

  const peerReady = Boolean(
    activeConvoData?.otherId && peerDetail?.user?.id === activeConvoData.otherId,
  )

  const isProviderPeer = peerDetail?.user?.role === 'provider'
  const rating = isProviderPeer
    ? peerDetail?.providerRow?.avg_rating
    : peerDetail?.user?.avg_customer_rating
  const reviewCount = isProviderPeer
    ? peerDetail?.providerReviewCount
    : peerDetail?.user?.customer_review_count

  if (loading) {
    return (
      <div className="loading-wrap messages-loading-wrap">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="messages-page">
      <header className="messages-toolbar">
        <h1 className="messages-toolbar-title">Messages</h1>
      </header>

      <div className="messages-layout">
        <aside className={`messages-col messages-col-list${activeConvo ? ' messages-col-hidden-mobile' : ''}`}>
          <div className="messages-list-actions">
            <button type="button" className="messages-new-btn" onClick={openNewMessageModal}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              New message
            </button>
            <label className="messages-search-messages">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                placeholder="Search messages"
                value={convoSearch}
                onChange={e => setConvoSearch(e.target.value)}
                aria-label="Search conversations"
              />
            </label>
          </div>

          {conversations.length === 0 ? (
            <p className="messages-empty">
              No conversations yet. Use <strong>New message</strong> to search by name, or open someone’s profile and use Message there.
            </p>
          ) : (
            <div className="messages-convo-list">
              {filteredConversations.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={`messages-convo-item${c.id === activeConvo ? ' active' : ''}`}
                  onClick={() => navigate(`/messages/${c.id}`)}
                >
                  <div className="messages-convo-avatar">
                    {c.otherAvatar ? (
                      <img src={c.otherAvatar} alt="" />
                    ) : (
                      <span className="messages-convo-initials">{(c.otherName || 'U').slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="messages-convo-info">
                    <span className="messages-convo-name">{c.otherName}</span>
                    <span className="messages-convo-preview">
                      {c.lastMessage}
                      {c.lastMessageAt ? ` · ${timeAgo(c.lastMessageAt)}` : ''}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className={`messages-col messages-col-thread${!activeConvo ? ' messages-col-hidden-mobile' : ''}`}>
          {!activeConvo ? (
            <div className="messages-thread-empty">
              <p>Select a conversation to start chatting</p>
            </div>
          ) : (
            <>
              <div className="messages-thread-header">
                <button type="button" className="messages-back-btn" onClick={() => navigate('/messages')} aria-label="Back to conversations">
                  ‹
                </button>
                <div className="messages-thread-avatar">
                  {activeConvoData?.otherAvatar ? (
                    <img src={activeConvoData.otherAvatar} alt="" />
                  ) : (
                    <span className="messages-convo-initials">
                      {(activeConvoData?.otherName || 'U').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="messages-thread-name">{activeConvoData?.otherName || 'User'}</span>
              </div>

              <div className="messages-thread-body">
                {messageBlocks.map(block =>
                  block.type === 'day' ? (
                    <div key={block.id} className="messages-day-sep">
                      {block.label}
                    </div>
                  ) : (
                    <div
                      key={block.id}
                      className={`messages-row${block.sender_id === uid ? ' messages-row-own' : ''}`}
                    >
                      {block.sender_id !== uid && (
                        <div className="messages-avatar-sm">
                          {activeConvoData?.otherAvatar ? (
                            <img src={activeConvoData.otherAvatar} alt="" />
                          ) : (
                            <span>{(activeConvoData?.otherName || 'U').slice(0, 1)}</span>
                          )}
                        </div>
                      )}
                      <div className="messages-bubble-wrap">
                        <div
                          className={`messages-bubble${block.sender_id === uid ? ' messages-bubble-own' : ' messages-bubble-other'}`}
                        >
                          <p className="messages-bubble-text">{block.content}</p>
                        </div>
                        <span className="messages-bubble-meta">
                          {formatMessageTime(block.created_at)}
                          {block.sender_id === uid && <span className="messages-sent-label"> · Sent</span>}
                        </span>
                      </div>
                      {block.sender_id === uid && (
                        <div className="messages-avatar-sm messages-avatar-sm-own">
                          {userProfile?.avatar_url ? (
                            <img src={userProfile.avatar_url} alt="" />
                          ) : (
                            <span>
                              {(userProfile?.display_name || session?.user?.email || 'U').slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ),
                )}
                <div ref={messagesEndRef} />
              </div>

              <form id="messages-compose-form" className="messages-compose" onSubmit={handleSend}>
                <button type="button" className="messages-compose-add" tabIndex={-1} aria-hidden title="Attachments coming soon">
                  +
                </button>
                <input
                  type="text"
                  className="messages-compose-input"
                  placeholder="Type your message"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  disabled={sending}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="messages-compose-send messages-compose-send--inline"
                  disabled={sending || !input.trim()}
                  aria-label="Send message"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </form>
            </>
          )}
        </section>

        <aside className="messages-col messages-col-context">
          {!activeConvo ? (
            <div className="messages-context-empty">
              <p>Open a chat to see profile and service details.</p>
            </div>
          ) : !peerReady ? (
            <div className="messages-context-card messages-context-card-loading">
              <p className="messages-context-loading-text">Loading profile…</p>
              <div className="messages-context-send-row">
                <button
                  type="submit"
                  form="messages-compose-form"
                  className="messages-context-send"
                  disabled={sending || !input.trim()}
                  aria-label="Send message"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="messages-context-card messages-context-card-profile">
                <div className="messages-context-profile">
                  <div className="messages-context-avatar-lg">
                    {peerDetail.user.avatar_url ? (
                      <img src={peerDetail.user.avatar_url} alt="" />
                    ) : (
                      <span>{(peerDetail.user.display_name || 'U').slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="messages-context-profile-text">
                    <h2 className="messages-context-name">{peerDetail.user.display_name || 'User'}</h2>
                    <div className="messages-context-rating">
                      <Stars value={rating} />
                      {reviewCount != null && reviewCount > 0 && (
                        <span className="messages-context-review-count">({reviewCount})</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="messages-context-send-row">
                  <button
                    type="submit"
                    form="messages-compose-form"
                    className="messages-context-send"
                    disabled={sending || !input.trim()}
                    aria-label="Send message"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {isProviderPeer && peerDetail.service && (
                <div className="messages-context-card messages-context-service">
                  <h3 className="messages-context-service-title">Service info</h3>
                  <div className="messages-service-row">
                    <div className="messages-service-thumb">
                      {firstImageUrl(peerDetail.service) ? (
                        <img src={firstImageUrl(peerDetail.service)} alt="" />
                      ) : (
                        <span className="messages-service-thumb-ph" />
                      )}
                    </div>
                    <div>
                      <p className="messages-service-name">{peerDetail.service.name}</p>
                      <p className="messages-service-price">{servicePriceLabel(peerDetail.service)}</p>
                      {peerDetail.service.description && (
                        <p className="messages-service-desc">{peerDetail.service.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="messages-service-actions">
                    <Link to={`/provider/${peerDetail.user.id}`} className="messages-btn-outline">
                      View service
                    </Link>
                    {uid === peerDetail.user.id ? (
                      <Link to="/my-services" className="messages-btn-accent">
                        Edit service
                      </Link>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {newMsgOpen && (
        <div
          className="messages-new-modal-overlay"
          role="presentation"
          onClick={() => !newMsgBusy && setNewMsgOpen(false)}
        >
          <div
            className="messages-new-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="messages-new-modal-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="messages-new-modal-head">
              <h2 id="messages-new-modal-title" className="messages-new-modal-title">
                New message
              </h2>
              <button
                type="button"
                className="messages-new-modal-close"
                onClick={() => !newMsgBusy && setNewMsgOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="messages-new-modal-hint">Search for someone by the name on their profile (type at least 2 characters).</p>
            <label className="messages-new-modal-search">
              <input
                type="search"
                autoFocus
                placeholder="Search by name…"
                value={newMsgQ}
                onChange={e => setNewMsgQ(e.target.value)}
                disabled={newMsgBusy}
                aria-label="Search users by display name"
              />
            </label>
            {newMsgErr ? <p className="messages-new-modal-error" role="alert">{newMsgErr}</p> : null}
            <ul className="messages-new-modal-list" aria-busy={newMsgBusy}>
              {newMsgQ.trim().length < 2 ? (
                <li className="messages-new-modal-empty">Keep typing to see matches.</li>
              ) : newMsgBusy ? (
                <li className="messages-new-modal-empty">Searching…</li>
              ) : newMsgResults.length === 0 ? (
                <li className="messages-new-modal-empty">No users match that name.</li>
              ) : (
                newMsgResults.map(u => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="messages-new-modal-user"
                      disabled={newMsgBusy}
                      onClick={() => startConversationWith(u.id)}
                    >
                      <span className="messages-new-modal-user-avatar">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" />
                        ) : (
                          <span>{(u.display_name || 'U').slice(0, 1).toUpperCase()}</span>
                        )}
                      </span>
                      <span className="messages-new-modal-user-text">
                        <span className="messages-new-modal-user-name">{u.display_name || 'User'}</span>
                        {u.role === 'provider' ? (
                          <span className="messages-new-modal-user-role">Provider</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
