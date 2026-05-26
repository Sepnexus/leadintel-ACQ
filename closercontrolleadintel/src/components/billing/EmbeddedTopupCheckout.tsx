import { useCallback, useMemo, useRef } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  amountCents: number;
  /** URL to return to after Stripe completes (will receive ?session_id=...). */
  returnUrl?: string;
}

const stripeCache = new Map<string, Promise<Stripe | null>>();
function getStripe(pk: string) {
  let p = stripeCache.get(pk);
  if (!p) { p = loadStripe(pk); stripeCache.set(pk, p); }
  return p;
}

/**
 * Renders Stripe's Embedded Checkout inline (no popup, no redirect).
 * Mirrors the My Acq Coach pattern.
 */
export function EmbeddedTopupCheckout({ amountCents, returnUrl }: Props) {
  const sessionPromiseRef = useRef<Promise<{ clientSecret: string; publishableKey: string }> | null>(null);

  const ensureSession = useCallback(() => {
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = (async () => {
        const origin = window.location.origin;
        const back = returnUrl || `${origin}/billing`;
        const sep = back.includes("?") ? "&" : "?";
        const { data, error } = await supabase.functions.invoke("create-checkout-session", {
          body: {
            env: "live",
            mode: "payment",
            ui_mode: "embedded",
            amount_cents: amountCents,
            return_url: `${back}${sep}topup=success&session_id={CHECKOUT_SESSION_ID}`,
          },
        });
        if (error) throw error;
        if (!data?.client_secret || !data?.publishable_key) {
          throw new Error(data?.error || "Could not start checkout");
        }
        return {
          clientSecret: data.client_secret as string,
          publishableKey: data.publishable_key as string,
        };
      })();
    }
    return sessionPromiseRef.current;
  }, [amountCents, returnUrl]);

  const fetchClientSecret = useCallback(
    async () => (await ensureSession()).clientSecret,
    [ensureSession],
  );

  const stripePromise = useMemo<Promise<Stripe | null>>(
    () => ensureSession().then(({ publishableKey }) => getStripe(publishableKey)),
    [ensureSession],
  );

  const options = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret]);

  return (
    <div id="checkout" style={{ background: "#fff", borderRadius: 8, overflow: "hidden" }}>
      <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}