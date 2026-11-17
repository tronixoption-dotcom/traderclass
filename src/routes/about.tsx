import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, InfoNote } from "@/components/app/PageHeader";
import { Logo } from "@/components/app/icons";
import { pageHead } from "@/components/app/meta";

export const Route = createFileRoute("/about")({
  head: () => pageHead("About", "Tradeclass account, market and funding information."),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="pb-6">
      <PageHeader title="About us" />
      <div className="space-y-5 px-5 text-lg">
        <Logo className="h-24" />
        <p className="text-muted-foreground">
          Tradeclass provides a funded USDT trading account. Deposits and withdrawals are requested through the payment methods available in your account.
        </p>
        <InfoNote>
          Live USDT timed contracts use OKX spot prices and settle inside Tradeclass; they do not place orders on an OKX account. Deposits are credited after staff review, while withdrawal funds are reserved until the request is paid or rejected. Always check the asset, network and receiving address before sending crypto.
        </InfoNote>
      </div>
    </div>
  );
}
