import { createFileRoute } from "@tanstack/react-router";
import { FundsPage } from "@/components/app/FundsPage";
import { pageHead } from "@/components/app/meta";

export const Route = createFileRoute("/withdraw")({
  head: () => pageHead("Withdraw KES", "Withdraw your available Kenyan shilling wallet balance to M-Pesa."),
  component: () => <FundsPage mode="withdraw" />,
});
