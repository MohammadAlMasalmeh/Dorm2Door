-- Add provider availability scheduling
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS availability JSONB
  DEFAULT '{"days":[1,2,3,4,5],"startTime":"9:00 AM","endTime":"6:00 PM"}'::jsonb;
