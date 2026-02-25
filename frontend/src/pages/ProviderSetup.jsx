import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import AsyncSelect from 'react-select/async'
import { MapContainer, TileLayer, Circle, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../supabaseClient'
import 'leaflet/dist/leaflet.css'

function ServiceAreaMapCenter({ center }) {
  const map = useMap()
  useEffect(() => {
    if (center && center[0] != null && center[1] != null) map.setView(center, 14)
  }, [center, map])
  return null
}

const serviceAreaCenterIcon = L.divIcon({
  className: 'provider-setup-marker',
  html: '<span class="provider-setup-marker-dot"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const serviceAreaSelectStyles = {
  control: (base) => ({ ...base, minHeight: 40, borderRadius: 6, borderColor: 'var(--border)' }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  menu: (base) => ({ ...base, zIndex: 9999 }),
}

export default function ProviderSetup({ session, userProfile, onUpdate }) {
  const [profile, setProfile]       = useState(null)
  const [bio, setBio]               = useState('')
  const [location, setLocation]     = useState('')
  const [campusName, setCampusName] = useState('')
  const [campusLatitude, setCampusLatitude] = useState(null)
  const [campusLongitude, setCampusLongitude] = useState(null)
  const [serviceAreaAddress, setServiceAreaAddress] = useState('')
  const [latitude, setLatitude]   = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [serviceRadiusKm, setServiceRadiusKm] = useState('10')
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeError, setGeocodeError] = useState('')
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
  const [availDays, setAvailDays]   = useState([1, 2, 3, 4, 5])
  const [availStart, setAvailStart] = useState('9:00 AM')
  const [availEnd, setAvailEnd]     = useState('6:00 PM')
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
      setCampusName(data.campus_name || '')
      setCampusLatitude(data.campus_latitude != null ? data.campus_latitude : null)
      setCampusLongitude(data.campus_longitude != null ? data.campus_longitude : null)
      setLatitude(data.latitude != null ? data.latitude : null)
      setLongitude(data.longitude != null ? data.longitude : null)
      setServiceRadiusKm(data.service_radius_km != null ? String(data.service_radius_km) : '10')
      setTags(data.tags || [])
      setServices(data.services || [])
      if (data.availability) {
        setAvailDays(data.availability.days || [1, 2, 3, 4, 5])
        setAvailStart(data.availability.startTime || '9:00 AM')
        setAvailEnd(data.availability.endTime || '6:00 PM')
      }
    }
    setLoading(false)
  }

  const SERVICE_MAP_CENTER = [30.2672, -97.7431] // Austin, TX

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const loadCampusOptions = (inputValue) => {
    if (!inputValue || inputValue.trim().length < 2) return Promise.resolve([])
    const q = inputValue.trim()
    const query = q.toLowerCase().includes('university') || q.toLowerCase().includes('college') || q.toLowerCase().includes('school')
      ? q
      : `${q} university`
    const params = new URLSearchParams({ q: query, limit: '10', lang: 'en' })
    return fetch(`https://photon.komoot.io/api/?${params}`)
      .then((res) => res.json())
      .then((data) => {
        const features = data.features || []
        const campusLike = (f) => {
          const key = f.properties?.osm_key
          const val = f.properties?.osm_value
          return (key === 'amenity' && (val === 'university' || val === 'college')) || (key === 'building' && val === 'university')
        }
        const sorted = [...features].sort((a, b) => {
          const aC = campusLike(a) ? 1 : 0
          const bC = campusLike(b) ? 1 : 0
          if (bC !== aC) return bC - aC
          return 0
        })
        return sorted.slice(0, 8).map((f) => {
          const [lon, lat] = f.geometry?.coordinates || [0, 0]
          const p = f.properties || {}
          const label = [p.name, p.city, p.state].filter(Boolean).join(', ') || p.name || 'Campus'
          return {
            label,
            value: { lat: Number(lat), lon: Number(lon), display_name: label },
          }
        })
      })
      .catch(() => [])
  }

  const campusSelectValue = useMemo(() => {
    if (!campusName || campusLatitude == null || campusLongitude == null) return null
    return {
      label: campusName,
      value: { lat: campusLatitude, lon: campusLongitude, display_name: campusName },
    }
  }, [campusName, campusLatitude, campusLongitude])

  function onCampusChange(option) {
    if (!option) {
      setCampusName('')
      setCampusLatitude(null)
      setCampusLongitude(null)
    } else {
      setCampusName(option.label)
      setCampusLatitude(option.value.lat)
      setCampusLongitude(option.value.lon)
    }
  }

  const loadAddressOptions = (inputValue) => {
    if (!inputValue || inputValue.trim().length < 2) return Promise.resolve([])
    const q = inputValue.trim()
    const params = new URLSearchParams({ q, limit: '10', lang: 'en' })
    if (campusLatitude != null && campusLongitude != null) {
      const pad = 0.1
      params.set('bbox', [campusLongitude - pad, campusLatitude - pad, campusLongitude + pad, campusLatitude + pad].join(','))
    }
    return fetch(`https://photon.komoot.io/api/?${params}`)
      .then((res) => res.json())
      .then((data) => {
        const features = data.features || []
        const options = features.map((f) => {
          const [lon, lat] = f.geometry?.coordinates || [0, 0]
          const p = f.properties || {}
          const parts = [p.name, p.street, p.housenumber, p.locality, p.city, p.state].filter(Boolean)
          const label = parts.length ? parts.join(', ') : p.name || `${p.lat}, ${p.lon}`
          return {
            label,
            value: { lat: Number(lat), lon: Number(lon), display_name: label },
          }
        })
        if (campusLatitude != null && campusLongitude != null && options.length > 1) {
          options.sort((a, b) => {
            const dA = haversineKm(campusLatitude, campusLongitude, a.value.lat, a.value.lon)
            const dB = haversineKm(campusLatitude, campusLongitude, b.value.lat, b.value.lon)
            return dA - dB
          })
        }
        return options.slice(0, 5)
      })
      .catch(() => [])
  }

  const serviceAreaSelectValue = useMemo(() => {
    if (latitude == null || longitude == null || !serviceAreaAddress) return null
    return { label: serviceAreaAddress, value: { lat: latitude, lon: longitude, display_name: serviceAreaAddress } }
  }, [latitude, longitude, serviceAreaAddress])

  function onServiceAreaChange(option) {
    if (!option) {
      setServiceAreaAddress('')
      setLatitude(null)
      setLongitude(null)
    } else {
      setServiceAreaAddress(option.label)
      setLatitude(option.value.lat)
      setLongitude(option.value.lon)
      setGeocodeError('')
    }
  }

  async function geocodeAddress() {
    const q = serviceAreaAddress.trim()
    if (!q) { setGeocodeError('Enter an address or area'); return }
    setGeocodeError('')
    setGeocodeLoading(true)
    try {
      const params = new URLSearchParams({ q, limit: '1', lang: 'en' })
      if (campusLatitude != null && campusLongitude != null) {
        const pad = 0.1
        params.set('bbox', [campusLongitude - pad, campusLatitude - pad, campusLongitude + pad, campusLatitude + pad].join(','))
      }
      const res = await fetch(`https://photon.komoot.io/api/?${params}`)
      const data = await res.json()
      const features = data.features || []
      if (features[0]) {
        const f = features[0]
        const [lon, lat] = f.geometry?.coordinates || [0, 0]
        const p = f.properties || {}
        const label = [p.name, p.street, p.city, p.state].filter(Boolean).join(', ') || p.name || q
        setLatitude(Number(lat))
        setLongitude(Number(lon))
        setServiceAreaAddress(label)
      } else {
        setGeocodeError('Address not found.')
      }
    } catch (err) {
      setGeocodeError('Lookup failed. Try again.')
    }
    setGeocodeLoading(false)
  }

  async function saveProfile(e) {
    e.preventDefault()
    setSaving(true); setMessage(''); setError('')

    if (userProfile?.role !== 'provider') {
      await supabase.from('users').update({ role: 'provider' }).eq('id', session.user.id)
    }

    const payload = {
      bio, location, tags,
      campus_name: campusName || null,
      campus_latitude: campusLatitude != null ? Number(campusLatitude) : null,
      campus_longitude: campusLongitude != null ? Number(campusLongitude) : null,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      service_radius_km: serviceRadiusKm === '' ? 10 : parseFloat(serviceRadiusKm),
      availability: { days: availDays, startTime: availStart, endTime: availEnd },
    }
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
            <label className="form-label">College / Campus</label>
            <p className="form-hint" style={{ marginBottom: 6 }}>Pick your school so we can show nearby locations first when you set your service area.</p>
            <AsyncSelect
              placeholder="Search for your college or university…"
              value={campusSelectValue}
              onChange={onCampusChange}
              loadOptions={loadCampusOptions}
              isClearable
              defaultOptions={false}
              debounceTimeout={300}
              noOptionsMessage={({ inputValue }) => (inputValue?.trim().length < 2 ? 'Type to search…' : 'No campuses found')}
              loadingMessage={() => 'Searching…'}
              menuPortalTarget={document.body}
              menuPlacement="auto"
              classNamePrefix="service-area-select"
              styles={serviceAreaSelectStyles}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Service area for Discover</label>
            <AsyncSelect
              placeholder="Start typing an address or area…"
              value={serviceAreaSelectValue}
              onChange={onServiceAreaChange}
              loadOptions={loadAddressOptions}
              isClearable
              defaultOptions={false}
              debounceTimeout={300}
              noOptionsMessage={({ inputValue }) => (inputValue?.trim().length < 2 ? 'Type to search…' : 'No places found')}
              loadingMessage={() => 'Searching…'}
              menuPortalTarget={document.body}
              menuPlacement="auto"
              classNamePrefix="service-area-select"
              styles={serviceAreaSelectStyles}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <button type="button" className="btn btn-sm btn-outline-light" onClick={geocodeAddress} disabled={geocodeLoading}>
                {geocodeLoading ? 'Finding…' : 'Find on map'}
              </button>
              <span className="form-label" style={{ fontSize: '0.8rem', margin: 0 }}>Radius (km)</span>
              <input className="form-input" type="number" min="0.5" step="0.5" placeholder="10"
                value={serviceRadiusKm} onChange={e => setServiceRadiusKm(e.target.value)} style={{ width: 72 }} />
            </div>
            {geocodeError && <p className="form-hint" style={{ color: 'var(--danger)', marginTop: 6, marginBottom: 0 }}>{geocodeError}</p>}
            <div className="provider-setup-map-wrap">
              <MapContainer center={latitude != null && longitude != null ? [latitude, longitude] : SERVICE_MAP_CENTER} zoom={latitude != null && longitude != null ? 14 : 12} className="provider-setup-map" scrollWheelZoom={false}>
                <TileLayer attribution='&copy; <a href="https://carto.com/">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png" />
                <ServiceAreaMapCenter center={latitude != null && longitude != null ? [latitude, longitude] : null} />
                {latitude != null && longitude != null && (
                  <>
                    <Circle
                      center={[latitude, longitude]}
                      radius={(serviceRadiusKm === '' ? 10 : parseFloat(serviceRadiusKm)) * 1000}
                      pathOptions={{ color: 'var(--accent)', fillColor: 'var(--accent)', fillOpacity: 0.15, weight: 2 }}
                    />
                    <Marker
                      position={[latitude, longitude]}
                      icon={serviceAreaCenterIcon}
                      draggable
                      eventHandlers={{
                        dragend: (e) => {
                          const pos = e.target.getLatLng()
                          setLatitude(pos.lat)
                          setLongitude(pos.lng)
                        },
                      }}
                    />
                  </>
                )}
              </MapContainer>
            </div>
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

          <div className="form-group">
            <label className="form-label">Availability</label>
            <div className="avail-days">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map((name, i) => (
                <button
                  key={i}
                  type="button"
                  className={`avail-day-btn${availDays.includes(i) ? ' active' : ''}`}
                  onClick={() => setAvailDays(prev =>
                    prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i].sort()
                  )}
                >{name}</button>
              ))}
            </div>
            <div className="avail-time-row">
              <select value={availStart} onChange={e => setAvailStart(e.target.value)} className="form-input avail-time-select">
                {['6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <span className="avail-time-sep">to</span>
              <select value={availEnd} onChange={e => setAvailEnd(e.target.value)} className="form-input avail-time-select">
                {['6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <button className="btn btn-primary btn-full" type="submit" disabled={saving}>
            {saving ? 'Saving...' : profile ? 'Save changes' : 'Create provider profile'}
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
