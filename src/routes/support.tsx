import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Headset, SendHorizontal } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { pageHead } from "@/components/app/meta";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PAYOUT_MULTIPLIER, STARTING_BALANCE } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/support")({
  head: () => pageHead("Support", "Chat with the Tradeclass support assistant about your account."),
  component: SupportPage,
});

type Topic = { q: string; a: string; keys: string[] };
const TOPICS: Topic[] = [
  { q: "Are deposits and trades real?", keys: ["real", "money", "deposit", "withdraw", "cash"], a: "Deposits and withdrawals use the payment methods in your account. Crypto deposits are credited after staff verify the transaction on the selected network; withdrawal requests reserve the amount until paid or rejected. USDT contracts settle against OKX crypto market prices inside Tradeclass." },
  { q: "How does a trade work?", keys: ["trade", "buy", "sell", "how", "work"], a: "Pick a market, a duration and a stake, then tap BUY if you think the price will be higher when time runs out, or SELL if you think it will be lower." },
  { q: "How much does a win pay?", keys: ["pay", "payout", "win", "profit", "8.50"], a: `A winning trade pays your stake × ${PAYOUT_MULTIPLIER} (a $5 stake pays $8.50). A losing trade loses the stake. If the price is exactly the same, your stake is returned.` },
  { q: "Are the prices real?", keys: ["price", "chart", "real", "market"], a: "Prices are generated internally and are not live prices from an external exchange. Tradeclass uses those prices to settle timed contracts." },
  { q: "How do I fund my account?", keys: ["balance", "funds", "deposit", "wallet"], a: "Open the deposit page to view supported payment methods and your account balances. Deposits are credited after staff review." },
  { q: "What does the Robot do?", keys: ["robot", "bot", "auto", "copy"], a: "The Robot can place USDT trades on listed markets using your Tradeclass balance and OKX crypto market prices. Set a stop loss and take profit, and monitor it while running." },
  { q: "How do the chart tools work?", keys: ["draw", "tool", "line", "fib", "ruler", "magnet"], a: "Pick a tool on the left of the chart, then tap two points on the chart. Tap the bin icon at the bottom of the tools to remove your drawings." },
];

type Msg = { from: "me" | "bot"; text: string };

function answer(text: string): string {
  const t = text.toLowerCase();
  let best: Topic | null = null;
  let score = 0;
  for (const topic of TOPICS) {
    const s = topic.keys.filter((k) => t.includes(k)).length;
    if (s > score) {
      score = s;
      best = topic;
    }
  }
  return best ? best.a : "I'm the Tradeclass support assistant. I can answer questions about accounts, funding, trades, payouts, charts and the Robot. Try one of the questions above.";
}

function SupportPage() {
  return (
    <div>
      <PageHeader title="Support" className="h-[56px]" />
      <div className="px-[20px] pt-[26px]">
        <h2 className="text-[16.5px] font-bold leading-[22px]">Need help?</h2>
        <p className="mt-[16px] text-[14.5px] leading-[20px] text-muted-foreground">Our 24/7 support assistant is ready to answer your questions.</p>
        <Sheet>
          <SheetTrigger asChild>
            <button className="mt-[30px] flex h-[71px] w-full items-center rounded-[15px] border border-border pl-[15.5px] text-left hover:bg-muted/60">
              <span className="grid size-[40.5px] place-items-center rounded-full bg-primary text-primary-foreground">
                <Headset className="size-[20px]" strokeWidth={2.2} />
              </span>
              <span className="ml-[13.5px]">
                <span className="block text-[15.5px] font-bold leading-[20px]">Chat with support</span>
                <span className="block text-[11.5px] leading-[15px] text-muted-foreground">How can we help?</span>
              </span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="mx-auto flex h-[85dvh] max-w-md flex-col gap-0 rounded-t-[18px] p-0">
            <SheetHeader className="border-b border-border px-4 py-3">
              <SheetTitle className="text-[15.5px]">Chat with support</SheetTitle>
            </SheetHeader>
            <Chat />
          </SheetContent>
        </Sheet>
        <SupportTickets />
      </div>
    </div>
  );
}

function SupportTickets() {
  const { user } = useStore();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const tickets = useQuery({ queryKey: ['my-support-tickets', user?.id], enabled: !!user, refetchInterval: 15000, queryFn: async () => {
    if (!user) return [];
    const { data, error } = await supabase.from('support_tickets').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) throw new Error('Could not load support tickets');
    return data ?? [];
  } });
  return <section className="mt-8 space-y-4 border-t border-border py-5"><h2 className="font-bold">Contact the support team</h2>{!user ? <Button asChild variant="outline"><Link to="/auth">Sign in to contact support</Link></Button> : <><form className="space-y-3" onSubmit={async e => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from('support_tickets').insert({ user_id: user.id, subject: subject.trim(), message: message.trim() });
    setBusy(false); if (error) toast.error('Could not send your request'); else { setSubject(''); setMessage(''); toast.success('Sent to support'); tickets.refetch(); }
  }}><Input aria-label="Support subject" placeholder="Subject" required maxLength={120} value={subject} onChange={e => setSubject(e.target.value)} /><Textarea aria-label="Support message" placeholder="Your message" required maxLength={4000} value={message} onChange={e => setMessage(e.target.value)} /><Button disabled={busy || !subject.trim() || !message.trim()}>Send request</Button></form>{tickets.isError && <p className="text-sm text-destructive">Could not load your requests.</p>}{tickets.data?.map(t => <article key={t.id} className="space-y-2 rounded-lg border border-border p-3"><div className="flex justify-between gap-2"><h3 className="break-words text-sm font-bold">{t.subject}</h3><span className="text-xs text-muted-foreground">{t.status}</span></div><p className="whitespace-pre-wrap break-words text-sm">{t.message}</p>{t.reply && <div className="border-t border-border pt-2"><span className="text-xs font-bold text-primary">Support reply</span><p className="whitespace-pre-wrap break-words text-sm">{t.reply}</p></div>}</article>)}</>}</section>;
}

function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "bot", text: "Welcome to Tradeclass support. How can I help?" }]);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  const send = (q: string, a?: string) => {
    const clean = q.trim();
    if (!clean) return;
    setMsgs((m) => [...m, { from: "me", text: clean }]);
    setText("");
    setTimeout(() => setMsgs((m) => [...m, { from: "bot", text: a ?? answer(clean) }]), 450);
  };

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {TOPICS.map((t) => (
            <button key={t.q} onClick={() => send(t.q, t.a)} className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[12px] hover:bg-muted">
              {t.q}
            </button>
          ))}
        </div>
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.from === "me" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-[14px] px-3 py-2 text-[13px] leading-[18px]",
                m.from === "me" ? "rounded-br-[4px] bg-primary text-primary-foreground" : "rounded-bl-[4px] bg-muted text-foreground",
              )}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message"
          aria-label="Message"
          className="h-[40px] flex-1 rounded-full border border-input bg-background px-4 text-[13.5px] outline-none focus:border-primary"
        />
        <button type="submit" aria-label="Send" className="grid size-[40px] place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50" disabled={!text.trim()}>
          <SendHorizontal className="size-[18px]" />
        </button>
      </form>
    </>
  );
}
