import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import AsyncSelect from 'react-select/async'
import { MapContainer, TileLayer, Circle, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import Cropper from 'react-easy-crop'
import { supabase } from '../supabaseClient'
import 'leaflet/dist/leaflet.css'

/* ── Helpers ────────────────────────────────────────────────── */

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

const MAX_IMAGES = 5
const CROP_ASPECT = 4 / 3

function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (e) => reject(e))
    image.crossOrigin = 'anonymous'
    image.src = url
  })
}

async function getCroppedImg(imageSrc, pixelCrop) {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height
  )
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92)
  })
}

/* ── Component ──────────────────────────────────────────────── */

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
  const [editingService, setEditingService] = useState(null)
  const [showAddSvc, setShowAddSvc] = useState(false)
  const [svcName, setSvcName]       = useState('')
  const [svcDesc, setSvcDesc]       = useState('')
  const [svcOptions, setSvcOptions] = useState([{ name: '', price: '' }])
  // Multi-image state
  const [svcImages, setSvcImages]     = useState([])   // File | null per slot (null = existing URL)
  const [svcPreviews, setSvcPreviews] = useState([])   // preview URLs (object URLs or remote URLs)
  // Crop state
  const [cropSrc, setCropSrc]           = useState(null) // image src to crop
  const [cropObj, setCropObj]           = useState({ x: 0, y: 0 })
  const [cropZoom, setCropZoom]         = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [cropTargetIndex, setCropTargetIndex] = useState(null) // which image slot

  const [uploading, setUploading]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [loading, setLoading]       = useState(true)
  const [message, setMessage]       = useState('')
  const [error, setError]           = useState('')
  const TIME_OPTIONS = ['6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM']
  const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa']
  const defaultDayHours = () => ({ startTime: '9:00 AM', endTime: '6:00 PM' })
  const [availByDay, setAvailByDay] = useState(() => ({
    0: null, 1: defaultDayHours(), 2: defaultDayHours(), 3: defaultDayHours(), 4: defaultDayHours(), 5: defaultDayHours(), 6: null,
  }))
  const fileInputRef = useRef()
  const addFormRef = useRef()

  const routerLocation = useLocation()
  const [searchParams] = useSearchParams()

  // Edit-only mode: hide profile form when ?edit= is present
  const editOnlyMode = !!searchParams.get('edit')

  // Open add-service form when coming from "Add Service" button (?add=1); show setup prompt when ?setup=1
  useEffect(() => {
    const params = new URLSearchParams(routerLocation.search)
    if (params.get('add') === '1') setShowAddSvc(true)
  }, [routerLocation.search])

  // Auto-open edit form when navigating with ?edit=<serviceId>
  useEffect(() => {
    const params = new URLSearchParams(routerLocation.search)
    const editId = params.get('edit')
    if (!editId || services.length === 0) return
    const svc = services.find(s => s.id === editId || (s.service_options || []).some(o => o.id === editId))
    if (svc) openEditService(svc)
  }, [routerLocation.search, services])

  useEffect(() => {
    if (!routerLocation.hash) return
    const el = document.getElementById(routerLocation.hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [routerLocation.hash])

  useEffect(() => {
    if (showAddSvc && addFormRef.current) {
      const t = requestAnimationFrame(() => {
        addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return () => cancelAnimationFrame(t)
    }
  }, [showAddSvc])

  // Block consumers from this page (allow if profile or auth metadata says provider)
  const isProvider = userProfile?.role === 'provider' || session?.user?.user_metadata?.role === 'provider'
  if (!isProvider) {
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

  useEffect(() => {
    if (session?.user?.id) fetchProfile()
  }, [session?.user?.id])

  async function fetchProfile() {
    setLoading(true)
    const { data } = await supabase
      .from('providers')
      .select('*, services (*, service_options (*))')
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
    setSaving(true)
    setMessage('')
    setError('')

    try {
      if (!session?.user?.id || !session?.user?.email) {
        setError('Session expired. Please sign in again.')
        return
      }

      // Ensure public.users has a row with role = 'provider' so RLS allows providers insert
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
      // Upsert: insert if new, update if row exists (avoids "duplicate key" when profile exists but fetch returned null)
      const { error } = await supabase.from('providers').upsert(
        { id: session.user.id, ...payload },
        { onConflict: 'id' }
      )

      if (error) {
        setError(error.message || 'Could not save profile. Try again.')
        return
      }
      await fetchProfile()
      onUpdate?.()
      setMessage('Profile saved!')
    } catch (err) {
      setError(err?.message || 'Something went wrong. Try again.')
    } finally {
      setSaving(false)
    }
  }

  /* ── Image handling (multi-image + crop) ──────────────────── */

  function handleImagePick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''
    // Open crop modal
    const src = URL.createObjectURL(file)
    setCropSrc(src)
    setCropObj({ x: 0, y: 0 })
    setCropZoom(1)
    setCroppedAreaPixels(null)
    setCropTargetIndex(svcPreviews.length) // append
  }

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  async function confirmCrop() {
    if (!cropSrc || !croppedAreaPixels) return
    try {
      const blob = await getCroppedImg(cropSrc, croppedAreaPixels)
      const file = new File([blob], `crop-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const preview = URL.createObjectURL(blob)
      const idx = cropTargetIndex

      setSvcImages(prev => {
        const next = [...prev]
        next[idx] = file
        return next
      })
      setSvcPreviews(prev => {
        const next = [...prev]
        next[idx] = preview
        return next
      })
    } catch {
      // silently fail crop
    }
    URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setCropTargetIndex(null)
  }

  function cancelCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setCropTargetIndex(null)
  }

  function removeImage(idx) {
    setSvcImages(prev => prev.filter((_, i) => i !== idx))
    setSvcPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  function clearImages() {
    setSvcImages([])
    setSvcPreviews([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadImage(file) {
    const ext  = file.name.split('.').pop()
    const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
    const { error } = await supabase.storage
      .from('service-images')
      .upload(path, file, { upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from('service-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function uploadAllImages() {
    const urls = []
    for (let i = 0; i < svcPreviews.length; i++) {
      const file = svcImages[i]
      if (file) {
        // New file to upload
        const url = await uploadImage(file)
        urls.push(url)
      } else {
        // Existing URL (kept from edit)
        urls.push(svcPreviews[i])
      }
    }
    return urls
  }

  async function addService(e) {
    e.preventDefault()
    setError('')
    setUploading(true)

    const validOptions = svcOptions.filter(o => o.name.trim() && o.price !== '' && Number(o.price) >= 0)
    if (validOptions.length === 0) {
      setError('Add at least one option with name and price.')
      setUploading(false)
      return
    }

    // Ensure provider row and user role exist so DB allows the insert (RLS requires users.role = 'provider')
    if (!profile) {
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
        setError('Account setup failed: ' + (userErr.message || 'Please save your provider profile (left card) first.'))
        setUploading(false)
        return
      }
      const { error: provErr } = await supabase.from('providers').insert({
        id: session.user.id,
        bio: bio.trim() || null,
        location: location.trim() || null,
        tags: tags.length ? tags : null,
      })
      if (provErr) {
        if (provErr.code === '23505') {
          // Already exists, refetch
          await fetchProfile()
        } else {
          setError('Profile setup failed: ' + (provErr.message || 'Save your provider profile on the left first, then add a service.'))
          setUploading(false)
          return
        }
      } else {
        await fetchProfile()
      }
    }

    let imageUrls = []
    try { imageUrls = await uploadAllImages() }
    catch (err) { setError('Image upload failed: ' + err.message); setUploading(false); return }

    const { data: newService, error: insertErr } = await supabase.from('services').insert({
      provider_id: session.user.id,
      name:        svcName.trim(),
      description: svcDesc.trim() || null,
      image_url:   imageUrls[0] || null,
      image_urls:  imageUrls,
    }).select('id').single()

    if (insertErr) {
      setError(insertErr.message || 'Could not add service. Check your connection and try again.')
      setUploading(false)
      return
    }

    const optionRows = validOptions.map(o => ({
      service_id: newService.id,
      name:       o.name.trim(),
      price:      parseFloat(o.price),
    }))
    const { error: optErr } = await supabase.from('service_options').insert(optionRows)
    if (optErr) {
      await supabase.from('services').delete().eq('id', newService.id)
      setError(optErr.message || 'Could not save options. Try again.')
      setUploading(false)
      return
    }

    setSvcName('')
    setSvcDesc('')
    setSvcOptions([{ name: '', price: '' }])
    clearImages()
    setShowAddSvc(false)
    await fetchProfile()
    setUploading(false)
  }

  async function deleteService(svc) {
    // Remove images from storage
    const allUrls = (svc.image_urls && svc.image_urls.length > 0) ? svc.image_urls : (svc.image_url ? [svc.image_url] : [])
    for (const url of allUrls) {
      const path = url.split('/service-images/')[1]
      if (path) await supabase.storage.from('service-images').remove([path])
    }
    await supabase.from('services').delete().eq('id', svc.id)
    if (editingService?.id === svc.id) {
      setEditingService(null)
      setShowAddSvc(false)
      setSvcName('')
      setSvcDesc('')
      setSvcOptions([{ name: '', price: '' }])
      clearImages()
    }
    fetchProfile()
  }

  function openEditService(svc) {
    setEditingService(svc)
    setSvcName(svc.name || '')
    setSvcDesc(svc.description || '')
    setSvcOptions(
      (svc.service_options && svc.service_options.length) > 0
        ? svc.service_options.map(o => ({ name: o.name || '', price: String(o.price ?? '') }))
        : [{ name: '', price: '' }]
    )
    // Populate multi-image previews
    const urls = (svc.image_urls && svc.image_urls.length > 0)
      ? svc.image_urls
      : (svc.image_url ? [svc.image_url] : [])
    setSvcPreviews([...urls])
    setSvcImages(urls.map(() => null)) // null = existing URL, no new file
    setShowAddSvc(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function closeServiceForm() {
    setEditingService(null)
    setShowAddSvc(false)
    setSvcName('')
    setSvcDesc('')
    setSvcOptions([{ name: '', price: '' }])
    clearImages()
  }

  async function saveEditService(e) {
    e.preventDefault()
    if (!editingService) return
    setError('')
    setUploading(true)

    const validOptions = svcOptions.filter(o => o.name.trim() && o.price !== '' && Number(o.price) >= 0)
    if (validOptions.length === 0) {
      setError('Add at least one option with name and price.')
      setUploading(false)
      return
    }

    let imageUrls = []
    try {
      imageUrls = await uploadAllImages()
    } catch (err) {
      setError('Image upload failed: ' + err.message)
      setUploading(false)
      return
    }

    const { error: updateErr } = await supabase
      .from('services')
      .update({
        name: svcName.trim(),
        description: svcDesc.trim() || null,
        image_url: imageUrls[0] || null,
        image_urls: imageUrls,
      })
      .eq('id', editingService.id)

    if (updateErr) {
      setError(updateErr.message)
      setUploading(false)
      return
    }

    await supabase.from('service_options').delete().eq('service_id', editingService.id)
    const optionRows = validOptions.map(o => ({
      service_id: editingService.id,
      name: o.name.trim(),
      price: parseFloat(o.price),
    }))
    const { error: optErr } = await supabase.from('service_options').insert(optionRows)
    if (optErr) {
      setError(optErr.message)
      setUploading(false)
      return
    }

    closeServiceForm()
    fetchProfile()
    setUploading(false)
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

  const layoutClass = `provider-setup-layout${editOnlyMode ? ' provider-setup-layout--edit-only' : ''}`

  return (
    <div className="provider-setup-page">
      {/* Edit-only: back link */}
      {editOnlyMode && (
        <div className="provider-setup-back-row">
          <Link to="/my-services" className="provider-setup-back-link">&lsaquo; Back to My Services</Link>
        </div>
      )}

      {!editOnlyMode && (
        <header className="provider-setup-header">
          <h1 className="provider-setup-title">My Services</h1>
          <p className="provider-setup-subtitle">
            {profile ? 'Manage your provider profile and portfolio' : 'Set up your profile to start offering services'}
          </p>
          {routerLocation.search.includes('setup=1') && !profile && (
            <p className="provider-setup-hint" style={{ marginTop: 8, padding: '10px 14px', background: 'var(--ps-accent)', color: '#fff', borderRadius: 8 }}>
              Complete your provider profile below so your listing appears and you can add services.
            </p>
          )}
        </header>
      )}

      <div className={layoutClass}>
        {/* ── Profile card ──────────────────────────────── */}
        {!editOnlyMode && (
        <form className="provider-setup-card provider-setup" onSubmit={saveProfile}>
          <h2 className="provider-setup-card-title">{profile ? 'Provider profile' : 'Step 1: Provider profile'}</h2>

          {error && !showAddSvc && <div className="alert alert-error">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <div className="provider-setup-section">
            <label className="provider-setup-section-title">Bio</label>
            <textarea className="form-input" rows={3}
              placeholder="Tell students about yourself and what you offer…"
              value={bio} onChange={e => setBio(e.target.value)} />
          </div>

          <div className="provider-setup-section">
            <label className="provider-setup-section-title">Location / campus area</label>
            <input className="form-input" type="text" placeholder="e.g. West Campus"
              value={location} onChange={e => setLocation(e.target.value)} />
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
              menuPortalTarget={document.body}
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
              menuPortalTarget={document.body}
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
                value={serviceRadiusKm} onChange={e => setServiceRadiusKm(e.target.value)} />
            </div>
            {geocodeError && <p className="provider-setup-hint" style={{ color: 'var(--danger)', marginTop: 6 }}>{geocodeError}</p>}
            <div className="provider-setup-map-wrap">
              <MapContainer center={latitude != null && longitude != null ? [latitude, longitude] : SERVICE_MAP_CENTER} zoom={latitude != null && longitude != null ? 14 : 12} className="provider-setup-map" scrollWheelZoom={false}>
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

          <div className="provider-setup-section">
            <label className="provider-setup-section-title">Tags</label>
            <p className="provider-setup-hint">Press Enter or comma to add (e.g. delivery, tutoring)</p>
            <div className="tags-input-wrap">
              {tags.map(t => (
                <span key={t} className="tags-input-tag">
                  {t}
                  <button type="button" onClick={() => setTags(tags.filter(x => x !== t))} aria-label={`Remove ${t}`}>×</button>
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

          <div className="provider-setup-section" id="availability">
            <label className="provider-setup-section-title">Availability</label>
            <p className="provider-setup-hint">Set hours per day. Choose "Off" to leave a day unavailable.</p>
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
                      onChange={e => {
                        const v = e.target.value
                        setAvailByDay(prev => ({
                          ...prev,
                          [i]: v ? { startTime: v, endTime: prev[i]?.endTime || '6:00 PM' } : null,
                        }))
                      }}
                    >
                      <option value="">Off</option>
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="provider-setup-avail-sep">to</span>
                    <select
                      value={end}
                      onChange={e => {
                        const v = e.target.value
                        setAvailByDay(prev => ({
                          ...prev,
                          [i]: prev[i] ? { ...prev[i], endTime: v } : { startTime: '9:00 AM', endTime: v },
                        }))
                      }}
                      disabled={!start}
                    >
                      <option value="">—</option>
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>

          <button className="provider-setup-submit" type="submit" disabled={saving}>
            {saving ? 'Saving…' : profile ? 'Save changes' : 'Create provider profile'}
          </button>
          {error && !showAddSvc && <p className="provider-setup-hint" style={{ marginTop: 8, color: 'var(--danger)', fontWeight: 500 }}>{error}</p>}
        </form>
        )}

        {/* ── Services column ──────────────────────────────────── */}
        <div className="provider-setup-services-col" id="add-service">
          <div className="provider-setup-services-header">
            <h2 className="provider-setup-services-title">{editOnlyMode ? 'Edit service' : 'Portfolio & services'}</h2>
            {isProvider && !showAddSvc && !editOnlyMode && (
              <button type="button" className="provider-setup-add-btn" onClick={() => { setEditingService(null); setSvcName(''); setSvcDesc(''); setSvcOptions([{ name: '', price: '' }]); clearImages(); setShowAddSvc(true) }}>
                <span aria-hidden>+</span> Add service
              </button>
            )}
          </div>

          {!profile && !editOnlyMode && (
            <div className="provider-setup-empty">
              <div className="provider-setup-empty-icon" aria-hidden>2</div>
              <h3 className="provider-setup-empty-title">Step 2: Add your services</h3>
              <p className="provider-setup-empty-text">
                Save your profile on the left first, or add a service below — we'll create your provider profile when you save the service.
              </p>
              <ul className="provider-setup-empty-list">
                <li>Add service name and at least one option with price</li>
                <li>Optional photo and description</li>
                <li>Show up in Discover for students</li>
              </ul>
              <p className="provider-setup-empty-text" style={{ marginBottom: 12, fontSize: '0.875rem' }}>
                Click <strong>Create provider profile</strong> in the left card, or use <strong>Add service</strong> below.
              </p>
              <button type="button" className="provider-setup-empty-btn" onClick={() => { setEditingService(null); setSvcName(''); setSvcDesc(''); setSvcOptions([{ name: '', price: '' }]); clearImages(); setShowAddSvc(true) }}>
                Add your first service
              </button>
            </div>
          )}

          {!editOnlyMode && services.map(svc => (
            <div key={svc.id} className="provider-setup-service-card">
              <div
                className="provider-setup-service-card-image"
                style={svc.image_url ? { backgroundImage: `url(${svc.image_url})` } : {}}
              />
              <div className="provider-setup-service-card-body">
                <div className="provider-setup-service-card-info">
                  <p className="provider-setup-service-card-name">{svc.name}</p>
                  {svc.description && <p className="provider-setup-service-card-desc">{svc.description}</p>}
                  {(svc.service_options && svc.service_options.length) > 0 && (
                    <ul className="provider-setup-service-options-list">
                      {(svc.service_options || []).map(opt => (
                        <li key={opt.id}>
                          <span className="provider-setup-service-option-name">{opt.name}</span>
                          <span className="provider-setup-service-card-price">${Number(opt.price).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="provider-setup-service-card-actions">
                  <button type="button" className="provider-setup-service-card-edit" onClick={() => openEditService(svc)} aria-label={`Edit ${svc.name}`}>Edit</button>
                  <button type="button" className="provider-setup-service-card-remove" onClick={() => deleteService(svc)} aria-label={`Delete ${svc.name}`}>×</button>
                </div>
              </div>
            </div>
          ))}

          {services.length === 0 && profile && !showAddSvc && !editOnlyMode && (
            <div className="provider-setup-empty provider-setup-empty--services">
              <div className="provider-setup-empty-icon" aria-hidden>🛒</div>
              <h3 className="provider-setup-empty-title">No services yet</h3>
              <p className="provider-setup-empty-text">Add your first service to start appearing in Discover.</p>
              <button type="button" className="provider-setup-empty-btn" onClick={() => setShowAddSvc(true)}>Add one</button>
            </div>
          )}

          {showAddSvc && (
            <form ref={addFormRef} className="add-service-form add-service-form--compact" onSubmit={editingService ? saveEditService : addService}>
              <div className="add-service-form-header">
                <span className="add-service-form-title">{editingService ? 'Edit service' : 'New service'}</span>
                <button type="button" className="add-service-form-close" onClick={closeServiceForm} aria-label="Close">×</button>
              </div>
              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

              <div className="form-group">
                <label className="form-label">Service name</label>
                <input className="form-input" type="text" placeholder="e.g. Haircuts"
                  value={svcName} onChange={e => setSvcName(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Description <span className="form-label-optional">optional</span></label>
                <input className="form-input" type="text" placeholder="Short description…"
                  value={svcDesc} onChange={e => setSvcDesc(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Options & prices</label>
                <p className="provider-setup-hint">Add at least one option (e.g. &quot;Hair only&quot; $20, &quot;Hair + beard&quot; $40)</p>
                {svcOptions.map((opt, idx) => (
                  <div key={idx} className="add-service-option-row">
                    <input className="form-input" type="text" placeholder="Option name"
                      value={opt.name} onChange={e => setSvcOptions(prev => prev.map((o, i) => i === idx ? { ...o, name: e.target.value } : o))} />
                    <input className="form-input add-service-option-price" type="number" min="0" step="0.01" placeholder="0"
                      value={opt.price} onChange={e => setSvcOptions(prev => prev.map((o, i) => i === idx ? { ...o, price: e.target.value } : o))} />
                    {svcOptions.length > 1 ? (
                      <button type="button" className="add-service-option-remove" onClick={() => setSvcOptions(prev => prev.filter((_, i) => i !== idx))} aria-label="Remove option">×</button>
                    ) : (
                      <span className="add-service-option-spacer" />
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-sm btn-outline-light add-service-add-option" onClick={() => setSvcOptions(prev => [...prev, { name: '', price: '' }])}>
                  + Add another option
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Photos <span className="form-label-optional">up to {MAX_IMAGES}</span></label>
                <div className="svc-image-grid">
                  {svcPreviews.map((src, idx) => (
                    <div key={idx} className="svc-image-grid-item">
                      <img src={src} alt={`Preview ${idx + 1}`} />
                      <button type="button" onClick={() => removeImage(idx)} className="svc-image-grid-remove" aria-label="Remove photo">×</button>
                    </div>
                  ))}
                  {svcPreviews.length < MAX_IMAGES && (
                    <label className="svc-image-grid-add">
                      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImagePick} />
                      <span>+ Add photo</span>
                    </label>
                  )}
                </div>
              </div>

              <div className="add-service-form-actions">
                <button type="button" className="btn btn-outline-light" onClick={closeServiceForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? (editingService ? 'Saving…' : 'Adding…') : (editingService ? 'Save changes' : 'Add service')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ── Crop modal ──────────────────────────────────────────── */}
      {cropSrc && (
        <div className="crop-modal-overlay">
          <div className="crop-modal">
            <div className="crop-modal-area">
              <Cropper
                image={cropSrc}
                crop={cropObj}
                zoom={cropZoom}
                aspect={CROP_ASPECT}
                onCropChange={setCropObj}
                onZoomChange={setCropZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="crop-modal-controls">
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={cropZoom}
                onChange={e => setCropZoom(Number(e.target.value))}
                className="crop-modal-zoom"
              />
              <div className="crop-modal-actions">
                <button type="button" className="btn btn-outline-light" onClick={cancelCrop}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={confirmCrop}>Confirm crop</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
