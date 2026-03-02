-- Add multi-image support to services
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT '[]'::jsonb;

-- Migrate existing single images into the new array
UPDATE public.services
SET image_urls = jsonb_build_array(image_url)
WHERE image_url IS NOT NULL AND image_urls = '[]'::jsonb;
