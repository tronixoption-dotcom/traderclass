CREATE TABLE public.admin_session_unlocks (session_id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL);
GRANT ALL ON public.admin_session_unlocks TO service_role;
ALTER TABLE public.admin_session_unlocks ENABLE ROW LEVEL SECURITY;
