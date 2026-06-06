// Replaced with a redirect to the unified Account → Billing page in the launcher.
// Billing (wallet, card, top-up) is no longer managed inside Lead Intel —
// the same wallet is used for ACQ Coach too, so it lives in your platform Account.

export function AddCardBanner() {
  const launcherUrl = (() => {
    if (typeof window === "undefined") return "http://localhost:8080/#/account";
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    return isLocal ? "http://localhost:8080/#/account" : "/#/account";
  })();

  return (
    <div style={{
      margin: "12px 0", padding: "10px 14px", borderRadius: 8,
      border: "1px solid rgba(126,181,106,0.30)",
      background: "rgba(60,120,80,0.10)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, flexWrap: "wrap", fontSize: 12.5,
      fontFamily: "'Open Sans', system-ui, sans-serif",
    }}>
      <div style={{ color: "#d6e8c4" }}>
        <strong>Billing is unified.</strong> Top up your wallet and manage payment methods in your platform <strong>Account</strong> — the same wallet covers ACQ Coach + Lead Intel.
      </div>
      <a href={launcherUrl} style={{
        flexShrink: 0, border: "1px solid rgba(126,181,106,0.40)",
        background: "rgba(126,181,106,0.15)",
        padding: "6px 12px", borderRadius: 6, fontSize: 12,
        color: "#d6e8c4", textDecoration: "none", fontWeight: 500,
      }}>Go to Account → Billing</a>
    </div>
  );
}
