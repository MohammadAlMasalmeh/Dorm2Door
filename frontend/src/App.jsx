import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Auth from './pages/Auth'
import Home from './pages/Home'
import ProviderProfile from './pages/ProviderProfile'
import BookAppointment from './pages/BookAppointment'
import Appointments from './pages/Appointments'
import ProviderSetup from './pages/ProviderSetup'
import Profile from './pages/Profile'
import UserProfile from './pages/UserProfile'
import Messages from './pages/Messages'
import Discover from './pages/Discover'
import Services from './pages/Services'
import Nav from './components/Nav'

export default function App() {
  const location = useLocation()
  const [session, setSession] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  /** Set when a session exists but email_confirmed_at is null — user must verify via Supabase email */
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState(null)

  useEffect(() => {
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

  async function fetchProfile(uid) {
    const { data } = await supabase.from('users').select('*').eq('id', uid).single()
    setUserProfile(data)
    setLoading(false)
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
      <main className={`main-content${location.pathname === '/' ? ' main-content--landing' : ''}`}>
        <Routes>
          <Route path="/" element={<Home session={session} />} />
          <Route path="/user/:id" element={<UserProfile session={session} />} />
          <Route path="/provider/:id" element={<ProviderProfile session={session} />} />
          <Route path="/book/:providerId/:serviceId" element={<BookAppointment session={session} />} />
          <Route path="/appointments" element={<Appointments session={session} userProfile={userProfile} />} />
          <Route path="/my-services" element={<ProviderSetup session={session} userProfile={userProfile} onUpdate={() => fetchProfile(session.user.id)} />} />
          <Route path="/profile" element={<Profile session={session} userProfile={userProfile} onUpdate={() => fetchProfile(session.user.id)} />} />
          <Route path="/messages" element={<Messages session={session} userProfile={userProfile} />} />
          <Route path="/messages/:conversationId" element={<Messages session={session} userProfile={userProfile} />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/services" element={(userProfile?.role === 'provider' || session?.user?.user_metadata?.role === 'provider') ? <Services session={session} userProfile={userProfile} /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  )
}
