import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

export default function Messages({ session }) {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState([])
  const [activeConvo, setActiveConvo] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)
  const uid = session?.user?.id

  // Fetch conversations list
  useEffect(() => {
    if (!uid) return
    async function load() {
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

      // Fetch user info for the other participant
      const otherIds = [...new Set(data.map(c => c.user_a === uid ? c.user_b : c.user_a))]
      const { data: users } = await supabase
        .from('users')
        .select('id, display_name, avatar_url')
        .in('id', otherIds)

      const userMap = (users || []).reduce((acc, u) => ({ ...acc, [u.id]: u }), {})

      // Fetch last message for each conversation
      const convoIds = data.map(c => c.id)
      const { data: lastMsgs } = await supabase
        .from('messages')
        .select('conversation_id, content, created_at')
        .in('conversation_id', convoIds)
        .order('created_at', { ascending: false })

      const lastMsgMap = {}
      for (const m of (lastMsgs || [])) {
        if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m
      }

      setConversations(data.map(c => {
        const otherId = c.user_a === uid ? c.user_b : c.user_a
        const other = userMap[otherId] || { display_name: 'User', avatar_url: null }
        return {
          ...c,
          otherId,
          otherName: other.display_name || 'User',
          otherAvatar: other.avatar_url,
          lastMessage: lastMsgMap[c.id]?.content || '',
          lastMessageAt: lastMsgMap[c.id]?.created_at || c.last_message_at,
        }
      }))
      setLoading(false)
    }
    load()
  }, [uid])

  // Load messages when conversation is selected
  useEffect(() => {
    if (!conversationId) { setActiveConvo(null); return }
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

    // Subscribe to new messages via Realtime
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  const activeConvoData = conversations.find(c => c.id === activeConvo)

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>

  return (
    <div className="messages-page">
      {/* Conversation list */}
      <div className={`messages-sidebar${activeConvo ? ' messages-sidebar-hidden-mobile' : ''}`}>
        <h2 className="messages-sidebar-title">Messages</h2>
        {conversations.length === 0 ? (
          <p className="messages-empty">No conversations yet. Start one from a provider's profile!</p>
        ) : (
          <div className="messages-convo-list">
            {conversations.map(c => (
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
                    <span className="messages-convo-initials">
                      {(c.otherName || 'U').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="messages-convo-info">
                  <span className="messages-convo-name">{c.otherName}</span>
                  <span className="messages-convo-preview">{c.lastMessage}</span>
                </div>
                <span className="messages-convo-time">{timeAgo(c.lastMessageAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Message thread */}
      <div className={`messages-thread${!activeConvo ? ' messages-thread-hidden-mobile' : ''}`}>
        {!activeConvo ? (
          <div className="messages-thread-empty">
            <p>Select a conversation to start chatting</p>
          </div>
        ) : (
          <>
            <div className="messages-thread-header">
              <button
                type="button"
                className="messages-back-btn"
                onClick={() => navigate('/messages')}
              >
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
              {messages.map(m => (
                <div
                  key={m.id}
                  className={`messages-bubble${m.sender_id === uid ? ' messages-bubble-own' : ' messages-bubble-other'}`}
                >
                  <p className="messages-bubble-text">{m.content}</p>
                  <span className="messages-bubble-time">{timeAgo(m.created_at)}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="messages-compose" onSubmit={handleSend}>
              <input
                type="text"
                className="messages-compose-input"
                placeholder="Type a message..."
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={sending}
              />
              <button
                type="submit"
                className="messages-compose-btn"
                disabled={sending || !input.trim()}
              >
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
