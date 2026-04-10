import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function minServicePrice(service) {
  const prices = []
  if (service?.price != null) prices.push(Number(service.price))
  ;(service?.service_options || []).forEach((opt) => {
    if (opt?.price != null) prices.push(Number(opt.price))
  })
  if (prices.length === 0) return null
  return Math.min(...prices)
}

export default function AllServices() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [priceMax, setPriceMax] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [category, setCategory] = useState('all')

  useEffect(() => {
    let cancelled = false
    async function loadServices() {
      setLoading(true)
      const { data, error } = await supabase
        .from('services')
        .select(
          'id, name, price, image_url, category, provider_id, service_options (id, name, price), providers (id, location, tags, users (display_name, avatar_url))',
        )
        .order('id', { ascending: false })
      if (!cancelled) {
        if (error) setServices([])
        else setServices(data || [])
        setLoading(false)
      }
    }
    void loadServices()
    return () => {
      cancelled = true
    }
  }, [])

  const categories = useMemo(() => {
    const set = new Set()
    services.forEach((s) => {
      if (typeof s?.category === 'string' && s.category.trim()) set.add(s.category.trim())
      ;(s?.providers?.tags || []).forEach((tag) => {
        if (typeof tag === 'string' && tag.trim()) set.add(tag.trim())
      })
    })
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))]
  }, [services])

  const filtered = useMemo(() => {
    const q = locationQuery.trim().toLowerCase()
    const max = priceMax === '' ? null : Number(priceMax)
    return services.filter((s) => {
      const p = minServicePrice(s)
      if (max != null && Number.isFinite(max) && p != null && p > max) return false

      const loc = (s?.providers?.location || '').toLowerCase()
      if (q && !loc.includes(q)) return false

      if (category !== 'all') {
        const inCategoryColumn =
          typeof s?.category === 'string' && s.category.toLowerCase() === category.toLowerCase()
        const inProviderTags = (s?.providers?.tags || []).some(
          (tag) => typeof tag === 'string' && tag.toLowerCase() === category.toLowerCase(),
        )
        if (!inCategoryColumn && !inProviderTags) return false
      }
      return true
    })
  }, [services, locationQuery, priceMax, category])

  return (
    <div className="all-services-page">
      <header className="all-services-header">
        <h1>All Services</h1>
        <p>Browse every listing and filter by price, location, and category.</p>
      </header>

      <section className="all-services-filters" aria-label="Service filters">
        <label className="all-services-filter">
          <span>Max price ($)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="Any"
          />
        </label>

        <label className="all-services-filter">
          <span>Location</span>
          <input
            type="text"
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
            placeholder="Austin, West Campus..."
          />
        </label>

        <label className="all-services-filter">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All categories' : c}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loading ? (
        <p className="all-services-empty">Loading services...</p>
      ) : filtered.length === 0 ? (
        <p className="all-services-empty">No services match these filters.</p>
      ) : (
        <section className="all-services-grid">
          {filtered.map((service) => {
            const provider = service.providers
            const displayName = provider?.users?.display_name || 'Provider'
            const location = provider?.location || 'Location not set'
            const img = service?.image_url
            const minPrice = minServicePrice(service)
            return (
              <Link
                key={service.id}
                to={`/provider/${service.provider_id}?service=${encodeURIComponent(service.id)}`}
                className="all-services-card"
              >
                <div
                  className="all-services-card-image"
                  style={img ? { backgroundImage: `url(${img})` } : {}}
                  aria-hidden
                />
                <div className="all-services-card-body">
                  <h3>{service.name || 'Service'}</h3>
                  <p className="all-services-card-provider">{displayName}</p>
                  <p className="all-services-card-meta">{location}</p>
                  <p className="all-services-card-price">
                    {minPrice == null ? 'Price not set' : `From $${Number(minPrice).toFixed(0)}`}
                  </p>
                </div>
              </Link>
            )
          })}
        </section>
      )}
    </div>
  )
}
