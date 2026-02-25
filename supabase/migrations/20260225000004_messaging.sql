-- ============================================================
-- Dorm2Door — In-App Messaging with Supabase Realtime
-- ============================================================

-- 1. conversations table (unique pair of users)
CREATE TABLE public.conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_message_at timestamptz DEFAULT timezone('utc'::text, now()),
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)  -- enforce ordering to prevent duplicate pairs
);

-- 2. messages table
CREATE TABLE public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Conversations: users can only see conversations they are part of
CREATE POLICY "conversations: read own" ON public.conversations
  FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "conversations: insert" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "conversations: update" ON public.conversations
  FOR UPDATE USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Messages: users can see messages in their conversations
CREATE POLICY "messages: read own conversations" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

CREATE POLICY "messages: insert own" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);
CREATE INDEX idx_conversations_user_a ON public.conversations(user_a);
CREATE INDEX idx_conversations_user_b ON public.conversations(user_b);
CREATE INDEX idx_conversations_last_msg ON public.conversations(last_message_at DESC);

-- Enable Realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- 3. Trigger: update last_message_at on conversation when new message inserted
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_message_created
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE PROCEDURE public.update_conversation_last_message();

-- 4. Helper function: get or create a conversation between two users
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(other_user uuid)
RETURNS uuid AS $$
DECLARE
  conv_id uuid;
  a uuid;
  b uuid;
BEGIN
  -- Enforce ordering (user_a < user_b)
  IF auth.uid() < other_user THEN
    a := auth.uid(); b := other_user;
  ELSE
    a := other_user; b := auth.uid();
  END IF;

  SELECT id INTO conv_id FROM public.conversations
  WHERE user_a = a AND user_b = b;

  IF conv_id IS NULL THEN
    INSERT INTO public.conversations (user_a, user_b)
    VALUES (a, b)
    RETURNING id INTO conv_id;
  END IF;

  RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
