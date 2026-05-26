export function stripHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw);
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/<\/(p|div|li|tr|h[1-6])>/gi, " ");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
    String.fromCodePoint(parseInt(h, 16)));
  s = s.replace(/&#(\d+);/g, (_, d) =>
    String.fromCodePoint(parseInt(d, 10)));
  return s.replace(/\s+/g, " ").trim();
}