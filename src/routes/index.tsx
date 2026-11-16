import { createFileRoute } from "@tanstack/react-router";
import { MarketView } from "@/components/app/MarketView";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tradeclass | A clearer way to practice" },
      { name: "description", content: "Explore gold, forex and crypto in a focused practice trading workspace with simulated funds." },
      { property: "og:title", content: "Tradeclass | A clearer way to practice" },
      { property: "og:description", content: "A focused market workspace to explore, practice and build better routines." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <MarketView />,
});
