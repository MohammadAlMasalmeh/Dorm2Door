import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../supabaseClient'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [30.2672, -97.7431] // Austin, TX
const DEFAULT_ZOOM = 12

function Stars({ value }) {
  const n = Math.round(value || 0)
  return <span className="stars">{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

function initialsFromName(name) {
  const parts = (name || 'Provider').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'P'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function CenterController({ center }) {
  const map = useMap()
  useEffect(() => {
    if (center && center[0] && center[1]) map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

function MapClickHandler({ onMapClick }) {
  const map = useMap()
  useEffect(() => {
    if (!onMapClick) return
    map.on('click', onMapClick)
    return () => map.off('click', onMapClick)
  }, [map, onMapClick])
  return null
}

function Discover() {
  const [center, setCenter] = useState(DEFAULT_CENTER)
  const [userLocation, setUserLocation] = useState(null)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [minRating, setMinRating] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [maxDistanceKm, setMaxDistanceKm] = useState('50')
  const [selectedId, setSelectedId] = useState(null)
  const [locationError, setLocationError] = useState(false)

  const fetchNearby = useCallback(async () => {
    setLoading(true)
    const [lat, lng] = center
    const { data, error } = await supabase.rpc('get_services_nearby', {
      center_lat: lat,
      center_lng: lng,
      max_distance_km: maxDistanceKm === '' ? 50 : parseFloat(maxDistanceKm),
      min_rating: minRating === '' ? 0 : parseFloat(minRating),
      filter_min_price: minPrice === '' ? null : parseFloat(minPrice),
      filter_max_price: maxPrice === '' ? null : parseFloat(maxPrice),
    })
    if (error) {
      console.error(error)
      setResults([])
    } else {
      setResults(data || [])
    }
    setLoading(false)
  }, [center, minRating, minPrice, maxPrice, maxDistanceKm])

  useEffect(() => {
    fetchNearby()
  }, [fetchNearby])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    let cancelled = false
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!cancelled) setUserLocation([pos.coords.latitude, pos.coords.longitude])
        },
        () => {
          if (!cancelled) setLocationError(true)
        },
        { timeout: 10000, maximumAge: 300000, enableHighAccuracy: false }
      )
    } catch (e) {
      if (!cancelled) setLocationError(true)
    }
    return () => { cancelled = true }
  }, [])

  const goToMyLocation = () => {
    if (userLocation) {
      setCenter(userLocation)
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationError(true)
      return
    }
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = [pos.coords.latitude, pos.coords.longitude]
          setUserLocation(loc)
          setCenter(loc)
          setLocationError(false)
        },
        () => setLocationError(true),
        { timeout: 10000, maximumAge: 300000, enableHighAccuracy: false }
      )
    } catch (e) {
      setLocationError(true)
    }
  }

  const userIcon = L.divIcon({
    className: 'discover-marker discover-marker-user',
    html: '<span class="discover-marker-dot"></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })

  const providerIcon = L.divIcon({
    className: 'discover-marker discover-marker-provider',
    html: '<span class="discover-marker-provider-dot" aria-hidden="true"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })

  return (
    <div className="discover-page">
      <header className="discover-toolbar">
        <div className="discover-toolbar-intro">
          <h1 className="discover-toolbar-title">Discover</h1>
          <p className="discover-toolbar-line">
            Map and list update from the point you tap — filters on the left.
          </p>
        </div>
      </header>

      <div className="discover-layout">
        <aside className="discover-filters" aria-label="Filters">
          <h2 className="discover-filters-title">Filters</h2>
          <div className="discover-filter-group">
            <label htmlFor="discover-min-rating">Min. rating</label>
            <select id="discover-min-rating" value={minRating} onChange={(e) => setMinRating(e.target.value)} className="discover-input">
              <option value="">Any</option>
              <option value="1">1+ stars</option>
              <option value="2">2+ stars</option>
              <option value="3">3+ stars</option>
              <option value="4">4+ stars</option>
              <option value="4.5">4.5+ stars</option>
            </select>
          </div>
          <div className="discover-filter-group">
            <span className="discover-filter-label" id="discover-price-label">Price ($)</span>
            <div className="discover-price-row" aria-labelledby="discover-price-label">
              <input type="number" min="0" step="0.01" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="discover-input" aria-label="Minimum price" />
              <span className="discover-price-sep">–</span>
              <input type="number" min="0" step="0.01" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="discover-input" aria-label="Maximum price" />
            </div>
          </div>
          <div className="discover-filter-group">
            <label htmlFor="discover-max-km">Max distance</label>
            <div className="discover-distance-row">
              <input id="discover-max-km" type="number" min="1" max="200" step="1" value={maxDistanceKm} onChange={(e) => setMaxDistanceKm(e.target.value)} className="discover-input" />
              <span className="discover-distance-unit">km</span>
            </div>
          </div>
          <button type="button" className="discover-btn discover-btn-primary" onClick={goToMyLocation}>
            My location
          </button>
          {locationError && (
            <p className="discover-location-hint">Location unavailable — tap the map to choose an area.</p>
          )}
        </aside>

        <div className="discover-map-panel">
          <div className="discover-map-wrap">
            <MapContainer
              center={center}
              zoom={DEFAULT_ZOOM}
              className="discover-map"
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
              <CenterController center={center} />
              <MapClickHandler onMapClick={(e) => setCenter([e.latlng.lat, e.latlng.lng])} />
              {userLocation && (
                <Marker position={userLocation} icon={userIcon}>
                  <Popup>You are here</Popup>
                </Marker>
              )}
              {results.map((r) => {
                const position = [Number(r.latitude), Number(r.longitude)]
                return (
                  <Marker
                    key={r.provider_id}
                    position={position}
                    icon={providerIcon}
                    eventHandlers={{ click: () => setSelectedId(r.provider_id) }}
                  >
                    <Popup>
                      <div className="discover-popup">
                        <strong>{r.display_name || 'Provider'}</strong>
                        <div className="discover-popup-meta"><Stars value={r.avg_rating} /> · {r.distance_km} km</div>
                        {r.min_price != null && <div className="discover-popup-price">From ${Number(r.min_price).toFixed(2)}</div>}
                        <Link to={`/provider/${r.provider_id}`} className="discover-popup-link">View listing</Link>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MapContainer>
          </div>
          <p className="discover-map-hint">Click the map to set the search center.</p>
        </div>

        <section className="discover-list-panel" aria-label="Nearby listings">
          <div className="discover-list-head">
            <h2 className="discover-list-title">
              Nearby
              <span className="discover-list-count">{results.length}</span>
            </h2>
          </div>
          {loading && (
            <div className="discover-loading">
              <span className="discover-loading-dot" />
              Loading listings…
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="discover-empty">No providers in this area. Try a larger distance or move the map.</p>
          )}
          <div className="discover-list">
            {!loading && results.map((r) => {
              const names = (r.service_names || []).filter(Boolean).slice(0, 2).join(' · ')
              return (
                <Link
                  key={r.provider_id}
                  to={`/provider/${r.provider_id}`}
                  className={`discover-card ${selectedId === r.provider_id ? 'selected' : ''}`}
                >
                  <span className="discover-card-avatar">
                    {r.avatar_url ? (
                      <img src={r.avatar_url} alt="" className="discover-card-avatar-img" />
                    ) : (
                      <span className="discover-card-initials">{initialsFromName(r.display_name)}</span>
                    )}
                  </span>
                  <div className="discover-card-body">
                    <span className="discover-card-name">{r.display_name || 'Provider'}</span>
                    <span className="discover-card-meta">
                      <Stars value={r.avg_rating} />
                      <span className="discover-card-dot">·</span>
                      {r.distance_km} km
                      {r.location_text ? (
                        <>
                          <span className="discover-card-dot">·</span>
                          <span className="discover-card-loc">{r.location_text}</span>
                        </>
                      ) : null}
                    </span>
                    {names ? <p className="discover-card-services">{names}</p> : null}
                  </div>
                  <div className="discover-card-aside">
                    {r.min_price != null && (
                      <span className="discover-card-price">From ${Number(r.min_price).toFixed(0)}</span>
                    )}
                    <span className="discover-card-chevron" aria-hidden>→</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

export default Discover
