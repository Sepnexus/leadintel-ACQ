import { useEffect, useState } from "react";
import { toast } from "sonner";
import { COLORS } from "@/utils/leadUtils";
import { supabase } from "@/integrations/supabase/client";

type GhlField = { id: string; name: string };
type Mapping = { field_key: string; ghl_field_id: string; ghl_field_name: string | null };

const WEIGHT3_KEYS = [
  "seller_temperature", "last_offer_date", "last_offer_feedback", "last_offer_type",
  "last_offer_made", "timeline", "asking_price", "condition", "motivation",
  "seller_note", "lead_identity", "lead_source", "personality_type",
] as const;

const KEY_LABELS: Record<string, string> = {
  seller_temperature: "Seller Temperature",
  last_offer_date: "Last Offer Date",
  last_offer_feedback: "Last Offer Feedback",
  last_offer_type: "Last Offer Type",
  last_offer_made: "Last Offer Made",
  timeline: "Timeline",
  asking_price: "Asking Price",
  condition: "Condition",
  motivation: "Motivation",
  seller_note: "Seller Note",
  lead_identity: "Lead Identity",
  lead_source: "Lead Source",
  personality_type: "Personality Type",
};

export function TenantFieldsTab({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [allFields, setAllFields] = useState<GhlField[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discovered, setDiscovered] = useState(false);

  // Load existing mappings on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tenant_custom_field_mappings")
        .select("field_key, ghl_field_id, ghl_field_name")
        .eq("tenant_id", tenantId);
      if (cancelled) return;
      const sel: Record<string, string> = {};
      for (const row of (data ?? []) as Mapping[]) sel[row.field_key] = row.ghl_field_id;
      setSelections(sel);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  async function discover() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("discover-tenant-fields", {
        body: { tenant_id: tenantId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "discovery failed");
      setAllFields(data.all_fields ?? []);
      setDiscovered(true);
      toast.success(`Loaded ${data.all_fields?.length ?? 0} fields from GHL`);
    } catch (e: any) {
      toast.error(`Discover failed: ${e?.message ?? "unknown"}`);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const mappings = WEIGHT3_KEYS
        .filter((k) => selections[k])
        .map((k) => {
          const f = allFields.find((x) => x.id === selections[k]);
          return { field_key: k, ghl_field_id: selections[k], ghl_field_name: f?.name ?? null };
        });
      // Include cleared keys (empty selection) so backend deletes them
      const cleared = WEIGHT3_KEYS.filter((k) => selections[k] === "").map((k) => ({
        field_key: k, ghl_field_id: "", ghl_field_name: null,
      }));

      const { data, error } = await supabase.functions.invoke("save-tenant-field-mappings", {
        body: { tenant_id: tenantId, mappings: [...mappings, ...cleared] },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "save failed");
      toast.success("Field mapping saved. Triggering re-sync…");

      // Trigger full contacts sync so new mappings take effect
      await supabase.functions.invoke("ghl-sync", {
        body: { tenant_id: tenantId, resource: "contacts", mode: "full" },
      });
      toast.success("Contacts re-sync started");
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message ?? "unknown"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ color: COLORS.TEXT, fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "'League Spartan', sans-serif", fontSize: 16, color: COLORS.TEXT }}>
            Custom Field Mapping
          </h3>
          <div style={{ color: COLORS.T2, fontSize: 12, marginTop: 4 }}>
            Map this tenant's GHL custom fields to the 13 Weight-3 lead signals.
          </div>
        </div>
        <button
          onClick={discover}
          disabled={loading}
          style={{
            background: COLORS.GRN, color: "#000", border: "none", borderRadius: 8,
            padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: loading ? "wait" : "pointer",
            fontFamily: "inherit", opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Loading…" : "Discover fields from GHL"}
        </button>
      </div>

      {!discovered && allFields.length === 0 && (
        <div style={{
          padding: 16, border: "1px dashed " + COLORS.B2, borderRadius: 8,
          color: COLORS.T2, fontSize: 12, marginBottom: 16,
        }}>
          Click "Discover fields from GHL" to load this tenant's custom fields, then assign each Weight-3 signal.
          {Object.keys(selections).length > 0 && (
            <div style={{ marginTop: 8, color: COLORS.GRN }}>
              {Object.keys(selections).length} of {WEIGHT3_KEYS.length} fields are already mapped.
            </div>
          )}
        </div>
      )}

      <div style={{ border: "1px solid " + COLORS.B1, borderRadius: 8, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "200px 1fr", gap: 0,
          background: COLORS.B1, padding: "8px 12px", fontSize: 11, fontWeight: 600, color: COLORS.T2,
        }}>
          <div>Weight-3 Field</div>
          <div>GHL Custom Field</div>
        </div>
        {WEIGHT3_KEYS.map((k, idx) => (
          <div
            key={k}
            style={{
              display: "grid", gridTemplateColumns: "200px 1fr", gap: 0, alignItems: "center",
              padding: "10px 12px",
              borderTop: idx === 0 ? "none" : "1px solid " + COLORS.B1,
              background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
            }}
          >
            <div style={{ color: COLORS.TEXT, fontSize: 12 }}>
              {KEY_LABELS[k]}
              <div style={{ color: COLORS.T2, fontSize: 10, fontFamily: "monospace" }}>{k}</div>
            </div>
            <select
              value={selections[k] ?? ""}
              onChange={(e) => setSelections((s) => ({ ...s, [k]: e.target.value }))}
              disabled={!discovered && allFields.length === 0}
              style={{
                background: COLORS.BG, color: COLORS.TEXT, border: "1px solid " + COLORS.B2,
                borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "inherit", width: "100%",
              }}
            >
              <option value="">— not mapped —</option>
              {allFields.length === 0 && selections[k] && (
                <option value={selections[k]}>(currently mapped: {selections[k]})</option>
              )}
              {allFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            background: COLORS.GRN, color: "#000", border: "none", borderRadius: 8,
            padding: "10px 18px", fontSize: 13, fontWeight: 600,
            cursor: saving ? "wait" : "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : `Save mapping for ${tenantName}`}
        </button>
      </div>
    </div>
  );
}