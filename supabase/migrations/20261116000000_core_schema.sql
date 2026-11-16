-- Core user data used by the practice workspace.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL DEFAULT '',
  referral_code text NOT NULL UNIQUE,
  referred_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_referred_by_idx ON public.profiles(referred_by);
CREATE INDEX profiles_created_at_idx ON public.profiles(created_at DESC);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (username) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users update own username" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TABLE public.practice_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_accounts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.practice_accounts TO authenticated;
GRANT ALL ON public.practice_accounts TO service_role;
CREATE POLICY "Users read own practice account" ON public.practice_accounts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users create own practice account" ON public.practice_accounts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own practice account" ON public.practice_accounts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_referral_code text;
  referrer_id uuid;
  requested_username text;
BEGIN
  new_referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  requested_username := left(coalesce(nullif(trim(NEW.raw_user_meta_data ->> 'username'), ''), split_part(coalesce(NEW.email, 'member'), '@', 1)), 40);

  SELECT id INTO referrer_id
  FROM public.profiles
  WHERE referral_code = upper(trim(coalesce(NEW.raw_user_meta_data ->> 'ref', '')))
  LIMIT 1;

  INSERT INTO public.profiles (id, username, referral_code, referred_by)
  VALUES (NEW.id, requested_username, new_referral_code, referrer_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_referral_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.profiles WHERE referred_by = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_referral_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referral_count() TO authenticated;
