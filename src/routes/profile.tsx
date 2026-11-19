import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { pageHead } from "@/components/app/meta";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/profile")({
  head: () => pageHead("Profile", "Your Tradeclass profile and account details."),
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
  const { state, setName, setProfilePhone, hydrated, user, profile, accountMode } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, set] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const username = profile?.username ?? state.name;
  const id = hydrated ? state.userId : "GM••••••••";

  const copyId = async () => {
    await navigator.clipboard?.writeText(state.userId);
    toast.success("ID copied");
  };

  const savePhone = async () => {
    if (!user) return;
    let digits = phoneDraft.replace(/\D/g, '');
    if (digits.startsWith('2540')) digits = `254${digits.slice(4)}`;
    else if (digits.startsWith('0')) digits = `254${digits.slice(1)}`;
    else if (!digits.startsWith('254')) digits = `254${digits}`;
    if (!/^254(?:7|1)\d{8}$/.test(digits)) { toast.error('Enter a valid Kenyan M-Pesa number, such as 0712345678'); return; }
    setPhoneBusy(true);
    const phone = `+${digits}`;
    const { error } = await supabase.from('profiles').update({ phone }).eq('id', user.id);
    setPhoneBusy(false);
    if (error) { toast.error('Could not save your M-Pesa number'); return; }
    setProfilePhone(phone);
    setEditingPhone(false);
    toast.success('Registered M-Pesa number updated');
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
        <Row label="M-Pesa">
          <button type="button" onClick={() => { setPhoneDraft(profile?.phone ?? ''); setEditingPhone(true); }} className="truncate text-[15px] font-semibold" aria-label="Edit registered M-Pesa number">
            {profile?.phone || 'Add registered number'}
          </button>
        </Row>
        <Row label="Account">
          <span className="text-[15.5px] font-semibold text-primary">Live USDT</span>
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

      <Dialog open={editingPhone} onOpenChange={setEditingPhone}>
        <DialogContent className="max-w-[340px] rounded-[16px]">
          <DialogHeader>
            <DialogTitle>Registered M-Pesa number</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-5 text-muted-foreground">This number is used automatically for M-Pesa deposits and withdrawals.</p>
          <input
            autoFocus
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phoneDraft}
            onChange={(event) => setPhoneDraft(event.target.value)}
            placeholder="0712345678 or +254712345678"
            className="h-[49px] w-full rounded-[10px] border-2 border-primary bg-background px-[13px] text-[15px] outline-none"
          />
          <button
            disabled={phoneBusy || !phoneDraft.trim() || phoneDraft.trim() === profile?.phone}
            onClick={() => void savePhone()}
            className="h-[49px] w-full rounded-full bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-50"
          >
            {phoneBusy ? 'Saving…' : 'Save number'}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
