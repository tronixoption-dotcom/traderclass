import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { pageHead } from "@/components/app/meta";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/referral")({
  head: () => pageHead("Referral program", "Invite friends to join Tradeclass."),
  component: ReferralPage,
});

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[14px] border border-border bg-card", className)}>{children}</div>;
}

function InfoDot({ tone }: { tone: "primary" | "amber" }) {
  return (
    <span className={cn("grid size-[13px] shrink-0 place-items-center rounded-full text-[9px] font-bold leading-none text-primary-foreground", tone === "primary" ? "bg-primary" : "bg-amber")}>
      i
    </span>
  );
}

function ReferralPage() {
  const { user, profile, hydrated } = useStore();
  const [count, setCount] = useState<number | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!user) return;
    supabase.rpc("my_referral_count").then(({ data }) => setCount(data ?? 0));
  }, [user]);

  const code = profile?.referral_code ?? "";
  const link = code ? `${origin}/auth?ref=${code}` : "";
  const copy = async (text: string, what: string) => {
    await navigator.clipboard?.writeText(text);
    toast.success(`${what} copied`);
  };

  return (
    <div className="min-h-full bg-muted pb-6">
      <PageHeader title="Referral program" compact className="bg-muted" />
      <div className="space-y-[17px] px-[13px] pt-[12px]">
        <Card className="px-[17px] py-[16px] text-center">
          <h2 className="text-[17px] font-bold leading-[22px]">Invite friends to Tradeclass</h2>
          <p className="mt-[6px] text-[13px] leading-[20px] text-muted-foreground">Share your referral link so friends can create their own account</p>
        </Card>

        {hydrated && !user ? (
          <Card className="px-[17px] py-[16px] text-center">
            <p className="text-[13px] text-muted-foreground">Sign in to get your own referral link and code.</p>
            <Link to="/auth" className="mt-[12px] inline-flex h-[40px] items-center rounded-full bg-primary px-[22px] text-[14px] font-semibold text-primary-foreground">
              Sign in
            </Link>
          </Card>
        ) : (
          <>
            <Card className="flex items-center gap-[12px] py-[13px] pl-[17px] pr-[16px]">
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-muted-foreground">Your referral link</div>
                <div className="mt-[3px] break-all font-mono text-[13px] leading-[16px] text-primary">{link || "…"}</div>
              </div>
              <button
                disabled={!link}
                onClick={() => copy(link, "Referral link")}
                className="flex h-[32px] shrink-0 items-center gap-[4px] rounded-full bg-primary px-[16px] text-[14px] font-semibold text-primary-foreground"
              >
                <Copy className="size-[14px]" strokeWidth={2.2} /> Copy
              </button>
            </Card>
            <Card className="flex items-center gap-[12px] py-[13px] pl-[17px] pr-[16px]">
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-muted-foreground">Your referral code</div>
                <div className="mt-[3px] font-mono text-[17px] font-bold tracking-[0.08em]">{code || "…"}</div>
              </div>
              <button
                disabled={!code}
                onClick={() => copy(code, "Referral code")}
                className="flex h-[32px] shrink-0 items-center gap-[4px] rounded-full border border-input bg-muted px-[16px] text-[14px] font-medium"
              >
                <Copy className="size-[14px]" strokeWidth={2.2} /> Copy
              </button>
            </Card>
          </>
        )}

        <div className="grid grid-cols-2 gap-[13px]">
          <Card className="flex h-[76px] flex-col items-center justify-center">
            <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Total referrals</div>
            <div className="tabular mt-[4px] text-[17.5px] font-bold">{count ?? 0}</div>
          </Card>
          <Card className="flex h-[76px] flex-col items-center justify-center">
            <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Link status</div>
            <div className={cn("mt-[4px] text-[17.5px] font-bold", user ? "text-success" : "text-muted-foreground")}>{user ? "Active" : "—"}</div>
          </Card>
        </div>

        <Card className="px-[17px] py-[16px]">
          <div className="flex items-center gap-[10px]">
            <InfoDot tone="primary" />
            <span className="text-[14px] font-semibold">How it works</span>
          </div>
          <ol className="mt-[8px] list-decimal space-y-[4px] pl-[22px] text-[13px] leading-[22px]">
            <li>Share your unique referral link or code with friends.</li>
            <li>When they sign up using your link, they're linked to your account.</li>
            <li>They can create and fund their own trading account.</li>
            <li>Live USDT trading and wallet funding are available separately when enabled.</li>
          </ol>
        </Card>

        <p className="flex items-center justify-center gap-[7px] pt-[4px] text-[12px] text-muted-foreground">
          <InfoDot tone="amber" /> The referral program currently has no cash rewards
        </p>
      </div>
    </div>
  );
}
