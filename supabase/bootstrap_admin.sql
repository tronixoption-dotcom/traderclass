-- Run once in the Supabase SQL Editor after the first admin has signed up
-- and confirmed their email. Replace the example address before running.
DO $$
DECLARE
  target_user uuid;
BEGIN
  SELECT id INTO target_user
  FROM auth.users
  WHERE lower(email) = lower('replace-with-admin-email@example.com')
    AND email_confirmed_at IS NOT NULL;

  IF target_user IS NULL THEN
    RAISE EXCEPTION 'No confirmed user found for the configured admin email';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;
