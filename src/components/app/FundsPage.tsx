import { PageHeader } from "./PageHeader";
import { MpesaWallet } from "./MpesaWallet";

/** Real M-Pesa deposits and withdrawals use the server-side KES wallet. */
export function FundsPage({ mode }: { mode: "deposit" | "withdraw" }) {
  return (
    <div className="pb-6">
      <PageHeader title={mode === "deposit" ? "Deposit" : "Withdraw"} compact />
      <div className="px-[16.5px] pt-5">
        <MpesaWallet mode={mode} />
        <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
          M-Pesa funds are held in your KES wallet. They do not change the separate simulated USD/USDT practice trading balances.
        </p>
      </div>
    </div>
  );
}
