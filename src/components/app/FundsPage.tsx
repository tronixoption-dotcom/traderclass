import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccountSelect } from "./AccountSelect";
import { PageHeader, PracticeNote } from "./PageHeader";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useStore } from "@/lib/store";
import { TOP_UP_PRESETS, formatMoney, type AccountId } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { MpesaWallet } from "./MpesaWallet";

/** Practice-only deposit / withdrawal screen, laid out like the reference Deposit screen. Virtual money only. */
export function FundsPage({ mode }: { mode: "deposit" | "withdraw" }) {
  const { state, topUp, withdraw, hydrated } = useStore();
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountId>(state.active);
  const [amount, setAmount] = useState(mode === "deposit" ? 5000 : 100);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const deposit = mode === "deposit";

  const submit = () => {
    const err = deposit ? topUp(account, amount) : withdraw(account, amount);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success(deposit ? `${formatMoney(amount)} practice funds added` : `${formatMoney(amount)} practice funds removed`);
    navigate({ to: "/transactions" });
  };

  return (
    <div className="pb-6">
      <PageHeader title={deposit ? "Deposit" : "Withdraw"} compact />
      <div className="px-[16.5px]">
        <MpesaWallet />
        <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          The M-Pesa wallet above holds real KES. The practice controls below change simulated USD/USDT balances only; those balances cannot be deposited or withdrawn.
        </div>
        <p className="pt-[20px] text-[11.5px] leading-[15px] text-muted-foreground">
          Practice {account} Account #{hydrated ? state.userId : "GM••••••••"}
        </p>
        <div className="mt-[8px] mb-[8px] text-[14px] text-muted-foreground">Account</div>
        <AccountSelect value={account} onChange={setAccount} label="Account" chevron="right" className="h-[58px]" />

        <div className="mt-[18px] mb-[8px] text-[14px] text-muted-foreground">{deposit ? "Deposit amount" : "Withdrawal amount"}</div>
        <button
          onClick={() => {
            setText(String(amount));
            setOpen(true);
          }}
          className="flex h-[43px] w-full items-center rounded-[10px] border border-input pl-[15px] pr-[13px] text-left hover:bg-muted/60"
        >
          <span className="tabular flex-1 text-[14.5px] font-bold">{formatMoney(amount)}</span>
          <ChevronRight className="size-[20px] text-muted-foreground" strokeWidth={1.6} />
        </button>

        <div className="mt-[18px] mb-[8px] text-[14px] text-muted-foreground">{deposit ? "Funded with" : "Taken from"}</div>
        <div className="flex h-[55px] items-center rounded-[13px] border border-input pl-[15px] pr-[13px]">
          <span className="grid size-[29px] place-items-center rounded-full bg-primary-soft text-[13px] font-bold text-primary">P</span>
          <span className="ml-[10.5px] flex-1">
            <span className="block text-[14.5px] font-medium leading-[18px]">Practice funds</span>
            <span className="block text-[11.5px] leading-[15px] text-muted-foreground">Virtual money, not real</span>
          </span>
        </div>

        <button onClick={submit} className="mt-[19px] h-[53px] w-full rounded-full bg-primary text-[15.5px] font-bold text-primary-foreground hover:bg-primary/90">
          {deposit ? "Add practice funds" : "Remove practice funds"}
        </button>
        <PracticeNote className="mt-[18px]">Practice funds are virtual. No real money is charged, received or paid out.</PracticeNote>
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="mx-auto max-w-md">
          <DrawerHeader>
            <DrawerTitle>{deposit ? "Deposit amount" : "Withdrawal amount"}</DrawerTitle>
          </DrawerHeader>
          <div className="px-[16.5px] pb-[20px]">
            <div className="flex h-[49px] items-center rounded-[10px] border-2 border-primary px-[14px] text-[17.5px] font-bold">
              $
              <input
                autoFocus
                aria-label="Amount"
                inputMode="decimal"
                value={text}
                onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
                className="tabular ml-[9px] w-full bg-transparent outline-none"
              />
            </div>
            <div className="mt-[9px] flex flex-wrap gap-[9px]">
              {(deposit ? TOP_UP_PRESETS : ([10, 50, 100, 500] as const)).map((p) => (
                <button
                  key={p}
                  onClick={() => setText(String(p))}
                  className={cn("h-[36px] rounded-[7px] border px-[16px] text-[14.5px]", Number(text) === p ? "border-2 border-primary bg-primary-soft px-[15px]" : "border-input hover:bg-muted")}
                >
                  ${p.toLocaleString()}
                </button>
              ))}
              {!deposit && (
                <button onClick={() => setText(String(state.balances[account]))} className="h-[36px] rounded-[7px] border border-input px-[16px] text-[14.5px] hover:bg-muted">
                  All
                </button>
              )}
            </div>
            <button
              disabled={!(Number(text) > 0)}
              onClick={() => {
                setAmount(Number(text));
                setOpen(false);
              }}
              className="mt-[16px] h-[49px] w-full rounded-full bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-50"
            >
              Done
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
