import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function ProviderSetup({ session, userProfile, onUpdate }) {
  const [profile, setProfile]       = useState(null)
  const [bio, setBio]               = useState('')
  const [location, setLocation]     = useState('')
  const [tags, setTags]             = useState([])
  const [tagInput, setTagInput]     = useState('')
  const [services, setServices]     = useState([])
  const [showAddSvc, setShowAddSvc] = useState(false)
  const [svcName, setSvcName]       = useState('')
  const [svcPrice, setSvcPrice]     = useState('')
  const [svcDesc, setSvcDesc]       = useState('')
  const [svcImage, setSvcImage]     = useState(null)   // File object
  const [svcPreview, setSvcPreview] = useState(null)   // local object URL
  const [uploading, setUploading]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [loading, setLoading]       = useState(true)
  const [message, setMessage]       = useState('')
  const [error, setError]           = useState('')
  const fileInputRef = useRef()

  // Block consumers from this page
  if (userProfile && userProfile.role === 'consumer') {
    return (
      <div style={{ textAlign: 'center', padding: '72px 24px' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Provider accounts only</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: '0.875rem' }}>
          You signed up as a consumer. To offer services, create a new account and select "Provider" during signup.
        </p>
        <Link to="/" className="btn btn-primary">Browse providers</Link>
      </div>
    )
  }

  useEffect(() => { fetchProfile() }, [])

  async function fetchProfile() {
    setLoading(true)
    const { data } = await supabase
      .from('providers')
      .select('*, services (*)')
      .eq('id', session.user.id)
      .single()
    if (data) {
      setProfile(data)
      setBio(data.bio || '')
      setLocation(data.location || '')
      setTags(data.tags || [])
      setServices(data.services || [])
    }
    setLoading(false)
  }

  async function saveProfile(e) {
    e.preventDefault()
    setSaving(true); setMessage(''); setError('')

    if (userProfile?.role !== 'provider') {
      await supabase.from('users').update({ role: 'provider' }).eq('id', session.user.id)
    }

    const payload = { bio, location, tags }
    const { error } = profile
      ? await supabase.from('providers').update(payload).eq('id', session.user.id)
      : await supabase.from('providers').insert({ id: session.user.id, ...payload })

    if (error) { setError(error.message); setSaving(false); return }
    await fetchProfile()
    onUpdate?.()
    setMessage('Profile saved!')
    setSaving(false)
  }

  function handleImagePick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSvcImage(file)
    setSvcPreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setSvcImage(null)
    setSvcPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadImage(file) {
    const ext  = file.name.split('.').pop()
    const path = `${session.user.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('service-images')
      .upload(path, file, { upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from('service-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function addService(e) {
    e.preventDefault()
    setError(''); setUploading(true)

    let imageUrl = null
    if (svcImage) {
      try { imageUrl = await uploadImage(svcImage) }
      catch (err) { setError('Image upload failed: ' + err.message); setUploading(false); return }
    }

    const { error } = await supabase.from('services').insert({
      provider_id: session.user.id,
      name:        svcName,
      price:       parseFloat(svcPrice),
      description: svcDesc,
      image_url:   imageUrl,
    })

    setUploading(false)
    if (error) { setError(error.message); return }

    setSvcName(''); setSvcPrice(''); setSvcDesc('')
    clearImage(); setShowAddSvc(false)
    fetchProfile()
  }

  async function deleteService(svc) {
    // Remove image from storage if present
    if (svc.image_url) {
      const path = svc.image_url.split('/service-images/')[1]
      if (path) await supabase.storage.from('service-images').remove([path])
    }
    await supabase.from('services').delete().eq('id', svc.id)
    fetchProfile()
  }

  function handleTagKey(e) {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const t = tagInput.trim().toLowerCase().replace(/,/g, '')
      if (!tags.includes(t)) setTags(prev => [...prev, t])
      setTagInput('')
    }
  }

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Services</h1>
        <p className="page-subtitle">
          {profile ? 'Manage your provider profile and portfolio' : 'Set up your profile to start offering services'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Profile form ──────────────────────────────── */}
        <form className="card" onSubmit={saveProfile}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 18 }}>Provider Profile</h2>

          {error   && <div className="alert alert-error">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <div className="form-group">
            <label className="form-label">Bio</label>
            <textarea className="form-input" rows={3}
              placeholder="Tell students about yourself and what you offer…"
              value={bio} onChange={e => setBio(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Location / Campus area</label>
            <input className="form-input" type="text" placeholder="e.g. West Campus"
              value={location} onChange={e => setLocation(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">
              Tags <span style={{ color: '#aaa', fontWeight: 400 }}>(Enter or , to add)</span>
            </label>
            <div className="tags-input-wrap">
              {tags.map(t => (
                <span key={t} className="tags-input-tag">
                  {t}
                  <button type="button" onClick={() => setTags(tags.filter(x => x !== t))}>×</button>
                </span>
              ))}
              <input
                className="tags-input-field"
                placeholder={tags.length ? '' : 'delivery, tutoring…'}
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKey}
              />
            </div>
          </div>

          <button className="btn btn-primary btn-full" type="submit" disabled={saving}>
            {saving ? 'Saving…' : profile ? 'Save changes' : 'Create provider profile'}
          </button>
        </form>

        {/* ── Services ──────────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p className="section-title" style={{ marginBottom: 0 }}>Portfolio & Services</p>
            {profile && !showAddSvc && (
              <button className="btn btn-sm btn-primary" onClick={() => setShowAddSvc(true)}>+ Add</button>
            )}
          </div>

          {!profile && (
            <div className="card" style={{ textAlign: 'center', color: '#888', fontSize: '0.85rem', padding: 28 }}>
              Save your profile first, then add services.
            </div>
          )}

          {/* Service cards with images */}
          {services.map(svc => (
            <div key={svc.id} style={{
              background: 'var(--card)', borderRadius: 'var(--radius)',
              overflow: 'hidden', marginBottom: 12, boxShadow: 'var(--shadow)',
            }}>
              {svc.image_url && (
                <div style={{
                  height: 140, backgroundImage: `url(${svc.image_url})`,
                  backgroundSize: 'cover', backgroundPosition: 'center',
                }} />
              )}
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div className="service-name">{svc.name}</div>
                  {svc.description && <div className="service-desc">{svc.description}</div>}
                </div>
                <span className="service-price">${Number(svc.price).toFixed(2)}</span>
                <button className="btn btn-sm btn-danger" style={{ padding: '5px 9px' }}
                  onClick={() => deleteService(svc)}>×</button>
              </div>
            </div>
          ))}

          {services.length === 0 && profile && !showAddSvc && (
            <div className="card" style={{ textAlign: 'center', color: '#888', fontSize: '0.85rem', padding: 24 }}>
              No services yet.{' '}
              <button style={{ background: 'none', border: 'none', color: 'var(--orange)', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => setShowAddSvc(true)}>Add one</button>
            </div>
          )}

          {/* Add service form */}
          {showAddSvc && (
            <form className="add-service-form" onSubmit={addService}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 12 }}>New Service</div>

              {/* Image upload */}
              <div className="form-group">
                <label className="form-label">
                  Portfolio image <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
                </label>
                {svcPreview ? (
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <img src={svcPreview} alt="preview" style={{
                      width: '100%', height: 140, objectFit: 'cover',
                      borderRadius: 6, display: 'block',
                    }} />
                    <button type="button" onClick={clearImage} style={{
                      position: 'absolute', top: 6, right: 6,
                      background: 'rgba(0,0,0,0.55)', color: 'white',
                      border: 'none', borderRadius: '50%', width: 24, height: 24,
                      cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1,
                    }}>×</button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed var(--border)', borderRadius: 6,
                      padding: '20px 12px', textAlign: 'center',
                      cursor: 'pointer', color: '#aaa', fontSize: '0.82rem',
                      marginBottom: 8, transition: 'border-color 0.15s',
                    }}
                    onMouseOver={e => e.currentTarget.style.borderColor = 'var(--orange)'}
                    onMouseOut={e  => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    Click to upload a photo
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*"
                  style={{ display: 'none' }} onChange={handleImagePick} />
              </div>

              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" type="text" placeholder="Grocery run"
                  value={svcName} onChange={e => setSvcName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Price ($)</label>
                <input className="form-input" type="number" min="0" step="0.01" placeholder="9.99"
                  value={svcPrice} onChange={e => setSvcPrice(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Description <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
                </label>
                <input className="form-input" type="text" placeholder="Short description…"
                  value={svcDesc} onChange={e => setSvcDesc(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-sm btn-outline-light"
                  onClick={() => { setShowAddSvc(false); clearImage() }}>Cancel</button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={uploading}>
                  {uploading ? 'Uploading…' : 'Add service'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
