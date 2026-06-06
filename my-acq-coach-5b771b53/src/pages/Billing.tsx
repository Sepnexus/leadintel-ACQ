// Customer-facing billing page: wallet balance, top-up via Stripe,
// transactions, auto-recharge, saved card, and recent usage breakdown.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminCall, useAdminQuery, fmt$, fmt$4 } from "@/admin/api";
import { EmptyState, ErrorBox, balanceClass } from "@/admin/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Wallet, CreditCard, Activity, Save, ArrowLeft, Zap, Trash2, AlertCircle,
  TrendingUp, BarChart3, Receipt, ShieldCheck, Plus, Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TopupCheckout } from "@/components/TopupCheckout";

import { isPaymentsConfigured } from "@/lib/stripe";
import { cn } from "@/lib/utils";
import { AccountMovedBanner } from "@/components/AccountMovedBanner";

const PRESETS = [25, 50, 100, 250];

export default function Billing({ onBack }: { onBack?: () => void }) {
  // Billing & wallet moved to platform Account.
  const launcherUrl = (() => {
    if (typeof window === "undefined") return "http://localhost:8080/#/account/billing";
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    return isLocal ? "http://localhost:8080/#/account/billing" : "/#/account/billing";
  })();
  return (
    <div style={{
      minHeight: "100vh", background: "#000", color: "#f4f4f4",
      fontFamily: "'Open Sans', system-ui, sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24,
    }}>
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
          color: "#7eb56a", textTransform: "uppercase", marginBottom: 14 }}>Moved</div>
        <h2 style={{ margin: "0 0 10px", fontSize: 22 }}>Billing &amp; wallet moved to your Account</h2>
        <p style={{ color: "#999", fontSize: 13.5, lineHeight: 1.6, margin: "0 0 22px" }}>
          One wallet, one card, used across ACQ Coach + Lead Intel.
        </p>
        <a href={launcherUrl} style={{
          display: "inline-block", padding: "10px 22px", borderRadius: 8,
          background: "#4e7d3d", color: "#fff", textDecoration: "none",
          fontSize: 13, fontWeight: 700, letterSpacing: "0.02em",
        }}>Open Account → Billing</a>
        {onBack && (
          <div>
            <button onClick={onBack} style={{
              marginTop: 16, background: "transparent", border: "1px solid #1c1c1c",
              color: "#999", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12,
            }}>← Back to ACQ Coach</button>
          </div>
        )}
      </div>
    </div>
  );
}

