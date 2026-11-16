import { createFileRoute } from "@tanstack/react-router";
import { MarketView } from "@/components/app/MarketView";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tradeclass | Demo and Live Trading" },
      { name: "description", content: "Trade gold, forex and supported crypto markets with demo and live USDT accounts." },
      { property: "og:title", content: "Tradeclass | Demo and Live Trading" },
      { property: "og:description", content: "A focused market workspace with demo and live USDT accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <MarketView />,
});
