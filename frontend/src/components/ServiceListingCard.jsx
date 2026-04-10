import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const THUMB_SLOTS = 5

/**
 * Search-results style listing card (hero + 5 thumbs, dashed rule, dark body).
 * Gallery is outside the link; body is a Link when `linkTo` is set.
 */
export default function ServiceListingCard({
  portfolioUrls = [],
  serviceName,
  priceLabel,
  rating = 0,
  providerName,
  providerAvatarUrl,
  linkTo,
  toolbar,
  className = '',
  resetKey,
}) {
  const urls = portfolioUrls || []
  const [activeIdx, setActiveIdx] = useState(0)
  const [hoverIdx, setHoverIdx] = useState(null)

  useEffect(() => {
    setActiveIdx(0)
    setHoverIdx(null)
  }, [resetKey])

  const safeIdx = urls.length ? Math.min(Math.max(0, activeIdx), urls.length - 1) : 0
  const displayIdx = hoverIdx != null && urls[hoverIdx] ? hoverIdx : safeIdx
  const mainUrl = urls[displayIdx] || ''
  const othersOrdered = urls.map((_, i) => i).filter((i) => i !== safeIdx)
  const thumbSlots = Array.from({ length: THUMB_SLOTS }, (_, s) => othersOrdered[s] ?? null)

  const hasMedia = urls.length > 0
  const onPickThumb = useCallback((i) => {
    setHoverIdx(null)
    setActiveIdx(i)
  }, [])

  const ratingLine = Number(rating || 0).toFixed(2)

  const bodyContent = (
    <>
      <h3>{serviceName}</h3>
      <p className="figma-results-price-line">From {priceLabel}</p>
      <p className="figma-results-rating-line">
        <span className="figma-results-rating-star" aria-hidden>★</span>
        {ratingLine}
      </p>
      <div className="figma-results-provider">
        {providerAvatarUrl ? (
          <img src={providerAvatarUrl} alt="" className="figma-results-provider-avatar" />
        ) : (
          <span className="figma-results-provider-initials" aria-hidden>
            {(providerName || 'P').slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="figma-results-provider-name" title={providerName || 'Provider'}>
          {providerName || 'Provider'}
        </span>
      </div>
    </>
  )

  const cardClass = `figma-results-card${!hasMedia ? ' figma-results-card--no-media' : ''}${className ? ` ${className}` : ''}`.trim()

  return (
    <div className={cardClass}>
      {hasMedia && (
        <div className="figma-results-card-gallery">
          <div
            className="figma-results-main-img"
            style={{ backgroundImage: `url(${mainUrl})` }}
            role="img"
            aria-label="Listing preview"
          />
          <div
            className="figma-results-sub-imgs"
            role="group"
            aria-label="More photos"
            onMouseLeave={() => setHoverIdx(null)}
          >
            {thumbSlots.map((urlIndex, slot) => {
              if (urlIndex == null) {
                return (
                  <div
                    key={`empty-${slot}`}
                    className="figma-results-sub-img figma-results-sub-img--empty"
                    aria-hidden
                  />
                )
              }
              const url = urls[urlIndex]
              return (
                <button
                  key={`${url}-${urlIndex}`}
                  type="button"
                  className="figma-results-sub-img figma-results-sub-img--filled figma-results-sub-img-btn"
                  style={{ backgroundImage: `url(${url})` }}
                  onClick={() => onPickThumb(urlIndex)}
                  onMouseEnter={() => setHoverIdx(urlIndex)}
                  aria-label={`Show image ${urlIndex + 1} of ${urls.length}`}
                />
              )
            })}
          </div>
        </div>
      )}
      {linkTo ? (
        <Link to={linkTo} className="figma-results-card-body figma-results-card-body--link">
          {bodyContent}
        </Link>
      ) : (
        <div className="figma-results-card-body">{bodyContent}</div>
      )}
      {toolbar}
    </div>
  )
}
