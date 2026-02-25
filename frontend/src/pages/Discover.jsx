import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../supabaseClient'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [30.2672, -97.7431] // Austin, TX
const DEFAULT_ZOOM = 12

function Stars({ value }) {
  const n = Math.round(value || 0)
  return <span className="stars">{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
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
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
      () => {}
    )
  }, [])

  const goToMyLocation = () => {
    if (userLocation) {
      setCenter(userLocation)
      return
    }
    if (!navigator.geolocation) return alert('Geolocation not supported')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = [pos.coords.latitude, pos.coords.longitude]
        setUserLocation(loc)
        setCenter(loc)
      },
      () => alert('Could not get your location')
    )
  }

  const userIcon = L.divIcon({
    className: 'discover-marker discover-marker-user',
    html: '<span class="discover-marker-dot"></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })

  const providerIcon = L.divIcon({
    className: 'discover-marker discover-marker-provider',
    html: '<span class="discover-marker-pin">📍</span>',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  })

  return (
    <div className="discover-page">
      <div className="discover-header">
        <h1 className="discover-title">Discover services near you</h1>
        <p className="discover-subtitle">Click the map to set your area, or use your location. Filter by rating, price, and distance.</p>
      </div>

      <div className="discover-layout">
        <div className="discover-filters">
          <div className="discover-filter-group">
            <label>Min. rating (stars)</label>
            <select value={minRating} onChange={e => setMinRating(e.target.value)} className="discover-input">
              <option value="">Any</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
              <option value="4.5">4.5+</option>
            </select>
          </div>
          <div className="discover-filter-group">
            <label>Price range ($)</label>
            <div className="discover-price-row">
              <input type="number" min="0" step="0.01" placeholder="Min" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="discover-input" />
              <span>–</span>
              <input type="number" min="0" step="0.01" placeholder="Max" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="discover-input" />
            </div>
          </div>
          <div className="discover-filter-group">
            <label>Max distance (km)</label>
            <input type="number" min="1" max="200" step="1" value={maxDistanceKm} onChange={e => setMaxDistanceKm(e.target.value)} className="discover-input" />
          </div>
          <button type="button" className="discover-btn discover-btn-primary" onClick={goToMyLocation}>
            Use my location
          </button>
        </div>

        <div className="discover-map-wrap">
          <MapContainer
            center={center}
            zoom={DEFAULT_ZOOM}
            className="discover-map"
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
            />
            <CenterController center={center} />
            <MapClickHandler onMapClick={(e) => setCenter([e.latlng.lat, e.latlng.lng])} />
            {userLocation && <Marker position={userLocation} icon={userIcon}><Popup>You are here</Popup></Marker>}
            {results.map((r) => {
              const center = [Number(r.latitude), Number(r.longitude)]
              const radiusM = (r.service_radius_km != null ? Number(r.service_radius_km) : 10) * 1000
              return (
                <React.Fragment key={r.provider_id}>
                  <Circle
                    center={center}
                    radius={radiusM}
                    pathOptions={{ color: 'var(--accent)', fillColor: 'var(--accent)', fillOpacity: 0.12, weight: 2 }}
                    eventHandlers={{ click: () => setSelectedId(r.provider_id) }}
                  />
                  <Marker
                    position={center}
                    icon={providerIcon}
                    eventHandlers={{ click: () => setSelectedId(r.provider_id) }}
                  >
                    <Popup>
                      <div className="discover-popup">
                        <strong>{r.display_name || 'Provider'}</strong>
                        <div><Stars value={r.avg_rating} /> {r.distance_km} km away</div>
                        {r.min_price != null && <div>From ${Number(r.min_price).toFixed(2)}</div>}
                        <Link to={`/provider/${r.provider_id}`} className="discover-popup-link">View profile</Link>
                      </div>
                    </Popup>
                  </Marker>
                </React.Fragment>
              )
            })}
          </MapContainer>
        </div>

        <div className="discover-list">
          <h2 className="discover-list-title">Services nearby ({results.length})</h2>
          {loading && <p className="discover-loading">Loading…</p>}
          {!loading && results.length === 0 && (
            <p className="discover-empty">No providers in this area. Try a larger distance or move the map.</p>
          )}
          {!loading && results.map((r) => (
            <Link
              key={r.provider_id}
              to={`/provider/${r.provider_id}`}
              className={`discover-card ${selectedId === r.provider_id ? 'selected' : ''}`}
            >
              <div className="discover-card-main">
                <span className="discover-card-name">{r.display_name || 'Provider'}</span>
                <span className="discover-card-meta"><Stars value={r.avg_rating} /> · {r.distance_km} km</span>
              </div>
              {r.min_price != null && <span className="discover-card-price">From ${Number(r.min_price).toFixed(2)}</span>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Discover
