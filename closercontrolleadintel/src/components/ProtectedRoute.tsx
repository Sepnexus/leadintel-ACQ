import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { COLORS } from "@/utils/leadUtils";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: COLORS.BG,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: COLORS.T2, fontSize: 13, fontFamily: "'Open Sans', sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            display: "inline-block", width: 14, height: 14,
            border: "2px solid " + COLORS.B2, borderTopColor: COLORS.GRN,
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          Loading…
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}