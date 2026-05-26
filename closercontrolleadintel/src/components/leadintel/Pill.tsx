import { COLORS } from "@/utils/leadUtils";

interface PillProps {
  label: string;
  color: string;
  small?: boolean;
}

export function Pill({ label, color, small }: PillProps) {
  return (
    <span
      style={{
        fontSize: small ? 8.5 : 9.5,
        fontWeight: 600,
        color: color,
        background: color + "15",
        border: "1px solid " + color + "25",
        borderRadius: 4,
        padding: small ? "1px 5px" : "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

interface ToggleProps {
  on: boolean;
  onChange: () => void;
}

export function Toggle({ on, onChange }: ToggleProps) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: on ? COLORS.GRN : COLORS.B2,
        position: "relative",
        cursor: "pointer",
        transition: "background .15s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .15s",
        }}
      />
    </div>
  );
}
