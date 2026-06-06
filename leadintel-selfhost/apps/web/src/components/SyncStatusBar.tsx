// Application-wide sync status indicator.
// Polls sync_history every 5s and shows a banner at the top of the app
// whenever there's a running sync for the current tenant.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";

interface SyncState {
  running: boolean;
  resources: string[];
  startedAt: string | null;
}

export function SyncStatusBar() {
  const { tenant } = useCurrentTenant();
  const [state, setState] = useState<SyncState>({ running: false, resources: [], startedAt: null });

  useEffect(() => {
    if (!tenant?.id) return;
    let cancelled = false;
    async function check() {
      const { data } = await supabase
        .from("sync_history")
        .select("resource, started_at, status")
        .eq("tenant_id", tenant.id)
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(10);
      if (cancelled) return;
      if (data && data.length > 0) {
        setState({
          running: true,
          resources: [...new Set(data.map(d => d.resource))],
          startedAt: data[0].started_at,
        });
      } else {
        setState({ running: false, resources: [], startedAt: null });
      }
    }
    check();
    const t = setInterval(check, 5_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [tenant?.id]);

  if (!state.running) return null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0,
      background: "linear-gradient(90deg, #4e7d3d 0%, #5a9147 100%)",
      color: "#fff", fontFamily: "'Open Sans', sans-serif", fontSize: 12,
      padding: "6px 16px", textAlign: "center",
      zIndex: 99999, fontWeight: 600, letterSpacing: 0.3,
      boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
    }}>
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999,
        background: "#fff", marginRight: 8, animation: "ccPulse 1.2s ease-in-out infinite" }} />
      Syncing {state.resources.join(", ")} from GHL — keeps running if you navigate away
      <style>{`@keyframes ccPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </div>
  );
}
