import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PracticeNote } from "@/components/app/PageHeader";
import { Logo } from "@/components/app/icons";
import { pageHead } from "@/components/app/meta";

export const Route = createFileRoute("/about")({
  head: () => pageHead("About", "Tradeclass practice trading and funding wallet information."),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="pb-6">
      <PageHeader title="About us" />
      <div className="space-y-5 px-5 text-lg">
        <Logo className="h-24" />
        <p className="text-muted-foreground">
          Tradeclass includes a practice trading workspace and a separate wallet for deposits and withdrawals through the payment methods shown in your account.
        </p>
        <PracticeNote>
          Trade execution and market prices are simulated. Wallet deposits and withdrawals are real transactions; crypto transfers require network and transaction review, and exchange payouts are processed by staff. Never send funds until you have checked the selected asset, network and receiving address.
        </PracticeNote>
      </div>
    </div>
  );
}
