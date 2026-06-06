import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { COLORS } from "@/utils/leadUtils";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useWalletBalance, formatUsd } from "@/hooks/useWalletBalance";
import { useUsageHistory } from "@/hooks/useUsageHistory";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmbeddedTopupCheckout } from "@/components/billing/EmbeddedTopupCheckout";

const PRESETS_CENTS = [2500, 5000, 10000, 25000];

interface BillingSettingsRow {
  auto_recharge_enabled: boolean;
  threshold_cents: number;
  topup_amount_cents: number;
  default_payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
}

/** /billing now redirects to the unified Account → Billing in the launcher. */
export default function BillingPage() {
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
      </div>
    </div>
  );
}

function _LegacyBillingPage() {
  const navigate = useNavigate();
  const { tenant, loading: tenantLoading } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const wallet = useWalletBalance(tenantId);
  const usage = useUsageHistory(tenantId);
  const [settings, setSettings] = useState<BillingSettingsRow | null>(null);
  const [settingsTick, setSettingsTick] = useState(0);

  // Load billing_settings
  useEffect(() => {
    if (!tenantId) { setSettings(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("billing_settings")
        .select("auto_recharge_enabled, threshold_cents, topup_amount_cents, default_payment_method_id, card_brand, card_last4, card_exp_month, card_exp_year")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!cancelled) {
        setSettings((data as BillingSettingsRow | null) ?? {
          auto_recharge_enabled: false,
          threshold_cents: 500,
          topup_amount_cents: 1000,
          default_payment_method_id: null,
          card_brand: null,
          card_last4: null,
          card_exp_month: null,
          card_exp_year: null,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId, settingsTick]);

  // Toast on Stripe return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("topup");
    if (t === "success") {
      toast.success("Top-up successful — balance and card will update shortly.");
      wallet.refetch();
      const ivl = setInterval(() => { wallet.refetch(); setSettingsTick((s) => s + 1); }, 1500);
      setTimeout(() => clearInterval(ivl), 12000);
    } else if (t === "cancel") {
      toast.info("Top-up canceled.");
    }
    if (t) {
      params.delete("topup");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (tenantLoading) {
    return <Shell><div style={{ color: COLORS.T3, fontSize: 13 }}>Loading…</div></Shell>;
  }
  if (!tenantId) {
    return <Shell><div style={{ color: COLORS.T3, fontSize: 13 }}>Select a tenant to view billing.</div></Shell>;
  }

  const bal = wallet.balanceCents ?? 0;
  const lowFunds = bal < 500;
  const noFunds = bal <= 0;

  return (
    <Shell onBack={() => navigate("/")}>
      {/* Hero */}
      <Card>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: noFunds ? COLORS.RED : lowFunds ? COLORS.AMB : COLORS.GRN,
        }} />
        <div style={{ padding: "26px 28px" }}>
          <Eyebrow>● Wallet balance</Eyebrow>
          <div style={{
            fontFamily: "'League Spartan', sans-serif",
            fontWeight: 700, fontSize: 56, lineHeight: 1, marginTop: 8,
            color: noFunds ? COLORS.RED : lowFunds ? COLORS.AMB : COLORS.GRN,
          }}>
            {wallet.loading ? "…" : formatUsd(bal)}
          </div>
          {(noFunds || lowFunds) && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14,
              fontSize: 11, padding: "6px 12px", borderRadius: 6,
              border: "1px solid " + (noFunds ? COLORS.RED : COLORS.AMB) + "55",
              background: (noFunds ? COLORS.RED : COLORS.AMB) + "15",
              color: noFunds ? COLORS.RED : COLORS.AMB, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              {noFunds ? "Top up to keep AI running" : "Consider topping up soon"}
            </div>
          )}
        </div>
      </Card>

      {/* KPIs */}
      <KpiRow events={usage.events} />

      {/* Top-up + Saved card */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <TopupCard tenantId={tenantId} />
        <SavedCardCard
          settings={settings}
          tenantId={tenantId}
          onChanged={() => setSettingsTick((s) => s + 1)}
        />
      </div>

      {/* Auto-recharge */}
      <AutoRechargeCard
        tenantId={tenantId}
        settings={settings}
        onSaved={() => setSettingsTick((s) => s + 1)}
      />

      {/* Usage + Transactions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
        <UsageBreakdown events={usage.events} />
        <TransactionsCard transactions={usage.transactions} />
      </div>
    </Shell>
  );
}

/* ──────────── Shell ──────────── */
function Shell({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
  return (
    <div style={{
      minHeight: "100vh", background: COLORS.BG, color: COLORS.TEXT,
      fontFamily: "'Open Sans', sans-serif",
    }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 30,
        borderBottom: "1px solid " + COLORS.B1,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: COLORS.GRN + "20", border: "1px solid " + COLORS.GRN + "55",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: COLORS.GRN, fontWeight: 700,
            }}>$</div>
            <div>
              <div style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>Billing &amp; Wallet</div>
              <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 2 }}>Prepaid balance, payments &amp; usage</div>
            </div>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: COLORS.S2, border: "1px solid " + COLORS.B2,
                borderRadius: 8, padding: "7px 14px", color: COLORS.T2,
                fontSize: 12, fontFamily: "inherit", cursor: "pointer",
              }}
            >← Back</button>
          )}
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 80px", display: "flex", flexDirection: "column", gap: 20 }}>
        {children}
      </div>
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: "relative", background: COLORS.S1, border: "1px solid " + COLORS.B1,
      borderRadius: 12, overflow: "hidden", ...style,
    }}>{children}</div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: COLORS.T3,
      textTransform: "uppercase", letterSpacing: 1.4,
    }}>{children}</div>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <div style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>{title}</div>
      {hint && <div style={{ fontSize: 10, color: COLORS.T3 }}>{hint}</div>}
    </div>
  );
}

