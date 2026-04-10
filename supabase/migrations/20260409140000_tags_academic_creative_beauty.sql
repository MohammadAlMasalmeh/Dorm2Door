-- Canonical listing / profile tags: academic | creative | beauty only.
-- Migrates legacy free-form tags on providers and users, adds services.category, enforces checks.

CREATE OR REPLACE FUNCTION public._remap_legacy_tag_to_category(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(both from t))
    WHEN 'tutoring' THEN 'academic'
    WHEN 'tech support' THEN 'academic'
    WHEN 'delivery' THEN 'academic'
    WHEN 'groceries' THEN 'academic'
    WHEN 'errands' THEN 'academic'
    WHEN 'photography' THEN 'creative'
    WHEN 'haircuts' THEN 'beauty'
    WHEN 'cleaning' THEN 'beauty'
    WHEN 'laundry' THEN 'beauty'
    WHEN 'nails' THEN 'beauty'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public._remap_tags_array(input_tags text[])
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  acc text[] := ARRAY[]::text[];
  t text;
  m text;
BEGIN
  IF input_tags IS NULL THEN
    RETURN NULL;
  END IF;
  FOREACH t IN ARRAY input_tags LOOP
    m := public._remap_legacy_tag_to_category(t);
    IF m IS NOT NULL AND NOT (acc @> ARRAY[m]) THEN
      acc := array_append(acc, m);
    END IF;
  END LOOP;
  IF cardinality(acc) = 0 THEN
    RETURN ARRAY['academic']::text[];
  END IF;
  RETURN acc;
END;
$$;

-- Normalize existing provider and user tags
UPDATE public.providers
SET tags = public._remap_tags_array(tags)
WHERE tags IS NOT NULL;

UPDATE public.users
SET tags = public._remap_tags_array(tags)
WHERE tags IS NOT NULL;

-- Per-service category (same vocabulary)
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS category text;

UPDATE public.services s
SET category = COALESCE(
  (SELECT p.tags[1]
   FROM public.providers p
   WHERE p.id = s.provider_id
     AND p.tags IS NOT NULL
     AND cardinality(p.tags) > 0),
  'academic'
)
WHERE s.category IS NULL
   OR trim(both from s.category) = ''
   OR lower(trim(both from s.category)) NOT IN ('academic', 'creative', 'beauty');

ALTER TABLE public.services
  ALTER COLUMN category SET DEFAULT 'academic';

ALTER TABLE public.services
  ALTER COLUMN category SET NOT NULL;

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_category_check;

ALTER TABLE public.services
  ADD CONSTRAINT services_category_check
  CHECK (category IN ('academic', 'creative', 'beauty'));

COMMENT ON COLUMN public.services.category IS 'Listing category: academic, creative, or beauty.';

-- Enforce allowed values on tag arrays (every element must be one of the three)
ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_tags_allowed;

ALTER TABLE public.providers
  ADD CONSTRAINT providers_tags_allowed CHECK (
    tags IS NULL
    OR cardinality(tags) = 0
    OR tags <@ ARRAY['academic', 'creative', 'beauty']::text[]
  );

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_tags_allowed;

ALTER TABLE public.users
  ADD CONSTRAINT users_tags_allowed CHECK (
    tags IS NULL
    OR cardinality(tags) = 0
    OR tags <@ ARRAY['academic', 'creative', 'beauty']::text[]
  );

DROP FUNCTION IF EXISTS public._remap_tags_array(text[]);
DROP FUNCTION IF EXISTS public._remap_legacy_tag_to_category(text);
