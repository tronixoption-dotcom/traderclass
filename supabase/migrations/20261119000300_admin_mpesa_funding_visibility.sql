-- Let funding staff see M-Pesa payment activity in the admin funding screens.
DROP POLICY IF EXISTS "Staff read M-Pesa transactions" ON public.mpesa_transactions;
CREATE POLICY "Staff read M-Pesa transactions"
  ON public.mpesa_transactions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'agent'));
