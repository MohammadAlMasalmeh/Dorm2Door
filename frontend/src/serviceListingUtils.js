/** Shared helpers for listing / search / profile service cards */

export { galleryUrlsForService } from './utils/serviceImages'

export function priceLabelForService(service) {
  const prices = []
  if (service?.price != null) prices.push(Number(service.price))
  ;(service?.service_options || []).forEach((opt) => {
    if (opt?.price != null) prices.push(Number(opt.price))
  })
  const minPrice = prices.length ? Math.min(...prices) : null
  const maxPrice = prices.length ? Math.max(...prices) : null
  if (minPrice == null) return '$70-$100'
  return maxPrice != null && maxPrice > minPrice
    ? `$${Math.round(minPrice)}-$${Math.round(maxPrice)}`
    : `$${Math.round(minPrice)}`
}
