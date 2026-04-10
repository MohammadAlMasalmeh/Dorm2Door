-- One provider review per consumer+provider pair; one customer review per provider+consumer pair.
-- (Previously: unique per appointment allowed multiple ratings of the same account across bookings.)

-- ── reviews (consumer rates provider) ───────────────────────
UPDATE public.reviews r
SET consumer_id = a.consumer_id
FROM public.appointments a
WHERE r.appointment_id = a.id
  AND r.consumer_id IS NULL;

DELETE FROM public.reviews r
WHERE r.id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY r2.consumer_id, r2.provider_id
        ORDER BY r2.created_at DESC, r2.id DESC
      ) AS rn
    FROM public.reviews r2
    WHERE r2.consumer_id IS NOT NULL
  ) z
  WHERE z.rn > 1
);

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_appointment_id_key;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_consumer_provider_unique UNIQUE (consumer_id, provider_id);

ALTER TABLE public.reviews
  ALTER COLUMN consumer_id SET NOT NULL;

-- ── customer_reviews (provider rates consumer) ────────────────
DELETE FROM public.customer_reviews cr
WHERE cr.id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY cr2.provider_id, cr2.consumer_id
        ORDER BY cr2.created_at DESC, cr2.id DESC
      ) AS rn
    FROM public.customer_reviews cr2
  ) z
  WHERE z.rn > 1
);

ALTER TABLE public.customer_reviews DROP CONSTRAINT IF EXISTS customer_reviews_appointment_id_key;

ALTER TABLE public.customer_reviews
  ADD CONSTRAINT customer_reviews_provider_consumer_unique UNIQUE (provider_id, consumer_id);

-- ── RLS: block duplicate pairs at policy layer ───────────────
DROP POLICY IF EXISTS "reviews: insert" ON public.reviews;

CREATE POLICY "reviews: insert" ON public.reviews
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND consumer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_id
        AND a.consumer_id = auth.uid()
        AND a.status = 'completed'
        AND a.provider_id = provider_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.reviews r_existing
      WHERE r_existing.consumer_id = reviews.consumer_id
        AND r_existing.provider_id = reviews.provider_id
    )
  );

DROP POLICY IF EXISTS "customer_reviews: insert as provider" ON public.customer_reviews;

CREATE POLICY "customer_reviews: insert as provider" ON public.customer_reviews
  FOR INSERT WITH CHECK (
    auth.uid() = provider_id
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_id AND a.provider_id = auth.uid() AND a.status = 'completed'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.customer_reviews cr_existing
      WHERE cr_existing.provider_id = customer_reviews.provider_id
        AND cr_existing.consumer_id = customer_reviews.consumer_id
    )
  );

-- ── Recalculate aggregates after row deletes ────────────────
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

UPDATE public.users u
SET
  avg_customer_rating = (
    SELECT ROUND(AVG(c.rating)::numeric, 2)
    FROM public.customer_reviews c
    WHERE c.consumer_id = u.id
  ),
  customer_review_count = COALESCE((
    SELECT COUNT(*)::integer
    FROM public.customer_reviews c
    WHERE c.consumer_id = u.id
  ), 0);
