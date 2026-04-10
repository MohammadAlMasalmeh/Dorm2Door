import { Link } from 'react-router-dom'
import ProviderServicesShell from '../components/ProviderServicesShell'

export default function ServicesAvailability() {
  return (
    <ProviderServicesShell>
      <section className="services-section">
        <h1 className="services-heading">Availability</h1>
        <p className="services-availability-subtitle">
          Your booking windows come from the weekly hours in your profile. Update them anytime so students only see slots when you are free.
        </p>
        <div className="services-availability-card" style={{ maxWidth: 520 }}>
          <p className="services-panel-empty-dark" style={{ marginTop: 0 }}>
            Open your profile, stay on the Services tab, and scroll to the availability section to change days and time ranges.
          </p>
          <Link
            to="/profile#availability"
            className="services-availability-btn services-availability-btn-primary services-availability-btn-inline"
          >
            Edit availability in profile
          </Link>
        </div>
      </section>
    </ProviderServicesShell>
  )
}
