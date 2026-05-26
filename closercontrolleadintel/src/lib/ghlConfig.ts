// Frontend-safe GHL config. Location ID is not a secret — it's part of every GHL URL.
// Override via VITE_GHL_LOCATION_ID / VITE_GHL_BASE_URL if needed.
export const GHL_LOCATION_ID =
  (import.meta.env.VITE_GHL_LOCATION_ID as string | undefined) ?? "jklbWjRUrIBuMN6klILh";
export const GHL_BASE_URL =
  (import.meta.env.VITE_GHL_BASE_URL as string | undefined) ?? "https://app.gohighlevel.com";

export function ghlContactUrl(ghlContactId: string): string {
  return `${GHL_BASE_URL}/v2/location/${GHL_LOCATION_ID}/contacts/detail/${ghlContactId}`;
}