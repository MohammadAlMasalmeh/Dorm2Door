-- College/campus for providers: used to bias location suggestions near campus
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS campus_name text,
  ADD COLUMN IF NOT EXISTS campus_latitude numeric,
  ADD COLUMN IF NOT EXISTS campus_longitude numeric;

COMMENT ON COLUMN public.providers.campus_name IS 'College or campus name; used to prioritize service-area suggestions near campus.';
