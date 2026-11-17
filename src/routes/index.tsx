import { createFileRoute } from "@tanstack/react-router";
import { MarketView } from "@/components/app/MarketView";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tradeclass | Live Trading" },
      { name: "description", content: "Trade supported crypto markets with a funded USDT account." },
      { property: "og:title", content: "Tradeclass | Live Trading" },
      { property: "og:description", content: "A focused live market workspace with USDT trading." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <MarketView />,
});
