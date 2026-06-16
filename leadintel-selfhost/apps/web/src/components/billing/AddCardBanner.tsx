// Replaced with a redirect to the unified Account → Billing page in the launcher.
// Billing (wallet, card, top-up) is no longer managed inside Lead Intel —
// the same wallet is used for ACQ Coach too, so it lives in your platform Account.

import { COLORS } from "@/utils/leadUtils";

export function AddCardBanner() {
  const launcherUrl = (() => {
    if (typeof window === "undefined") return "http://localhost:8080/#/account";
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    return isLocal ? "http://localhost:8080/#/account" : "/#/account";
  })();

  return (
    <div style={{
      margin: "12px 0", padding: "12px 16px", borderRadius: 10,
      // Theme-aware (COLORS adapts to light/dark) — the old hardcoded pale-green
      // text washed out to near-invisible on the light theme.
      border: "1px solid " + COLORS.GRN + "40",
      background: COLORS.GRN + "12",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, flexWrap: "wrap", fontSize: 12.5,
      fontFamily: "'Open Sans', system-ui, sans-serif",
    }}>
      <div style={{ color: COLORS.TEXT }}>
        <strong>Billing is unified.</strong> Top up your wallet and manage payment methods in your platform <strong>Account</strong> — the same wallet covers ACQ Coach + Lead Intel.
      </div>
      <a href={launcherUrl} style={{
        flexShrink: 0, border: "1px solid " + COLORS.GRN,
        background: COLORS.GRN,
        padding: "7px 14px", borderRadius: 8, fontSize: 12,
        color: "#fff", textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap",
      }}>Go to Account → Billing</a>
    </div>
  );
}
