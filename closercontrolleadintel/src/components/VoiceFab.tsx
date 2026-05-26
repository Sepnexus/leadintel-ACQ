import { useState } from "react";
import { COLORS } from "@/utils/leadUtils";
import { VoiceAssistant } from "@/components/leadintel/VoiceAssistant";
import type { Lead } from "@/data/leads";

interface VoiceFabProps {
  deepgramApiKey: string;
  deepgramConnected: boolean;
  leads: Lead[];
  rankedTopLeads?: { lead: Lead; tier: string; rationale: string }[];
  isMobile: boolean;
  onHighlightLeads?: (ids: number[]) => void;
  onExpandLead?: (id: number) => void;
  onChangeTab?: (tab: string) => void;
}

export function VoiceFab(props: VoiceFabProps) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 200 }}>
      {open && (
        <div style={{
          position: "absolute", bottom: 70, right: 0, width: props.isMobile ? "calc(100vw - 40px)" : 360,
          maxWidth: 380,
          animation: "fadeIn 0.18s ease-out",
        }}>
          <VoiceAssistant {...props} />
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close voice assistant" : "Open voice assistant"}
        style={{
          width: 56, height: 56, borderRadius: "50%",
          border: "1px solid " + COLORS.GRN + "60",
          background: open ? COLORS.GRN : COLORS.S2,
          color: open ? "#000" : COLORS.GRN,
          fontSize: 22, cursor: "pointer",
          boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all .15s",
        }}
      >
        {open ? "×" : "🎤"}
      </button>
    </div>
  );
}