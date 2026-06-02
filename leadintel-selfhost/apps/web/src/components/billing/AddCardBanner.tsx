import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { COLORS } from "@/utils/leadUtils";

/**
 * Subtle banner prompting tenants without a saved card to add one
 * so usage isn't interrupted. Hidden once a default payment method
 * is on file, or while data is loading.
 */
export function AddCardBanner() {
  const { tenant, role, loading: tenantLoading } = useCurrentTenant();
  const [loading, setLoading] = useState(true);
  const [hasCard, setHasCard] = useState<boolean>(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (tenantLoading) return;
    if (!tenant) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("billing_settings")
        .select("default_payment_method_id")
        .eq("tenant_id", tenant.id)
        .maybeSingle();
      if (cancelled) return;
      setHasCard(!!data?.default_payment_method_id);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenant, tenantLoading]);

  if (tenantLoading || loading) return null;
  if (!tenant) return null;
  if (role !== "tenant_user" && role !== "super_admin") return null;
  if (hasCard) return null;
  if (dismissed) return null;

  return (
    <div style={{
      background: COLORS.S2,
      border: "1px solid " + COLORS.AMB + "40",
      borderLeft: "3px solid " + COLORS.AMB,
      borderRadius: 10,
      padding: "10px 14px",
      margin: "0 0 14px 0",
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
      fontFamily: "'Open Sans', sans-serif",
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: COLORS.AMB, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: COLORS.TEXT, lineHeight: 1.5 }}>
        Add a payment method to keep Lead Intel running without interruption.
      </div>
      <Link
        to="/billing"
        style={{
          background: "transparent",
          border: "1px solid " + COLORS.GRN + "80",
          color: COLORS.GRN,
          padding: "6px 14px",
          borderRadius: 7,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "none",
          fontFamily: "'League Spartan', sans-serif",
          letterSpacing: 0.3,
        }}
      >
        Add card
      </Link>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          background: "transparent", border: "none", color: COLORS.T3,
          fontSize: 16, cursor: "pointer", padding: "2px 6px", lineHeight: 1,
        }}
      >×</button>
    </div>
  );
}