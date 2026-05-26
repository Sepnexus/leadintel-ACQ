import { useEffect, useState } from "react";
import { COLORS } from "@/utils/leadUtils";
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/data/leads";
import { fallbackOpeningLine } from "./leadDetailUtils";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { handleAiResponseError, type AiErrorResponse } from "@/lib/aiErrorToast";

interface Props {
  lead: Lead;
  aiAvailable: boolean;
  override?: string | null;
}

export function OpeningLineCard({ lead, aiAvailable, override }: Props) {
  const { tenant, loading: tenantLoading } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [line, setLine] = useState<string>(() => fallbackOpeningLine(lead));
  const [loading, setLoading] = useState(false);
  const [usedAi, setUsedAi] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // If intelligence provided an opening line, use it and skip the per-card AI call
    if (override && override.trim()) {
      setLine(override.trim());
      setUsedAi(true);
      setLoading(false);
      return;
    }
    setLine(fallbackOpeningLine(lead));
    setUsedAi(false);
    if (!aiAvailable) return;
    if (tenantLoading) return;
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const summary = [
          `Lead: ${(lead.firstName || "") + " " + (lead.lastName || "")}`.trim(),
          `Niche: ${lead.niche || lead.source}`,
          `Stage: ${lead.pipelineStageName || lead.stage}`,
          `Disposition: ${lead.sellerDisposition || "—"}`,
          `Address: ${lead.address}`,
          `Last contact: ${lead.daysSince ?? 999}d ago`,
          lead.tags?.length ? `Tags: ${lead.tags.slice(0, 6).join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const { data, error } = await supabase.functions.invoke("ai-analyze", {
          body: {
            system:
              "You write a single-sentence (max 2 sentence) cold-call opening line for a real estate acquisitions rep. Warm, natural, casual. No greetings beyond 'Hi {first name}'. Output ONLY the line, no quotes, no preamble.",
            messages: [{ role: "user", content: summary }],
            max_tokens: 120,
            tenant_id: tenantId,
            caller_hint: "opening_line",
          },
        });
        if (cancelled) return;
        if (handleAiResponseError(data as AiErrorResponse | null | undefined)) { return; }
        if (error || !data?.text) {
          // keep fallback
          return;
        }
        const text = String(data.text).trim().replace(/^"|"$/g, "");
        if (text) {
          setLine(text);
          setUsedAi(true);
        }
      } catch {
        // keep fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lead, aiAvailable, override, tenantId, tenantLoading]);

  function handleCopy() {
    navigator.clipboard.writeText(line).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            color: COLORS.T3,
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
        >
          Suggested opening line {loading && <span style={{ color: COLORS.T3 }}>· thinking…</span>}
          {!loading && !usedAi && aiAvailable && (
            <span style={{ color: COLORS.T3 }}> · template</span>
          )}
        </div>
        <button
          onClick={handleCopy}
          style={{
            background: "transparent",
            border: "1px solid " + COLORS.B2,
            borderRadius: 6,
            padding: "3px 10px",
            color: copied ? COLORS.GRN : COLORS.T2,
            fontSize: 10,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <div
        style={{
          background: COLORS.S3,
          border: "1px solid " + COLORS.B2,
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 13,
          color: COLORS.TEXT,
          lineHeight: 1.6,
          fontStyle: "italic",
        }}
      >
        {line}
      </div>
    </div>
  );
}