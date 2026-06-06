// "Moved to your Account" banner shown on LI's customer-admin pages.
import React from "react";

export function AccountMovedBanner({ what }: { what: string }) {
  const launcherUrl = (() => {
    if (typeof window === "undefined") return "http://localhost:8080/#/account";
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    return isLocal ? "http://localhost:8080/#/account" : "/#/account";
  })();
  return (
    <div style={{
      marginBottom: 16, padding: "12px 14px", borderRadius: 8,
      border: "1px solid rgba(126,181,106,0.30)",
      background: "rgba(60,120,80,0.10)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, flexWrap: "wrap", fontSize: 13,
      fontFamily: "'Open Sans', system-ui, sans-serif",
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", minWidth: 0 }}>
        <span style={{
          background: "rgba(126,181,106,0.20)", color: "#b8e0a3",
          padding: "2px 8px", borderRadius: 4, fontSize: 10,
          fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
          flexShrink: 0, marginTop: 1,
        }}>Moved</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#d6e8c4" }}>
            <strong>{what}</strong> is now managed in your <strong>Account</strong> (across both ACQ Coach + Lead Intel).
          </div>
          <div style={{ color: "#a6b89a", fontSize: 11, marginTop: 4 }}>
            Make changes in one place and they apply everywhere.
          </div>
        </div>
      </div>
      <a href={launcherUrl} style={{
        flexShrink: 0, border: "1px solid rgba(126,181,106,0.40)",
        background: "rgba(126,181,106,0.15)",
        padding: "6px 12px", borderRadius: 6, fontSize: 12,
        color: "#d6e8c4", textDecoration: "none", fontWeight: 500,
      }}>Go to Account →</a>
    </div>
  );
}
