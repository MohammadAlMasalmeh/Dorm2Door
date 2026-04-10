import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import ServiceListingCard from '../components/ServiceListingCard'
import { galleryUrlsForService, priceLabelForService } from '../serviceListingUtils'

function normalizeForSearch(text) {
  return (text || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
}

const SECTION_TABS = [
  { id: 'popular', label: 'Popular with friends' },
  { id: 'suggested', label: 'Suggested For you' },
  { id: 'recent', label: 'Recently Viewed' },
]

function getSectionTitle(section) {
  if (section === 'suggested') return 'Suggested For you'
  if (section === 'recent') return 'Recently Viewed'
  return 'Popular with friends'
}

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

function priceFieldsForService(service) {
  const prices = []
  if (service?.price != null) prices.push(Number(service.price))
  ;(service?.service_options || []).forEach((opt) => {
    if (opt?.price != null) prices.push(Number(opt.price))
  })
  if (prices.length === 0) return { minPriceNum: null, maxPriceNum: null }
  return { minPriceNum: Math.min(...prices), maxPriceNum: Math.max(...prices) }
}

/** Default listing order: best average rating first, then most-reviewed as tiebreaker. */
const SORT_RATING_DESC = 'rating_desc'

function sortListings(rows, sortKey, userLatLng) {
  const sorted = [...rows]
  const inf = Number.POSITIVE_INFINITY
  const ninf = Number.NEGATIVE_INFINITY
  switch (sortKey) {
    case 'price_asc':
      sorted.sort((a, b) => (a.minPriceNum ?? inf) - (b.minPriceNum ?? inf))
      break
    case 'price_desc':
      sorted.sort((a, b) => (b.minPriceNum ?? ninf) - (a.minPriceNum ?? ninf))
      break
    case 'reviews_desc':
      sorted.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0) || b.rating - a.rating)
      break
    case 'distance_asc': {
      const ratingFallback = () =>
        sorted.sort((a, b) => b.rating - a.rating || (b.reviewCount || 0) - (a.reviewCount || 0))
      if (!userLatLng || userLatLng.length < 2) {
        ratingFallback()
        break
      }
      const [ulat, ulng] = userLatLng
      const dist = (r) => {
        if (r.latitude == null || r.longitude == null) return inf
        return haversineKm(ulat, ulng, r.latitude, r.longitude)
      }
      sorted.sort((a, b) => dist(a) - dist(b) || b.rating - a.rating)
      break
    }
    case SORT_RATING_DESC:
    default:
      sorted.sort((a, b) => b.rating - a.rating || (b.reviewCount || 0) - (a.reviewCount || 0))
      break
  }
  return sorted
}

