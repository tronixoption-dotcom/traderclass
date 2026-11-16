import { createFileRoute } from "@tanstack/react-router";
import { FundsPage } from "@/components/app/FundsPage";
import { pageHead } from "@/components/app/meta";

export const Route = createFileRoute("/withdraw")({
  head: () => pageHead("Withdraw", "Withdraw available KES to M-Pesa or remove simulated practice funds."),
  component: () => <FundsPage mode="withdraw" />,
});
