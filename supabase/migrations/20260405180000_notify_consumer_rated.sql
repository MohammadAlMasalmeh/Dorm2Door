-- Allow storing customer_rated notifications
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'appointment_request',
  'appointment_confirmed',
  'appointment_cancelled',
  'appointment_completed',
  'new_review',
  'friend_request',
  'friend_accepted',
  'customer_rated'
));

-- Notify consumers when a provider submits a customer review (so they know to check profile)
CREATE OR REPLACE FUNCTION public.notify_consumer_rated()
RETURNS TRIGGER AS $$
DECLARE
  provider_name text;
BEGIN
  SELECT u.display_name INTO provider_name FROM public.users u WHERE u.id = NEW.provider_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.consumer_id,
    'customer_rated',
    'You received a rating',
    coalesce(provider_name, 'A provider')
      || ' rated you '
      || NEW.rating
      || CASE WHEN NEW.rating = 1 THEN ' star' ELSE ' stars' END
      || ' as a customer. See your profile for your average.',
    jsonb_build_object('appointment_id', NEW.appointment_id, 'rating', NEW.rating, 'provider_id', NEW.provider_id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_customer_review_notify_consumer ON public.customer_reviews;
CREATE TRIGGER on_customer_review_notify_consumer
  AFTER INSERT ON public.customer_reviews
  FOR EACH ROW EXECUTE PROCEDURE public.notify_consumer_rated();
