-- ============================================================
-- Dorm2Door — Profile banner, bio, friends
-- ============================================================

-- 1. USERS: cover/banner image URL and bio (for About section)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio TEXT;

-- 2. FRIENDS: symmetric connections (each row is one friendship)
CREATE TABLE IF NOT EXISTS public.friends (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Users can see their own friend list
CREATE POLICY "friends: read own"
  ON public.friends FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Users can add a friend (insert row with themselves as user_id)
CREATE POLICY "friends: insert own"
  ON public.friends FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can remove a friend (delete where they are user_id)
CREATE POLICY "friends: delete own"
  ON public.friends FOR DELETE
  USING (auth.uid() = user_id);

-- Optional: index for counting friends
CREATE INDEX IF NOT EXISTS friends_user_id_idx ON public.friends(user_id);
CREATE INDEX IF NOT EXISTS friends_friend_id_idx ON public.friends(friend_id);