/* ──────────── KPI row ──────────── */
function KpiRow({ events }: { events: { charged_cents: number }[] }) {
  const totalCents = events.reduce((s, e) => s + (e.charged_cents || 0), 0);
  const count = events.length;
  const avg = count > 0 ? Math.round(totalCents / count) : 0;
  const items = [
    { label: "Spent · last 30 days", value: formatUsd(totalCents), sub: `${count} AI events` },
    { label: "AI events", value: String(count), sub: "Last 30 days" },
    { label: "Avg cost / event", value: avg > 0 ? formatUsd(avg) : "—", sub: "Last 30 days" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
      {items.map((k) => (
        <Card key={k.label}>
          <div style={{ padding: 16 }}>
            <Eyebrow>{k.label}</Eyebrow>
            <div style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 700, fontSize: 26, marginTop: 6 }}>{k.value}</div>
            <div style={{ fontSize: 10, color: COLORS.T3, marginTop: 2 }}>{k.sub}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ──────────── Top-up ──────────── */
function TopupCard({ tenantId }: { tenantId: string }) {
  const [amountStr, setAmountStr] = useState<string>("50");
  const [checkoutCents, setCheckoutCents] = useState<number | null>(null);

  function startCheckout(dollars: number) {
    if (!Number.isFinite(dollars) || dollars < 5) {
      toast.error("Minimum top-up is $5.");
      return;
    }
    setCheckoutCents(Math.round(dollars * 100));
  }

  const activeCents = Math.round(Number(amountStr) * 100);

  return (
    <Card>
      <div style={{ padding: 20 }}>
        <SectionHeader title="Add funds" hint="Min $5" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {PRESETS_CENTS.map((c) => {
            const active = c === activeCents;
            return (
              <button
                key={c}
                onClick={() => { setAmountStr(String(c / 100)); startCheckout(c / 100); }}
                style={{
                  height: 46, borderRadius: 8,
                  background: active ? COLORS.GRN + "22" : COLORS.S2,
                  border: "1px solid " + (active ? COLORS.GRN : COLORS.B2),
                  color: active ? COLORS.GRN : COLORS.TEXT,
                  fontFamily: "'League Spartan', sans-serif",
                  fontWeight: 700, fontSize: 16, cursor: "pointer",
                }}
              >${c / 100}</button>
            );
          })}
        </div>
        <div style={{ marginTop: 16 }}>
          <Eyebrow>Custom amount (USD)</Eyebrow>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: COLORS.T3, fontFamily: "'League Spartan', sans-serif" }}>$</span>
              <input
                type="number" min={5} step={1}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="50"
                style={{
                  width: "100%", height: 40, paddingLeft: 24, paddingRight: 12,
                  background: COLORS.S2, border: "1px solid " + COLORS.B2, borderRadius: 8,
                  color: COLORS.TEXT, fontFamily: "'League Spartan', sans-serif",
                  fontSize: 15, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            <button
              onClick={() => startCheckout(Number(amountStr))}
              style={{
                background: COLORS.GRN, border: "none", borderRadius: 8,
                padding: "0 20px", color: "#fff", fontWeight: 700, fontSize: 13,
                fontFamily: "inherit", cursor: "pointer",
              }}
            >Pay</button>
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 10, color: COLORS.T3 }}>
          🔒 Secure checkout via Stripe — funds credit instantly on confirmation.
        </div>
      </div>
      <Dialog open={checkoutCents !== null} onOpenChange={(o) => { if (!o) setCheckoutCents(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 bg-white text-black">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-black">Add {checkoutCents !== null ? formatUsd(checkoutCents) : ""} to wallet</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {checkoutCents !== null && (
              <EmbeddedTopupCheckout amountCents={checkoutCents} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ──────────── Saved card ──────────── */
function SavedCardCard({ settings, tenantId, onChanged }: { settings: BillingSettingsRow | null; tenantId: string; onChanged: () => void }) {
  const [removing, setRemoving] = useState(false);
  const last4 = settings?.card_last4 ?? null;
  const brand = settings?.card_brand ?? null;
  const expM = settings?.card_exp_month;
  const expY = settings?.card_exp_year;

  async function remove() {
    if (!confirm("Remove the saved card? Auto-recharge will be turned off.")) return;
    setRemoving(true);
    try {
      const { error } = await supabase.functions.invoke("remove-saved-card", {
        body: { env: "live", tenant_id: tenantId },
      });
      if (error) throw error;
      toast.success("Card removed.");
      onChanged();
    } catch (e) {
      toast.error("Failed: " + ((e as Error)?.message ?? String(e)));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card>
      <div style={{ padding: 20 }}>
        <SectionHeader title="Payment method" hint={last4 ? "Saved" : "None yet"} />
        {last4 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              position: "relative", borderRadius: 10,
              border: "1px solid " + COLORS.B2,
              background: `linear-gradient(135deg, ${COLORS.S2}, ${COLORS.S3})`,
              padding: 18, overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: -40, right: -40, width: 140, height: 140,
                borderRadius: "50%", background: COLORS.GRN + "10", filter: "blur(40px)",
              }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Eyebrow>{brand || "Card"}</Eyebrow>
                <div style={{ width: 36, height: 24, borderRadius: 4, background: COLORS.AMB + "40", border: "1px solid " + COLORS.AMB + "60" }} />
              </div>
              <div style={{
                marginTop: 22, fontFamily: "'League Spartan', sans-serif",
                fontSize: 22, letterSpacing: 4,
              }}>•••• •••• •••• {last4}</div>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 9, color: COLORS.T3, textTransform: "uppercase", letterSpacing: 1 }}>Expires</div>
                  <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 14 }}>
                    {expM && expY ? `${String(expM).padStart(2, "0")}/${String(expY).slice(-2)}` : "—"}
                  </div>
                </div>
                <div style={{ fontSize: 9, color: COLORS.GRN, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
                  🔒 Stored by Stripe
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 10, color: COLORS.T3 }}>Used for auto-recharge when balance drops below your threshold.</div>
              <button
                onClick={remove} disabled={removing}
                style={{
                  background: COLORS.S2, border: "1px solid " + COLORS.B2, borderRadius: 8,
                  padding: "6px 12px", color: COLORS.RED, fontSize: 11, fontFamily: "inherit",
                  cursor: removing ? "wait" : "pointer", whiteSpace: "nowrap",
                }}
              >{removing ? "Removing…" : "Remove"}</button>
            </div>
          </div>
        ) : (
          <div style={{
            border: "1px dashed " + COLORS.B2, borderRadius: 10, padding: 28,
            textAlign: "center",
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%", background: COLORS.S2,
              border: "1px solid " + COLORS.B2, margin: "0 auto 12px",
              display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.T3,
            }}>💳</div>
            <div style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>No card on file</div>
            <div style={{ fontSize: 11, color: COLORS.T3, maxWidth: 260, margin: "0 auto" }}>
              Make a top-up and your card will be saved automatically — required to enable auto-recharge.
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ──────────── Auto-recharge ──────────── */
function AutoRechargeCard({ tenantId, settings, onSaved }: { tenantId: string; settings: BillingSettingsRow | null; onSaved: () => void }) {
  const hasCard = !!settings?.default_payment_method_id;
  const [enabled, setEnabled] = useState<boolean>(!!settings?.auto_recharge_enabled);
  const [threshold, setThreshold] = useState<string>(String((settings?.threshold_cents ?? 500) / 100));
  const [topup, setTopup] = useState<string>(String((settings?.topup_amount_cents ?? 2000) / 100));
  const [saving, setSaving] = useState(false);

  // Sync state when settings load
  useEffect(() => {
    if (settings) {
      setEnabled(!!settings.auto_recharge_enabled);
      setThreshold(String((settings.threshold_cents ?? 500) / 100));
      setTopup(String((settings.topup_amount_cents ?? 2000) / 100));
    }
  }, [settings]);

  async function save() {
    if (enabled && !hasCard) {
      toast.error("Save a card first by making a top-up.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("save-billing-settings", {
        body: {
          tenant_id: tenantId,
          auto_recharge_enabled: enabled,
          threshold_cents: Math.round(Number(threshold) * 100),
          topup_amount_cents: Math.round(Number(topup) * 100),
        },
      });
      if (error) throw error;
      toast.success("Settings saved.");
      onSaved();
    } catch (e) {
      toast.error("Failed: " + ((e as Error)?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  const on = enabled && hasCard;

  return (
    <Card>
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: on ? COLORS.GRN + "22" : COLORS.S2,
              border: "1px solid " + (on ? COLORS.GRN + "55" : COLORS.B2),
              color: on ? COLORS.GRN : COLORS.T3,
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
            }}>⚡</div>
            <div>
              <div style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>Auto-recharge</div>
              <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 2 }}>Top up automatically when your balance drops below the threshold.</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: on ? COLORS.GRN : COLORS.T3 }}>
              {on ? "On" : "Off"}
            </span>
            <button
              onClick={() => setEnabled((v) => !v)}
              disabled={!hasCard}
              style={{
                position: "relative", width: 36, height: 20, borderRadius: 10,
                background: enabled ? COLORS.GRN : COLORS.B2,
                border: "none", cursor: hasCard ? "pointer" : "not-allowed",
                opacity: hasCard ? 1 : 0.5, transition: "background 0.2s",
              }}
            >
              <span style={{
                position: "absolute", top: 2, left: enabled ? 18 : 2,
                width: 16, height: 16, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s",
              }} />
            </button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <Field label="When balance drops below" value={threshold} onChange={setThreshold} min={1} />
          <Field label="Top up by" value={topup} onChange={setTopup} min={5} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, paddingTop: 14, borderTop: "1px solid " + COLORS.B1 }}>
          <div style={{ fontSize: 10, color: COLORS.T3 }}>
            {hasCard ? "🔒 Will charge your saved card automatically." : "⚠ Add a card by making a top-up first."}
          </div>
          <button
            onClick={save} disabled={saving}
            style={{
              background: COLORS.GRN, border: "none", borderRadius: 8,
              padding: "7px 16px", color: "#fff", fontSize: 12, fontWeight: 700,
              fontFamily: "inherit", cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1,
            }}
          >{saving ? "Saving…" : "Save settings"}</button>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, value, onChange, min }: { label: string; value: string; onChange: (v: string) => void; min: number }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ position: "relative", marginTop: 6 }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: COLORS.T3, fontFamily: "'League Spartan', sans-serif" }}>$</span>
        <input
          type="number" min={min} step={1} value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", height: 40, paddingLeft: 24, paddingRight: 12,
            background: COLORS.S2, border: "1px solid " + COLORS.B2, borderRadius: 8,
            color: COLORS.TEXT, fontFamily: "'League Spartan', sans-serif",
            fontSize: 14, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>
    </div>
  );
}

