-- Ensure consumer exists in public.users before booking (fixes FK when trigger missed or race).
-- Then insert appointment so consumer_id always matches a row in public.users.

CREATE OR REPLACE FUNCTION public.ensure_consumer_then_book(
  p_provider_id uuid,
  p_service_id uuid,
  p_scheduled_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt_id uuid;
BEGIN
  -- Backfill current user into public.users if missing (same .edu rule as handle_new_user)
  INSERT INTO public.users (id, email, display_name)
  SELECT
    id,
    email,
    coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  FROM auth.users
  WHERE id = auth.uid()
    AND right(email, 4) = '.edu'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.appointments (consumer_id, provider_id, service_id, status, scheduled_at)
  VALUES (auth.uid(), p_provider_id, p_service_id, 'pending', p_scheduled_at)
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

GRANT EXECUTE ON FUNCTION public.ensure_consumer_then_book(uuid, uuid, timestamptz) TO authenticated;
