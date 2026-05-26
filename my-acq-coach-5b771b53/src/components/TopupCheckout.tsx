import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { useAuth } from "@/hooks/useAuth";
import { useCallback, useMemo, useRef } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface Props {
  accountId: string;
  amountCents: number;
  returnUrl?: string;
}

const stripeCache = new Map<string, Promise<Stripe | null>>();
function getStripe(pk: string) {
  let p = stripeCache.get(pk);
  if (!p) { p = loadStripe(pk); stripeCache.set(pk, p); }
  return p;
}

export function TopupCheckout({ accountId, amountCents, returnUrl }: Props) {
  const { session } = useAuth();
  // Cache the in-flight session so fetchClientSecret returns the same one
  // even if Stripe's provider calls it again.
  const sessionPromiseRef = useRef<Promise<{ clientSecret: string; publishableKey: string }> | null>(null);

  const ensureSession = useCallback(() => {
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = (async () => {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/create-topup-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            apikey: SUPABASE_KEY,
          },
          body: JSON.stringify({
            account_id: accountId,
            amount_cents: amountCents,
            return_url: returnUrl || window.location.origin + "/?view=billing",
          }),
        });
        const d = await r.json();
        if (!r.ok || !d.clientSecret || !d.publishableKey) {
          throw new Error(d.error || "Could not start checkout");
        }
        return { clientSecret: d.clientSecret, publishableKey: d.publishableKey };
      })();
    }
    return sessionPromiseRef.current;
  }, [accountId, amountCents, returnUrl, session?.access_token]);

  const fetchClientSecret = useCallback(async () => (await ensureSession()).clientSecret, [ensureSession]);

  const stripePromise = useMemo<Promise<Stripe | null>>(
    () => ensureSession().then(({ publishableKey }) => getStripe(publishableKey)),
    [ensureSession],
  );

  const options = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret]);

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
