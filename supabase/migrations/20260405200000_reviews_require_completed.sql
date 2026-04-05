-- Consumers may only insert a provider review after the appointment is completed
DROP POLICY IF EXISTS "reviews: insert" ON public.reviews;

CREATE POLICY "reviews: insert" ON public.reviews
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND consumer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_id
        AND a.consumer_id = auth.uid()
        AND a.status = 'completed'
        AND a.provider_id = provider_id
    )
  );
