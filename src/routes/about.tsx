import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PracticeNote } from "@/components/app/PageHeader";
import { Logo } from "@/components/app/icons";
import { pageHead } from "@/components/app/meta";

export const Route = createFileRoute("/about")({
  head: () => pageHead("About", "Goldmarket is a free practice app for learning to trade with virtual money."),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="pb-6">
      <PageHeader title="About us" />
      <div className="space-y-5 px-5 text-lg">
        <Logo className="h-24" />
        <p className="text-muted-foreground">
          Goldmarket is a practice app for learning how short-term trading works on gold, forex and crypto, without risking real money.
        </p>
        <PracticeNote>
          All balances and prices are simulated. Goldmarket does not accept deposits, pay withdrawals or give financial advice.
        </PracticeNote>
      </div>
    </div>
  );
}
