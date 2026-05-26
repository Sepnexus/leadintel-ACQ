import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PipelineFromGhl {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

interface Props {
  tenantId: string;
  onSaved?: () => void;
  /** Inline (Settings page) vs modal (first-login wizard) — purely cosmetic. */
  variant?: "inline" | "modal";
}

/**
 * Reusable pipeline selection panel. Used inside both the modal wizard
 * and the Settings → Pipelines section.
 */
export function PipelineSelectionPanel({ tenantId, onSaved, variant = "inline" }: Props) {
  const [pipelines, setPipelines] = useState<PipelineFromGhl[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: invokeErr } = await supabase.functions.invoke("list-tenant-pipelines", {
      body: { tenant_id: tenantId },
    });
    if (invokeErr) {
      setError(invokeErr.message || "Failed to load pipelines");
      setLoading(false);
      return;
    }
    if (data?.error) {
      setError(data.error);
      setLoading(false);
      return;
    }
    setPipelines(data?.pipelines ?? []);
    setSelected(new Set(data?.current_selections ?? []));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(pipelines.map((p) => p.id)));
  const clearAll = () => setSelected(new Set());

  const save = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const { data, error: invokeErr } = await supabase.functions.invoke("save-tenant-pipelines", {
      body: {
        tenant_id: tenantId,
        selected_pipeline_ids: Array.from(selected),
        pipelines_meta: pipelines.map((p) => ({ id: p.id, name: p.name })),
      },
    });
    setSaving(false);
    if (invokeErr || data?.error) {
      toast.error(invokeErr?.message || data?.error || "Save failed");
      return;
    }
    toast.success("Pipeline selection saved. Re-syncing opportunities…");
    onSaved?.();
  };

  if (loading) {
    return <div style={{ padding: 16, color: "#888", fontSize: 13 }}>Loading pipelines from GoHighLevel…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: 16, color: "#e74c3c", fontSize: 13 }}>
        {error}
        <button onClick={load} style={{ marginLeft: 12, background: "transparent", border: "1px solid #4e7d3d", color: "#4e7d3d", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
          Retry
        </button>
      </div>
    );
  }
  if (pipelines.length === 0) {
    return <div style={{ padding: 16, color: "#888", fontSize: 13 }}>No pipelines found in this GHL location.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "#aaa" }}>
          <span style={{ color: "#fff", fontWeight: 600 }}>{selected.size}</span> of {pipelines.length} pipelines selected
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={selectAll} style={btnSecondary}>Select all</button>
          <button onClick={clearAll} style={btnSecondary}>Clear all</button>
        </div>
      </div>
      <div style={{ background: "#0a0a0a", border: "1px solid #222", borderRadius: 10, maxHeight: variant === "modal" ? 360 : 480, overflow: "auto" }}>
        {pipelines.map((p) => {
          const isOn = selected.has(p.id);
          return (
            <label key={p.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 14px", borderBottom: "1px solid #1a1a1a",
              cursor: "pointer", background: isOn ? "rgba(78,125,61,0.08)" : "transparent",
            }}>
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => toggle(p.id)}
                style={{ accentColor: "#4e7d3d", width: 16, height: 16, cursor: "pointer" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: "#888", marginTop: 2 }}>
                  {p.stages.length} stage{p.stages.length === 1 ? "" : "s"}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
        <button
          onClick={save}
          disabled={selected.size === 0 || saving}
          style={{
            background: selected.size === 0 ? "#222" : "#4e7d3d",
            border: "none",
            color: "#fff",
            padding: "8px 18px",
            borderRadius: 7,
            fontSize: 12,
            fontWeight: 600,
            cursor: selected.size === 0 || saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
            fontFamily: "inherit",
          }}
        >
          {saving ? "Saving…" : "Save selection"}
        </button>
      </div>
    </div>
  );
}

const btnSecondary: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #333",
  color: "#aaa",
  padding: "4px 10px",
  borderRadius: 6,
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "inherit",
};