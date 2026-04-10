import { useEffect, useMemo, useState } from 'react'
import ProviderServicesShell from '../components/ProviderServicesShell'

const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
const GCAL_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || ''
const GCAL_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const GCAL_CALENDAR_ID = import.meta.env.VITE_GOOGLE_CALENDAR_ID || 'primary'

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.defer = true
    s.addEventListener('load', () => {
      s.dataset.loaded = 'true'
      resolve()
    }, { once: true })
    s.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true })
    document.head.appendChild(s)
  })
}

function formatDateTimeLocal(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${mins}`
}

function toEventDateTime(value) {
  const dt = new Date(value)
  return {
    dateTime: dt.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  }
}

export default function ServicesAvailability() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [token, setToken] = useState('')
  const [events, setEvents] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [savingEvent, setSavingEvent] = useState(false)
  const [eventForm, setEventForm] = useState(() => {
    const start = new Date()
    start.setHours(start.getHours() + 1, 0, 0, 0)
    const end = new Date(start)
    end.setHours(end.getHours() + 1)
    return {
      title: 'Dorm2Door booking',
      location: '',
      notes: '',
      start: formatDateTimeLocal(start),
      end: formatDateTimeLocal(end),
    }
  })

  const configMissing = useMemo(() => !GCAL_API_KEY || !GCAL_CLIENT_ID, [])

  useEffect(() => {
    let mounted = true
    async function init() {
      if (configMissing) return
      try {
        await Promise.all([
          loadScript('https://apis.google.com/js/api.js'),
          loadScript('https://accounts.google.com/gsi/client'),
        ])
        await new Promise((resolve) => window.gapi.load('client', resolve))
        await window.gapi.client.init({
          apiKey: GCAL_API_KEY,
          discoveryDocs: [DISCOVERY_DOC],
        })
        if (!mounted) return
        setReady(true)
      } catch (e) {
        if (!mounted) return
        setError(e?.message || 'Could not load Google Calendar SDK.')
      }
    }
    void init()
    return () => { mounted = false }
  }, [configMissing])

  async function fetchEvents(accessToken) {
    setLoadingEvents(true)
    setError('')
    try {
      const response = await window.gapi.client.calendar.events.list({
        calendarId: GCAL_CALENDAR_ID,
        timeMin: new Date().toISOString(),
        showDeleted: false,
        singleEvents: true,
        maxResults: 20,
        orderBy: 'startTime',
      })
      setEvents(response.result.items || [])
    } catch (e) {
      setError(e?.result?.error?.message || e?.message || 'Could not load calendar events.')
    } finally {
      setLoadingEvents(false)
    }
  }

  function connectGoogleCalendar() {
    if (!ready) return
    setAuthBusy(true)
    setError('')
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GCAL_CLIENT_ID,
      scope: GCAL_SCOPE,
      callback: async (resp) => {
        setAuthBusy(false)
        if (resp.error) {
          setError(resp.error_description || resp.error || 'Google sign-in failed.')
          return
        }
        const accessToken = resp.access_token || ''
        setToken(accessToken)
        window.gapi.client.setToken({ access_token: accessToken })
        await fetchEvents(accessToken)
      },
    })
    tokenClient.requestAccessToken({ prompt: 'consent' })
  }

  function disconnectGoogleCalendar() {
    const accessToken = window.gapi?.client?.getToken?.()?.access_token
    if (accessToken) {
      window.google.accounts.oauth2.revoke(accessToken, () => {})
    }
    window.gapi?.client?.setToken?.(null)
    setToken('')
    setEvents([])
  }

  async function createEvent(e) {
    e.preventDefault()
    if (!token) {
      setError('Connect Google Calendar first.')
      return
    }
    if (!eventForm.title.trim()) {
      setError('Booking title is required.')
      return
    }
    if (!eventForm.start || !eventForm.end || new Date(eventForm.end) <= new Date(eventForm.start)) {
      setError('End time must be after start time.')
      return
    }
    setSavingEvent(true)
    setError('')
    try {
      await window.gapi.client.calendar.events.insert({
        calendarId: GCAL_CALENDAR_ID,
        resource: {
          summary: eventForm.title.trim(),
          location: eventForm.location.trim() || undefined,
          description: eventForm.notes.trim() || undefined,
          start: toEventDateTime(eventForm.start),
          end: toEventDateTime(eventForm.end),
        },
      })
      await fetchEvents(token)
    } catch (err) {
      setError(err?.result?.error?.message || err?.message || 'Could not create booking event.')
    } finally {
      setSavingEvent(false)
    }
  }

  return (
    <ProviderServicesShell>
      <section className="services-section">
        <h1 className="services-heading">Availability</h1>
        <p className="services-availability-subtitle">
          Connect Google Calendar to view your schedule and add booking blocks.
        </p>

        {configMissing && (
          <div className="services-availability-alert" role="alert">
            Add `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_CLIENT_ID` in your frontend env file to enable Google Calendar.
          </div>
        )}
        {error && <div className="services-availability-alert" role="alert">{error}</div>}

        <div className="services-availability-actions">
          <button
            type="button"
            className="services-availability-btn services-availability-btn-primary"
            onClick={connectGoogleCalendar}
            disabled={!ready || configMissing || authBusy}
          >
            {authBusy ? 'Connecting…' : (token ? 'Reconnect Google Calendar' : 'Connect Google Calendar')}
          </button>
          {token && (
            <button
              type="button"
              className="services-availability-btn services-availability-btn-outline"
              onClick={disconnectGoogleCalendar}
            >
              Disconnect
            </button>
          )}
        </div>
      </section>

      <section className="services-section services-availability-grid">
        <div className="services-availability-card">
          <h2 className="services-availability-title">Upcoming calendar bookings</h2>
          {loadingEvents ? (
            <p className="services-panel-empty-dark">Loading…</p>
          ) : token && events.length === 0 ? (
            <p className="services-panel-empty-dark">No upcoming events.</p>
          ) : !token ? (
            <p className="services-panel-empty-dark">Connect Google Calendar to load events.</p>
          ) : (
            <div className="services-availability-events">
              {events.map((ev) => {
                const start = ev.start?.dateTime || ev.start?.date
                const end = ev.end?.dateTime || ev.end?.date
                const when = start
                  ? `${new Date(start).toLocaleString()}${end ? ` - ${new Date(end).toLocaleTimeString()}` : ''}`
                  : 'Time TBD'
                return (
                  <div key={ev.id} className="services-availability-event">
                    <p className="services-availability-event-title">{ev.summary || 'Untitled booking'}</p>
                    <p className="services-availability-event-time">{when}</p>
                    {ev.location ? <p className="services-availability-event-meta">{ev.location}</p> : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="services-availability-card">
          <h2 className="services-availability-title">Add booking to calendar</h2>
          <form className="services-availability-form" onSubmit={createEvent}>
            <label className="services-availability-label">
              Title
              <input
                className="services-availability-input"
                value={eventForm.title}
                onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Dorm2Door booking"
                required
              />
            </label>
            <label className="services-availability-label">
              Start
              <input
                type="datetime-local"
                className="services-availability-input"
                value={eventForm.start}
                onChange={(e) => setEventForm((prev) => ({ ...prev, start: e.target.value }))}
                required
              />
            </label>
            <label className="services-availability-label">
              End
              <input
                type="datetime-local"
                className="services-availability-input"
                value={eventForm.end}
                onChange={(e) => setEventForm((prev) => ({ ...prev, end: e.target.value }))}
                required
              />
            </label>
            <label className="services-availability-label">
              Location
              <input
                className="services-availability-input"
                value={eventForm.location}
                onChange={(e) => setEventForm((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label className="services-availability-label">
              Notes
              <textarea
                className="services-availability-input"
                rows={4}
                value={eventForm.notes}
                onChange={(e) => setEventForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional details"
              />
            </label>
            <button
              type="submit"
              className="services-availability-btn services-availability-btn-primary"
              disabled={!token || savingEvent}
            >
              {savingEvent ? 'Saving…' : 'Add booking'}
            </button>
          </form>
        </div>
      </section>
    </ProviderServicesShell>
  )
}
