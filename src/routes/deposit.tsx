import { createFileRoute } from "@tanstack/react-router";
import { FundsPage } from "@/components/app/FundsPage";
import { pageHead } from "@/components/app/meta";

export const Route = createFileRoute("/deposit")({
  head: () => pageHead("Deposit", "Deposit Kenyan shillings to your wallet."),
  component: () => <FundsPage mode="deposit" />,
});
