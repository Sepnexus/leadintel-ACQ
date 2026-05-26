// One-stop drilldown for a single customer: team, billing, sync, usage, danger zone.
import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, Shield, Wallet, RefreshCw, Play, Trash2, KeyRound, Plus, ExternalLink, DollarSign,
  Building2, Activity, AlertTriangle, Save,
} from "lucide-react";
import { useAdminCall, useAdminQuery, useAdminMutation, fmt$, type Customer, type TeamMember, type GhlUser, type SyncRun } from "./api";
import { Kpi, StatusPill, RolePill, EmptyState, ErrorBox, balanceClass } from "./shared";
import { AddTeamMemberDialog } from "./AddTeamMemberDialog";
import { SyncRunDetailSheet } from "./SyncRunDetailSheet";
import { useToast } from "@/hooks/use-toast";

type Detail = {
  customer: Customer;
  team: TeamMember[];
  ghl_users: GhlUser[];
  wallet: { balance_cents: number; updated_at: string | null };
  billing_settings: { auto_recharge_enabled: boolean; threshold_cents: number; topup_amount_cents: number; markup_multiplier: number | null; min_call_seconds_for_ai: number | null; stripe_customer_id?: string | null; default_payment_method_id?: string | null; card_brand?: string | null; card_last4?: string | null; card_exp_month?: number | null; card_exp_year?: number | null };
  transactions: any[];
  sync_runs: SyncRun[];
  sync_state: any;
  usage_events: any[];
  usage_recent: { provider_cost_cents: number; billed_cents: number; events: number; margin_cents: number };
  counts: { calls: number; scores: number; contacts: number };
};

