import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader, PracticeNote } from "@/components/app/PageHeader";
import { pageHead } from "@/components/app/meta";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { ref?: string } => {
    const ref = s["ref"];
    return typeof ref === "string" ? { ref: ref.slice(0, 12) } : {};
  },
  head: () => pageHead("Sign in", "Sign in or create an account to save your practice trading progress."),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  username: z.string().trim().max(40).optional(),
});

function GoogleG() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

function AuthPage() {
  const { ref } = Route.useSearch();
  const { user } = useStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">(ref ? "up" : "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState(ref ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/account" });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password, username: username || undefined });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password });
      setBusy(false);
      if (error) toast.error(error.message === "Invalid login credentials" ? "Wrong email or password" : error.message);
      return;
    }
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { username: parsed.data.username ?? "", ref: code.trim().toUpperCase() },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else setSent(true);
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error("Google sign-in didn't work. Please try again.");
  };

  const field = "h-[49px] w-full rounded-[10px] border border-input bg-background px-[14px] text-[15px] outline-none focus:border-2 focus:border-primary focus:px-[13px]";

  return (
    <div className="pb-6">
      <PageHeader title={mode === "in" ? "Sign in" : "Create account"} />
      <div className="px-[21px] pt-[16px]">
        <div className="grid grid-cols-2" role="tablist">
          {(["in", "up"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setSent(false);
              }}
              className={cn("h-[44px] border-b-[3px] text-[15px]", mode === m ? "border-primary font-bold" : "border-transparent font-medium text-muted-foreground")}
            >
              {m === "in" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        {sent ? (
          <div className="mt-[24px] rounded-[14px] border border-border p-[18px] text-center">
            <div className="text-[16px] font-bold">Check your email</div>
            <p className="mt-[6px] text-[13px] text-muted-foreground">We sent a link to {email}. Open it to finish creating your account, then sign in.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-[18px] space-y-[12px]">
            {mode === "up" && (
              <label className="block">
                <span className="mb-[6px] block text-[13.5px] text-muted-foreground">Username</span>
                <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} autoComplete="nickname" className={field} />
              </label>
            )}
            <label className="block">
              <span className="mb-[6px] block text-[13.5px] text-muted-foreground">Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={field} />
            </label>
            <label className="block">
              <span className="mb-[6px] block text-[13.5px] text-muted-foreground">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                className={field}
              />
            </label>
            {mode === "up" && (
              <label className="block">
                <span className="mb-[6px] block text-[13.5px] text-muted-foreground">Referral code (optional)</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} className={cn(field, "font-mono uppercase tracking-wider")} />
              </label>
            )}
            <button disabled={busy} className="mt-[6px] h-[53px] w-full rounded-full bg-primary text-[15.5px] font-bold text-primary-foreground disabled:opacity-60">
              {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}

        <div className="my-[16px] flex items-center gap-3 text-[12px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>
        <button
          type="button"
          onClick={google}
          className="flex h-[49px] w-full items-center justify-center gap-[10px] rounded-full border border-google-border bg-google px-[12px] text-[14px] font-medium text-google-foreground"
        >
          <GoogleG />
          Continue with Google
        </button>
        <PracticeNote className="mt-[18px]">Your account saves your practice balance, trades and settings. No real money is used.</PracticeNote>
      </div>
    </div>
  );
}
