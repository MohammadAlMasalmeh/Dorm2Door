import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import Auth from './pages/Auth'
import Home from './pages/Home'
import ProviderProfile from './pages/ProviderProfile'
import BookAppointment from './pages/BookAppointment'
import Appointments from './pages/Appointments'
import ProviderSetup from './pages/ProviderSetup'
import CreateListing from './pages/CreateListing'
import Profile from './pages/Profile'
import UserProfile from './pages/UserProfile'
import Messages from './pages/Messages'
import Discover from './pages/Discover'
import Services from './pages/Services'
import SearchResults from './pages/SearchResults'
import Nav from './components/Nav'

function MissingSupabaseConfig() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        background: '#fff',
        color: 'var(--text-primary, #2F4F4F)',
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 520 }}>
        <h1 style={{ fontSize: '1.35rem', marginBottom: 12, fontWeight: 700 }}>Supabase configuration missing</h1>
        <p style={{ marginBottom: 16, lineHeight: 1.55, color: 'var(--text-secondary, #5C5C5C)' }}>
          Add{' '}
          <code style={{ background: '#f0f0f0', padding: '2px 8px', borderRadius: 6, fontSize: '0.9em' }}>VITE_SUPABASE_URL</code>{' '}
          and{' '}
          <code style={{ background: '#f0f0f0', padding: '2px 8px', borderRadius: 6, fontSize: '0.9em' }}>VITE_SUPABASE_ANON_KEY</code>{' '}
          in your Vercel project → Settings → Environment Variables (Production), then redeploy. Values come from the Supabase
          dashboard → Project Settings → API.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const [session, setSession] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(() => isSupabaseConfigured)
  /** Set when a session exists but email_confirmed_at is null — user must verify via Supabase email */
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState(null)

  async function fetchProfile(uid) {
    const { data } = await supabase.from('users').select('*').eq('id', uid).single()
    setUserProfile(data)
    setLoading(false)
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user && !session.user.email_confirmed_at) {
        const em = session.user.email
        await supabase.auth.signOut()
        setPendingVerificationEmail(em)
        setSession(null)
        setLoading(false)
        return
      }
      setPendingVerificationEmail(null)
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (session?.user && !session.user.email_confirmed_at) {
          const em = session.user.email
          await supabase.auth.signOut()
          setPendingVerificationEmail(em)
          setSession(null)
          setUserProfile(null)
          setLoading(false)
          return
        }
        if (session?.user) setPendingVerificationEmail(null)
        setSession(session)
        if (session) fetchProfile(session.user.id)
        else {
          setUserProfile(null)
          setLoading(false)
        }
      })()
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!isSupabaseConfigured) {
    return <MissingSupabaseConfig />
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!session) {
    return (
      <Auth
        pendingVerificationEmail={pendingVerificationEmail}
        onClearPendingVerification={() => setPendingVerificationEmail(null)}
      />
    )
  }

  return (
    <>
      <Nav session={session} userProfile={userProfile} />
      <main
        className={`main-content${
          location.pathname === '/' ? ' main-content--landing' : ''
        }${location.pathname === '/discover' ? ' main-content--discover' : ''}`}
      >
        <Routes>
          <Route path="/" element={<Home session={session} />} />
          <Route path="/user/:id" element={<UserProfile session={session} />} />
          <Route path="/provider/:id" element={<ProviderProfile session={session} />} />
          <Route path="/book/:providerId/:serviceId" element={<BookAppointment session={session} />} />
          <Route path="/appointments" element={<Appointments session={session} userProfile={userProfile} />} />
          <Route path="/my-services" element={<ProviderSetup session={session} userProfile={userProfile} onUpdate={() => fetchProfile(session.user.id)} />} />
          <Route path="/my-services/new" element={<CreateListing session={session} userProfile={userProfile} onUpdate={() => fetchProfile(session.user.id)} />} />
          <Route path="/my-services/edit/:serviceId" element={<CreateListing session={session} userProfile={userProfile} onUpdate={() => fetchProfile(session.user.id)} />} />
          <Route path="/profile" element={<Profile session={session} userProfile={userProfile} onUpdate={() => fetchProfile(session.user.id)} />} />
          <Route path="/messages" element={<Messages session={session} userProfile={userProfile} />} />
          <Route path="/messages/:conversationId" element={<Messages session={session} userProfile={userProfile} />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/services/all" element={<Navigate to="/discover" replace />} />
          <Route path="/search" element={<SearchResults session={session} />} />
          <Route path="/services/stats" element={<Navigate to="/services#stats" replace />} />
          <Route path="/services/availability" element={<Navigate to="/services" replace />} />
          <Route path="/services" element={(userProfile?.role === 'provider' || session?.user?.user_metadata?.role === 'provider') ? <Services session={session} userProfile={userProfile} /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  )
}
