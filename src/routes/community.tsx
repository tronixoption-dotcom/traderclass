import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { pageHead } from "@/components/app/meta";

export const Route = createFileRoute("/community")({
  head: () => pageHead("Join our community", "Tradeclass community channels."),
  component: CommunityPage,
});

function CommunityPage() {
  return (
    <div className="pb-6">
      <PageHeader title="Join our community" compact />
      <div className="px-[16.5px] pt-[20px]">
        <h2 className="text-[14.5px] font-medium">Community channels</h2>
        <p className="mt-[4px] text-[12.5px] text-muted-foreground">Community links haven't been added yet. Check back soon.</p>
      </div>
    </div>
  );
}
