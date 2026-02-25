import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Auth from './pages/Auth'
import Home from './pages/Home'
import ProviderProfile from './pages/ProviderProfile'
import BookAppointment from './pages/BookAppointment'
import Appointments from './pages/Appointments'
import ProviderSetup from './pages/ProviderSetup'
import Profile from './pages/Profile'
import Messages from './pages/Messages'
import Discover from './pages/Discover'
import Nav from './components/Nav'

export default function App() {
  const [session, setSession] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setUserProfile(null); setLoading(false) }
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

  if (!session) return <Auth />

  return (
    <>
      <Nav session={session} userProfile={userProfile} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/provider/:id" element={<ProviderProfile session={session} />} />
          <Route path="/book/:providerId/:serviceId" element={<BookAppointment session={session} />} />
          <Route path="/appointments" element={<Appointments session={session} userProfile={userProfile} />} />
          <Route path="/my-services" element={<ProviderSetup session={session} userProfile={userProfile} onUpdate={() => fetchProfile(session.user.id)} />} />
          <Route path="/profile" element={<Profile session={session} userProfile={userProfile} onUpdate={() => fetchProfile(session.user.id)} />} />
          <Route path="/messages" element={<Messages session={session} />} />
          <Route path="/messages/:conversationId" element={<Messages session={session} />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  )
}
