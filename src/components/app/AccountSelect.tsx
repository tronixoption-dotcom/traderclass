import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatMoney, type AccountId } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { AccountIcon } from "./icons";

/** Account card with an inline list that opens over the content below, as in the reference Transfer screen. */
export function AccountSelect({
  value,
  onChange,
  label,
  chevron = "down",
  className,
  suffix = "",
}: {
  value: AccountId;
  onChange: (a: AccountId) => void;
  label: string;
  chevron?: "down" | "right";
  className?: string;
  suffix?: string;
}) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const Chevron = chevron === "right" ? ChevronRight : ChevronDown;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn("flex h-[55px] w-full items-center rounded-[13px] border border-input pl-[15px] pr-[13px] text-left hover:bg-muted/60", className)}
      >
        <AccountIcon account={value} />
        <span className="ml-[10.5px] flex-1">
          <span className="block text-[13.5px] font-medium leading-[17px]">Practice {value} Account</span>
          <span className="tabular block text-[11.5px] leading-[15px] text-muted-foreground">{formatMoney(state.balances[value], value)}{suffix}</span>
        </span>
        <Chevron className={cn(chevron === "right" ? "size-[20px]" : "size-[24px]", "text-muted-foreground")} strokeWidth={1.6} />
      </button>
      {open && (
        <div role="listbox" className="absolute inset-x-0 top-[calc(100%+4.5px)] z-30 overflow-hidden rounded-[13px] border border-input bg-popover py-[8.5px] shadow-[0_6px_16px_rgba(0,0,0,0.08)]">
          {(["USD", "USDT"] as AccountId[]).map((id) => (
            <button
              type="button"
              role="option"
              aria-selected={id === value}
              key={id}
              onClick={() => {
                onChange(id);
                setOpen(false);
              }}
              className={cn("flex h-[50px] w-full items-center pl-[16.5px] pr-[16px] text-left", id === value ? "bg-primary-soft" : "hover:bg-muted")}
            >
              <AccountIcon account={id} />
              <span className="ml-[10.5px] flex-1">
                <span className="block text-[13.5px] font-medium leading-[17px]">Practice {id} Account</span>
                <span className="tabular block text-[11.5px] leading-[15px] text-muted-foreground">{formatMoney(state.balances[id], id)}</span>
              </span>
              {id === value && <Check className="size-[18px] text-primary" strokeWidth={2.2} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
