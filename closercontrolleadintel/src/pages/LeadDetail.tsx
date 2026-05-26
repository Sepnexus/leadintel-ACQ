import { useNavigate, useParams } from "react-router-dom";
import { COLORS } from "@/utils/leadUtils";

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: "100vh", background: COLORS.BG, color: COLORS.TEXT, padding: "32px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: "transparent", border: "1px solid " + COLORS.B2, borderRadius: 8, padding: "6px 12px", color: COLORS.T2, fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginBottom: 20 }}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Lead detail</h1>
        <div style={{ fontSize: 13, color: COLORS.T2, marginBottom: 16 }}>
          Contact ID: <span className="font-mono">{id}</span>
        </div>
        <div style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 12, padding: "20px 22px", color: COLORS.T2, fontSize: 13, lineHeight: 1.6 }}>
          Detail view is coming in a separate PR. For now, this is a placeholder so row clicks don't 404.
        </div>
      </div>
    </div>
  );
}