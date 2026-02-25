-- ============================================================
-- Dorm2Door — Booking validation & double-booking prevention
-- ============================================================

-- 1. RPC function to check booked time slots for a provider on a given date
-- Runs as SECURITY DEFINER to bypass appointment RLS (consumers need to see
-- other consumers' bookings to avoid conflicts).
CREATE OR REPLACE FUNCTION public.get_booked_slots(
  p_provider_id uuid,
  p_date date
)
RETURNS TABLE(scheduled_at timestamptz) AS $$
BEGIN
  RETURN QUERY
  SELECT a.scheduled_at
  FROM public.appointments a
  WHERE a.provider_id = p_provider_id
    AND a.scheduled_at::date = p_date
    AND a.status IN ('pending', 'confirmed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Unique partial index to prevent double-booking at the database level
-- Two appointments cannot share the same provider + time if either is active.
CREATE UNIQUE INDEX IF NOT EXISTS idx_no_double_booking
  ON public.appointments (provider_id, scheduled_at)
  WHERE status IN ('pending', 'confirmed');
