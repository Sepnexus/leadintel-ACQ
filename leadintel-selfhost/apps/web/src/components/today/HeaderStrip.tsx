import { useEffect, useState } from "react";
import { COLORS } from "@/utils/leadUtils";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useTenantFilter } from "@/hooks/useTenantFilter";

export type AiStatus = "ready" | "exhausted" | "analyzing";

interface HeaderStripProps {
  isMobile: boolean;
  reps: string[];
  repFilter: string;
  onRepChange: (v: string) => void;
  onAddLead: () => void;
  aiStatus: AiStatus;
  onAiPillClick?: () => void;
  userMenu?: React.ReactNode;
}

function ageMinutes(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

function ageLabel(mins: number | null): string {
  if (mins == null) return "Never synced";
  if (mins < 1) return "Synced just now";
  if (mins < 60) return `Synced ${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `Synced ${h}h ago`;
  return `Synced ${Math.floor(h / 24)}d ago`;
}

function syncColor(mins: number | null): string {
  if (mins == null) return COLORS.RED;
  if (mins < 15) return COLORS.T2;
  if (mins < 60) return COLORS.AMB;
  return COLORS.RED;
}

export function HeaderStrip({
  isMobile, reps, repFilter, onRepChange, onAddLead, aiStatus, onAiPillClick, userMenu,
}: HeaderStripProps) {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { tenantFilter } = useTenantFilter();
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [, setTick] = useState(0);
  const [aiPopover, setAiPopover] = useState(false);

  async function fetchSyncTime() {
    let q: any = supabase
      .from("sync_state")
      .select("resource, last_delta_sync_at, last_full_sync_at");
    if (tenantFilter) q = q.eq("tenant_id", tenantFilter);
    const { data } = await q
      .order("last_delta_sync_at", { ascending: false, nullsFirst: false })
      .limit(10);
    if (!data) return;
    let newest: string | null = null;
    for (const row of data) {
      const candidates = [row.last_delta_sync_at, row.last_full_sync_at].filter(Boolean) as string[];
      for (const c of candidates) {
        if (!newest || new Date(c) > new Date(newest)) newest = c;
      }
    }
    setLastSyncAt(newest);
  }

  useEffect(() => {
    fetchSyncTime();
    const interval = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function handleSync() {
    if (syncing) return;
    if (!tenantId) {
      console.warn("sync skipped: no tenant selected");
      return;
    }
    setSyncing(true);
    try {
      await supabase.functions.invoke("ghl-sync", {
        body: { mode: "delta", tenant_id: tenantId },
      });
      await fetchSyncTime();
    } catch (e) {
      console.error("sync failed", e);
    } finally {
      setSyncing(false);
    }
  }

  const mins = ageMinutes(lastSyncAt);
  const sc = syncColor(mins);

  const aiColor =
    aiStatus === "ready" ? COLORS.GRN : aiStatus === "analyzing" ? COLORS.BLU : COLORS.RED;
  const aiLabel =
    aiStatus === "ready" ? "AI ready" : aiStatus === "analyzing" ? "AI analyzing…" : "AI exhausted";

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 8, flexWrap: isMobile ? "wrap" : "nowrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/assets/closer-control-logo.png" alt="Closer Control" style={{ height: isMobile ? 24 : 30 }} />
        <span style={{ fontSize: 9, fontWeight: 600, color: COLORS.GRN, background: COLORS.GRN + "15", border: "1px solid " + COLORS.GRN + "25", borderRadius: 4, padding: "1px 6px" }}>AI</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {/* Sync pill */}
        <button
          onClick={handleSync}
          disabled={syncing || !tenantId}
          title={!tenantId ? "Select a tenant to sync" : "Click refresh to sync now"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: sc + "10", border: "1px solid " + sc + "35",
            borderRadius: 999, padding: "5px 10px",
            color: sc, fontSize: 10.5, fontFamily: "inherit",
            cursor: syncing || !tenantId ? "default" : "pointer",
            opacity: !tenantId ? 0.5 : 1,
          }}
        >
          <span style={{
            display: "inline-block", width: 12, height: 12,
            animation: syncing ? "spin 0.9s linear infinite" : "none",
          }}>↻</span>
          {syncing ? "Syncing…" : ageLabel(mins)}
        </button>

        {/* AI pill */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => { setAiPopover((v) => !v); onAiPillClick?.(); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: aiColor + "10", border: "1px solid " + aiColor + "35",
              borderRadius: 999, padding: "5px 10px",
              color: aiColor, fontSize: 10.5, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: aiColor,
              animation: aiStatus === "analyzing" ? "pulse-glow 1.5s infinite" : "none",
            }} />
            {aiLabel}
          </button>
          {aiPopover && aiStatus === "exhausted" && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 20,
              width: 240, background: COLORS.S2, border: "1px solid " + COLORS.B2,
              borderRadius: 10, padding: "10px 12px", fontSize: 11, color: COLORS.T2,
              lineHeight: 1.5,
            }}>
              AI credits exhausted. Add funds in Workspace → Usage.
            </div>
          )}
        </div>

        {/* Rep selector */}
        <select
          value={repFilter}
          onChange={(e) => onRepChange(e.target.value)}
          style={{ background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 8, color: COLORS.T2, fontSize: 11, padding: "5px 10px", fontFamily: "inherit", outline: "none", cursor: "pointer" }}
        >
          {reps.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <button
          onClick={onAddLead}
          style={{ background: "transparent", border: "1px solid " + COLORS.B2, borderRadius: 8, padding: "5px 12px", color: COLORS.T2, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
        >
          + Add Lead
        </button>
        {userMenu}
      </div>
    </div>
  );
}