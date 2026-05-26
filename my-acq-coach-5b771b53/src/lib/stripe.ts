// Direct-Stripe integration: payments are always considered "configured"
// since secrets live in edge functions. The active mode (test/live) is
// controlled by app_settings.stripe_mode and surfaced via the server when
// creating a checkout session.

export type StripeMode = "test" | "live";

export function isPaymentsConfigured(): boolean {
  // Always true now — server validates keys per-mode at session creation.
  return true;
}
