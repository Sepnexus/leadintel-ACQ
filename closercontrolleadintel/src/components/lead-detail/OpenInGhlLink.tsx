import { COLORS } from "@/utils/leadUtils";
import { ghlContactUrl } from "@/lib/ghlConfig";

interface Props {
  ghlContactId: string | null | undefined;
}

export function OpenInGhlLink({ ghlContactId }: Props) {
  if (!ghlContactId) return null;
  return (
    <a
      href={ghlContactUrl(ghlContactId)}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: COLORS.T2,
        border: "1px solid " + COLORS.B2,
        borderRadius: 8,
        padding: "6px 12px",
        textDecoration: "none",
        background: COLORS.S2,
      }}
    >
      Open in GHL ↗
    </a>
  );
}