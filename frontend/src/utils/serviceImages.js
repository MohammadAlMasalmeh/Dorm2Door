/** Gallery URLs for a service (matches ProviderProfile / SearchResults). */
export function galleryUrlsForService(service) {
  let raw = service?.image_urls
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = []
    }
  }
  const arr = Array.isArray(raw) ? raw.map((u) => (typeof u === 'string' ? u : u?.url)).filter(Boolean) : []
  if (arr.length > 0) return arr
  const one = (service?.image_url || '').trim()
  return one ? [one] : []
}
