import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Bot, ChartNoAxesCombined, ShieldCheck, WalletCards } from "lucide-react";

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Tradeclass home">
      <span className="grid size-9 place-items-center rounded-xl bg-[#eab84e] text-[#111b2c]"><ChartNoAxesCombined className="size-5" strokeWidth={2.5} /></span>
      <span className="text-[17px] font-extrabold tracking-tight text-foreground">Trade<span className="text-[#eab84e]">class</span></span>
    </Link>
  );
}

function MarketPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[590px]">
      <div className="absolute -inset-8 rounded-[50%] bg-[#d7a743]/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-[26px] border border-border bg-card p-5 shadow-xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">Trading workspace</p><h2 className="mt-2 text-lg font-bold text-foreground">BTC / USDT</h2></div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-300">LIVE MARKETS</span>
        </div>
        <div className="mt-5 flex items-end justify-between gap-4">
          <div><div className="font-mono text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Live quote</div><div className="mt-1 flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-300"><ArrowUpRight className="size-4" /> OKX market price</div></div>
          <div className="hidden gap-1 rounded-lg bg-white/5 p-1 text-[11px] text-slate-400 sm:flex">{["1m", "5m", "15m", "1h"].map((t, i) => <span key={t} className={`rounded-md px-2 py-1 ${i === 1 ? "bg-[#eab84e] font-bold text-[#101a2a]" : ""}`}>{t}</span>)}</div>
        </div>
        <div className="mt-5 h-[190px] overflow-hidden rounded-xl bg-muted p-2 sm:h-[230px]">
          <svg viewBox="0 0 540 220" className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Illustrative market chart preview">
            <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#eab84e" stopOpacity=".23"/><stop offset="1" stopColor="#eab84e" stopOpacity="0"/></linearGradient></defs>
            {[35, 80, 125, 170, 210].map((y) => <line key={y} x1="0" x2="540" y1={y} y2={y} stroke="white" strokeOpacity=".08" strokeDasharray="4 7" />)}
            {[70, 170, 270, 370, 470].map((x) => <line key={x} x1={x} x2={x} y1="0" y2="220" stroke="white" strokeOpacity=".045" />)}
            <path d="M0 167 L25 157 L48 163 L72 130 L95 142 L119 120 L143 131 L166 108 L190 117 L214 92 L238 110 L262 80 L285 95 L309 62 L333 78 L357 50 L381 67 L405 39 L429 57 L452 29 L476 42 L500 17 L522 31 L540 12 L540 220 L0 220Z" fill="url(#chartFill)" />
            <path d="M0 167 L25 157 L48 163 L72 130 L95 142 L119 120 L143 131 L166 108 L190 117 L214 92 L238 110 L262 80 L285 95 L309 62 L333 78 L357 50 L381 67 L405 39 L429 57 L452 29 L476 42 L500 17 L522 31 L540 12" fill="none" stroke="#efc15c" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            <circle cx="540" cy="12" r="5" fill="#efc15c"/><circle cx="540" cy="12" r="11" fill="#efc15c" fillOpacity=".18"/>
          </svg>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[{ label: "Markets", value: "OKX crypto" }, { label: "Account", value: "Live USDT" }, { label: "Funding", value: "Crypto · M-Pesa" }].map((item) => <div key={item.label} className="rounded-xl bg-muted px-3 py-2.5"><div className="text-[10px] uppercase tracking-[.14em] text-muted-foreground">{item.label}</div><div className="mt-1 text-xs font-semibold text-foreground">{item.value}</div></div>)}
        </div>
      </div>
      <div className="absolute -bottom-5 -left-5 hidden items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xl sm:flex"><span className="grid size-9 place-items-center rounded-xl bg-emerald-300/10 text-emerald-700 dark:text-emerald-300"><ArrowDownRight className="size-5"/></span><span><span className="block text-[11px] text-muted-foreground">Live account</span><span className="block text-sm font-semibold text-foreground">Funded USDT trading</span></span></div>
    </div>
  );
}

