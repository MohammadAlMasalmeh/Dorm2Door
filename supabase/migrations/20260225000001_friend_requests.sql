-- ============================================================
-- Dorm2Door — Friend request system
-- ============================================================

-- 1. friend_requests table
CREATE TABLE public.friend_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (sender_id, receiver_id),
  CHECK (sender_id <> receiver_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- Both parties can read requests involving them
CREATE POLICY "friend_requests: read own" ON public.friend_requests
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Authenticated users can send requests (as sender, must be pending)
CREATE POLICY "friend_requests: insert" ON public.friend_requests
  FOR INSERT WITH CHECK (auth.uid() = sender_id AND status = 'pending');

-- Receiver can accept/decline; sender can withdraw
CREATE POLICY "friend_requests: update" ON public.friend_requests
  FOR UPDATE USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

-- Either party can delete
CREATE POLICY "friend_requests: delete" ON public.friend_requests
  FOR DELETE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE INDEX idx_friend_requests_receiver ON public.friend_requests(receiver_id) WHERE status = 'pending';
CREATE INDEX idx_friend_requests_sender ON public.friend_requests(sender_id);

-- 2. Trigger: auto-create bidirectional friendship on acceptance
CREATE OR REPLACE FUNCTION public.handle_friend_request_accepted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    INSERT INTO public.friends (user_id, friend_id)
    VALUES (NEW.sender_id, NEW.receiver_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.friends (user_id, friend_id)
    VALUES (NEW.receiver_id, NEW.sender_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_friend_request_accepted
  AFTER UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE PROCEDURE public.handle_friend_request_accepted();

-- 3. RPC function for unfriending (deletes both directional rows)
CREATE OR REPLACE FUNCTION public.unfriend(friend uuid)
RETURNS void AS $$
BEGIN
  DELETE FROM public.friends WHERE user_id = auth.uid() AND friend_id = friend;
  DELETE FROM public.friends WHERE user_id = friend AND friend_id = auth.uid();
  -- Also clean up any friend requests between the two users
  DELETE FROM public.friend_requests
    WHERE (sender_id = auth.uid() AND receiver_id = friend)
       OR (sender_id = friend AND receiver_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
