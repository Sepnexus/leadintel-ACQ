import { COLORS } from "@/utils/leadUtils";

export function EmptyTenantState() {
  return (
    <div style={{
      background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 12,
      padding: "48px 24px", textAlign: "center", color: COLORS.T2, fontSize: 14,
      maxWidth: 480, margin: "80px auto",
    }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.TEXT, marginBottom: 8 }}>
        No tenant assigned
      </div>
      <div style={{ color: COLORS.T3, lineHeight: 1.5 }}>
        You're not assigned to a tenant yet. Contact your administrator.
      </div>
    </div>
  );
}