// Shared GHL credential validator used by both validate-ghl-credentials and create-tenant.
// Calls GET /locations/{id} with a 10s timeout and returns a discriminated union.

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

export type GhlValidationResult =
  | { ok: true; location: { id: string; name: string; business?: unknown } }
  | { ok: false; error: string; status?: number };

export async function validateGhlCredentials(
  locationId: string,
  token: string,
): Promise<GhlValidationResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${GHL_BASE}/locations/${encodeURIComponent(locationId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_VERSION,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    if (res.status === 200) {
      const data = await res.json().catch(() => ({} as any));
      const loc = data?.location ?? data ?? {};
      return {
        ok: true,
        location: {
          id: String(loc.id ?? locationId),
          name: String(loc.name ?? "Unnamed location"),
          business: loc.business,
        },
      };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, error: "Token rejected by GHL — check scopes and validity" };
    }
    if (res.status === 404) {
      return { ok: false, status: 404, error: "Location not found — check the Location ID" };
    }
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: `GHL returned ${res.status}: ${body.slice(0, 200)}` };
  } catch (e) {
    if ((e as any)?.name === "AbortError") {
      return { ok: false, error: "GHL did not respond — try again" };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Network error contacting GHL: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}