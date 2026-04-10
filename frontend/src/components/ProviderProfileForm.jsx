import { useState, useEffect, useMemo } from 'react'
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

const TIME_OPTIONS = ['6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM']
const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa']
const defaultDayHours = () => ({ startTime: '9:00 AM', endTime: '6:00 PM' })
const SERVICE_MAP_CENTER = [30.2672, -97.7431]

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

/**
 * Provider-only: bio, location, campus, service area map, listing tags, availability.
 * Use from Profile → Edit (providers) or anywhere a provider edits listing details.
 */
export default function ProviderProfileForm({ session, onSaved, compact }) {
  const [profile, setProfile] = useState(null)
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [campusName, setCampusName] = useState('')
  const [campusLatitude, setCampusLatitude] = useState(null)
  const [campusLongitude, setCampusLongitude] = useState(null)
  const [serviceAreaAddress, setServiceAreaAddress] = useState('')
  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [serviceRadiusKm, setServiceRadiusKm] = useState('10')
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeError, setGeocodeError] = useState('')
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [availByDay, setAvailByDay] = useState(() => ({
    0: null, 1: defaultDayHours(), 2: defaultDayHours(), 3: defaultDayHours(), 4: defaultDayHours(), 5: defaultDayHours(), 6: null,
  }))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.user?.id) return
    void (async () => {
      setLoading(true)
      const { data } = await supabase
        .from('providers')
        .select('bio, tags, location, campus_name, campus_latitude, campus_longitude, latitude, longitude, service_radius_km, availability')
        .eq('id', session.user.id)
        .maybeSingle()
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
        if (data.availability) {
          const a = data.availability
          if (a.days && (a.startTime != null || a.endTime != null)) {
            const legacy = { startTime: a.startTime || '9:00 AM', endTime: a.endTime || '6:00 PM' }
            const byDay = {}
            for (let d = 0; d <= 6; d++) byDay[d] = a.days.includes(d) ? { ...legacy } : null
            setAvailByDay(byDay)
          } else {
            const byDay = {}
            for (let d = 0; d <= 6; d++) {
              const v = a[String(d)] ?? a[d]
              byDay[d] = v && (v.startTime || v.endTime) ? { startTime: v.startTime || '9:00 AM', endTime: v.endTime || '6:00 PM' } : null
            }
            setAvailByDay(byDay)
          }
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })()
  }, [session?.user?.id])

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
    } catch {
      setGeocodeError('Lookup failed. Try again.')
    }
    setGeocodeLoading(false)
  }

  function handleTagKey(e) {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const t = tagInput.trim().toLowerCase().replace(/,/g, '')
      if (!tags.includes(t)) setTags((prev) => [...prev, t])
      setTagInput('')
    }
  }

  async function saveProfile(e) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      if (!session?.user?.id || !session?.user?.email) {
        setError('Session expired. Please sign in again.')
        return
      }
      const { error: userErr } = await supabase.from('users').upsert(
        {
          id: session.user.id,
          email: session.user.email,
          display_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Provider',
          role: 'provider',
        },
        { onConflict: 'id' }
      )
      if (userErr) {
        setError(userErr.message || 'Could not update account.')
        return
      }
      const payload = {
        bio, location, tags,
        campus_name: campusName || null,
        campus_latitude: campusLatitude != null ? Number(campusLatitude) : null,
        campus_longitude: campusLongitude != null ? Number(campusLongitude) : null,
        latitude: latitude != null ? Number(latitude) : null,
        longitude: longitude != null ? Number(longitude) : null,
        service_radius_km: serviceRadiusKm === '' ? 10 : parseFloat(serviceRadiusKm),
        availability: (() => {
          const out = {}
          for (let d = 0; d <= 6; d++) {
            const day = availByDay[d]
            if (day?.startTime && day?.endTime) out[String(d)] = { startTime: day.startTime, endTime: day.endTime }
          }
          return out
        })(),
      }
      const { error: upErr } = await supabase.from('providers').upsert(
        { id: session.user.id, ...payload },
        { onConflict: 'id' }
      )
      if (upErr) {
        setError(upErr.message || 'Could not save profile. Try again.')
        return
      }
      setProfile((p) => ({ ...(p || {}), ...payload }))
      setMessage('Provider details saved.')
      onSaved?.()
    } catch (err) {
      setError(err?.message || 'Something went wrong. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="profile-edit-modal-hint">Loading provider settings…</p>
  }

  const cardClass = compact
    ? 'provider-profile-form-inline provider-setup provider-setup-card'
    : 'provider-setup provider-setup-card'

  return (
    <form className={cardClass} onSubmit={saveProfile}>
      <h3 className={`provider-setup-card-title${compact ? ' provider-profile-form-title--compact' : ''}`}>
        Provider listing details
      </h3>
      <p className="profile-edit-modal-hint" style={{ marginTop: -8, marginBottom: 16 }}>
        Campus area, Discover map radius, service tags, and weekly hours.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="provider-setup-section">
        <label className="provider-setup-section-title">Bio (listing)</label>
        <textarea className="form-input" rows={3}
          placeholder="Tell students about yourself and what you offer…"
          value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>

      <div className="provider-setup-section">
        <label className="provider-setup-section-title">Location / campus area</label>
        <input className="form-input" type="text" placeholder="e.g. West Campus"
          value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>

      <div className="provider-setup-section">
        <label className="provider-setup-section-title">College / campus</label>
        <p className="provider-setup-hint">Pick your school so we can show nearby locations when you set your service area.</p>
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
          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
          menuPlacement="auto"
          classNamePrefix="service-area-select"
          styles={serviceAreaSelectStyles}
        />
      </div>

      <div className="provider-setup-section">
        <label className="provider-setup-section-title">Service area for Discover</label>
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
          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
          menuPlacement="auto"
          classNamePrefix="service-area-select"
          styles={serviceAreaSelectStyles}
        />
        <div className="provider-setup-map-row">
          <button type="button" className="btn btn-sm btn-outline-light" onClick={geocodeAddress} disabled={geocodeLoading}>
            {geocodeLoading ? 'Finding…' : 'Find on map'}
          </button>
          <span className="provider-setup-map-row-label">Radius (km)</span>
          <input className="form-input" type="number" min="0.5" step="0.5" placeholder="10"
            value={serviceRadiusKm} onChange={(e) => setServiceRadiusKm(e.target.value)} />
        </div>
        {geocodeError && <p className="provider-setup-hint" style={{ color: 'var(--danger)', marginTop: 6 }}>{geocodeError}</p>}
        <div className="provider-setup-map-wrap">
          <MapContainer
            center={latitude != null && longitude != null ? [latitude, longitude] : SERVICE_MAP_CENTER}
            zoom={latitude != null && longitude != null ? 14 : 12}
            className="provider-setup-map"
            scrollWheelZoom={false}
          >
            <TileLayer attribution='&copy; <a href="https://carto.com/">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png" />
            <ServiceAreaMapCenter center={latitude != null && longitude != null ? [latitude, longitude] : null} />
            {latitude != null && longitude != null && (
              <>
                <Circle
                  center={[latitude, longitude]}
                  radius={(serviceRadiusKm === '' ? 10 : parseFloat(serviceRadiusKm)) * 1000}
                  pathOptions={{ color: 'var(--ps-accent)', fillColor: 'var(--ps-accent)', fillOpacity: 0.15, weight: 2 }}
                />
                <Marker
                  position={[latitude, longitude]}
                  icon={serviceAreaCenterIcon}
                  draggable
                  eventHandlers={{
                    dragend: (ev) => {
                      const pos = ev.target.getLatLng()
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

      <div className="provider-setup-section">
        <label className="provider-setup-section-title">Tags (Discover)</label>
        <p className="provider-setup-hint">Press Enter or comma to add (e.g. delivery, tutoring)</p>
        <div className="tags-input-wrap">
          {tags.map((t) => (
            <span key={t} className="tags-input-tag">
              {t}
              <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>×</button>
            </span>
          ))}
          <input
            className="tags-input-field"
            placeholder={tags.length ? '' : 'delivery, tutoring…'}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKey}
          />
        </div>
      </div>

      <div className="provider-setup-section" id="availability">
        <label className="provider-setup-section-title">Availability</label>
        <p className="provider-setup-hint">Set hours per day. Choose &quot;Off&quot; to leave a day unavailable.</p>
        <div className="provider-setup-avail">
          {DAY_NAMES.map((name, i) => {
            const day = availByDay[i]
            const start = day?.startTime ?? ''
            const end = day?.endTime ?? ''
            return (
              <div key={i} className="provider-setup-avail-row">
                <span className="provider-setup-avail-day">{name}</span>
                <select
                  value={start}
                  onChange={(e) => {
                    const v = e.target.value
                    setAvailByDay((prev) => ({
                      ...prev,
                      [i]: v ? { startTime: v, endTime: prev[i]?.endTime || '6:00 PM' } : null,
                    }))
                  }}
                >
                  <option value="">Off</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="provider-setup-avail-sep">to</span>
                <select
                  value={end}
                  onChange={(e) => {
                    const v = e.target.value
                    setAvailByDay((prev) => ({
                      ...prev,
                      [i]: prev[i] ? { ...prev[i], endTime: v } : { startTime: '9:00 AM', endTime: v },
                    }))
                  }}
                  disabled={!start}
                >
                  <option value="">—</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      </div>

      <button className="provider-setup-submit" type="submit" disabled={saving}>
        {saving ? 'Saving…' : profile ? 'Save provider details' : 'Create provider profile'}
      </button>
    </form>
  )
}
