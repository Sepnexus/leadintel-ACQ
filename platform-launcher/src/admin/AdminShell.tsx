// Top-level admin shell — handles tab state + which page is shown.

import { useEffect, useState } from "react";
import { AdminLayout, AdminTab } from "./AdminLayout";
import { AdminUsersPage } from "./AdminUsersPage";
import { AdminCustomersPage } from "./AdminCustomersPage";
import { AdminAuditPage } from "./AdminAuditPage";
import { AdminPlatformSettingsPage } from "./AdminPlatformSettingsPage";
import { ToastProvider } from "./Toast";
import { adminApi } from "./adminApi";
import { COLORS } from "../theme";

export function AdminShell({ onClose }: { onClose: () => void }) {
  const initialTab = ((): AdminTab => {
    const h = window.location.hash;
    if (h.startsWith("#/admin/customers")) return "customers";
    if (h.startsWith("#/admin/audit"))     return "audit";
    if (h.startsWith("#/admin/settings"))  return "settings";
    return "users";
  })();
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  // Verify the current user is actually a platform admin before showing anything.
  useEffect(() => {
    adminApi.me().then(r => {
      setAuthed(r.ok);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    window.history.replaceState(null, "", `#/admin/${tab}`);
  }, [tab]);

  if (!authChecked) {
    return <div style={{ padding: 40, color: COLORS.T3, textAlign: "center" }}>Checking permissions…</div>;
  }
  if (!authed) {
    return (
      <AdminLayout tab="users" onTab={() => {}} onClose={onClose}>
        <div style={{ padding: 40, textAlign: "center", color: COLORS.T2 }}>
          <h2 style={{ color: COLORS.TEXT }}>Not authorized</h2>
          <p>Your account is not a platform admin.</p>
        </div>
      </AdminLayout>
    );
  }
  return (
    <ToastProvider>
      <AdminLayout tab={tab} onTab={setTab} onClose={onClose}>
        {tab === "users"     && <AdminUsersPage />}
        {tab === "customers" && <AdminCustomersPage />}
        {tab === "audit"     && <AdminAuditPage />}
        {tab === "settings"  && <AdminPlatformSettingsPage />}
      </AdminLayout>
    </ToastProvider>
  );
}