const features = [
  { icon: ChartNoAxesCombined, title: "A clearer market view", text: "Follow supported OKX crypto markets in one focused workspace, with live prices and chart tools close at hand." },
  { icon: Bot, title: "Manual and automated trading", text: "Use the strategy robot with your funded USDT account." },
  { icon: WalletCards, title: "Funding in one place", text: "Submit deposits, request withdrawals and review wallet activity from your account." },
];

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-hidden bg-background text-foreground">
      <header className="relative z-10 border-b border-border bg-background">
        <div className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between px-5 sm:px-8">
          <Brand />
          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex" aria-label="Main navigation">
            <a href="#markets" className="transition hover:text-foreground">Markets</a><a href="#tools" className="transition hover:text-foreground">Tools</a><a href="#about" className="transition hover:text-foreground">About</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/auth" search={{ mode: "in" }} className="hidden rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted sm:inline-flex">Sign in</Link>
            <Link to="/auth" search={{ mode: "up" }} className="inline-flex items-center gap-2 rounded-lg bg-[#eab84e] px-4 py-2.5 text-sm font-bold text-[#101a2a] transition hover:bg-[#f1c96f] sm:px-5">Open an account <ArrowRight className="size-4" /></Link>
          </div>
        </div>
      </header>

      <main>
        <section id="markets" className="relative isolate">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_18%_18%,hsl(var(--primary)/.08),transparent_46%),radial-gradient(ellipse_at_86%_55%,rgba(213,163,62,.08),transparent_40%)]" />
          <div className="mx-auto grid min-h-[650px] max-w-[1240px] items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[.95fr_1.05fr] lg:gap-10 lg:py-20">
            <div className="max-w-[570px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#eab84e]/20 bg-[#eab84e]/[.07] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.18em] text-[#f1c96f]"><span className="size-1.5 rounded-full bg-emerald-400"/> Your markets. Your account.</div>
              <h1 className="mt-7 text-[clamp(2.8rem,6.4vw,5.25rem)] font-extrabold leading-[.99] tracking-[-.055em] text-foreground">Make your next move <span className="text-[#edbd58]">with clarity.</span></h1>
              <p className="mt-6 max-w-[500px] text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">A focused trading workspace for supported OKX crypto markets, with a funded USDT account and crypto funding options.</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/auth" search={{ mode: "up" }} className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#eab84e] px-5 text-sm font-bold text-[#101a2a] transition hover:bg-[#f1c96f]">Create your account <ArrowRight className="size-4"/></Link>
                <Link to="/auth" search={{ mode: "in" }} className="inline-flex h-12 items-center rounded-lg border border-border px-5 text-sm font-semibold text-foreground transition hover:bg-muted">Client sign in</Link>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-300"/> Private customer workspace</span>
                <span className="inline-flex items-center gap-2"><ChartNoAxesCombined className="size-4 text-[#edbd58]"/> Live USDT trading</span>
              </div>
            </div>
            <MarketPreview />
          </div>
          <div className="border-y border-border bg-muted/40">
            <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-4 px-5 py-5 text-center sm:grid-cols-4 sm:px-8">
              {["Supported crypto markets", "OKX live prices", "Funded USDT wallet", "Crypto and M-Pesa funding"].map((x) => <div key={x} className="text-xs font-semibold tracking-wide text-slate-300 sm:text-sm">{x}</div>)}
            </div>
          </div>
        </section>

        <section id="tools" className="bg-background py-20 text-foreground sm:py-24">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
            <div className="max-w-2xl"><p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#a67d25]">Built for your routine</p><h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Your markets and account tools in one place.</h2><p className="mt-4 max-w-xl leading-7 text-muted-foreground">Keep your attention on the market. Tradeclass brings charts, manual trading, the robot, wallet funding and account activity together.</p></div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">{features.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-border bg-card p-6 shadow-sm"><span className="grid size-11 place-items-center rounded-xl bg-[#f7edda] text-[#a67d25]"><Icon className="size-5"/></span><h3 className="mt-5 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></article>)}</div>
          </div>
        </section>

        <section id="about" className="bg-muted py-16 sm:py-20">
          <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-8 px-5 sm:px-8 md:flex-row md:items-center">
            <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#edbd58]">Start in your own time</p><h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Trade with a funded USDT account.</h2><p className="mt-4 text-sm leading-6 text-muted-foreground">Create an account to access live USDT trading and account funding tools. Timed contracts use OKX crypto market prices.</p></div>
            <Link to="/auth" search={{ mode: "up" }} className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-[#eab84e] px-5 text-sm font-bold text-[#101a2a] transition hover:bg-[#f1c96f]">Get started <ArrowUpRight className="size-4"/></Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8"><Brand/><span>Tradeclass · Live USDT trading.</span><Link to="/auth" search={{ mode: "in" }} className="font-semibold text-foreground hover:underline">Client sign in</Link></div>
      </footer>
    </div>
  );
}