/* ──────────── Usage breakdown ──────────── */
function UsageBreakdown({ events }: { events: { operation: string; charged_cents: number }[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, { count: number; charged: number }>();
    for (const e of events) {
      const k = e.operation || "other";
      const cur = map.get(k) || { count: 0, charged: 0 };
      cur.count += 1;
      cur.charged += e.charged_cents || 0;
      map.set(k, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].charged - a[1].charged);
  }, [events]);
  const total = grouped.reduce((s, [, v]) => s + v.charged, 0);

  return (
    <Card>
      <div style={{ padding: 20 }}>
        <SectionHeader title="Usage breakdown" hint={`${events.length} events`} />
        {grouped.length === 0 ? (
          <div style={{ color: COLORS.T3, fontSize: 12, padding: "20px 0" }}>No AI usage yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {grouped.map(([op, v]) => {
              const pct = total > 0 ? Math.max(2, Math.round((v.charged / total) * 100)) : 0;
              return (
                <div key={op}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>{op}</span>
                    <span style={{ color: COLORS.T3 }}>
                      {v.count} · <span style={{ color: COLORS.TEXT, fontWeight: 600 }}>{formatUsd(v.charged)}</span>
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: COLORS.S2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: COLORS.GRN, transition: "width 0.5s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ──────────── Transactions ──────────── */
function TransactionsCard({ transactions }: { transactions: { id: string; created_at: string; type: string; amount_cents: number; balance_after_cents: number; description: string }[] }) {
  return (
    <Card>
      <div style={{ padding: 20 }}>
        <SectionHeader title="Transaction history" hint={transactions.length > 0 ? `${transactions.length} most recent` : undefined} />
        {transactions.length === 0 ? (
          <div style={{ color: COLORS.T3, fontSize: 12, padding: "20px 0" }}>No transactions yet.</div>
        ) : (
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["When", "Type", "Reason", "Amount", "Balance"].map((h, i) => (
                    <th key={h} style={{
                      textAlign: i >= 3 ? "right" : "left", padding: "8px 10px",
                      color: COLORS.T3, fontSize: 10, fontWeight: 700, letterSpacing: 0.7,
                      textTransform: "uppercase", borderBottom: "1px solid " + COLORS.B1,
                      background: COLORS.S2, position: "sticky", top: 0,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const isDebit = t.type === "debit";
                  const sign = isDebit ? "−" : "+";
                  const color = isDebit ? COLORS.RED : COLORS.GRN;
                  return (
                    <tr key={t.id}>
                      <td style={cellStyle()}>{new Date(t.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                      <td style={cellStyle()}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                          textTransform: "uppercase", letterSpacing: 0.5,
                          color, border: "1px solid " + color + "55", background: color + "15",
                        }}>{t.type}</span>
                      </td>
                      <td style={cellStyle()}>{t.description}</td>
                      <td style={{ ...cellStyle("right"), color, fontWeight: 700 }}>{sign}{formatUsd(Math.abs(t.amount_cents))}</td>
                      <td style={{ ...cellStyle("right"), color: COLORS.T2 }}>{formatUsd(t.balance_after_cents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function cellStyle(align: "left" | "right" = "left"): React.CSSProperties {
  return {
    textAlign: align, padding: "9px 10px",
    borderBottom: "1px solid " + COLORS.B1, whiteSpace: "nowrap",
    fontFamily: "'League Spartan', sans-serif",
  };
}