-- Provider location for map discovery: lat/lng and service radius (how far they'll travel)
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS service_radius_km numeric DEFAULT 10;

COMMENT ON COLUMN public.providers.service_radius_km IS 'How far the provider is willing to travel (km). Used for "services near me" and map discovery.';

-- Optional: index for bounding-box style filters (e.g. map viewport)
CREATE INDEX IF NOT EXISTS idx_providers_lat_lng
  ON public.providers (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- RPC: get providers near a point with optional filters (rating, price, max distance)
-- Distance is computed from (center_lat, center_lng) to provider's (latitude, longitude).
-- Returns only providers that have latitude/longitude set.
CREATE OR REPLACE FUNCTION public.get_services_nearby(
  center_lat numeric,
  center_lng numeric,
  max_distance_km numeric DEFAULT 50,
  min_rating numeric DEFAULT 0,
  filter_min_price numeric DEFAULT NULL,
  filter_max_price numeric DEFAULT NULL
)
RETURNS TABLE (
  provider_id uuid,
  display_name text,
  avatar_url text,
  bio text,
  avg_rating numeric,
  location_text text,
  latitude numeric,
  longitude numeric,
  service_radius_km numeric,
  min_price numeric,
  max_price numeric,
  distance_km numeric,
  service_ids uuid[],
  service_names text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH with_distance AS (
    SELECT
      p.id AS pid,
      -- Haversine distance in km (R = 6371)
      (6371 * acos(least(1, greatest(-1,
        sin(radians(center_lat)) * sin(radians(p.latitude)) +
        cos(radians(center_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude - center_lng))
      )))) AS dist
    FROM public.providers p
    WHERE p.latitude IS NOT NULL
      AND p.longitude IS NOT NULL
      AND (6371 * acos(least(1, greatest(-1,
        sin(radians(center_lat)) * sin(radians(p.latitude)) +
        cos(radians(center_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude - center_lng))
      )))) <= max_distance_km
      AND (min_rating IS NULL OR p.avg_rating >= min_rating)
  ),
  service_agg AS (
    SELECT
      s.provider_id,
      min(s.price) AS sprice_min,
      max(s.price) AS sprice_max,
      array_agg(s.id) AS sids,
      array_agg(s.name) AS snames
    FROM public.services s
    GROUP BY s.provider_id
  )
  SELECT
    p.id AS provider_id,
    u.display_name,
    u.avatar_url,
    p.bio,
    p.avg_rating,
    p.location AS location_text,
    p.latitude,
    p.longitude,
    p.service_radius_km,
    sa.sprice_min AS min_price,
    sa.sprice_max AS max_price,
    round(wd.dist::numeric, 2) AS distance_km,
    sa.sids AS service_ids,
    sa.snames AS service_names
  FROM with_distance wd
  JOIN public.providers p ON p.id = wd.pid
  JOIN public.users u ON u.id = p.id
  LEFT JOIN service_agg sa ON sa.provider_id = p.id
  WHERE (filter_min_price IS NULL OR sa.sprice_max >= filter_min_price)
    AND (filter_max_price IS NULL OR sa.sprice_min <= filter_max_price)
  ORDER BY wd.dist;
END;
$$;

-- Allow authenticated users to call the RPC
GRANT EXECUTE ON FUNCTION public.get_services_nearby(numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated;
