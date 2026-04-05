-- Persist review count on providers (for listings without scanning reviews)
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.update_avg_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.providers
  SET
    avg_rating = COALESCE((
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM public.reviews
      WHERE provider_id = NEW.provider_id
    ), 0),
    review_count = (
      SELECT COUNT(*)::integer
      FROM public.reviews
      WHERE provider_id = NEW.provider_id
    )
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

UPDATE public.providers p
SET
  avg_rating = COALESCE((
    SELECT ROUND(AVG(r.rating)::numeric, 2)
    FROM public.reviews r
    WHERE r.provider_id = p.id
  ), 0),
  review_count = (
    SELECT COUNT(*)::integer
    FROM public.reviews r
    WHERE r.provider_id = p.id
  );
