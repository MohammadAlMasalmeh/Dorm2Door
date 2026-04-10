/** Must match DB check constraints on providers.tags, users.tags, and services.category */
export const SERVICE_CATEGORY_KEYS = ['academic', 'creative', 'beauty']

export const SERVICE_CATEGORY_LABELS = {
  academic: 'Academic',
  creative: 'Creative',
  beauty: 'Beauty',
}

export function isServiceCategory(value) {
  return SERVICE_CATEGORY_KEYS.includes(String(value || '').trim().toLowerCase())
}

export function normalizeServiceCategories(arr) {
  const out = []
  for (const x of arr || []) {
    const k = String(x || '').trim().toLowerCase()
    if (SERVICE_CATEGORY_KEYS.includes(k) && !out.includes(k)) out.push(k)
  }
  return out
}
