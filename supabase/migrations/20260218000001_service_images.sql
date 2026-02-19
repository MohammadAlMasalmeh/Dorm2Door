-- Add image support to services
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ── Storage RLS for service-images bucket ──────────────────────────────────

-- Anyone can view images
CREATE POLICY "Public can view service images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'service-images');

-- Authenticated providers can upload images to their own folder (uid/filename)
CREATE POLICY "Providers can upload service images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'service-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Providers can delete their own images
CREATE POLICY "Providers can delete own service images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
