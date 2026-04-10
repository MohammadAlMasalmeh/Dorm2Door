import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import Cropper from 'react-easy-crop'
import { supabase } from '../supabaseClient'
import { SERVICE_CATEGORY_KEYS, SERVICE_CATEGORY_LABELS } from '../constants/serviceCategories'

const MAX_IMAGES = 6
const CROP_ASPECT = 3 / 4

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

export default function CreateListing({ session, userProfile, onUpdate }) {
  const navigate = useNavigate()
  const { serviceId } = useParams()
  const isEdit = Boolean(serviceId)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('academic')
  const [locationOn, setLocationOn] = useState(false)
  const [locationText, setLocationText] = useState('')
  const [svcOptions, setSvcOptions] = useState([{ name: '', price: '' }])
  const [svcImages, setSvcImages] = useState([])
  const [svcPreviews, setSvcPreviews] = useState([])
  const [cropSrc, setCropSrc] = useState(null)
  const [cropObj, setCropObj] = useState({ x: 0, y: 0 })
  const [cropZoom, setCropZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(!!isEdit)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const isProvider = userProfile?.role === 'provider' || session?.user?.user_metadata?.role === 'provider'

  useEffect(() => {
    if (!isEdit || !serviceId || !session?.user?.id) {
      setLoading(false)
      return
    }
    void (async () => {
      const { data, error: err } = await supabase
        .from('services')
        .select('*, service_options (*)')
        .eq('id', serviceId)
        .eq('provider_id', session.user.id)
        .single()
      if (err || !data) {
        setError('Could not load this listing.')
        setLoading(false)
        return
      }
      setTitle(data.name || '')
      setDescription(data.description || '')
      const cat = (data.category || 'academic').toString().trim().toLowerCase()
      setCategory(SERVICE_CATEGORY_KEYS.includes(cat) ? cat : 'academic')
      const urls = (data.image_urls && data.image_urls.length > 0)
        ? data.image_urls
        : (data.image_url ? [data.image_url] : [])
      setSvcPreviews([...urls])
      setSvcImages(urls.map(() => null))
      if (data.service_options?.length) {
        setSvcOptions(data.service_options.map((o) => ({ name: o.name || '', price: String(o.price ?? '') })))
      }
      setLoading(false)
    })()
  }, [isEdit, serviceId, session?.user?.id])

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  function handleImagePick(e) {
    const file = e.target.files?.[0]
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file) return
    if (svcPreviews.length >= MAX_IMAGES) return
    const src = URL.createObjectURL(file)
    setCropSrc(src)
    setCropObj({ x: 0, y: 0 })
    setCropZoom(1)
    setCroppedAreaPixels(null)
  }

  async function confirmCrop() {
    if (!cropSrc || !croppedAreaPixels) return
    try {
      const blob = await getCroppedImg(cropSrc, croppedAreaPixels)
      const preview = URL.createObjectURL(blob)
      const file = new File([blob], `crop-${Date.now()}.jpg`, { type: 'image/jpeg' })
      setSvcImages((prev) => [...prev, file])
      setSvcPreviews((prev) => [...prev, preview])
    } catch { /* ignore */ }
    URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  function cancelCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  function removeImageAt(idx) {
    setSvcImages((prev) => prev.filter((_, i) => i !== idx))
    setSvcPreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  function buildDescriptionPayload() {
    const parts = []
    if (locationOn && locationText.trim()) parts.push(`Meet-up: ${locationText.trim()}`)
    if (description.trim()) parts.push(description.trim())
    return parts.length ? parts.join('\n\n') : null
  }

  async function ensureProviderRow() {
    const { data: existing } = await supabase.from('providers').select('id').eq('id', session.user.id).maybeSingle()
    if (existing) return true
    const { error: userErr } = await supabase.from('users').upsert(
      {
        id: session.user.id,
        email: session.user.email,
        display_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Provider',
        role: 'provider',
      },
      { onConflict: 'id' }
    )
    if (userErr) return false
    const { error: provErr } = await supabase.from('providers').insert({
      id: session.user.id,
      bio: null,
      location: null,
      tags: null,
    })
    if (provErr && provErr.code !== '23505') return false
    return true
  }

  async function uploadImage(file) {
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
    const { error } = await supabase.storage.from('service-images').upload(path, file, { upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from('service-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function uploadAllImages() {
    const urls = []
    for (let i = 0; i < svcPreviews.length; i++) {
      const file = svcImages[i]
      if (file) urls.push(await uploadImage(file))
      else if (svcPreviews[i]) urls.push(svcPreviews[i])
    }
    return urls.filter(Boolean)
  }

  async function handlePublish(e) {
    e.preventDefault()
    setError('')
    if (!session?.user?.id) return
    const validOptions = svcOptions.filter((o) => o.name.trim() && o.price !== '' && Number(o.price) >= 0)
    if (!title.trim()) {
      setError('Add a title.')
      return
    }
    if (validOptions.length === 0) {
      setError('Add at least one sub-service with name and price.')
      return
    }
    const ok = await ensureProviderRow()
    if (!ok) {
      setError('Could not set up provider account.')
      return
    }
    setUploading(true)
    let imageUrls = []
    try {
      imageUrls = await uploadAllImages()
    } catch (err) {
      setError('Image upload failed: ' + (err.message || 'Try again.'))
      setUploading(false)
      return
    }
    const desc = buildDescriptionPayload()

    if (isEdit) {
      const { error: updateErr } = await supabase
        .from('services')
        .update({
          name: title.trim(),
          description: desc,
          category,
          image_url: imageUrls[0] || null,
          image_urls: imageUrls,
        })
        .eq('id', serviceId)
        .eq('provider_id', session.user.id)
      if (updateErr) {
        setError(updateErr.message)
        setUploading(false)
        return
      }
      await supabase.from('service_options').delete().eq('service_id', serviceId)
      const optionRows = validOptions.map((o) => ({
        service_id: serviceId,
        name: o.name.trim(),
        price: parseFloat(o.price),
      }))
      const { error: optErr } = await supabase.from('service_options').insert(optionRows)
      if (optErr) {
        setError(optErr.message)
        setUploading(false)
        return
      }
    } else {
      const { data: newService, error: insertErr } = await supabase.from('services').insert({
        provider_id: session.user.id,
        name: title.trim(),
        description: desc,
        category,
        image_url: imageUrls[0] || null,
        image_urls: imageUrls,
      }).select('id').single()
      if (insertErr) {
        setError(insertErr.message || 'Could not create listing.')
        setUploading(false)
        return
      }
      const optionRows = validOptions.map((o) => ({
        service_id: newService.id,
        name: o.name.trim(),
        price: parseFloat(o.price),
      }))
      const { error: optErr } = await supabase.from('service_options').insert(optionRows)
      if (optErr) {
        await supabase.from('services').delete().eq('id', newService.id)
        setError(optErr.message)
        setUploading(false)
        return
      }
    }
    onUpdate?.()
    setUploading(false)
    navigate('/my-services')
  }

  function handleDrafts() {
    navigate('/my-services')
  }

  if (!isProvider) {
    return (
      <div style={{ textAlign: 'center', padding: '72px 24px' }}>
        <h2 style={{ color: 'var(--text-primary)' }}>Provider accounts only</h2>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Home</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="listing-create-page">
        <div className="loading-wrap"><div className="spinner" /></div>
      </div>
    )
  }

  const slots = Array.from({ length: MAX_IMAGES }, (_, i) => i)

  return (
    <div className="listing-create-page">
      <div className="listing-create-inner">
        <header className="listing-create-header">
          <div>
            <h1 className="listing-create-title">{isEdit ? 'Edit listing' : 'Create a new listing'}</h1>
            <p className="listing-create-subtitle">Sell your skills to other students!</p>
          </div>
          <button type="button" className="listing-create-close" onClick={() => navigate('/my-services')} aria-label="Close">
            ×
          </button>
        </header>

        <form className="listing-create-form" onSubmit={handlePublish}>
          <div className="listing-create-grid">
            <div className="listing-create-col listing-create-col-left">
              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

              <label className="listing-create-label">Title</label>
              <input
                className="listing-create-input"
                type="text"
                placeholder="Ex. Clean Haircut"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />

              <label className="listing-create-label">Category</label>
              <select
                className="listing-create-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Listing category"
              >
                {SERVICE_CATEGORY_KEYS.map((k) => (
                  <option key={k} value={k}>{SERVICE_CATEGORY_LABELS[k]}</option>
                ))}
              </select>

              <label className="listing-create-label">Description</label>
              <textarea
                className="listing-create-input listing-create-textarea"
                placeholder="Eg. The best barber on the 40 acres! I will get you right and it will be tough."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
              />

              <div className="listing-create-location-row">
                <label className="listing-create-label listing-create-label-inline">Location</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={locationOn}
                  className={`listing-create-toggle${locationOn ? ' on' : ''}`}
                  onClick={() => setLocationOn((v) => !v)}
                />
              </div>
              {locationOn && (
                <input
                  className="listing-create-input"
                  type="text"
                  placeholder="Ex. San Jac Room 4211"
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                />
              )}

              <label className="listing-create-label">Services</label>
              {svcOptions.map((opt, idx) => (
                <div key={idx} className="listing-create-option-row">
                  <input
                    className="listing-create-input"
                    placeholder="Sub-service name"
                    value={opt.name}
                    onChange={(e) => setSvcOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, name: e.target.value } : o)))}
                  />
                  <input
                    className="listing-create-input listing-create-price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={opt.price}
                    onChange={(e) => setSvcOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, price: e.target.value } : o)))}
                  />
                  {svcOptions.length > 1 ? (
                    <button type="button" className="listing-create-remove-opt" onClick={() => setSvcOptions((prev) => prev.filter((_, i) => i !== idx))}>×</button>
                  ) : <span className="listing-create-remove-spacer" />}
                </div>
              ))}
              <button
                type="button"
                className="listing-create-add-subs"
                onClick={() => setSvcOptions((prev) => [...prev, { name: '', price: '' }])}
              >
                + Add a sub-service
              </button>
            </div>

            <div className="listing-create-col listing-create-col-right">
              <label className="listing-create-label">Add photos</label>
              <p className="listing-create-photo-hint">Add up to {MAX_IMAGES} photos/videos of your service</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="listing-create-file-input"
                onChange={handleImagePick}
              />
              <div className="listing-create-photo-grid">
                {slots.map((i) => {
                  const src = svcPreviews[i]
                  const isFirstEmpty = !src && svcPreviews.length === i
                  return (
                    <div key={i} className={`listing-create-photo-cell${src ? ' has-image' : ''}`}>
                      {src ? (
                        <>
                          <img src={src} alt="" className="listing-create-photo-img" />
                          <button type="button" className="listing-create-photo-remove" onClick={() => removeImageAt(i)} aria-label="Remove photo">×</button>
                        </>
                      ) : isFirstEmpty ? (
                        <button type="button" className="listing-create-photo-placeholder" onClick={() => fileInputRef.current?.click()}>
                          <span className="listing-create-plus">+</span>
                          {i === 0 && <span className="listing-create-cover-label">Add Cover</span>}
                        </button>
                      ) : (
                        <div className="listing-create-photo-placeholder listing-create-photo-placeholder-dim" aria-hidden>
                          <span className="listing-create-plus">+</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="listing-create-actions">
                <button type="button" className="listing-create-btn-draft" onClick={handleDrafts}>
                  Save to Drafts
                </button>
                <button type="submit" className="listing-create-btn-publish" disabled={uploading}>
                  {uploading ? 'Publishing…' : 'List!'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

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
                onChange={(e) => setCropZoom(Number(e.target.value))}
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
