import { toast } from "sonner";

export interface AiErrorResponse {
  ok?: boolean;
  error?: string;
  code?: "insufficient_balance" | "tenant_not_found" | "provider_error" | string;
}

/**
 * Returns true if the response represented an error AND a toast was shown.
 * Caller should treat true as "stop processing this response".
 */
export function handleAiResponseError(data: AiErrorResponse | null | undefined): boolean {
  if (!data || data.ok !== false) return false;
  const code = data.code;
  const msg = data.error ?? "AI request failed.";

  if (code === "insufficient_balance") {
    toast.error("Wallet balance too low to run AI features.", {
      description: msg,
      action: {
        label: "Top up",
        // 7a: placeholder. 7b will open Stripe checkout modal here.
        onClick: () => toast.info("Stripe top-ups arrive in Phase 7b."),
      },
    });
    return true;
  }

  if (code === "tenant_not_found") {
    toast.error("Tenant configuration error.", { description: msg });
    return true;
  }

  toast.error("AI request failed.", { description: msg });
  return true;
}