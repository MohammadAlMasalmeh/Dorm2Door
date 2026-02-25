-- ============================================================
-- Dorm2Door — Notifications with Supabase Realtime
-- ============================================================

-- 1. notifications table
CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'appointment_request',
    'appointment_confirmed',
    'appointment_cancelled',
    'appointment_completed',
    'new_review',
    'friend_request',
    'friend_accepted'
  )),
  title text NOT NULL,
  body text,
  data jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: read own" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications: update own" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Triggers insert via SECURITY DEFINER
CREATE POLICY "notifications: system insert" ON public.notifications
  FOR INSERT WITH CHECK (true);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id) WHERE read = false;
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- Enable Supabase Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 2. Trigger: new appointment → notify provider
CREATE OR REPLACE FUNCTION public.notify_appointment_created()
RETURNS TRIGGER AS $$
DECLARE
  consumer_name text;
  service_name text;
BEGIN
  SELECT display_name INTO consumer_name FROM public.users WHERE id = NEW.consumer_id;
  SELECT name INTO service_name FROM public.services WHERE id = NEW.service_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.provider_id,
    'appointment_request',
    'New booking request',
    coalesce(consumer_name, 'Someone') || ' wants to book ' || coalesce(service_name, 'a service'),
    jsonb_build_object('appointment_id', NEW.id, 'consumer_id', NEW.consumer_id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_appointment_created_notify
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE PROCEDURE public.notify_appointment_created();

-- 3. Trigger: appointment status change → notify relevant party
CREATE OR REPLACE FUNCTION public.notify_appointment_status_change()
RETURNS TRIGGER AS $$
DECLARE
  other_name text;
  service_name text;
  notify_user uuid;
  notif_type text;
  notif_title text;
  notif_body text;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT s.name INTO service_name FROM public.services s WHERE s.id = NEW.service_id;

  IF NEW.status = 'confirmed' THEN
    SELECT display_name INTO other_name FROM public.users WHERE id = NEW.provider_id;
    notify_user := NEW.consumer_id;
    notif_type := 'appointment_confirmed';
    notif_title := 'Appointment confirmed';
    notif_body := coalesce(other_name, 'Provider') || ' confirmed your booking for ' || coalesce(service_name, 'a service');
  ELSIF NEW.status = 'cancelled' THEN
    notify_user := NEW.consumer_id;
    notif_type := 'appointment_cancelled';
    notif_title := 'Appointment cancelled';
    notif_body := coalesce(service_name, 'An') || ' appointment has been cancelled';
  ELSIF NEW.status = 'completed' THEN
    notify_user := NEW.consumer_id;
    notif_type := 'appointment_completed';
    notif_title := 'Appointment completed';
    notif_body := 'Your ' || coalesce(service_name, '') || ' appointment is complete. Leave a review!';
  END IF;

  IF notify_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (notify_user, notif_type, notif_title, notif_body,
      jsonb_build_object('appointment_id', NEW.id));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_appointment_status_change_notify
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE PROCEDURE public.notify_appointment_status_change();

-- 4. Trigger: new review → notify provider
CREATE OR REPLACE FUNCTION public.notify_new_review()
RETURNS TRIGGER AS $$
DECLARE
  consumer_name text;
BEGIN
  SELECT display_name INTO consumer_name FROM public.users WHERE id = NEW.consumer_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.provider_id,
    'new_review',
    'New review received',
    coalesce(consumer_name, 'Someone') || ' left a ' || NEW.rating || '-star review',
    jsonb_build_object('review_id', NEW.id, 'rating', NEW.rating)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_review_created_notify
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE PROCEDURE public.notify_new_review();

-- 5. Trigger: friend request → notify receiver
CREATE OR REPLACE FUNCTION public.notify_friend_request()
RETURNS TRIGGER AS $$
DECLARE
  sender_name text;
BEGIN
  SELECT display_name INTO sender_name FROM public.users WHERE id = NEW.sender_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.receiver_id,
    'friend_request',
    'New friend request',
    coalesce(sender_name, 'Someone') || ' wants to be your friend',
    jsonb_build_object('sender_id', NEW.sender_id, 'request_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_friend_request_created_notify
  AFTER INSERT ON public.friend_requests
  FOR EACH ROW EXECUTE PROCEDURE public.notify_friend_request();

-- 6. Trigger: friend request accepted → notify sender
CREATE OR REPLACE FUNCTION public.notify_friend_accepted()
RETURNS TRIGGER AS $$
DECLARE
  receiver_name text;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    SELECT display_name INTO receiver_name FROM public.users WHERE id = NEW.receiver_id;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.sender_id,
      'friend_accepted',
      'Friend request accepted',
      coalesce(receiver_name, 'Someone') || ' accepted your friend request',
      jsonb_build_object('friend_id', NEW.receiver_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_friend_request_accepted_notify
  AFTER UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE PROCEDURE public.notify_friend_accepted();
