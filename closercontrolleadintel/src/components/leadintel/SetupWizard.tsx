import { useState } from "react";
import { COLORS } from "@/utils/leadUtils";
import { Toggle } from "./Pill";

interface SetupWizardProps {
  onComplete: (data: {
    company: { name: string; userName: string; timezone: string };
    ghl?: { apiKey: string; subAccountId: string };
    deepgram?: { apiKey: string };
    voiceWelcome: boolean;
  }) => void;
  onSkip: () => void;
}

const US_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function SetupWizard({ onComplete, onSkip }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [userName, setUserName] = useState("");
  const [timezone, setTimezone] = useState("America/Phoenix");
  const [ghlKey, setGhlKey] = useState("");
  const [ghlSub, setGhlSub] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [dgKey, setDgKey] = useState("");

  const steps = [
    { label: "Welcome" },
    { label: "Your Info" },
    { label: "Connect CRM" },
    { label: "Voice" },
  ];

  function handleFinish() {
    onComplete({
      company: { name: companyName, userName, timezone },
      ghl: ghlKey ? { apiKey: ghlKey, subAccountId: ghlSub } : undefined,
      deepgram: dgKey ? { apiKey: dgKey } : undefined,
      voiceWelcome: voiceOn,
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: COLORS.S3,
    border: "1px solid " + COLORS.B2,
    borderRadius: 8,
    color: COLORS.TEXT,
    fontSize: 13,
    padding: "10px 14px",
    fontFamily: "'Open Sans', sans-serif",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    color: COLORS.T3,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom: 5,
    fontFamily: "'Open Sans', sans-serif",
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: COLORS.BG,
      zIndex: 500,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    }}>
      {/* Step dots */}
      <div style={{ position: "absolute", top: 40, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8 }}>
        {steps.map((_, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: i === step ? COLORS.GRN : COLORS.B2,
              transition: "background .2s",
            }}
          />
        ))}
      </div>

      <div style={{
        background: COLORS.S1,
        border: "1px solid " + COLORS.B1,
        borderRadius: 16,
        padding: 32,
        width: "100%",
        maxWidth: 520,
        animation: "fadeIn 0.3s ease-out",
      }}>
        {/* Step 0: Welcome */}
        {step === 0 && (
          <div style={{ textAlign: "center" }}>
            <img src="/assets/closer-control-logo.png" alt="Closer Control" style={{ height: 40, marginBottom: 20 }} />
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.TEXT, marginBottom: 8, fontFamily: "'League Spartan', sans-serif" }}>
              Welcome to Lead Intel
            </div>
            <div style={{ fontSize: 13, color: COLORS.T2, marginBottom: 28, lineHeight: 1.6 }}>
              Your AI-powered pipeline intelligence tool
            </div>
            <button
              onClick={() => setStep(1)}
              style={{
                background: COLORS.GRN,
                border: "none",
                borderRadius: 10,
                padding: "12px 40px",
                color: "#000",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "'League Spartan', sans-serif",
              }}
            >
              Get Started
            </button>
            <button
              onClick={onSkip}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.T3,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "'Open Sans', sans-serif",
                marginTop: 14,
              }}
            >
              Skip for now
            </button>
            <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 10, opacity: 0.7, lineHeight: 1.5 }}>
              Customize your settings anytime in Settings.
            </div>
          </div>
        )}

        {/* Step 1: Your Info */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.TEXT, marginBottom: 4, fontFamily: "'League Spartan', sans-serif" }}>Your Info</div>
            <div style={{ fontSize: 12, color: COLORS.T3, marginBottom: 24 }}>Tell us about your business</div>
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>Company Name</div>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Acquisitions" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>Your Name</div>
              <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="John Smith" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={labelStyle}>Timezone</div>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {US_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace("America/", "").replace("Pacific/", "").replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setStep(2)} style={{ background: COLORS.GRN, border: "none", borderRadius: 10, padding: "10px 28px", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'League Spartan', sans-serif" }}>
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: CRM */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.TEXT, marginBottom: 4, fontFamily: "'League Spartan', sans-serif" }}>Connect CRM</div>
            <div style={{ fontSize: 12, color: COLORS.T3, marginBottom: 24 }}>Connect your GoHighLevel sub-account</div>
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>GHL API Key</div>
              <input type="password" value={ghlKey} onChange={(e) => setGhlKey(e.target.value)} placeholder="Your GHL API key" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={labelStyle}>Sub-account ID</div>
              <input value={ghlSub} onChange={(e) => setGhlSub(e.target.value)} placeholder="Your sub-account ID" style={inputStyle} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={() => setStep(3)} style={{ background: "transparent", border: "none", color: COLORS.T3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Skip for now
              </button>
              <button onClick={() => setStep(3)} style={{ background: COLORS.GRN, border: "none", borderRadius: 10, padding: "10px 28px", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'League Spartan', sans-serif" }}>
                {ghlKey ? "Connect" : "Next"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Voice */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.TEXT, marginBottom: 4, fontFamily: "'League Spartan', sans-serif" }}>Voice Briefings</div>
            <div style={{ fontSize: 12, color: COLORS.T3, marginBottom: 24 }}>Enable AI voice briefings for your daily pipeline review</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <span style={{ fontSize: 13, color: COLORS.TEXT }}>Enable voice briefings?</span>
              <Toggle on={voiceOn} onChange={() => setVoiceOn(!voiceOn)} />
            </div>
            {voiceOn && (
              <div style={{ marginBottom: 24 }}>
                <div style={labelStyle}>Deepgram API Key</div>
                <input type="password" value={dgKey} onChange={(e) => setDgKey(e.target.value)} placeholder="Your Deepgram API key" style={inputStyle} />
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {voiceOn && !dgKey && (
                <button onClick={handleFinish} style={{ background: "transparent", border: "none", color: COLORS.T3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  Skip for now
                </button>
              )}
              {(!voiceOn || dgKey || !voiceOn) && <div />}
              <button onClick={handleFinish} style={{ background: COLORS.GRN, border: "none", borderRadius: 10, padding: "10px 28px", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'League Spartan', sans-serif" }}>
                Launch Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
