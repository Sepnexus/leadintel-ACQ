// "Moved to your Account" banner shown on ACQ's customer-admin pages
// (Team, Billing) — points users to the unified Account page in the launcher.
//
// Different from the platform-admin banner on SuperAdmin which is for
// super_admins only. This one is for account_admin / regular customer users.

import React from "react";

export function AccountMovedBanner({ what }: { what: string }) {
  const launcherUrl = (() => {
    if (typeof window === "undefined") return "http://localhost:8080/#/account";
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    return isLocal ? "http://localhost:8080/#/account" : "/#/account";
  })();

  return (
    <div className="mb-4 rounded-lg border border-emerald-700/40 bg-emerald-950/20 p-3 text-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 inline-block rounded bg-emerald-700/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">Moved</span>
          <div className="min-w-0">
            <div className="text-emerald-100">
              <strong>{what}</strong> is now managed in your <strong>Account</strong> (across ACQ Coach + Lead Intel).
            </div>
            <div className="text-[12px] text-emerald-200/70 mt-1">
              Make changes in one place and they apply everywhere.
            </div>
          </div>
        </div>
        <a
          href={launcherUrl}
          className="shrink-0 rounded border border-emerald-600/50 bg-emerald-700/20 px-3 py-1.5 text-[12px] font-medium text-emerald-100 hover:bg-emerald-700/40 transition-colors no-underline"
        >
          Go to Account →
        </a>
      </div>
    </div>
  );
}