function _LegacyBilling({ onBack }: { onBack?: () => void }) {
  const { who, session } = useAuth();
  const { toast } = useToast();
  const accountId = who?.admin_account_ids?.[0] || null;

  const { data, isLoading, error, refetch } = useAdminQuery<any>(
    ["billing", accountId || ""],
    { action: "customer-detail", account_id: accountId },
    { enabled: !!accountId, staleTime: 15_000 },
  );

  // Refresh when returning from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("topup") === "success") {
      toast({ title: "Payment received", description: "Your wallet will update in a moment." });
      window.history.replaceState({}, "", window.location.pathname);
      const t = setInterval(() => refetch(), 1500);
      setTimeout(() => clearInterval(t), 12000);
    } else if (params.get("topup") === "canceled") {
      toast({ title: "Top-up canceled", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast, refetch]);

  if (!accountId) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center" style={{ fontFamily: "'Open Sans', sans-serif" }}>
      <AccountMovedBanner what="Billing & wallet" />
        <div className="text-center max-w-sm p-8 border border-border rounded-lg">
          <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <div className="font-display text-lg font-bold mb-1">Customer admins only</div>
          <div className="text-xs text-muted-foreground">You don't have access to billing for any customer account.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="cc-admin bg-background text-foreground" style={{ fontFamily: "'Open Sans', sans-serif", height: "100vh", overflowY: "auto" }}>
      {/* Sticky header bar */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="font-display text-base font-bold leading-none tracking-wide">Billing &amp; Wallet</div>
              <div className="text-[11px] text-muted-foreground mt-1">Prepaid balance, payments &amp; usage</div>
            </div>
          </div>
          {onBack ? (
            <Button variant="outline" size="sm" onClick={onBack} className="h-8">
              <ArrowLeft className="h-3 w-3 mr-1.5" /> Back to dashboard
            </Button>
          ) : null}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 pb-20">
        {error ? <ErrorBox>{(error as any).message}</ErrorBox> : null}

        {isLoading || !data ? (
          <div className="grid gap-4">
            <div className="h-44 rounded-lg border border-border bg-card animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-lg border border-border bg-card animate-pulse" />)}
            </div>
            <div className="h-64 rounded-lg border border-border bg-card animate-pulse" />
          </div>
        ) : (
          <div className="space-y-6">
            {who?.is_super_admin ? <StripeModeCard /> : null}
            <HeroBalance data={data} />
            <KpiRow data={data} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <TopupCard accountId={accountId} session={session} />
              <SavedCardCard accountId={accountId} settings={data.billing_settings} onChanged={refetch} />
            </div>

            <AutoRechargeCard
              accountId={accountId}
              settings={data.billing_settings}
              hasCard={!!data.billing_settings?.default_payment_method_id}
              onSaved={refetch}
            />

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-2"><UsageCard data={data} /></div>
              <div className="lg:col-span-3"><TransactionsCard transactions={data.transactions} /></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════ HERO BALANCE ════════════════════════════ */

function HeroBalance({ data }: { data: any }) {
  const bal = data.wallet.balance_cents;
  const updated = data.wallet.updated_at ? new Date(data.wallet.updated_at) : null;
  const lowFunds = bal < 500;
  const noFunds = bal <= 0;

  return (
    <Card className="border-border overflow-hidden relative">
      {/* Accent strip */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-[3px]",
        noFunds ? "bg-destructive" : lowFunds ? "bg-amber-400" : "bg-primary",
      )} />
      <CardContent className="p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-bold">
              <Wallet className="h-3 w-3" /> Wallet balance
            </div>
            <div className={cn("font-display font-bold mt-2 leading-none tabular-nums", balanceClass(bal))} style={{ fontSize: "clamp(2.5rem, 6vw, 3.75rem)" }}>
              {fmt$(bal)}
            </div>
            <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground">
              {updated && <span>Updated {updated.toLocaleString()}</span>}
              {noFunds && <span className="text-destructive font-bold uppercase tracking-wider">Out of funds</span>}
              {!noFunds && lowFunds && <span className="text-amber-400 font-bold uppercase tracking-wider">Low balance</span>}
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2">
            {(noFunds || lowFunds) && (
              <div className={cn(
                "inline-flex items-center gap-2 text-[11px] px-3 py-1.5 rounded border",
                noFunds ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-amber-400/40 bg-amber-400/10 text-amber-400",
              )}>
                <AlertCircle className="h-3 w-3" />
                {noFunds ? "Top up to keep AI scoring running" : "Consider topping up soon"}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════ KPI ROW ════════════════════════════ */

function KpiRow({ data }: { data: any }) {
  const recent = data.usage_recent || { provider_cost_cents: 0, billed_cents: 0, events: 0 };
  const avg = recent.events > 0 ? Math.round(recent.billed_cents / recent.events) : 0;

  const kpis = [
    { label: "Spent · last 30 days", value: fmt$(recent.billed_cents), sub: `${recent.events} AI events`, icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { label: "Calls scored", value: String(data.counts?.scores ?? 0), sub: `of ${data.counts?.calls ?? 0} synced`, icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { label: "Avg cost / scored call", value: avg > 0 ? fmt$(avg) : "—", sub: "Last 30 days", icon: <Sparkles className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {kpis.map(k => (
        <Card key={k.label} className="border-border bg-card hover:border-primary/30 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold">{k.label}</div>
              <div className="text-muted-foreground">{k.icon}</div>
            </div>
            <div className="font-display text-2xl font-bold mt-2 tabular-nums">{k.value}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{k.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ════════════════════════════ SECTION ════════════════════════════ */

function SectionHeader({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-md bg-secondary border border-border flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
        <div className="font-display text-sm font-bold uppercase tracking-[0.1em]">{title}</div>
      </div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/* ════════════════════════════ TOP-UP ════════════════════════════ */

function TopupCard({ accountId }: { accountId: string; session: any }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("50");
  const [checkoutAmount, setCheckoutAmount] = useState<number | null>(null);
  const configured = isPaymentsConfigured();

  const startCheckout = (dollars: number) => {
    if (!dollars || dollars < 5) {
      toast({ title: "Minimum $5", variant: "destructive" });
      return;
    }
    if (!configured) {
      toast({ title: "Payments not configured", description: "Stripe client token missing.", variant: "destructive" });
      return;
    }
    setCheckoutAmount(Math.round(dollars * 100));
  };

  return (
    <>
      <Card className="border-border h-full">
        <CardContent className="p-5">
          <SectionHeader icon={<Plus className="h-3.5 w-3.5" />} title="Add funds" hint="Min $5" />

          

          <div className="grid grid-cols-4 gap-2 mt-3">
            {PRESETS.map(p => {
              const active = String(p) === amount;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setAmount(String(p)); startCheckout(p); }}
                  className={cn(
                    "h-12 rounded-md font-display text-base font-bold transition-all border tabular-nums",
                    active
                      ? "bg-primary/15 border-primary text-primary"
                      : "bg-secondary border-border text-foreground hover:border-primary/50 hover:bg-primary/5",
                  )}
                >
                  ${p}
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Custom amount (USD)</Label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-display">$</span>
                <Input
                  type="number" min="5" step="1" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="50"
                  className="pl-7 h-10 font-display text-base tabular-nums"
                />
              </div>
              <Button onClick={() => startCheckout(Number(amount))} className="h-10 px-5">
                <CreditCard className="h-3.5 w-3.5 mr-1.5" /> Pay
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-4 text-[10px] text-muted-foreground">
            <ShieldCheck className="h-3 w-3" /> Secure checkout via Stripe · funds credit instantly on confirmation.
          </div>
        </CardContent>
      </Card>

      <Dialog open={checkoutAmount !== null} onOpenChange={(o) => { if (!o) setCheckoutAmount(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wide">
              Add ${checkoutAmount ? checkoutAmount / 100 : 0} to wallet
            </DialogTitle>
          </DialogHeader>
          {checkoutAmount !== null && (
            <TopupCheckout accountId={accountId} amountCents={checkoutAmount} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ════════════════════════════ SAVED CARD ════════════════════════════ */

function SavedCardCard({ accountId, settings, onChanged }: { accountId: string; settings: any; onChanged: () => void }) {
  const call = useAdminCall();
  const { toast } = useToast();
  const [removing, setRemoving] = useState(false);
  const last4: string | null = settings?.card_last4 || null;
  const brand: string | null = settings?.card_brand || null;
  const expM = settings?.card_exp_month;
  const expY = settings?.card_exp_year;

  const remove = async () => {
    if (!confirm("Remove the saved card? Auto-recharge will be turned off.")) return;
    setRemoving(true);
    try {
      await call({ action: "remove-saved-card", account_id: accountId });
      toast({ title: "Card removed" });
      onChanged();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setRemoving(false);
  };

  return (
    <Card className="border-border h-full">
      <CardContent className="p-5">
        <SectionHeader
          icon={<CreditCard className="h-3.5 w-3.5" />}
          title="Payment method"
          hint={last4 ? "Saved" : "None yet"}
        />

        {last4 ? (
          <div className="space-y-3">
            {/* Credit-card-like visual */}
            <div className="relative rounded-lg border border-border bg-gradient-to-br from-secondary to-card p-5 overflow-hidden">
              <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold">{brand || "Card"}</div>
                <div className="h-6 w-9 rounded-sm bg-amber-400/30 border border-amber-400/40" aria-hidden />
              </div>
              <div className="mt-6 font-display text-xl tracking-[0.18em] tabular-nums">
                •••• •••• •••• {last4}
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Expires</div>
                  <div className="font-display text-sm tabular-nums">
                    {expM && expY ? `${String(expM).padStart(2, "0")}/${String(expY).slice(-2)}` : "—"}
                  </div>
                </div>
                <div className="text-[9px] uppercase tracking-wider text-primary font-bold inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Stored securely by Stripe
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] text-muted-foreground">
                Used for auto-recharge when balance drops below your threshold.
              </div>
              <Button variant="outline" size="sm" onClick={remove} disabled={removing} className="h-8">
                <Trash2 className="h-3 w-3 mr-1.5" /> {removing ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <div className="h-10 w-10 rounded-full bg-secondary border border-border flex items-center justify-center mx-auto mb-3">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="font-display text-sm font-bold mb-1">No card on file</div>
            <div className="text-[11px] text-muted-foreground max-w-[260px] mx-auto">
              Make a top-up and your card will be saved automatically — required to enable auto-recharge.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════ AUTO-RECHARGE ════════════════════════════ */

function AutoRechargeCard({ accountId, settings, hasCard, onSaved }: { accountId: string; settings: any; hasCard: boolean; onSaved: () => void }) {
  const call = useAdminCall();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState<boolean>(!!settings?.auto_recharge_enabled);
  const [threshold, setThreshold] = useState<string>(String((settings?.threshold_cents ?? 500) / 100));
  const [topup, setTopup] = useState<string>(String((settings?.topup_amount_cents ?? 2000) / 100));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (enabled && !hasCard) {
      toast({ title: "No saved card", description: "Make a top-up first to save a card on file.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await call({
        action: "save-billing-settings",
        account_id: accountId,
        auto_recharge_enabled: enabled,
        threshold_cents: Math.round(Number(threshold) * 100),
        topup_amount_cents: Math.round(Number(topup) * 100),
      });
      toast({ title: "Saved" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "h-7 w-7 rounded-md border flex items-center justify-center",
              enabled && hasCard ? "bg-primary/15 border-primary/40 text-primary" : "bg-secondary border-border text-muted-foreground",
            )}>
              <Zap className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="font-display text-sm font-bold uppercase tracking-[0.1em]">Auto-recharge</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Top up automatically when your balance drops below the threshold.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn("text-[10px] font-bold uppercase tracking-wider", enabled && hasCard ? "text-primary" : "text-muted-foreground")}>
              {enabled && hasCard ? "On" : "Off"}
            </span>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!hasCard} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">When balance drops below</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-display">$</span>
              <Input type="number" min="1" step="1" value={threshold} onChange={e => setThreshold(e.target.value)} className="pl-7 h-10 tabular-nums" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Top up by</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-display">$</span>
              <Input type="number" min="5" step="1" value={topup} onChange={e => setTopup(e.target.value)} className="pl-7 h-10 tabular-nums" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            {hasCard ? (
              <><ShieldCheck className="h-3 w-3 text-primary" /> Will charge your saved card automatically.</>
            ) : (
              <><AlertCircle className="h-3 w-3 text-amber-400" /> Add a card by making a top-up first.</>
            )}
          </div>
          <Button size="sm" onClick={save} disabled={saving} className="h-8">
            <Save className="h-3 w-3 mr-1.5" /> {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════ USAGE ════════════════════════════ */

function UsageCard({ data }: { data: any }) {
  const events: any[] = data.usage_events || [];
  const grouped = useMemo(() => {
    const map = new Map<string, { events: number; billed: number; cost: number; seconds: number }>();
    for (const e of events) {
      const key = e.operation || "other";
      const cur = map.get(key) || { events: 0, billed: 0, cost: 0, seconds: 0 };
      cur.events += 1;
      cur.billed += Number(e.billed_cents || 0);
      cur.cost += Number(e.provider_cost_cents || 0);
      cur.seconds += Number(e.audio_seconds || 0);
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].billed - a[1].billed);
  }, [events]);
  const total = grouped.reduce((s, [, v]) => s + v.billed, 0);

  return (
    <Card className="border-border h-full">
      <CardContent className="p-5">
        <SectionHeader icon={<Activity className="h-3.5 w-3.5" />} title="Usage breakdown" hint="Last 30 events" />
        {events.length === 0 ? (
          <EmptyState>No AI usage yet.</EmptyState>
        ) : (
          <div className="space-y-2.5">
            {grouped.map(([op, v]) => {
              const pct = total > 0 ? Math.max(2, Math.round((v.billed / total) * 100)) : 0;
              return (
                <div key={op} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-medium truncate pr-2">{op}</div>
                    <div className="flex items-center gap-3 text-muted-foreground tabular-nums shrink-0">
                      <span>{v.events} events</span>
                      {v.seconds > 0 && <span>{Math.round(v.seconds / 60)}m</span>}
                      <span className="text-foreground font-medium">{fmt$4(v.billed)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-[width] duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════ TRANSACTIONS ════════════════════════════ */

function TransactionsCard({ transactions }: { transactions: any[] }) {
  const txs = transactions || [];
  return (
    <Card className="border-border h-full">
      <CardContent className="p-5">
        <SectionHeader
          icon={<Receipt className="h-3.5 w-3.5" />}
          title="Transaction history"
          hint={txs.length > 0 ? `${txs.length} most recent` : undefined}
        />
        {txs.length === 0 ? (
          <EmptyState>No transactions yet.</EmptyState>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="text-[10px] uppercase tracking-wider">When</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Reason</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Amount</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txs.map(t => {
                  const isCredit = t.type === "credit";
                  const isDebit = t.type === "debit";
                  return (
                    <TableRow key={t.id} className="border-border">
                      <TableCell className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                        {new Date(t.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "inline-flex items-center text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border",
                          isCredit && "border-primary/40 bg-primary/10 text-primary",
                          isDebit && "border-destructive/30 bg-destructive/10 text-destructive",
                          !isCredit && !isDebit && "border-amber-400/40 bg-amber-400/10 text-amber-400",
                        )}>
                          {t.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{t.reason}</TableCell>
                      <TableCell className={cn(
                        "text-right text-xs font-bold tabular-nums whitespace-nowrap",
                        isDebit ? "text-destructive" : "text-primary",
                      )}>
                        {isDebit ? "−" : "+"}{fmt$(Math.abs(t.amount_cents))}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {fmt$(t.balance_after_cents)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════ STRIPE MODE TOGGLE (SUPER ADMIN) ════════════════════════════ */

function StripeModeCard() {
  const { toast } = useToast();
  const [mode, setMode] = useState<"test" | "live" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase.from("app_settings").select("stripe_mode").eq("id", true).maybeSingle()
        .then(({ data }) => setMode(data?.stripe_mode === "live" ? "live" : "test"));
    });
  }, []);

  const toggle = async () => {
    if (mode === null) return;
    const next = mode === "live" ? "test" : "live";
    if (next === "live") {
      const ok = window.confirm("Switch Stripe to LIVE mode? Real cards will be charged.");
      if (!ok) return;
    }
    setSaving(true);
    const { supabase } = await import("@/integrations/supabase/client");
    const { error } = await supabase.from("app_settings").update({ stripe_mode: next, updated_at: new Date().toISOString() }).eq("id", true);
    setSaving(false);
    if (error) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
      return;
    }
    setMode(next);
    toast({ title: `Stripe mode: ${next.toUpperCase()}`, description: next === "live" ? "Real charges enabled." : "Test card 4242 4242 4242 4242." });
  };

  if (mode === null) return null;
  const isLive = mode === "live";

  return (
    <Card className={cn("border-2", isLive ? "border-primary/50" : "border-amber-500/50")}>
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-9 w-9 rounded-md flex items-center justify-center border",
            isLive ? "bg-primary/15 border-primary/40" : "bg-amber-500/15 border-amber-500/40",
          )}>
            <Zap className={cn("h-4 w-4", isLive ? "text-primary" : "text-amber-400")} />
          </div>
          <div>
            <div className="font-display text-sm font-bold tracking-wide">
              Stripe mode: <span className={isLive ? "text-primary" : "text-amber-400"}>{mode.toUpperCase()}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isLive ? "Production keys — real money is moved." : "Test keys — no real charges."}
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={toggle} disabled={saving}>
          {saving ? "…" : `Switch to ${isLive ? "Test" : "Live"}`}
        </Button>
      </CardContent>
    </Card>
  );
}
