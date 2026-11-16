import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { AccountSelect } from "@/components/app/AccountSelect";
import { pageHead } from "@/components/app/meta";
import { useStore } from "@/lib/store";
import { MIN_TRANSFER, TRANSFER_PRESETS, validateTransfer, type AccountId } from "@/lib/trading";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/transfer")({
  head: () => pageHead("Transfer", "Move demo funds between your USD and USDT accounts."),
  component: TransferPage,
});

function TransferPage() {
  const { state, transfer } = useStore();
  const [from, setFrom] = useState<AccountId>("USD");
  const [to, setTo] = useState<AccountId>("USDT");
  const [text, setText] = useState("50");
  const amount = Number(text);

  const pickFrom = (a: AccountId) => {
    setFrom(a);
    if (a === to) setTo(a === "USD" ? "USDT" : "USD");
  };
  const pickTo = (a: AccountId) => {
    setTo(a);
    if (a === from) setFrom(a === "USD" ? "USDT" : "USD");
  };

  return (
    <div className="pb-6">
      <PageHeader title="Transfer" compact />
      <div className="px-[16.5px]">
        <div className="pt-[20px]">
          <h2 className="text-[14.5px] font-medium leading-[19px]">Transfer between accounts</h2>
          <p className="mt-[2px] text-[12.5px] leading-[15px] text-muted-foreground">Move demo funds between your USD and USDT accounts</p>
        </div>
        <div className="mt-[22px] mb-[8px] text-[13.5px] font-medium leading-[17px]">From</div>
        <AccountSelect value={from} onChange={pickFrom} label="From account" />
        <div className="mt-[18px] mb-[8px] text-[13.5px] font-medium leading-[17px]">To</div>
        <AccountSelect value={to} onChange={pickTo} label="To account" />
        <div className="mt-[16px] mb-[8px] text-[13.5px] font-medium leading-[17px]">Amount</div>
        <div className="flex h-[49px] items-center rounded-[10px] border-2 border-primary px-[14px] text-[17.5px] font-bold">
          $
          <input
            aria-label="Transfer amount"
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
            className="tabular ml-[9px] w-full bg-transparent outline-none"
          />
        </div>
        <div className="mt-[9px] flex flex-wrap gap-x-[9px] gap-y-[9.5px]">
          {TRANSFER_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setText(String(p))}
              className={cn(
                "h-[36px] rounded-[7px] border px-[16px] text-[14.5px]",
                amount === p ? "border-2 border-primary bg-primary-soft px-[15px]" : "border-input hover:bg-muted",
              )}
            >
              ${p}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            const e = transfer(from, to, amount);
            if (e) {
              toast.error(e);
              return;
            }
            toast.success(`$${amount.toFixed(2)} moved to Demo ${to} Account`);
          }}
          className="mt-[17px] h-[53px] w-full rounded-full bg-primary text-[15.5px] font-bold text-primary-foreground"
        >
          Transfer
        </button>
        <p className="mt-[24px] text-center text-[11.5px] leading-[17px] text-muted-foreground">
          Transfers between accounts are instant.
          <br />
          Minimum transfer amount: ${MIN_TRANSFER}
        </p>
        <p className="sr-only">Available: {state.balances[from]}</p>
      </div>
    </div>
  );
}
