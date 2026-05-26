import { COLORS } from "@/utils/leadUtils";

export function CallHistoryStub() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          color: COLORS.T3,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Call history
      </div>
      <div
        style={{
          background: COLORS.S1,
          border: "1px dashed " + COLORS.B2,
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 12,
          color: COLORS.T3,
          fontStyle: "italic",
        }}
      >
        Call history syncs from GHL coming soon.
      </div>
    </div>
  );
}