import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Two header layouts appear in the reference screens:
 * "wide" (Trades, Support, Account) and "compact" (Transfer, Transactions, Deposit).
 */
export function PageHeader({ title, right, compact, className }: { title: string; right?: ReactNode; compact?: boolean; className?: string }) {
  const router = useRouter();
  return (
    <header className={cn("sticky top-0 z-10 flex shrink-0 items-center bg-background", compact ? "h-[45px] pt-[4px]" : "h-[45px] pt-[8px]", className)}>
      <button
        aria-label="Go back"
        onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/" }))}
        className={cn("grid h-9 w-9 place-items-center rounded-full text-foreground hover:bg-muted", compact ? "ml-[2px]" : "ml-[6px]")}
      >
        <ChevronLeft className="size-[32px]" strokeWidth={1.8} />
      </button>
      <h1 className={cn("flex-1 text-[18.5px] font-bold leading-none lg:text-[21px]", compact ? "ml-[13px]" : "ml-[12.5px]")}>{title}</h1>
      {right}
    </header>
  );
}

export function InfoNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-center text-[11.5px] leading-[17px] text-muted-foreground", className)}>{children}</p>;
}
