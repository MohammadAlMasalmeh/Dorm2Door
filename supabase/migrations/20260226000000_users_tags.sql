-- Profile tags on users (editable in profile; no random placeholders)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
