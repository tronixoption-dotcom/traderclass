import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, MapPin, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";

const countries = [
  { code: "KE", name: "Kenya", dial: "+254" },
  { code: "UG", name: "Uganda", dial: "+256" },
  { code: "TZ", name: "Tanzania", dial: "+255" },
  { code: "RW", name: "Rwanda", dial: "+250" },
  { code: "NG", name: "Nigeria", dial: "+234" },
  { code: "GH", name: "Ghana", dial: "+233" },
  { code: "ZA", name: "South Africa", dial: "+27" },
  { code: "ZM", name: "Zambia", dial: "+260" },
] as const;

type CountryCode = (typeof countries)[number]["code"];

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => {
    const ref = search["ref"];
    const mode = search["mode"];
    const rawRedirect = search["redirect"];
    const redirect = typeof rawRedirect === "string" && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes("\\")
      ? rawRedirect.slice(0, 180)
      : undefined;
    return {
      ...(typeof ref === "string" ? { ref: ref.slice(0, 12) } : {}),
      ...(mode === "in" || mode === "up" ? { mode } : {}),
      ...(redirect ? { redirect } : {}),
    };
  },
  head: () => ({ meta: [{ title: "Sign in or create an account · Tradeclass" }, { name: "description", content: "Access your Tradeclass live USDT trading account." }] }),
  component: AuthPage,
});

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(1, "Enter your password").max(72),
});

const signUpSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Use at least 6 characters").max(72).regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, "Use at least one letter and one number"),
  username: z.string().trim().min(3, "Username must have at least 3 characters").max(32).regex(/^[A-Za-z0-9_.-]+$/, "Use letters, numbers, dots, dashes or underscores"),
  country: z.enum(["KE", "UG", "TZ", "RW", "NG", "GH", "ZA", "ZM"]),
  mobile: z.string().regex(/^\d{7,14}$/, "Enter a valid mobile number"),
  referral: z.string().max(12),
});

function Brand() {
  return <Link to="/" className="flex items-center gap-2.5" aria-label="Tradeclass home"><span className="grid size-9 place-items-center rounded-xl bg-[#dc2626] text-[#ffffff]"><span className="text-lg font-black">T</span></span><span className="text-[15px] font-extrabold text-white">Trade<span className="text-[#dc2626]">class</span></span></Link>;
}

