ALTER TABLE public.profiles ADD COLUMN phone text NOT NULL DEFAULT '';

UPDATE public.profiles p
SET phone=left(coalesce(nullif(trim(u.raw_user_meta_data->>'phone'),''),nullif(trim(u.phone),''),''),32)
FROM auth.users u
WHERE u.id=p.id;

GRANT UPDATE (phone) ON public.profiles TO authenticated;

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
  requested_phone text;
BEGIN
  new_referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  requested_username := left(coalesce(nullif(trim(NEW.raw_user_meta_data ->> 'username'), ''), split_part(coalesce(NEW.email, 'member'), '@', 1)), 40);
  requested_phone := left(coalesce(nullif(trim(NEW.raw_user_meta_data ->> 'phone'), ''), nullif(trim(NEW.phone), ''), ''), 32);

  SELECT id INTO referrer_id
  FROM public.profiles
  WHERE referral_code = upper(trim(coalesce(NEW.raw_user_meta_data ->> 'ref', '')))
  LIMIT 1;

  INSERT INTO public.profiles (id, username, phone, referral_code, referred_by)
  VALUES (NEW.id, requested_username, requested_phone, new_referral_code, referrer_id);

  RETURN NEW;
END;
$$;