export function CustomerDetailSheet({
  customerId, open, onOpenChange, onImpersonate,
}: {
  customerId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImpersonate?: (id: string) => void;
}) {
  const { data, isLoading, error, refetch } = useAdminQuery<Detail>(
    ["admin", "customer-detail", customerId || ""],
    { action: "customer-detail", account_id: customerId },
    { enabled: !!customerId && open, staleTime: 15_000 },
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="cc-admin w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="font-display text-xl flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {data?.customer?.name || "Customer"}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-mono">Loc {data?.customer?.location_id || "—"}</span>
            {data?.customer && (
              <span className={data.customer.is_active ? "text-primary" : "text-destructive"}>
                {data.customer.is_active ? "Active" : "Suspended"}
              </span>
            )}
            {(data?.customer as any)?.demo_mode && (
              <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded">Demo data</span>
            )}
            {onImpersonate && data?.customer && (
              <Button size="sm" variant="outline" className="h-6 text-[10px] ml-auto"
                onClick={() => { onImpersonate(data.customer.id); onOpenChange(false); }}>
                <ExternalLink className="h-3 w-3 mr-1" /> Open as customer
              </Button>
            )}
          </SheetDescription>
        </SheetHeader>

        {error ? <ErrorBox>{(error as any).message}</ErrorBox> : null}

        {isLoading || !data ? <div className="text-sm text-muted-foreground p-6 text-center">Loading customer details…</div> : (
          <Tabs defaultValue="overview">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
              <TabsTrigger value="sync">Sync</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 pt-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Kpi label="Wallet" value={fmt$(data.wallet.balance_cents)} tone={data.wallet.balance_cents <= 0 ? "red" : data.wallet.balance_cents < 500 ? "amber" : "green"} icon={<Wallet className="h-3 w-3" />} />
                <Kpi label="Calls synced" value={data.counts.calls.toLocaleString()} sub={`${data.counts.contacts.toLocaleString()} contacts`} />
                <Kpi label="Calls scored" value={data.counts.scores.toLocaleString()} sub={`${data.team.filter(t => t.role === "rep").length} reps`} />
                <Kpi label="Margin (recent)" value={fmt$(data.usage_recent.margin_cents)} sub={`${data.usage_recent.events} events`} tone="green" />
              </div>

              <Card className="border-border">
                <CardContent className="p-3 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold uppercase tracking-wider text-muted-foreground">Sync status</div>
                    {data.sync_state?.last_status ? <StatusPill status={data.sync_state.last_status} /> : null}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-muted-foreground">
                    <div>Last run: <span className="text-foreground">{data.sync_state?.last_run_at ? new Date(data.sync_state.last_run_at).toLocaleString() : "Never"}</span></div>
                    <div>Cursor: <span className="text-foreground">{data.sync_state?.cursor_ms ? new Date(Number(data.sync_state.cursor_ms)).toLocaleString() : "—"}</span></div>
                    <div>Integrated: <span className="text-foreground">{new Date(data.customer.integrated_at).toLocaleDateString()}</span></div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="team" className="pt-3">
              <TeamSection detail={data} onChanged={refetch} />
            </TabsContent>

            <TabsContent value="billing" className="space-y-4 pt-3">
              <BillingSection detail={data} onChanged={refetch} />
            </TabsContent>

            <TabsContent value="sync" className="space-y-3 pt-3">
              <SyncSection detail={data} onChanged={refetch} />
            </TabsContent>

            <TabsContent value="settings" className="pt-3">
              <SettingsSection detail={data} onChanged={refetch} onClose={() => onOpenChange(false)} />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Team ───────────────────────────────────────────────────────────────────
function TeamSection({ detail, onChanged }: { detail: Detail; onChanged: () => void }) {
  const call = useAdminCall();
  const { toast } = useToast();
  const [adding, setAdding] = useState<"rep" | "account_admin" | null>(null);
  const admins = detail.team.filter(t => t.role === "account_admin");
  const reps = detail.team.filter(t => t.role === "rep");

  const ghlNameMap = new Map(detail.ghl_users.map(g => [g.ghl_user_id, g.name || g.email || g.ghl_user_id]));

  const remove = async (m: TeamMember) => {
    if (!confirm(`Remove ${m.email}?`)) return;
    try { await call({ action: "remove-team-member", account_id: detail.customer.id, user_id: m.user_id }); onChanged(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };
  const reset = async (m: TeamMember) => {
    const p = prompt(`New password for ${m.email} (min 6 chars):`);
    if (!p || p.length < 6) return;
    try { await call({ action: "reset-user-password", user_id: m.user_id, new_password: p, account_id: detail.customer.id }); toast({ title: "Password updated" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };
  const setAssign = async (m: TeamMember, ghl_user_ids: string[]) => {
    try { await call({ action: "set-rep-assignment", account_id: detail.customer.id, user_id: m.user_id, ghl_user_ids }); onChanged(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-5">
      {/* Admins */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-xs"><Shield className="h-3.5 w-3.5 text-primary" /> Admins ({admins.length})</div>
          <Button size="sm" variant="outline" onClick={() => setAdding("account_admin")}><Plus className="h-3 w-3 mr-1" />Add admin</Button>
        </div>
        {admins.length === 0 ? <EmptyState>No admins yet.</EmptyState> : (
          <Table>
            <TableHeader><TableRow><TableHead>Email</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {admins.map(a => (
                <TableRow key={a.user_id}>
                  <TableCell className="font-medium">{a.email}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => reset(a)}><KeyRound className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(a)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Reps */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-xs"><Users className="h-3.5 w-3.5 text-primary" /> Reps ({reps.length})</div>
          <Button size="sm" variant="outline" onClick={() => setAdding("rep")}><Plus className="h-3 w-3 mr-1" />Add rep</Button>
        </div>
        {reps.length === 0 ? <EmptyState>No reps yet.</EmptyState> : (
          <div className="space-y-2">
            {reps.map(r => (
              <Card key={r.user_id} className="border-border">
                <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.email}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {r.ghl_user_ids.length === 0
                        ? "No GHL users assigned — they'll see no calls"
                        : r.ghl_user_ids.map(id => ghlNameMap.get(id) || id).join(", ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value="" onValueChange={(v) => {
                      if (!v || v === "__manage") return;
                      const next = r.ghl_user_ids.includes(v) ? r.ghl_user_ids.filter(x => x !== v) : [...r.ghl_user_ids, v];
                      setAssign(r, next);
                    }}>
                      <SelectTrigger className="h-8 text-xs w-44">
                        <SelectValue placeholder="Toggle GHL user…" />
                      </SelectTrigger>
                      <SelectContent className="cc-admin max-h-72">
                        {detail.ghl_users.map(u => (
                          <SelectItem key={u.ghl_user_id} value={u.ghl_user_id}>
                            {r.ghl_user_ids.includes(u.ghl_user_id) ? "✓ " : ""}{u.name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" onClick={() => reset(r)}><KeyRound className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {adding && (
        <AddTeamMemberDialog
          open={!!adding}
          onOpenChange={(v) => !v && setAdding(null)}
          accountId={detail.customer.id}
          role={adding}
          ghlUsers={detail.ghl_users}
          onAdded={onChanged}
        />
      )}
    </div>
  );
}

// ─── Billing ────────────────────────────────────────────────────────────────
function BillingSection({ detail, onChanged }: { detail: Detail; onChanged: () => void }) {
  const call = useAdminCall();
  const { toast } = useToast();
  const [amount, setAmount] = useState("10.00");
  const [reason, setReason] = useState("");
  const [type, setType] = useState<"adjustment" | "refund">("adjustment");
  const [paymentMethod, setPaymentMethod] = useState<string>("none");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  // Billing settings
  const [autoTopup, setAutoTopup] = useState(detail.billing_settings.auto_recharge_enabled);
  const [threshold, setThreshold] = useState(String(detail.billing_settings.threshold_cents / 100));
  const [topup, setTopup] = useState(String(detail.billing_settings.topup_amount_cents / 100));
  const [savingSettings, setSavingSettings] = useState(false);

  // Per-customer commercial overrides (super only)
  const [markupOverride, setMarkupOverride] = useState<string>(detail.billing_settings.markup_multiplier != null ? String(detail.billing_settings.markup_multiplier) : "");
  const [minSecondsOverride, setMinSecondsOverride] = useState<string>(detail.billing_settings.min_call_seconds_for_ai != null ? String(detail.billing_settings.min_call_seconds_for_ai) : "");
  const [savingCommercial, setSavingCommercial] = useState(false);

  const adjust = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const cents = Math.round(Number(amount) * 100);
      if (!cents) throw new Error("Amount must be non-zero (use a negative number to debit).");
      await call({
        action: "manual-credit", account_id: detail.customer.id, amount_cents: cents,
        reason: reason || `Manual ${type}`, type,
        payment_method: paymentMethod === "none" ? undefined : paymentMethod,
        reference: reference || undefined,
      });
      setAmount("10.00"); setReason(""); setReference(""); setPaymentMethod("none");
      toast({ title: cents > 0 ? "Credit applied" : "Debit applied" });
      onChanged();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setBusy(false);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await call({
        action: "save-billing-settings", account_id: detail.customer.id,
        auto_recharge_enabled: autoTopup,
        threshold_cents: Math.round(Number(threshold) * 100),
        topup_amount_cents: Math.round(Number(topup) * 100),
      });
      toast({ title: "Auto-recharge saved" });
      onChanged();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSavingSettings(false);
  };

  const saveCommercial = async () => {
    setSavingCommercial(true);
    try {
      await call({
        action: "save-billing-settings", account_id: detail.customer.id,
        markup_multiplier: markupOverride.trim() === "" ? null : Number(markupOverride),
        min_call_seconds_for_ai: minSecondsOverride.trim() === "" ? null : Number(minSecondsOverride),
      });
      toast({ title: "Customer overrides saved" });
      onChanged();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSavingCommercial(false);
  };

  // Stripe admin actions
  const [reconcileSession, setReconcileSession] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [chargeAmt, setChargeAmt] = useState("10.00");
  const [charging, setCharging] = useState(false);
  const [stripeMode, setStripeMode] = useState<"test" | "live">("test");

  const bs = detail.billing_settings;
  const hasCard = !!bs.default_payment_method_id;

  // Pull current Stripe mode (best-effort)
  useEffect(() => { call({ action: "get-stripe-details", account_id: detail.customer.id }).then((r: any) => setStripeMode(r?.mode || "test")).catch(() => {}); }, [detail.customer.id]);

  const reconcile = async () => {
    if (!reconcileSession.trim()) return;
    setReconciling(true);
    try {
      await call({ action: "reconcile-stripe-session", session_id: reconcileSession.trim(), environment: stripeMode === "live" ? "live" : "sandbox" });
      toast({ title: "Session reconciled — wallet credited" });
      setReconcileSession(""); onChanged();
    } catch (e: any) { toast({ title: "Reconcile failed", description: e.message, variant: "destructive" }); }
    setReconciling(false);
  };
  const chargeNow = async () => {
    const cents = Math.round(Number(chargeAmt) * 100);
    if (!cents || cents < 100) return;
    if (!confirm(`Charge ${bs.card_brand || "card"} •••• ${bs.card_last4} for $${(cents/100).toFixed(2)}?`)) return;
    setCharging(true);
    try {
      await call({ action: "charge-saved-card", account_id: detail.customer.id, amount_cents: cents });
      toast({ title: "Card charged successfully" }); onChanged();
    } catch (e: any) { toast({ title: "Charge failed", description: e.message, variant: "destructive" }); }
    setCharging(false);
  };
  const refundTx = async (tx: any) => {
    if (!confirm(`Refund ${fmt$(tx.amount_cents)} to the customer's card?\n\nThis will: (1) refund via Stripe, (2) debit the wallet.`)) return;
    try {
      await call({ action: "refund-topup", transaction_id: tx.id, reason: `Refund of ${tx.reason}` });
      toast({ title: "Refund issued" }); onChanged();
    } catch (e: any) { toast({ title: "Refund failed", description: e.message, variant: "destructive" }); }
  };
  const stripeUrl = (kind: "customer" | "pi" | "session", id: string) => {
    const base = stripeMode === "live" ? "https://dashboard.stripe.com" : "https://dashboard.stripe.com/test";
    if (kind === "customer") return `${base}/customers/${id}`;
    if (kind === "pi") return `${base}/payments/${id}`;
    return `${base}/payments?payment_session=${id}`;
  };

  return (
    <div className="space-y-4">
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current balance</div>
          <div className={`font-display text-3xl font-bold ${balanceClass(detail.wallet.balance_cents)}`}>{fmt$(detail.wallet.balance_cents)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Updated {detail.wallet.updated_at ? new Date(detail.wallet.updated_at).toLocaleString() : "—"}</div>
        </CardContent>
      </Card>

      {/* Stripe payment details */}
      <Card className="border-border">
        <CardContent className="p-4 space-y-3">
          <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Stripe payment details</span>
            <span className="text-[10px] normal-case font-normal">Mode: <span className={stripeMode === "live" ? "text-primary" : "text-amber-400"}>{stripeMode}</span></span>
          </div>
          {hasCard ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Card</span>
                <span className="font-medium">{bs.card_brand?.toUpperCase()} •••• {bs.card_last4} {bs.card_exp_month}/{String(bs.card_exp_year).slice(-2)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Customer ID</span>
                <a href={stripeUrl("customer", bs.stripe_customer_id!)} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-primary hover:underline flex items-center gap-1">{bs.stripe_customer_id}<ExternalLink className="h-3 w-3" /></a>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Payment method</span>
                <span className="font-mono text-[10px]">{bs.default_payment_method_id}</span>
              </div>
              <div className="flex items-end gap-2 pt-2 border-t border-border">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Charge saved card ($)</Label>
                  <Input type="number" step="1" min="1" value={chargeAmt} onChange={e => setChargeAmt(e.target.value)} />
                </div>
                <Button size="sm" onClick={chargeNow} disabled={charging}>{charging ? "Charging…" : "Charge now"}</Button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No card on file. Customer needs to complete a top-up first to save their card.</div>
          )}
        </CardContent>
      </Card>

      {/* Reconcile */}
      <Card className="border-border">
        <CardContent className="p-4 space-y-2">
          <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Reconcile Stripe session</div>
          <div className="text-[10px] text-muted-foreground">If a payment succeeded in Stripe but the wallet wasn't credited (missed webhook), paste the Checkout session ID here to credit it.</div>
          <div className="flex gap-2">
            <Input value={reconcileSession} onChange={e => setReconcileSession(e.target.value)} placeholder="cs_test_… or cs_live_…" className="font-mono text-xs" />
            <Button size="sm" onClick={reconcile} disabled={reconciling || !reconcileSession.trim()}>{reconciling ? "…" : "Reconcile"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-4 space-y-3">
          <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" />Manual credit / debit / refund</div>
          <form onSubmit={adjust} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Amount ($, negative to debit)</Label>
              <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="cc-admin">
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="cc-admin">
                  <SelectItem value="none">— none —</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="wire">Wire transfer</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="ach">ACH</SelectItem>
                  <SelectItem value="card_offline">Card (offline)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Reason (visible in transaction log)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Goodwill credit" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reference # (optional)</Label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Invoice / check #" />
            </div>
            <Button type="submit" disabled={busy} className="sm:col-span-3 w-full sm:w-auto sm:justify-self-end">{busy ? "Applying…" : "Apply"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-4 space-y-3">
          <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Commercial overrides (per customer)</div>
          <div className="text-[10px] text-muted-foreground">Leave blank / at default to inherit the global setting.</div>

          {/* Markup slider override */}
          <div className="space-y-2 border border-border rounded-md p-3 bg-card/40">
            <div className="flex items-end justify-between">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Markup multiplier override</Label>
              <div className="font-display text-2xl font-bold text-primary">
                {markupOverride.trim() === "" ? <span className="text-muted-foreground text-sm">inherit global</span> : `${Number(markupOverride).toFixed(1)}×`}
              </div>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="0.1"
              value={markupOverride.trim() === "" ? 2 : Number(markupOverride)}
              onChange={(e) => setMarkupOverride(e.target.value)}
              className="w-full accent-primary cursor-pointer"
            />
            <div className="flex items-center justify-between text-[9px] text-muted-foreground">
              <span>1× (cost only) · 5× · 10×</span>
              <button type="button" className="underline hover:text-foreground" onClick={() => setMarkupOverride("")}>Reset to global</button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Min call seconds for AI (override)</Label>
            <Input type="number" step="30" min="0" placeholder="inherit global" value={minSecondsOverride} onChange={e => setMinSecondsOverride(e.target.value)} />
            <div className="text-[10px] text-muted-foreground">Calls shorter than this are skipped entirely — no Whisper, no scoring, no charge.</div>
          </div>
          <Button size="sm" onClick={saveCommercial} disabled={savingCommercial}><Save className="h-3 w-3 mr-1" />{savingCommercial ? "Saving…" : "Save overrides"}</Button>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-4 space-y-3">
          <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Auto-recharge (Stripe)</div>
          <div className="flex items-center gap-3">
            <Switch checked={autoTopup} onCheckedChange={setAutoTopup} />
            <span className="text-xs text-muted-foreground">Top up automatically when balance drops below threshold</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Threshold ($)</Label>
              <Input type="number" step="1" min="1" value={threshold} onChange={e => setThreshold(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Top-up amount ($)</Label>
              <Input type="number" step="1" min="5" value={topup} onChange={e => setTopup(e.target.value)} />
            </div>
          </div>
          <Button size="sm" onClick={saveSettings} disabled={savingSettings}><Save className="h-3 w-3 mr-1" />{savingSettings ? "Saving…" : "Save settings"}</Button>
        </CardContent>
      </Card>

      <div>
        <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> Recent transactions</div>
        {detail.transactions.length === 0 ? <EmptyState>No transactions yet.</EmptyState> : (
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {detail.transactions.map(t => {
                const isStripeCredit = t.type === "credit" && t.stripe_session_id && (t.metadata?.payment_intent_id || t.stripe_session_id.startsWith("cs_"));
                return (
                <TableRow key={t.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</TableCell>
                  <TableCell><span className={`text-[10px] uppercase tracking-wider font-bold ${t.type === "credit" ? "text-primary" : t.type === "debit" ? "text-destructive" : "text-amber-400"}`}>{t.type}</span></TableCell>
                  <TableCell className="text-xs">{t.reason}</TableCell>
                  <TableCell className={`text-right font-medium ${t.type === "debit" ? "text-destructive" : "text-primary"}`}>{t.type === "debit" ? "−" : "+"}{fmt$(Math.abs(t.amount_cents))}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{fmt$(t.balance_after_cents)}</TableCell>
                  <TableCell className="text-right">
                    {isStripeCredit ? (
                      <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => refundTx(t)}>Refund</Button>
                    ) : null}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ─── Sync ───────────────────────────────────────────────────────────────────
function SyncSection({ detail, onChanged }: { detail: Detail; onChanged: () => void }) {
  const call = useAdminCall();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [pickedRun, setPickedRun] = useState<SyncRun | null>(null);
  const [window, setWindow] = useState<string>("incremental");

  const trigger = async () => {
    setBusy(true);
    const payload: Record<string, unknown> = { action: "trigger-sync", account_id: detail.customer.id };
    if (window !== "incremental") payload.backfill_seconds = window === "all" ? -1 : Number(window);
    try { await call(payload); toast({ title: "Sync started" }); onChanged(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setBusy(false);
  };

  return (
    <>
      <Card className="border-border">
        <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs">
            <div className="text-muted-foreground">
              Cursor: <span className="text-foreground">{detail.sync_state?.cursor_ms ? new Date(Number(detail.sync_state.cursor_ms)).toLocaleString() : "Never synced"}</span>
            </div>
            <div className="text-muted-foreground">
              Last run: <span className="text-foreground">{detail.sync_state?.last_run_at ? new Date(detail.sync_state.last_run_at).toLocaleString() : "—"}</span>
              {detail.sync_state?.last_status && <span className="ml-2"><StatusPill status={detail.sync_state.last_status} /></span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={window} onValueChange={setWindow}>
              <SelectTrigger className="h-8 text-xs w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incremental">Since last sync</SelectItem>
                <SelectItem value="300">Last 5 minutes</SelectItem>
                <SelectItem value="600">Last 10 minutes</SelectItem>
                <SelectItem value="1800">Last 30 minutes</SelectItem>
                <SelectItem value="3600">Last 1 hour</SelectItem>
                <SelectItem value="86400">Last 24 hours</SelectItem>
                <SelectItem value="604800">Last 7 days</SelectItem>
                <SelectItem value="all">All since integration</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={trigger} disabled={busy || !detail.customer.is_active} title={!detail.customer.is_active ? "Customer is inactive — re-activate to sync" : undefined}><Play className="h-3 w-3 mr-1" />{busy ? "Running…" : !detail.customer.is_active ? "Inactive — sync disabled" : "Run sync now"}</Button>
          </div>
        </CardContent>
      </Card>

      <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-2">Recent runs (click to inspect)</div>
      {detail.sync_runs.length === 0 ? <EmptyState>No sync runs yet.</EmptyState> : (
        <Table>
          <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Started</TableHead><TableHead>Trigger</TableHead><TableHead className="text-right">Calls</TableHead><TableHead className="text-right">Saved</TableHead><TableHead className="text-right">Duration</TableHead></TableRow></TableHeader>
          <TableBody>
            {detail.sync_runs.map(r => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setPickedRun(r)}>
                <TableCell><StatusPill status={r.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(r.started_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.trigger}</TableCell>
                <TableCell className="text-right text-xs">{r.call_messages_found}</TableCell>
                <TableCell className="text-right text-xs">{r.messages_saved}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <SyncRunDetailSheet run={pickedRun} open={!!pickedRun} onOpenChange={(v) => !v && setPickedRun(null)} />
    </>
  );
}

// ─── Settings ───────────────────────────────────────────────────────────────
function SettingsSection({ detail, onChanged, onClose }: { detail: Detail; onChanged: () => void; onClose: () => void }) {
  const call = useAdminCall();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: detail.customer.name,
    location_id: detail.customer.location_id,
    company_id: detail.customer.company_id,
    api_key: "",
    is_active: detail.customer.is_active,
    demo_mode: !!(detail.customer as any).demo_mode,
  });
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await call({ action: "update-customer", account_id: detail.customer.id, ...form });
      toast({ title: "Saved" });
      onChanged();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setBusy(false);
  };

  const remove = async () => {
    if (!confirm(`DELETE customer "${detail.customer.name}"?\n\nThis removes ALL their data, calls, scores, transactions and team. Cannot be undone.`)) return;
    try { await call({ action: "delete-customer", account_id: detail.customer.id }); toast({ title: "Customer deleted" }); onClose(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">Customer name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="space-y-1"><Label className="text-xs">GHL Company ID</Label><Input value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">GHL Location ID</Label><Input value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">GHL API Key (blank = keep)</Label><Input type="password" placeholder="••••••••" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} /></div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <Label className="text-xs">Active (uncheck to suspend)</Label>
        </div>
        <Card className={`border ${form.demo_mode ? "border-amber-500/50 bg-amber-500/5" : "border-border"}`}>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-3">
              <Switch checked={form.demo_mode} onCheckedChange={(v) => setForm({ ...form, demo_mode: v })} />
              <div className="flex-1">
                <Label className="text-xs font-bold">Demo mode (sample data)</Label>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  When ON, the customer sees a shared sample dataset (reps, contacts, calls, scores) and real GHL syncing is skipped. Turn OFF once their GHL credentials are working — syncing then resumes automatically.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
      </form>

      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-bold text-sm text-destructive">Danger zone</div>
              <div className="text-xs text-muted-foreground mt-1 mb-3">Deletes the customer and all related data. Cannot be undone.</div>
              <Button variant="destructive" size="sm" onClick={remove}><Trash2 className="h-3 w-3 mr-1" />Delete customer</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
