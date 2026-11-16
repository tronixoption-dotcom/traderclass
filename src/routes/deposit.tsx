import { createFileRoute } from "@tanstack/react-router";
import { FundsPage } from "@/components/app/FundsPage";
import { pageHead } from "@/components/app/meta";

export const Route = createFileRoute("/deposit")({
  head: () => pageHead("Deposit", "Deposit KES to your M-Pesa wallet or add simulated practice funds."),
  component: () => <FundsPage mode="deposit" />,
});
