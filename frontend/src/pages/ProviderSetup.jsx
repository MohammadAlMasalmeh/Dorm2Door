import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import ProviderServicesShell from '../components/ProviderServicesShell'

export default function ProviderSetup({ session, userProfile, onUpdate }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  const isProvider = userProfile?.role === 'provider' || session?.user?.user_metadata?.role === 'provider'

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const edit = params.get('edit')
    const add = params.get('add')
    if (add === '1') {
      navigate('/my-services/new', { replace: true })
      return
    }
    if (edit) {
      navigate(`/my-services/edit/${edit}`, { replace: true })
    }
  }, [location.search, navigate])

  useEffect(() => {
    if (!session?.user?.id || !isProvider) return
    void (async () => {
      setLoading(true)
      const { data } = await supabase
        .from('providers')
        .select('*, services (*, service_options (*))')
        .eq('id', session.user.id)
        .maybeSingle()
      if (data) {
        setProfile(data)
        setServices(data.services || [])
      } else {
        setProfile(null)
        setServices([])
      }
      setLoading(false)
    })()
  }, [session?.user?.id, isProvider])

  async function deleteService(svc) {
    const allUrls = (svc.image_urls && svc.image_urls.length > 0) ? svc.image_urls : (svc.image_url ? [svc.image_url] : [])
    for (const url of allUrls) {
      const path = url.split('/service-images/')[1]
      if (path) await supabase.storage.from('service-images').remove([path])
    }
    await supabase.from('services').delete().eq('id', svc.id)
    setServices((prev) => prev.filter((s) => s.id !== svc.id))
    onUpdate?.()
  }

  if (!isProvider) {
    return (
      <div style={{ textAlign: 'center', padding: '72px 24px' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Provider accounts only</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: '0.875rem' }}>
          You signed up as a consumer. To offer services, create a new account and select &quot;Provider&quot; during signup.
        </p>
        <Link to="/" className="btn btn-primary">Browse providers</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <ProviderServicesShell>
        <div className="loading-wrap"><div className="spinner" /></div>
      </ProviderServicesShell>
    )
  }

  return (
    <ProviderServicesShell>
      <div className="provider-setup-page provider-setup-page--portfolio-only">
        <header className="provider-setup-header">
          <h1 className="provider-setup-title">My Services</h1>
        </header>

        <div className="provider-setup-layout provider-setup-layout--single">
          <div className="provider-setup-services-col" id="add-service">
            <div className="provider-setup-services-header">
              <h2 className="provider-setup-services-title">Portfolio &amp; services</h2>
              <Link to="/my-services/new" className="provider-setup-add-btn">
                <span aria-hidden>+</span> Add service
              </Link>
            </div>

            {!profile && (
              <div className="provider-setup-empty">
                <div className="provider-setup-empty-icon" aria-hidden>2</div>
                <h3 className="provider-setup-empty-title">Add your first service</h3>
                <Link to="/my-services/new" className="provider-setup-empty-btn-link">Create listing</Link>
              </div>
            )}

            {profile && services.map((svc) => (
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
                        {(svc.service_options || []).map((opt) => (
                          <li key={opt.id}>
                            <span className="provider-setup-service-option-name">{opt.name}</span>
                            <span className="provider-setup-service-card-price">${Number(opt.price).toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="provider-setup-service-card-actions">
                    <Link to={`/my-services/edit/${svc.id}`} className="provider-setup-service-card-edit">Edit</Link>
                    <button type="button" className="provider-setup-service-card-remove" onClick={() => deleteService(svc)} aria-label={`Delete ${svc.name}`}>×</button>
                  </div>
                </div>
              </div>
            ))}

            {profile && services.length === 0 && (
              <div className="provider-setup-empty provider-setup-empty--services">
                <div className="provider-setup-empty-icon" aria-hidden>🛒</div>
                <h3 className="provider-setup-empty-title">No services yet</h3>
                <Link to="/my-services/new" className="provider-setup-empty-btn-link">Create listing</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProviderServicesShell>
  )
}
