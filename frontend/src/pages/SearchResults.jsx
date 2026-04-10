import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function normalizeForSearch(text) {
  return (text || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
}

function getSectionTitle(section) {
  if (section === 'suggested') return 'Suggested For you'
  if (section === 'recent') return 'Recently Viewed'
  return 'Popular with friends'
}

/** Same source of truth as ProviderProfile / ProviderSetup */
function galleryUrlsForService(service) {
  let raw = service?.image_urls
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = []
    }
  }
  const arr = Array.isArray(raw) ? raw.map(u => (typeof u === 'string' ? u : u?.url)).filter(Boolean) : []
  if (arr.length > 0) return arr
  return service?.image_url ? [service.image_url] : []
}

/** All unique image URLs across every service (order preserved). */
function aggregatePortfolioUrls(services) {
  const seen = new Set()
  const ordered = []
  for (const s of services) {
    for (const url of galleryUrlsForService(s)) {
      if (!url || seen.has(url)) continue
      seen.add(url)
      ordered.push(url)
    }
  }
  return ordered
}

/**
 * One listing per provider (same mental model as Home cards).
 * Extra `services` rows are folded into one card (not separate listings).
 */
function mapProviderToCard(provider) {
  const providerName = provider?.users?.display_name || 'Provider'
  const avgRating = Number(provider?.avg_rating || 0)
  const services = (provider?.services || []).filter(Boolean)
  if (services.length === 0) return null

  const prices = []
  services.forEach((s) => {
    if (s.price != null) prices.push(Number(s.price))
    ;(s.service_options || []).forEach((opt) => {
      if (opt?.price != null) prices.push(Number(opt.price))
    })
  })
  const minPrice = prices.length ? Math.min(...prices) : null
  const maxPrice = prices.length ? Math.max(...prices) : null
  const priceLabel = minPrice == null
    ? '$70-$100'
    : (maxPrice != null && maxPrice > minPrice ? `$${Math.round(minPrice)}-$${Math.round(maxPrice)}` : `$${Math.round(minPrice)}`)

  const primaryTitle = services[0]?.name || 'Service'
  const optionNames = services.flatMap(s => (s.service_options || []).map(o => o?.name).filter(Boolean))
  const extraServiceNames = services.slice(1).map(s => s?.name).filter(Boolean)

  const portfolioUrls = aggregatePortfolioUrls(services)

  const tags = provider?.tags || []
  const providerBio = (provider?.bio || '').trim()
  const serviceDescs = [...new Set(services.map(s => (s?.description || '').trim()).filter(Boolean))]
  const snippet = providerBio || (serviceDescs.length ? serviceDescs.join(' · ') : '')

  const allNames = services.map(s => s?.name).filter(Boolean).join(' ')
  const allOptions = optionNames.join(' ')
  const allDescriptions = serviceDescs.join(' ')
  const bio = provider?.bio || ''

  return {
    key: String(provider.id),
    providerId: provider.id,
    portfolioUrls,
    serviceName: primaryTitle,
    rating: avgRating,
    priceLabel,
    snippet,
    providerName,
    tags,
    matchHaystack: `${primaryTitle} ${allNames} ${allOptions} ${allDescriptions} ${providerName} ${tags.join(' ')} ${bio}`,
  }
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
        to={`/provider/${row.providerId}`}
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

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [listings, setListings] = useState([])
  const [activeTopic, setActiveTopic] = useState('')

  const section = searchParams.get('section') || location.state?.section || 'popular'
  const query = (searchParams.get('q') || location.state?.q || '').trim()
  const activeTags = Array.isArray(location.state?.activeTags) ? location.state.activeTags : []

  useEffect(() => {
    let mounted = true
    async function fetchData() {
      setLoading(true)
      const fieldsWithCount =
        'id, bio, tags, avg_rating, review_count, users (display_name), services (id, name, description, image_url, image_urls, price, service_options (name, price))'
      const fieldsLegacy =
        'id, bio, tags, avg_rating, users (display_name), services (id, name, description, image_url, image_urls, price, service_options (name, price))'

      async function runQuery(fields) {
        return supabase
          .from('providers')
          .select(fields)
          .order('avg_rating', { ascending: false })
      }

      const fieldsLegacyNoMulti =
        'id, bio, tags, avg_rating, users (display_name), services (id, name, description, image_url, price, service_options (name, price))'
      const fieldsWithCountNoMulti =
        'id, bio, tags, avg_rating, review_count, users (display_name), services (id, name, description, image_url, price, service_options (name, price))'

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
      const providers = (data || []).filter(p => p?.id && Array.isArray(p.services) && p.services.length > 0)
      const cards = providers.map(mapProviderToCard).filter(Boolean)
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

  return (
    <div className="figma-search-page">
      <section className="figma-search-wrap-shell">
        <div className="figma-search-top-bar">
          <div className="figma-results-header">
            <p className="figma-results-title">
              Results for &quot;{getSectionTitle(section)}&quot; <span>({filteredListings.length})</span>
            </p>
            <Link to="/" className="figma-results-close-link">Back</Link>
          </div>
        </div>
        <div className="figma-results-filters">
          {['Price', 'Time', 'Location', 'Reviews'].map((filter) => (
            <button key={filter} type="button" className="figma-results-filter-btn">{filter} ▾</button>
          ))}
        </div>
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
        ) : filteredListings.length === 0 ? (
          <p className="figma-empty">No matching services in this section yet.</p>
        ) : (
          <div className="figma-results-grid">
            {filteredListings.map((row) => (
              <SearchResultCard key={row.key} row={row} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