function AuthPage() {
  const { ref, mode: requestedMode, redirect } = Route.useSearch();
  const { user, authReady } = useStore();
  const [mode, setMode] = useState<"in" | "up">(requestedMode === 'up' ? 'up' : ref ? 'up' : 'in');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [country, setCountry] = useState<CountryCode>("KE");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState(ref ?? "");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const selectedCountry = countries.find((item) => item.code === country) ?? countries[0];

  useEffect(() => {
    if (authReady && user) window.location.assign(redirect || "/");
  }, [authReady, user, redirect]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === "in") {
      const parsed = signInSchema.safeParse({ email, password });
      if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check your details"); return; }
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password });
      setBusy(false);
      if (error) toast.error(error.message === "Invalid login credentials" ? "Wrong email or password" : error.message);
      return;
    }

    const parsed = signUpSchema.safeParse({ email, password, username, country, mobile, referral: code.trim() });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check your details"); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          username: parsed.data.username,
          ref: parsed.data.referral.trim().toUpperCase(),
          country: selectedCountry.name,
          phone: `${selectedCountry.dial}${parsed.data.mobile.replace(/^0/, '')}`,
        },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else if (!data.session) toast.error("The hosted Supabase project still requires email confirmation. Disable Confirm email in its Authentication settings.");
    else toast.success("Account created. You can use your account now.");
  };

  const inputClass = "h-[48px] w-full rounded-xl border border-white/10 bg-[#07150f] px-3.5 text-sm text-white outline-none placeholder:text-green-100/45 focus:border-[#dc2626]/70 focus:ring-2 focus:ring-[#dc2626]/10";
  const labelClass = "mb-1.5 block text-xs font-semibold text-white/85";

  return (
    <main className="auth-page min-h-dvh bg-[#071b14] text-white">
      <header className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-5 sm:px-8"><Brand/><Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold text-white/70 transition hover:text-white"><ArrowLeft className="size-4"/> Back to home</Link></header>
      <div className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1240px] items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[1fr_.88fr] lg:gap-20 lg:py-12">
        <section className="hidden max-w-[540px] lg:block">
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] text-[#fca5a5]"><span className="size-1.5 rounded-full bg-green-400"/> Secure market access</div>
          <h1 className="mt-6 text-6xl font-extrabold leading-[1.03] tracking-[-.05em]">Trade with <span className="text-[#fca5a5]">clarity.</span><br/>Move with confidence.</h1>
          <p className="mt-6 max-w-[430px] text-base leading-7 text-white/70">A focused trading workspace for market access, account activity and secure funding controls.</p>
          <ul className="mt-8 space-y-4 text-sm text-white/85"><li className="flex items-center gap-3"><ShieldCheck className="size-4 text-green-300"/> A private customer session</li><li className="flex items-center gap-3"><ShieldCheck className="size-4 text-green-300"/> Funded USDT trading account</li><li className="flex items-center gap-3"><ShieldCheck className="size-4 text-green-300"/> Deposits and withdrawals in your account</li></ul>
        </section>

        <section className="mx-auto w-full max-w-[490px] rounded-[24px] border border-white/10 bg-[#0b2119] p-5 shadow-[0_24px_90px_rgba(0,0,0,.3)] sm:p-8">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#fca5a5]">{mode === "up" ? "Create your account" : "Welcome back"}</p><h2 className="mt-2 text-2xl font-bold tracking-tight">{mode === "up" ? "Start your journey" : "Sign in to your workspace"}</h2><p className="mt-2 text-xs leading-5 text-white/70">{mode === "up" ? "Set up your customer profile in under a minute." : "Enter your details to continue to your private dashboard."}</p></div><span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#dc2626]/20 bg-[#dc2626]/[.08] text-[#fca5a5]"><ShieldCheck className="size-5"/></span></div>

          <div className="mt-6 grid grid-cols-2 rounded-xl bg-[#07150f] p-1" role="tablist" aria-label="Account access">
            {(["up", "in"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => setMode(item)} className={`h-10 rounded-lg text-xs font-bold transition ${mode === item ? "bg-[#dc2626] text-[#ffffff] shadow" : "text-white/70 hover:text-white"}`}>{item === "up" ? "Create account" : "Sign in"}</button>)}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-3.5">
            <label className="block"><span className={labelClass}>Email address</span><span className="relative block"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-green-100/60"/><input className={`${inputClass} pl-10`} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"/></span></label>
            {mode === "up" && <>
              <label className="block"><span className={labelClass}>Username</span><span className="relative block"><UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-green-100/60"/><input className={`${inputClass} pl-10`} autoComplete="nickname" required minLength={3} maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="your_username"/></span></label>
              <label className="block"><span className={labelClass}>Country of residence <span className="text-[#fca5a5]">*</span></span><span className="relative block"><MapPin className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-green-100/60"/><select className={`${inputClass} appearance-none pl-10`} value={country} onChange={(event) => setCountry(event.target.value as CountryCode)}>{countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></span></label>
              <label className="block"><span className={labelClass}>Mobile <span className="text-[#fca5a5]">*</span></span><span className="flex h-[48px] items-center rounded-xl border border-white/10 bg-[#07150f] focus-within:border-[#dc2626]/70 focus-within:ring-2 focus-within:ring-[#dc2626]/10"><span className="flex h-full items-center gap-2 border-r border-white/10 px-3 text-sm font-semibold text-white"><Phone className="size-4 text-green-100/60"/>{selectedCountry.dial}</span><input className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-green-100/45" type="tel" inputMode="numeric" autoComplete="tel-national" required value={mobile} onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 14))} placeholder="712 345 678"/></span></label>
              <label className="block"><span className={labelClass}>Referral code <span className="font-normal text-green-100/60">(optional)</span></span><input className={`${inputClass} font-mono uppercase tracking-wider`} autoComplete="off" maxLength={12} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="OPTIONAL CODE"/></label>
            </>}
            <label className="block"><span className={labelClass}>Password</span><span className="relative block"><LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-green-100/60"/><input className={`${inputClass} pl-10 pr-12`} type={showPassword ? "text" : "password"} autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={mode === "up" ? 6 : 1} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••"/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((show) => !show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-green-100/60 hover:text-white">{showPassword ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}</button></span>{mode === "up" && <span className="mt-1.5 block text-[10px] text-green-100/60">Use at least 6 characters with a letter and number.</span>}</label>
            <button disabled={busy} className="mt-1 inline-flex h-[49px] w-full items-center justify-center gap-2 rounded-xl bg-[#dc2626] text-sm font-extrabold text-[#ffffff] transition hover:bg-[#b91c1c] disabled:cursor-wait disabled:opacity-60">{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}<ArrowRight className="size-4"/></button>
          </form>

          <p className="mt-5 text-center text-[11px] text-green-100/60">{mode === "up" ? "Already have an account?" : "New to Tradeclass?"} <button type="button" onClick={() => setMode(mode === "up" ? "in" : "up")} className="font-bold text-white hover:text-[#fca5a5]">{mode === "up" ? "Sign in" : "Create an account"}</button></p>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-green-100/45"><LockKeyhole className="size-3"/> Your credentials are handled securely.</p>
        </section>
      </div>
    </main>
  );
}