function ResultsFilterMenu({ label, isOpen, onToggle, isActive, children }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={`figma-results-filter-btn${isActive ? ' active' : ''}`}
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        {label} ▾
      </button>
      {isOpen ? (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 10,
            minWidth: 220,
            padding: 10,
            borderRadius: 12,
            border: '2px solid var(--figma-dark)',
            background: 'var(--figma-white)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

function FilterOption({ onSelect, children }) {
  return (
    <button
      type="button"
      role="menuitem"
      className="figma-results-topic-btn"
      style={{ width: '100%', textAlign: 'left' }}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}

/**
 * One listing per service (same mental model as Home service cards).
 * A provider with multiple services appears as multiple cards.
 */
function mapProviderToServiceCards(provider) {
  const providerName = provider?.users?.display_name || 'Provider'
  const avgRating = Number(provider?.avg_rating || 0)
  const reviewCount = Number(provider?.review_count || 0)
  const services = (provider?.services || []).filter(Boolean)
  const tags = provider?.tags || []
  const bio = provider?.bio || ''
  const providerAvatarUrl = provider?.users?.avatar_url || null
  const latitude = provider?.latitude != null ? Number(provider.latitude) : null
  const longitude = provider?.longitude != null ? Number(provider.longitude) : null

  return services.map((service, idx) => {
    const serviceName = service?.name || 'Service'
    const optionNames = (service.service_options || []).map((o) => o?.name).filter(Boolean).join(' ')
    const serviceDesc = (service?.description || '').trim()
    const { minPriceNum, maxPriceNum } = priceFieldsForService(service)

    return {
      key: `${provider.id}:${service.id ?? `i${idx}`}`,
      providerId: provider.id,
      serviceId: service.id,
      portfolioUrls: galleryUrlsForService(service),
      serviceName,
      rating: avgRating,
      priceLabel: priceLabelForService(service),
      minPriceNum,
      maxPriceNum,
      providerName,
      providerAvatarUrl,
      reviewCount,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      tags,
      matchHaystack: `${serviceName} ${optionNames} ${serviceDesc} ${providerName} ${tags.join(' ')} ${bio}`,
    }
  })
}

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [listings, setListings] = useState([])
  const [activeTopic, setActiveTopic] = useState('')
  const [openFilter, setOpenFilter] = useState(null)
  const [sortKey, setSortKey] = useState(SORT_RATING_DESC)
  const [userLatLng, setUserLatLng] = useState(null)
  const [nearMePending, setNearMePending] = useState(false)
  const [nearMeError, setNearMeError] = useState('')
  const filtersRef = useRef(null)
  const sortKeyRef = useRef(sortKey)
  sortKeyRef.current = sortKey

  const rawSection = searchParams.get('section') || location.state?.section || 'popular'
  const section = SECTION_TABS.some((t) => t.id === rawSection) ? rawSection : 'popular'
  const query = (searchParams.get('q') || location.state?.q || '').trim()
  const activeTags = Array.isArray(location.state?.activeTags) ? location.state.activeTags : []

  const goToSection = useCallback(
    (nextId) => {
      const params = new URLSearchParams(searchParams)
      params.set('section', nextId)
      if (!query) params.delete('q')
      else params.set('q', query)
      navigate(`/search?${params.toString()}`, { replace: true, state: location.state })
    },
    [navigate, searchParams, query, location.state],
  )

  useEffect(() => {
    let mounted = true
    async function fetchData() {
      setLoading(true)
      const fieldsWithCount =
        'id, bio, tags, avg_rating, review_count, latitude, longitude, users (display_name, avatar_url), services (id, name, description, image_url, image_urls, price, service_options (name, price))'
      const fieldsLegacy =
        'id, bio, tags, avg_rating, latitude, longitude, users (display_name, avatar_url), services (id, name, description, image_url, image_urls, price, service_options (name, price))'

      async function runQuery(fields) {
        return supabase
          .from('providers')
          .select(fields)
          .order('avg_rating', { ascending: false })
      }

      const fieldsLegacyNoMulti =
        'id, bio, tags, avg_rating, latitude, longitude, users (display_name, avatar_url), services (id, name, description, image_url, price, service_options (name, price))'
      const fieldsWithCountNoMulti =
        'id, bio, tags, avg_rating, review_count, latitude, longitude, users (display_name, avatar_url), services (id, name, description, image_url, price, service_options (name, price))'

      let data
      const attempts = [fieldsWithCount, fieldsLegacy, fieldsWithCountNoMulti, fieldsLegacyNoMulti]
      for (const fields of attempts) {
        const { data: rows, error } = await runQuery(fields)
        if (!error) {
          data = rows
          break
        }
        data = rows
      }

      if (!mounted) return
      let providers = (data || []).filter(p => p?.id && Array.isArray(p.services) && p.services.length > 0)

      // If coords are missing from the join, fetch them directly and merge in.
      const ids = providers.map((p) => p.id).filter(Boolean)
      if (ids.length > 0) {
        const { data: coordRows, error: coordErr } = await supabase
          .from('providers')
          .select('id, latitude, longitude')
          .in('id', ids)
        if (!coordErr && coordRows?.length) {
          const coordById = new Map(coordRows.map((r) => [r.id, r]))
          providers = providers.map((p) => {
            const c = coordById.get(p.id)
            if (!c) return p
            return {
              ...p,
              latitude: c.latitude != null ? c.latitude : p.latitude,
              longitude: c.longitude != null ? c.longitude : p.longitude,
            }
          })
        }
      }

      const cards = providers.flatMap(mapProviderToServiceCards)
      setListings(cards)
      setLoading(false)
    }
    fetchData()
    return () => { mounted = false }
  }, [])

  const topicButtons = useMemo(() => {
    const set = new Set()
    if (query) set.add(query.toLowerCase())
    activeTags.forEach(tag => {
      const normalized = (tag || '').trim().toLowerCase()
      if (normalized) set.add(normalized)
    })
    listings.forEach((row) => {
      (row.tags || []).forEach((tag) => {
        const normalized = (tag || '').trim().toLowerCase()
        if (normalized) set.add(normalized)
      })
    })
    return [...set].slice(0, 12)
  }, [query, activeTags, listings])

  useEffect(() => {
    setActiveTopic(query ? query.toLowerCase() : '')
  }, [query])

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!openFilter) return
      const el = filtersRef.current
      if (el && !el.contains(e.target)) setOpenFilter(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [openFilter])

  const filteredListings = useMemo(() => {
    const normalizedQuery = normalizeForSearch(query)
    const normalizedTopic = normalizeForSearch(activeTopic)

    let base = listings
    if (section === 'suggested' && (normalizedQuery || activeTags.length)) {
      base = listings.filter((row) => {
        const normalizedHaystack = normalizeForSearch(row.matchHaystack)
        if (normalizedQuery && normalizedHaystack.includes(normalizedQuery)) return true
        return activeTags.some(tag => normalizedHaystack.includes(normalizeForSearch(tag)))
      })
    } else if (section === 'recent') {
      base = [...listings].reverse()
    }

    if (!normalizedTopic) return base
    return base.filter((row) => normalizeForSearch(row.matchHaystack).includes(normalizedTopic))
  }, [listings, section, query, activeTags, activeTopic])

  const displayedListings = useMemo(() => {
    return sortListings(filteredListings, sortKey, userLatLng)
  }, [filteredListings, sortKey, userLatLng])

  const withMapPinCount = useMemo(
    () => displayedListings.filter((r) => r.latitude != null && r.longitude != null).length,
    [displayedListings]
  )

  const requestNearMeSort = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNearMeError('Location is not available in this browser.')
      setOpenFilter(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNearMePending(false)
        setUserLatLng([pos.coords.latitude, pos.coords.longitude])
        setSortKey('distance_asc')
        setNearMeError('')
      },
      () => {
        setNearMePending(false)
        setNearMeError('Could not get your location. Allow location access to sort by distance.')
      },
      { timeout: 12000, maximumAge: 600000, enableHighAccuracy: false }
    )
    setNearMeError('')
    setNearMePending(true)
    setOpenFilter(null)
  }, [])

  return (
    <div className="figma-search-page">
      <section className="figma-search-wrap-shell">
        <div className="figma-search-top-bar">
          <div className="figma-results-header">
            <p className="figma-results-title">
              Results for &quot;{getSectionTitle(section)}&quot; <span>({displayedListings.length})</span>
            </p>
            <Link to="/" className="figma-results-close-link">Back</Link>
          </div>
          <nav className="figma-results-section-tabs" aria-label="Home sections">
            {SECTION_TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`figma-results-section-tab${section === id ? ' active' : ''}`}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => goToSection(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="figma-results-filters" ref={filtersRef}>
          <ResultsFilterMenu
            label="Price"
            isOpen={openFilter === 'price'}
            onToggle={() => setOpenFilter((o) => (o === 'price' ? null : 'price'))}
            isActive={sortKey === 'price_asc' || sortKey === 'price_desc'}
          >
            <FilterOption onSelect={() => { setSortKey('price_asc'); setOpenFilter(null) }}>Low to high</FilterOption>
            <FilterOption onSelect={() => { setSortKey('price_desc'); setOpenFilter(null) }}>High to low</FilterOption>
            <FilterOption onSelect={() => { setSortKey(SORT_RATING_DESC); setOpenFilter(null) }}>Show all (best rated)</FilterOption>
          </ResultsFilterMenu>

          <ResultsFilterMenu
            label="Near me"
            isOpen={openFilter === 'near'}
            onToggle={() => setOpenFilter((o) => (o === 'near' ? null : 'near'))}
            isActive={sortKey === 'distance_asc'}
          >
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8, lineHeight: 1.3 }}>
              Uses this device’s location (you’ll be prompted). Choose “Show all (best rated)” under Price to go back.
            </div>
            <FilterOption onSelect={requestNearMeSort}>Nearest first</FilterOption>
          </ResultsFilterMenu>

          <ResultsFilterMenu
            label="Reviews"
            isOpen={openFilter === 'reviews'}
            onToggle={() => setOpenFilter((o) => (o === 'reviews' ? null : 'reviews'))}
            isActive={sortKey === 'reviews_desc' || sortKey === SORT_RATING_DESC}
          >
            <FilterOption onSelect={() => { setSortKey(SORT_RATING_DESC); setOpenFilter(null) }}>Top rated</FilterOption>
            <FilterOption onSelect={() => { setSortKey('reviews_desc'); setOpenFilter(null) }}>Most reviewed</FilterOption>
            <FilterOption onSelect={() => { setSortKey(SORT_RATING_DESC); setOpenFilter(null) }}>Show all (best rated)</FilterOption>
          </ResultsFilterMenu>
        </div>
        {nearMePending && <p className="figma-empty">Getting your location…</p>}
        {nearMeError && <p className="figma-empty">{nearMeError}</p>}
        {sortKey === 'distance_asc' && userLatLng && !nearMePending ? (
          <p className="figma-empty">
            {withMapPinCount === 0
              ? 'No providers have a map location on file yet, so distance can’t change the order. They’re still listed by rating.'
              : `Sorted by distance from you. ${withMapPinCount === displayedListings.length ? 'All' : `${withMapPinCount} of ${displayedListings.length}`} listings have a map pin; the rest are listed after them.`}
          </p>
        ) : null}
        {topicButtons.length > 0 && (
          <div className="figma-results-topics">
            {topicButtons.map((topic) => (
              <button
                key={topic}
                type="button"
                className={`figma-results-topic-btn${topic === activeTopic ? ' active' : ''}`}
                onClick={() => setActiveTopic(topic)}
              >
                {topic.replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
          </div>
        )}
        {loading ? (
          <div className="figma-loading"><div className="spinner" /></div>
        ) : displayedListings.length === 0 ? (
          <p className="figma-empty">No matching services in this section yet.</p>
        ) : (
          <div className="figma-results-grid">
            {displayedListings.map((row) => (
              <ServiceListingCard
                key={row.key}
                resetKey={row.key}
                portfolioUrls={row.portfolioUrls}
                serviceName={row.serviceName}
                priceLabel={row.priceLabel}
                rating={row.rating}
                providerName={row.providerName}
                providerAvatarUrl={row.providerAvatarUrl}
                linkTo={
                  row.serviceId != null && row.serviceId !== ''
                    ? `/provider/${row.providerId}?service=${encodeURIComponent(String(row.serviceId))}`
                    : `/provider/${row.providerId}`
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
