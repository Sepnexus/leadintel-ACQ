import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function PaymentTestModeBanner() {
  const [mode, setMode] = useState<"test" | "live" | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.from("app_settings").select("stripe_mode").eq("id", true).maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setMode((data?.stripe_mode === "live" ? "live" : "test"));
      });
    return () => { cancelled = true; };
  }, []);

  if (mode !== "test") return null;
  return (
    <div className="w-full bg-amber-500/15 border border-amber-500/40 px-3 py-1.5 text-center text-[11px] text-amber-300 rounded">
      Test mode — use card <span className="font-mono">4242 4242 4242 4242</span>, any future expiry, any CVC.
    </div>
  );
}
