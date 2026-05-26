// "Add team member" — pick a synced GHL user from this customer's location,
// then create a Supabase login (email auto-filled from GHL) + assign role.
// For reps the GHL user is auto-linked via rep_assignments.
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAdminCall, type GhlUser } from "./api";
import { ErrorBox } from "./shared";
import { Search } from "lucide-react";

export function AddTeamMemberDialog({
  open, onOpenChange, accountId, role, ghlUsers, onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountId: string;
  role: "rep" | "account_admin";
  ghlUsers: GhlUser[];
  onAdded: () => void;
}) {
  const call = useAdminCall();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [pickedGhlId, setPickedGhlId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const pickedGhl = useMemo(
    () => ghlUsers.find(u => u.ghl_user_id === pickedGhlId),
    [ghlUsers, pickedGhlId],
  );

  // Auto-fill email when a GHL user is picked
  useEffect(() => {
    if (pickedGhl?.email) setEmail(pickedGhl.email);
  }, [pickedGhl]);

  const reset = () => {
    setPickedGhlId(""); setEmail(""); setPassword("");
    setErr(""); setBusy(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      if (!pickedGhlId) throw new Error("Please pick a GHL user from the location.");
      if (!email) throw new Error("Email is required (this user has no email in GHL — please type one).");
      if (!password || password.length < 6) throw new Error("Password must be 6+ characters.");

      const payload: any = {
        action: "add-team-member",
        account_id: accountId,
        role,
        email,
        password,
      };
      if (role === "rep") payload.ghl_user_id = pickedGhlId;

      await call(payload);
      reset();
      onAdded();
      onOpenChange(false);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const sortedGhl = useMemo(
    () => [...ghlUsers].sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || "")),
    [ghlUsers],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="cc-admin max-w-md">
        <DialogHeader>
          <DialogTitle>Add {role === "account_admin" ? "account admin" : "rep"}</DialogTitle>
        </DialogHeader>
        {err && <ErrorBox>{err}</ErrorBox>}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Pick a GHL user from this location</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {pickedGhl ? (pickedGhl.name || pickedGhl.email || pickedGhl.ghl_user_id) : (
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Search className="h-3.5 w-3.5" /> Search GHL users…
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="cc-admin p-0 w-[var(--radix-popover-trigger-width)]">
                <Command>
                  <CommandInput placeholder="Type to search…" />
                  <CommandList>
                    <CommandEmpty>No GHL users synced for this location yet.</CommandEmpty>
                    <CommandGroup>
                      {sortedGhl.map(u => (
                        <CommandItem
                          key={u.ghl_user_id}
                          value={`${u.name || ""} ${u.email || ""} ${u.ghl_user_id}`}
                          onSelect={() => { setPickedGhlId(u.ghl_user_id); setPickerOpen(false); }}
                        >
                          <div className="flex flex-col">
                            <span>{u.name || u.email || u.ghl_user_id}</span>
                            {u.email && u.name && <span className="text-[10px] text-muted-foreground">{u.email}</span>}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground">
              {sortedGhl.length} GHL user{sortedGhl.length === 1 ? "" : "s"} available.
              {role === "rep" && " They'll be auto-linked to this rep so their calls show up here."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Login email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder={pickedGhl?.email ? "" : "GHL user has no email — enter one"} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Temporary password (6+)</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !pickedGhlId}>{busy ? "Adding…" : "Add to team"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
