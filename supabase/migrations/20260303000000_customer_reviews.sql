-- ============================================================
-- Dorm2Door — Customer reviews (provider rates consumer)
-- Customer rating is only shown in service/request context (e.g. when viewing a booking request).
-- ============================================================

-- Providers can rate a consumer after an appointment is completed (one review per appointment).
CREATE TABLE public.customer_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  consumer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(appointment_id)
);

CREATE INDEX idx_customer_reviews_consumer ON public.customer_reviews(consumer_id);
CREATE INDEX idx_customer_reviews_provider ON public.customer_reviews(provider_id);

ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;

-- Providers can insert a customer review for their own completed appointment
CREATE POLICY "customer_reviews: insert as provider"
  ON public.customer_reviews FOR INSERT
  WITH CHECK (
    auth.uid() = provider_id
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_id AND a.provider_id = auth.uid() AND a.status = 'completed'
    )
  );

-- Anyone authenticated can read (for showing consumer rating in booking/request context)
CREATE POLICY "customer_reviews: read all authenticated"
  ON public.customer_reviews FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- No update/delete: reviews are immutable

-- Optional: cache avg customer rating on users for quick display
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avg_customer_rating numeric(3, 2);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS customer_review_count integer DEFAULT 0;

CREATE OR REPLACE FUNCTION public.update_user_customer_rating()
RETURNS trigger AS $$
BEGIN
  UPDATE public.users
  SET
    avg_customer_rating = (
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM public.customer_reviews
      WHERE consumer_id = NEW.consumer_id
    ),
    customer_review_count = (
      SELECT COUNT(*)::integer
      FROM public.customer_reviews
      WHERE consumer_id = NEW.consumer_id
    )
  WHERE id = NEW.consumer_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_customer_review_created ON public.customer_reviews;
CREATE TRIGGER on_customer_review_created
  AFTER INSERT ON public.customer_reviews
  FOR EACH ROW EXECUTE PROCEDURE public.update_user_customer_rating();

-- Backfill existing users' customer_review_count to 0 where null
UPDATE public.users SET customer_review_count = 0 WHERE customer_review_count IS NULL;
