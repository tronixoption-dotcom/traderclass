import { createFileRoute } from "@tanstack/react-router";
import { MarketView } from "@/components/app/MarketView";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Market — Goldmarket Practice Trading" },
      { name: "description", content: "Live practice chart for gold, forex and crypto. Place Buy or Sell trades with virtual money." },
      { property: "og:title", content: "Market — Goldmarket Practice Trading" },
      { property: "og:description", content: "Live practice chart for gold, forex and crypto with virtual money." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <MarketView />,
});
