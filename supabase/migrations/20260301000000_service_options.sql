-- Service options: multiple price options per service (e.g. Haircuts -> "Hair only" $20, "Hair + beard" $40)
CREATE TABLE public.service_options (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(10, 2) NOT NULL
);

CREATE INDEX idx_service_options_service_id ON public.service_options(service_id);

ALTER TABLE public.service_options ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read options
CREATE POLICY "service_options: read all" ON public.service_options
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Providers can insert options for their own services
CREATE POLICY "service_options: insert own provider" ON public.service_options
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_id AND s.provider_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'provider')
    )
  );

-- Providers can update/delete their own options
CREATE POLICY "service_options: update own provider" ON public.service_options
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_id AND s.provider_id = auth.uid())
  );

CREATE POLICY "service_options: delete own provider" ON public.service_options
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_id AND s.provider_id = auth.uid())
  );

-- Make services.price nullable (options hold price going forward)
ALTER TABLE public.services ALTER COLUMN price DROP NOT NULL;

-- Appointments can reference a specific service option (price/name come from option)
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS service_option_id uuid REFERENCES public.service_options(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_service_option ON public.appointments(service_option_id);

-- Backfill: one option per existing service (only for services that have no options yet)
INSERT INTO public.service_options (service_id, name, price)
  SELECT s.id, s.name, COALESCE(s.price, 0)
  FROM public.services s
  WHERE NOT EXISTS (SELECT 1 FROM public.service_options so WHERE so.service_id = s.id);

UPDATE public.appointments a
SET service_option_id = (
  SELECT so.id FROM public.service_options so WHERE so.service_id = a.service_id LIMIT 1
)
WHERE a.service_option_id IS NULL AND a.service_id IS NOT NULL;

-- Booking: accept service_option_id and set both service_id and service_option_id
CREATE OR REPLACE FUNCTION public.ensure_consumer_then_book(
  p_provider_id uuid,
  p_service_id uuid,
  p_scheduled_at timestamptz,
  p_service_option_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt_id uuid;
  v_service_id uuid;
  v_provider_id uuid;
BEGIN
  -- Resolve service and provider from option if given
  IF p_service_option_id IS NOT NULL THEN
    SELECT so.service_id, s.provider_id INTO v_service_id, v_provider_id
    FROM public.service_options so
    JOIN public.services s ON s.id = so.service_id
    WHERE so.id = p_service_option_id;
    IF v_service_id IS NULL OR v_provider_id != p_provider_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_provider_or_service');
    END IF;
  ELSE
    v_service_id := p_service_id;
    v_provider_id := p_provider_id;
  END IF;

  -- Backfill consumer into users if missing
  INSERT INTO public.users (id, email, display_name)
  SELECT id, email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  FROM auth.users
  WHERE id = auth.uid() AND right(email, 4) = '.edu'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.appointments (consumer_id, provider_id, service_id, service_option_id, status, scheduled_at)
  VALUES (auth.uid(), p_provider_id, v_service_id, p_service_option_id, 'pending', p_scheduled_at)
  RETURNING id INTO appt_id;

  RETURN jsonb_build_object('ok', true, 'id', appt_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'time_slot_taken');
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_provider_or_service');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.ensure_consumer_then_book(uuid, uuid, timestamptz, uuid) IS 'Book appointment. Pass p_service_option_id when booking a specific option; otherwise p_service_id (legacy).';
