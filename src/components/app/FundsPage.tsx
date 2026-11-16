import { FundingPage } from "./FundingPage";

/** Real payment and exchange options fund their own currency wallet. */
export function FundsPage({ mode }: { mode: "deposit" | "withdraw" }) {
  return <FundingPage mode={mode} />;
}
