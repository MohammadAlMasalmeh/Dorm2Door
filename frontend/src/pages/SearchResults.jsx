import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { galleryUrlsForService } from '../utils/serviceImages'

function normalizeForSearch(text) {
  return (text || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
}

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

function priceFieldsForService(s) {
  const prices = []
  if (s?.price != null) prices.push(Number(s.price))
  ;(s?.service_options || []).forEach((opt) => {
    if (opt?.price != null) prices.push(Number(opt.price))
  })
  if (prices.length === 0) return { minPriceNum: null, maxPriceNum: null, priceLabel: null }
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const label = max > min ? `$${Math.round(min)}-$${Math.round(max)}` : `$${Math.round(min)}`
  return { minPriceNum: min, maxPriceNum: max, priceLabel: label }
}

/** One search row per service (matches Home); same provider with multiple listings appears as separate cards. */
function mapProviderToServiceRows(provider) {
  const services = (provider?.services || []).filter(Boolean)
  if (services.length === 0) return []

  const providerName = provider?.users?.display_name || 'Provider'
  const avgRating = Number(provider?.avg_rating || 0)
  const tags = provider?.tags || []
  const location = (provider?.location || '').trim()
  const latRaw = provider?.latitude
  const lngRaw = provider?.longitude
  const latitude = latRaw != null && latRaw !== '' ? Number(latRaw) : null
  const longitude = lngRaw != null && lngRaw !== '' ? Number(lngRaw) : null
  const reviewCount = Number(provider?.review_count) || 0
  const providerBio = (provider?.bio || '').trim()

  return services.map((s) => {
    const { minPriceNum, maxPriceNum, priceLabel } = priceFieldsForService(s)
    const optionNames = (s.service_options || []).map((o) => o?.name).filter(Boolean)
    const desc = (s?.description || '').trim()
    const snippet = desc || providerBio || ''
    const name = s?.name || 'Service'
    const matchHaystack = `${name} ${optionNames.join(' ')} ${desc} ${providerName} ${tags.join(' ')} ${providerBio}`

    return {
      key: `${provider.id}:${s.id}`,
      providerId: provider.id,
      serviceId: s.id,
      portfolioUrls: galleryUrlsForService(s),
      serviceName: name,
      rating: avgRating,
      priceLabel: priceLabel || '$10',
      snippet,
      providerName,
      tags,
      location,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      reviewCount,
      minPriceNum,
      maxPriceNum,
      matchHaystack,
    }
  })
}

function SearchResultCard({ row }) {
  const urls = row.portfolioUrls || []
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    setActiveIdx(0)
  }, [row.key])

  const safeIdx = urls.length ? Math.min(Math.max(0, activeIdx), urls.length - 1) : 0
  const mainUrl = urls[safeIdx] || ''
  const thumbEntries = urls
    .map((url, i) => ({ url, i }))
    .filter(({ i }) => i !== safeIdx)
    .slice(0, 5)

  const hasMedia = urls.length > 0
  const onPickThumb = useCallback((i) => {
    setActiveIdx(i)
  }, [])

  return (
    <div className={`figma-results-card${!hasMedia ? ' figma-results-card--no-media' : ''}`}>
      {hasMedia && (
        <>
          <div
            className="figma-results-main-img"
            style={{ backgroundImage: `url(${mainUrl})` }}
            role="img"
            aria-label="Listing preview"
          />
          {thumbEntries.length > 0 ? (
            <div className="figma-results-sub-imgs" role="group" aria-label="More photos">
              {thumbEntries.map(({ url, i }) => (
                <button
                  key={`${url}-${i}`}
                  type="button"
                  className="figma-results-sub-img figma-results-sub-img--filled figma-results-sub-img-btn"
                  style={{ backgroundImage: `url(${url})` }}
                  onClick={() => onPickThumb(i)}
                  aria-label={`Show image ${i + 1} of ${urls.length}`}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
      <Link
        to={`/provider/${row.providerId}?service=${encodeURIComponent(row.serviceId)}`}
        className="figma-results-card-body figma-results-card-body--link"
      >
        <h3>{row.serviceName}</h3>
        <p className="figma-results-price-line">
          From {row.priceLabel} <span>★</span> {row.rating.toFixed(2)}
        </p>
        {row.snippet ? (
          <p className="figma-results-snippet">{row.snippet}</p>
        ) : null}
      </Link>
    </div>
  )
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
    case 'distance_asc': {
      const ratingFallback = () =>
        sorted.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
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
    case 'reviews_desc':
      sorted.sort((a, b) => b.reviewCount - a.reviewCount || b.rating - a.rating)
      break
    case SORT_RATING_DESC:
    default:
      sorted.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
      break
  }
  return sorted
}

function ResultsFilterMenu({ label, menuId, isOpen, onToggle, isActive, children }) {
  return (
    <div className="figma-results-filter-wrap">
      <button
        type="button"
        id={`${menuId}-btn`}
        className={`figma-results-filter-btn${isActive ? ' figma-results-filter-btn--active' : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? `${menuId}-menu` : undefined}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        {label} ▾
      </button>
      {isOpen ? (
        <div
          id={`${menuId}-menu`}
          className="figma-results-filter-panel"
          role="menu"
          aria-labelledby={`${menuId}-btn`}
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
      className="figma-results-filter-option"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [listings, setListings] = useState([])
  const [activeTopic, setActiveTopic] = useState('')
  const [openFilter, setOpenFilter] = useState(null)
  const [sortKey, setSortKey] = useState(SORT_RATING_DESC)
  const [userLatLng, setUserLatLng] = useState(null)
  const [nearMeError, setNearMeError] = useState(null)
  const [nearMePending, setNearMePending] = useState(false)
  const [sortHint, setSortHint] = useState(null)
  const filtersRef = useRef(null)
  const sortHintTimerRef = useRef(null)
  const sortKeyRef = useRef(sortKey)
  sortKeyRef.current = sortKey

  const clearSortHintTimer = useCallback(() => {
    if (sortHintTimerRef.current) window.clearTimeout(sortHintTimerRef.current)
    sortHintTimerRef.current = null
  }, [])

  useEffect(() => () => clearSortHintTimer(), [clearSortHintTimer])

  const section = searchParams.get('section') || location.state?.section || 'popular'
  const query = (searchParams.get('q') || location.state?.q || '').trim()
  const activeTags = Array.isArray(location.state?.activeTags) ? location.state.activeTags : []

  useEffect(() => {
    let mounted = true
    async function fetchData() {
      setLoading(true)
      const fieldsWithCount =
        'id, bio, tags, avg_rating, review_count, location, latitude, longitude, users (display_name), services (id, name, description, image_url, image_urls, price, service_options (name, price))'
      const fieldsLegacy =
        'id, bio, tags, avg_rating, location, latitude, longitude, users (display_name), services (id, name, description, image_url, image_urls, price, service_options (name, price))'

      async function runQuery(fields) {
        return supabase
          .from('providers')
          .select(fields)
          .order('avg_rating', { ascending: false })
      }

      const fieldsLegacyNoMulti =
        'id, bio, tags, avg_rating, location, latitude, longitude, users (display_name), services (id, name, description, image_url, price, service_options (name, price))'
      const fieldsWithCountNoMulti =
        'id, bio, tags, avg_rating, review_count, location, latitude, longitude, users (display_name), services (id, name, description, image_url, price, service_options (name, price))'

      let data
      const baseAttempts = [fieldsWithCount, fieldsLegacy, fieldsWithCountNoMulti, fieldsLegacyNoMulti]
      const attempts = [
        ...baseAttempts,
        ...baseAttempts.map((f) => f.replace(', latitude, longitude', '')),
      ]
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
      const cards = providers.flatMap(mapProviderToServiceRows)
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

  const displayedListings = useMemo(
    () => sortListings(filteredListings, sortKey, userLatLng),
    [filteredListings, sortKey, userLatLng]
  )

  const withMapPinCount = useMemo(
    () => displayedListings.filter((r) => r.latitude != null && r.longitude != null).length,
    [displayedListings]
  )

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!openFilter) return
      const el = filtersRef.current
      if (el && !el.contains(e.target)) setOpenFilter(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [openFilter])

  const closeMenus = () => setOpenFilter(null)

  const requestNearMeSort = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNearMeError('Location is not available in this browser.')
      closeMenus()
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNearMePending(false)
        setUserLatLng([pos.coords.latitude, pos.coords.longitude])
        setSortKey('distance_asc')
        setNearMeError(null)
      },
      () => {
        setNearMePending(false)
        setNearMeError('Could not get your location. Allow location access to sort by distance.')
      },
      { timeout: 12000, maximumAge: 600000, enableHighAccuracy: false }
    )
    setNearMeError(null)
    setSortHint(null)
    clearSortHintTimer()
    setNearMePending(true)
    closeMenus()
  }, [clearSortHintTimer])

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
        </div>
        <div className="figma-results-filters" ref={filtersRef}>
          <ResultsFilterMenu
            label="Price"
            menuId="figma-filter-price"
            isOpen={openFilter === 'price'}
            onToggle={() => setOpenFilter((o) => (o === 'price' ? null : 'price'))}
            isActive={sortKey === 'price_asc' || sortKey === 'price_desc'}
          >
            <FilterOption onSelect={() => { setSortKey('price_asc'); closeMenus() }}>Low to high</FilterOption>
            <FilterOption onSelect={() => { setSortKey('price_desc'); closeMenus() }}>High to low</FilterOption>
            <FilterOption onSelect={() => { setSortKey(SORT_RATING_DESC); closeMenus() }}>Best rated first</FilterOption>
          </ResultsFilterMenu>
          <ResultsFilterMenu
            label="Near me"
            menuId="figma-filter-near"
            isOpen={openFilter === 'near'}
            onToggle={() => setOpenFilter((o) => (o === 'near' ? null : 'near'))}
            isActive={sortKey === 'distance_asc'}
          >
            <p className="figma-results-filter-panel-intro">
              Uses this device’s location (you’ll be prompted to allow it). To sort by rating again, choose Best rated first under Price.
            </p>
            <FilterOption onSelect={requestNearMeSort}>Nearest first</FilterOption>
          </ResultsFilterMenu>
          <ResultsFilterMenu
            label="Reviews"
            menuId="figma-filter-reviews"
            isOpen={openFilter === 'reviews'}
            onToggle={() => setOpenFilter((o) => (o === 'reviews' ? null : 'reviews'))}
            isActive={sortKey === 'reviews_desc'}
          >
            <FilterOption
              onSelect={() => {
                closeMenus()
                if (sortKeyRef.current === SORT_RATING_DESC) {
                  clearSortHintTimer()
                  setSortHint('You’re already sorted by highest rating first (that’s the default).')
                  sortHintTimerRef.current = window.setTimeout(() => setSortHint(null), 3200)
                  return
                }
                clearSortHintTimer()
                setSortHint(null)
                setSortKey(SORT_RATING_DESC)
              }}
            >
              Highest rated
            </FilterOption>
            <FilterOption
              onSelect={() => {
                closeMenus()
                clearSortHintTimer()
                setSortHint(null)
                setSortKey('reviews_desc')
              }}
            >
              Most reviewed
            </FilterOption>
          </ResultsFilterMenu>
        </div>
        {nearMePending ? (
          <p className="figma-results-filter-hint" role="status">
            Getting your location…
          </p>
        ) : null}
        {nearMeError ? (
          <p className="figma-results-filter-hint figma-results-filter-hint--error" role="status">
            {nearMeError}
          </p>
        ) : null}
        {!nearMePending && !nearMeError && sortHint ? (
          <p className="figma-results-filter-hint" role="status">
            {sortHint}
          </p>
        ) : null}
        {sortKey === 'distance_asc' && userLatLng && !nearMePending ? (
          <p className="figma-results-filter-hint" role="status">
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
              <SearchResultCard key={row.key} row={row} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
