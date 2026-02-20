-- ============================================================
-- Dorm2Door — Profile pictures, review relations, cancellation
-- ============================================================

-- 1. USERS: profile picture URL (Supabase Storage public URL)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. REVIEWS: explicit foreign key to the user who wrote the review (consumer)
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS consumer_id UUID REFERENCES public.users(id);
-- Backfill from appointment's consumer
UPDATE public.reviews r
SET consumer_id = a.consumer_id
FROM public.appointments a
WHERE r.appointment_id = a.id AND r.consumer_id IS NULL;
COMMENT ON COLUMN public.reviews.consumer_id IS 'User (consumer) who wrote the review; denormalized from appointment for easy display.';

-- Trigger: set consumer_id from appointment when not provided
CREATE OR REPLACE FUNCTION public.set_review_consumer_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.consumer_id IS NULL THEN
    SELECT consumer_id INTO NEW.consumer_id
    FROM public.appointments WHERE id = NEW.appointment_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_review_set_consumer ON public.reviews;
CREATE TRIGGER on_review_set_consumer
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE PROCEDURE public.set_review_consumer_id();

-- 3. APPOINTMENTS: allow 'cancelled' status
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled'));

-- 4. STORAGE: avatars bucket (public read for profile pics)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS for avatars: anyone can view; users can upload/update/delete their own (path = user_id/filename)
CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
