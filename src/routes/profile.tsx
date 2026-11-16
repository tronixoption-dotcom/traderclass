import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { pageHead } from "@/components/app/meta";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/profile")({
  head: () => pageHead("Profile", "Your practice trader username, ID and email."),
  component: ProfilePage,
});

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[51px] items-center border-b border-border">
      <span className="w-[84px] shrink-0 text-[15px] text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end">{children}</div>
    </div>
  );
}

function ProfilePage() {
  const { state, setName, hydrated, user, profile } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, set] = useState("");
  const username = profile?.username ?? state.name;
  const id = hydrated ? state.userId : "GM••••••••";

  const copyId = async () => {
    await navigator.clipboard?.writeText(state.userId);
    toast.success("ID copied");
  };

  return (
    <div className="pb-6">
      <PageHeader title="Profile" />
      <div className="mx-[21px] mt-[30px]">
        <Row label="Username">
          <button
            onClick={() => {
              set(username);
              setEditing(true);
            }}
            className="truncate text-[15.5px] font-semibold"
            aria-label="Change username"
          >
            {username}
          </button>
        </Row>
        <Row label="ID">
          <span className="tabular flex-1 truncate pl-[8px] text-center text-[15.5px] font-semibold">{id}</span>
          <button onClick={copyId} className="ml-[8px] flex h-[25px] items-center gap-[4px] rounded-full border border-input bg-muted px-[11px] text-[11.5px] font-semibold">
            <Copy className="size-[12px]" strokeWidth={2.2} /> Copy ID
          </button>
        </Row>
        <Row label="Email">
          {user ? (
            <span className="truncate text-[15.5px] font-semibold">{user.email}</span>
          ) : (
            <Link to="/auth" className="text-[15px] font-semibold text-primary">
              Sign in
            </Link>
          )}
        </Row>
        <Row label="Account">
          <span className="text-[15.5px] font-semibold text-primary">Practice</span>
        </Row>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-[340px] rounded-[16px]">
          <DialogHeader>
            <DialogTitle>Change username</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={name}
            maxLength={40}
            onChange={(e) => set(e.target.value)}
            className="h-[49px] w-full rounded-[10px] border-2 border-primary bg-background px-[13px] text-[15px] outline-none"
          />
          <button
            disabled={!name.trim() || name.trim() === username}
            onClick={() => {
              setName(name.trim());
              setEditing(false);
              toast.success("Username saved");
            }}
            className="h-[49px] w-full rounded-full bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-50"
          >
            Save
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
