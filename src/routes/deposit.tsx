import { createFileRoute } from "@tanstack/react-router";
import { FundsPage } from "@/components/app/FundsPage";
import { pageHead } from "@/components/app/meta";

export const Route = createFileRoute("/deposit")({
  head: () => pageHead("Deposit KES", "Deposit Kenyan shillings to your M-Pesa wallet."),
  component: () => <FundsPage mode="deposit" />,
});
