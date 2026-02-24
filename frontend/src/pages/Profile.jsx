import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const AVATAR_BUCKET = 'avatars'
const MAX_SIZE_MB = 2
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export default function Profile({ session, userProfile, onUpdate }) {
  const [displayName, setDisplayName] = useState(userProfile?.display_name ?? '')
  const [avatarUrl, setAvatarUrl] = useState(userProfile?.avatar_url ?? '')

  useEffect(() => {
    setDisplayName(userProfile?.display_name ?? '')
    setAvatarUrl(userProfile?.avatar_url ?? '')
  }, [userProfile?.display_name, userProfile?.avatar_url])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef(null)

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

  async function handleSaveProfile(e) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setSaving(true)
    const { error: updateError } = await supabase
      .from('users')
      .update({ display_name: displayName.trim() || null })
      .eq('id', session.user.id)
    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }
    onUpdate?.()
    setSuccess(true)
    setSaving(false)
  }

  const [profileTab, setProfileTab] = useState('settings') // bookings | services | settings
  const initials = (userProfile?.display_name || session?.user?.email || '?')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="profile-page-layout">
      <div className="profile-page-visual">
        <div className="profile-page-visual-placeholder" />
        <div className="profile-page-visual-thumbs">
          <div className="profile-page-visual-thumb" />
          <div className="profile-page-visual-thumb" />
          <div className="profile-page-visual-thumb" />
        </div>
      </div>
      <div className="profile-page-content">
      <div className="profile-midfi-header">
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleAvatarChange}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="profile-midfi-avatar-wrap"
          onClick={() => fileInputRef.current?.click()}
          disabled={saving}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="profile-midfi-avatar-img" />
          ) : (
            <div className="profile-midfi-avatar-initials">{initials}</div>
          )}
        </button>
        <div className="profile-midfi-info">
          <h1 className="profile-midfi-name">{userProfile?.display_name || 'User'}</h1>
          <Link to="/profile" className="btn btn-outline btn-sm">Edit profile</Link>
        </div>
      </div>

      <div className="tabs profile-tabs">
        <button type="button" className={`tab-btn${profileTab === 'bookings' ? ' active' : ''}`} onClick={() => setProfileTab('bookings')}>My bookings</button>
        <button type="button" className={`tab-btn${profileTab === 'services' ? ' active' : ''}`} onClick={() => setProfileTab('services')}>My services</button>
        <button type="button" className={`tab-btn${profileTab === 'settings' ? ' active' : ''}`} onClick={() => setProfileTab('settings')}>Settings</button>
      </div>

      {profileTab === 'bookings' && (
        <div className="card">
          <p className="page-subtitle" style={{ marginBottom: 12 }}>View and manage your appointments.</p>
          <Link to="/appointments" className="btn btn-primary">Go to Appointments</Link>
        </div>
      )}

      {profileTab === 'services' && (
        <div className="card">
          <p className="page-subtitle" style={{ marginBottom: 12 }}>Manage the services you offer as a provider.</p>
          <Link to="/my-services" className="btn btn-primary">Go to My Services</Link>
        </div>
      )}

      {profileTab === 'settings' && (
        <div className="card profile-edit-card">
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">Profile updated.</div>}
          <div className="profile-edit-avatar-row">
            <button type="button" className="profile-edit-avatar-wrap" onClick={() => fileInputRef.current?.click()} disabled={saving}>
              {avatarUrl ? <img src={avatarUrl} alt="" className="profile-edit-avatar-img" /> : <div className="profile-edit-avatar-initials">{initials}</div>}
              <span className="profile-edit-avatar-label">Change photo</span>
            </button>
            <div className="profile-edit-avatar-hint"><p>JPEG, PNG, WebP or GIF. Max {MAX_SIZE_MB} MB.</p></div>
          </div>
          <form onSubmit={handleSaveProfile}>
            <div className="form-group">
              <label className="form-label">Display name</label>
              <input className="form-input" type="text" placeholder="Your name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          </form>
        </div>
      )}
      </div>
    </div>
  )
}
