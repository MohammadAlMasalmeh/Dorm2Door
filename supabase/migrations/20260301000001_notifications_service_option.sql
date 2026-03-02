-- Use service option name in notifications when appointment has service_option_id
CREATE OR REPLACE FUNCTION public.notify_appointment_created()
RETURNS TRIGGER AS $$
DECLARE
  consumer_name text;
  service_name text;
BEGIN
  SELECT display_name INTO consumer_name FROM public.users WHERE id = NEW.consumer_id;
  IF NEW.service_option_id IS NOT NULL THEN
    SELECT s.name || ' · ' || so.name INTO service_name
    FROM public.service_options so
    JOIN public.services s ON s.id = so.service_id
    WHERE so.id = NEW.service_option_id;
  ELSE
    SELECT name INTO service_name FROM public.services WHERE id = NEW.service_id;
  END IF;

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

  IF NEW.service_option_id IS NOT NULL THEN
    SELECT s.name || ' · ' || so.name INTO service_name
    FROM public.service_options so
    JOIN public.services s ON s.id = so.service_id
    WHERE so.id = NEW.service_option_id;
  ELSE
    SELECT s.name INTO service_name FROM public.services s WHERE s.id = NEW.service_id;
  END IF;

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
    VALUES (notify_user, notif_type, notif_title, notif_body, jsonb_build_object('appointment_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
