import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ChevronRight, History, List, LogIn, LogOut, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { pageHead } from "@/components/app/meta";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useStore } from "@/lib/store";
import { STARTING_BALANCE, formatMoney } from "@/lib/trading";

export const Route = createFileRoute("/account")({
  head: () => pageHead("Account", "Your practice balance, funds, transfers, history and settings."),
  component: AccountPage,
});

const ic = "size-[20px] shrink-0";

const GiftFill = () => (
  <svg viewBox="0 0 24 24" className={ic} fill="currentColor" aria-hidden>
    <path d="M8.2 2.5c1.5 0 2.8 1 3.8 2.6 1-1.6 2.3-2.6 3.8-2.6a2.8 2.8 0 0 1 2.3 4.4H21a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1h-8V7h-2v5H3a1 1 0 0 1-1-1V7.9a1 1 0 0 1 1-1h2.9a2.8 2.8 0 0 1 2.3-4.4Zm0 2a.8.8 0 0 0 0 1.6h2.3c-.7-1.1-1.5-1.6-2.3-1.6Zm7.6 0c-.8 0-1.6.5-2.3 1.6h2.3a.8.8 0 0 0 0-1.6ZM3.5 13.5H11V22H5a1.5 1.5 0 0 1-1.5-1.5Zm9.5 0h7.5v7A1.5 1.5 0 0 1 19 22h-6Z" />
  </svg>
);
const CopyFill = () => (
  <svg viewBox="0 0 24 24" className={ic} fill="currentColor" aria-hidden>
    <path d="M9 2h7.6L21 6.4V16a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
    <path d="M5 6v12.5A3.5 3.5 0 0 0 8.5 22H16v-2H8.5A1.5 1.5 0 0 1 7 18.5V6Z" />
  </svg>
);
const PlaneFill = () => (
  <svg viewBox="0 0 24 24" className={ic} fill="currentColor" aria-hidden>
    <path d="M22.2 2.2 1.8 10.1c-.9.4-.8 1.6.1 1.9l5.3 1.6L18 6.2l-8.6 8.9-.1 6c0 .8 1 1.2 1.6.6l3-3.1 4.6 3.4c.6.4 1.4.1 1.6-.6L23.5 3.4c.2-.8-.6-1.5-1.3-1.2Z" />
  </svg>
);
const HalfCircle = () => (
  <svg viewBox="0 0 24 24" className={ic} aria-hidden>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.6" />
    <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
  </svg>
);
const InfoFill = () => (
  <svg viewBox="0 0 24 24" className={ic} aria-hidden>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <circle cx="12" cy="7.6" r="1.4" fill="var(--background)" />
    <path d="M10.6 10.5h2.2v6.3h1.2v1.4h-4v-1.4h1.2v-4.9h-.6z" fill="var(--background)" />
  </svg>
);
const UserOutline = () => (
  <svg viewBox="0 0 24 24" className={ic} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <circle cx="12" cy="7.5" r="4.2" />
    <path d="M4 21.2v-.7c0-3 2.5-5.4 5.5-5.4h5c3 0 5.5 2.4 5.5 5.4v.7z" />
  </svg>
);

const links = [
  { to: "/deposit", label: "M-Pesa deposit", icon: <ArrowDownToLine className={ic} strokeWidth={2.2} /> },
  { to: "/withdraw", label: "M-Pesa withdrawal", icon: <ArrowUpFromLine className={ic} strokeWidth={2.2} /> },
  { to: "/transfer", label: "Transfer", icon: <ArrowLeftRight className={ic} strokeWidth={2.2} /> },
  { to: "/transactions", label: "Transactions", icon: <List className={ic} strokeWidth={2.2} /> },
  { to: "/referral", label: "Referral program", icon: <GiftFill /> },
  { to: "/trades", label: "Trade history", icon: <History className={ic} strokeWidth={2.2} /> },
  { to: "/copy-trading", label: "Copy trading", icon: <CopyFill /> },
  { to: "/community", label: "Join our community", icon: <PlaneFill /> },
] as const;
const after = [
  { to: "/profile", label: "Profile", icon: <UserOutline /> },
  { to: "/about", label: "About us", icon: <InfoFill /> },
] as const;
type RowTo = (typeof links)[number]["to"] | (typeof after)[number]["to"];

function Row({ to, label, icon }: { to: RowTo; label: string; icon: ReactNode }) {
  return (
    <Link to={to} className="menu-row">
      <span className="text-primary">{icon}</span>
      <span className="ml-[12px] flex-1">{label}</span>
      <ChevronRight className="size-[18px] text-foreground/70" strokeWidth={2} />
    </Link>
  );
}

function AccountPage() {
  const { state, setTheme, reset, hydrated, user, profile, signOut } = useStore();
  const dark = state.theme === "dark";
  return (
    <div className="pb-[14px]">
      <PageHeader title="Account" />
      <div className="mt-[3px] flex items-center px-[20px]">
        <span className="grid size-[45px] place-items-center rounded-full bg-muted text-muted-foreground">
          <UserRound className="size-[22px]" fill="currentColor" strokeWidth={1.5} />
        </span>
        <div className="ml-[15px]">
          <div className="text-[16.5px] font-bold leading-[20px]">{profile?.username ?? state.name}</div>
          <div className="mt-[1px] text-[12.5px] leading-[16px] text-muted-foreground">ID {hydrated ? state.userId : "GM••••••••"}</div>
        </div>
      </div>
      <div className="mx-[16px] flex h-[43px] items-center justify-between border-b border-border px-[4.5px]">
        <span className="text-[14.5px] text-muted-foreground">Practice balance</span>
        <span className="tabular text-[16.5px] font-bold">{formatMoney(state.balances[state.active], state.active)}</span>
      </div>

      <div className="space-y-[7px] px-[20px] pt-[12.5px]">
        {hydrated && !user && (
          <Link to="/auth" className="menu-row border-primary bg-primary-soft text-primary">
            <LogIn className={ic} strokeWidth={2.2} />
            <span className="ml-[12px] flex-1">Sign in to save your account</span>
            <ChevronRight className="size-[18px]" strokeWidth={2} />
          </Link>
        )}
        {links.map((l) => (
          <Row key={l.to} {...l} />
        ))}
        <label className="menu-row cursor-pointer">
          <span className="text-amber">
            <HalfCircle />
          </span>
          <span className="ml-[12px] flex-1">Theme</span>
          <span className="mr-[11px] text-[12px] font-normal text-muted-foreground">{dark ? "Dark" : "Light"}</span>
          <Switch checked={!dark} onCheckedChange={(v) => setTheme(v ? "light" : "dark")} aria-label="Light theme" />
        </label>
        {after.map((l) => (
          <Row key={l.to} {...l} />
        ))}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="menu-row text-destructive">
              <LogOut className={`${ic} rotate-180`} strokeWidth={2.2} />
              <span className="ml-[12px] flex-1">Log out</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Log out?</AlertDialogTitle>
              <AlertDialogDescription>
                {user
                  ? "Your practice account is saved online. Sign in again any time to pick up where you left off."
                  : `You're not signed in, so this account is only on this device. Logging out clears your trades and history and starts a fresh account with ${STARTING_BALANCE.toLocaleString()} in each balance.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (user) {
                    await signOut();
                    toast.success("Logged out");
                  } else {
                    reset();
                    toast.success("Logged out. A fresh practice account is ready.");
                  }
                }}
              >
                Log out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
