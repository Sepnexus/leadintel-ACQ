import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { COLORS, urgencyColor, stageColor, sourceColor, healthColor, nameToColor, nameInitials, fmt$ } from "@/utils/leadUtils";
import { ALL_STAGES, LEADS } from "@/data/leads";
import type { Lead, CallLogEntry, AIResult, LeadIntelData, Settings } from "@/data/leads";
import { SYS_PROMPT, LEAD_INTEL_PROMPT } from "@/data/prompts";
import { LeadRow } from "@/components/leadintel/LeadRow";
import { StageCard } from "@/components/leadintel/StageCard";
import { DailyBriefing } from "@/components/leadintel/DailyBriefing";
import { HealthRing } from "@/components/leadintel/HealthRing";
import { Pill, Toggle } from "@/components/leadintel/Pill";
import { VoiceBriefing } from "@/components/leadintel/VoiceBriefing";
import { VoiceAssistant } from "@/components/leadintel/VoiceAssistant";
import { SetupWizard } from "@/components/leadintel/SetupWizard";
import { HuddleExport } from "@/components/leadintel/HuddleExport";
import { useLeads } from "@/hooks/useLeads";
import { useGhlUsers, displayName } from "@/hooks/useGhlUsers";
import { useUsersSyncState, relativeTime } from "@/hooks/useUsersSyncState";
import { useIntegrationStatus } from "@/hooks/useIntegrationStatus";
import { TodayView } from "@/components/today/TodayView";
import { useTodaysLeads } from "@/hooks/useTodaysLeads";
import { Phone } from "lucide-react";
import { GHL_BASE_URL, GHL_LOCATION_ID } from "@/lib/ghlConfig";
import { VoiceFab } from "@/components/VoiceFab";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LeadDetailPanel } from "@/components/lead-detail/LeadDetailPanel";
import { UserMenu } from "@/components/auth/UserMenu";
import { useTheme } from "@/contexts/ThemeContext";
import { ChangePasswordSection } from "@/components/settings/ChangePasswordSection";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { EmptyTenantState } from "@/components/EmptyTenantState";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { PipelinesNeededBanner } from "@/components/pipelines/PipelinesNeededBanner";
import { AddCardBanner } from "@/components/billing/AddCardBanner";
import { PipelineSelectionPanel } from "@/components/pipelines/PipelineSelectionPanel";
import { useTenantPipelinesConfig } from "@/hooks/useTenantPipelinesConfig";
import { BillingTab } from "@/components/billing/BillingTab";
import { handleAiResponseError } from "@/lib/aiErrorToast";

const INTEG_LIST = [
  { key: "ghl", name: "GoHighLevel CRM", icon: "GHL", iconColor: COLORS.GRN, accent: COLORS.GRN, desc: "Pull leads, pipeline stages, and contact history directly from your GHL sub-account" },
  { key: "anthropic", name: "AI Engine", icon: "AI", iconColor: "#cc785c", accent: "#cc785c", desc: "Powers lead intelligence, priority scoring, and opening line generation", always: true, model: "google/gemini-2.5-flash" },
  { key: "slack", name: "Slack", icon: "SL", iconColor: "#7c3aed", accent: "#7c3aed", desc: "Get daily briefings and hot lead alerts sent to your Slack channel" },
  { key: "zapier", name: "Zapier / n8n", icon: "ZP", iconColor: "#ff4a00", accent: COLORS.AMB, desc: "Trigger automations when leads change stage or new leads enter pipeline" },
  { key: "sheets", name: "Google Sheets", icon: "GS", iconColor: "#34d399", accent: "#34d399", desc: "Export pipeline data and call logs to a Google Sheet automatically" },
  { key: "twilio", name: "Twilio / SMS", icon: "TW", iconColor: COLORS.RED, accent: COLORS.RED, desc: "Send SMS directly from the dashboard using your Twilio number" },
  { key: "deepgram", name: "Deepgram TTS", icon: "DG", iconColor: COLORS.BLU, accent: COLORS.BLU, desc: "Power voice briefings with natural AI speech using your Deepgram API key" },
];

const INTEG_MODAL_CFG: Record<string, { name: string; fields: { label: string; key: string; type: string; placeholder: string }[]; toggles?: { label: string; key: string }[] }> = {
  ghl: { name: "GoHighLevel CRM", fields: [{ label: "API Key", key: "apiKey", type: "password", placeholder: "Your GHL API key" }, { label: "Sub-account ID", key: "subAccountId", type: "text", placeholder: "Your sub-account ID" }] },
  slack: { name: "Slack", fields: [{ label: "Webhook URL", key: "webhookUrl", type: "text", placeholder: "https://hooks.slack.com/..." }, { label: "Channel Name", key: "channel", type: "text", placeholder: "#lead-intel" }], toggles: [{ label: "Send daily briefing at 8am", key: "dailyBriefing" }, { label: "Alert on hot leads", key: "hotAlerts" }] },
  zapier: { name: "Zapier / n8n", fields: [{ label: "Webhook URL", key: "webhookUrl", type: "text", placeholder: "https://hooks.zapier.com/..." }] },
  sheets: { name: "Google Sheets", fields: [{ label: "Sheet URL", key: "sheetUrl", type: "text", placeholder: "https://docs.google.com/spreadsheets/..." }], toggles: [{ label: "Auto-sync daily", key: "autoSync" }] },
  twilio: { name: "Twilio / SMS", fields: [{ label: "Account SID", key: "sid", type: "text", placeholder: "ACxxxxxxxxxxxxxxx" }, { label: "Auth Token", key: "authToken", type: "password", placeholder: "••••••••" }, { label: "From Number", key: "fromNumber", type: "text", placeholder: "+1 (555) 000-0000" }] },
  deepgram: { name: "Deepgram TTS", fields: [{ label: "API Key", key: "apiKey", type: "password", placeholder: "Your Deepgram API key" }] },
};

function createDefaultSettings(): Settings {
  return {
    ghl: { connected: false, apiKey: "", subAccountId: "" },
    slack: { connected: false, webhookUrl: "", channel: "", dailyBriefing: false, hotAlerts: false },
    zapier: { connected: false, webhookUrl: "" },
    sheets: { connected: false, sheetUrl: "", autoSync: false },
    twilio: { connected: false, sid: "", authToken: "", fromNumber: "" },
    deepgram: { connected: false, apiKey: "" },
    aiModel: "google/gemini-2.5-flash",
    priorityWeights: { newLead: 9, auctionDeadline: 10, daysSilent: 7, motivation: 8, offerFollowUp: 8 },
    openingLineStyle: "warm",
    autoRefresh: "off",
    intelligenceDepth: "full",
    voiceWelcome: true,
    company: { name: "", userName: "", email: "", timezone: "America/Phoenix" },
    teamMembers: [],
    pipelineStages: ALL_STAGES.map((s) => ({ name: s })),
    leadSources: ["Probate", "Pre-foreclosure", "PPC", "Direct Mail", "Signal Sniping", "Divorce List", "Tired Landlord", "Absentee Owner", "Referral", "Other"].map((s) => ({ name: s })),
  };
}

export default function LeadIntelPage() {
  const { theme, toggleTheme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenant: currentTenant, noTenantAssigned, loading: tenantLoading } = useCurrentTenant();

  // Lead detail side panel — driven by ?lead={ghlContactId} query param so it's bookmarkable.
  const selectedLeadId = searchParams.get("lead");
  const openLeadDetail = useCallback((lead: Lead) => {
    const id = lead.ghlContactId ?? String(lead.id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("lead", id);
      return next;
    }, { replace: false });
  }, [setSearchParams]);
  const closeLeadDetail = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("lead");
      return next;
    }, { replace: false });
  }, [setSearchParams]);

  // Canvas background animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const GRN_R = 78, GRN_G = 125, GRN_B = 61;
    const gridSpacing = 70;
    let gridOffset = 0;
    let frameCount = 0;
    const PARTICLE_COUNT = 35;
    let particles: { x: number; y: number; vx: number; vy: number; r: number; baseOpacity: number; opacity: number; pulseTimer: number }[] = [];

    function makeParticle(w: number, h: number) {
      return { x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, r: 1 + Math.random() * 1.5, baseOpacity: 0.25 + Math.random() * 0.15, opacity: 0, pulseTimer: 0 };
    }
    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = makeParticle(canvas!.width, canvas!.height);
        p.opacity = p.baseOpacity;
        particles.push(p);
      }
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      if (document.hidden) { rafRef.current = requestAnimationFrame(draw); return; }
      frameCount++;
      const W = canvas!.width, H = canvas!.height;
      ctx!.clearRect(0, 0, W, H);
      gridOffset = (gridOffset + 0.15) % gridSpacing;
      ctx!.strokeStyle = `rgba(${GRN_R},${GRN_G},${GRN_B},0.10)`;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      for (let x = -gridSpacing; x < W + gridSpacing; x += gridSpacing) { ctx!.moveTo(x, 0); ctx!.lineTo(x, H); }
      for (let y = (gridOffset % gridSpacing) - gridSpacing; y < H + gridSpacing; y += gridSpacing) { ctx!.moveTo(0, y); ctx!.lineTo(W, y); }
      ctx!.stroke();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -5) p.x = W + 5; if (p.x > W + 5) p.x = -5;
        if (p.y < -5) p.y = H + 5; if (p.y > H + 5) p.y = -5;
        if (p.pulseTimer > 0) { p.pulseTimer--; p.opacity = p.baseOpacity + (0.7 - p.baseOpacity) * (p.pulseTimer / 40); }
        else { p.opacity = p.baseOpacity; if (Math.random() < 0.0008) p.pulseTimer = 40; }
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx!.strokeStyle = `rgba(${GRN_R},${GRN_G},${GRN_B},${(1 - dist / 120) * 0.15})`;
            ctx!.lineWidth = 0.6;
            ctx!.beginPath(); ctx!.moveTo(particles[i].x, particles[i].y); ctx!.lineTo(particles[j].x, particles[j].y); ctx!.stroke();
          }
        }
      }
      for (let i = 0; i < particles.length; i++) {
        const pd = particles[i];
        ctx!.fillStyle = `rgba(${GRN_R},${GRN_G},${GRN_B},${pd.opacity})`;
        ctx!.beginPath(); ctx!.arc(pd.x, pd.y, pd.r, 0, Math.PI * 2); ctx!.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, []);

  // State
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<AIResult | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const { users: ghlUsers, userMap: ghlUserMap } = useGhlUsers();
  const { state: usersSyncState, lastSyncAt: usersLastSyncAt } = useUsersSyncState(ghlUsers.length);
  const { ghl: ghlStatus, refresh: refreshIntegrationStatus } = useIntegrationStatus();
  const [resyncing, setResyncing] = useState(false);
  const [aiTestState, setAiTestState] = useState<{ status: "idle" | "ok" | "fail"; msg?: string }>({ status: "idle" });
  const [aiTesting, setAiTesting] = useState(false);

  const triggerGhlResync = useCallback(async () => {
    if (resyncing) return;
    if (!currentTenant?.id) {
      console.warn("ghl resync skipped: no tenant selected");
      return;
    }
    setResyncing(true);
    try {
      await supabase.functions.invoke("ghl-sync", {
        body: { mode: "delta", tenant_id: currentTenant.id },
      });
    } catch (e) {
      console.error("ghl resync failed", e);
    } finally {
      await refreshIntegrationStatus();
      setResyncing(false);
    }
  }, [resyncing, refreshIntegrationStatus, currentTenant?.id]);

  const triggerAiTest = useCallback(async () => {
    if (aiTesting) return;
    if (!currentTenant?.id) {
      setAiTestState({ status: "fail", msg: "Select a tenant to run AI test." });
      setTimeout(() => setAiTestState({ status: "idle" }), 5000);
      return;
    }
    setAiTesting(true);
    setAiTestState({ status: "idle" });
    try {
      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          system: "Reply with the single word: OK",
          messages: [{ role: "user", content: "probe" }],
          max_tokens: 10,
          tenant_id: currentTenant.id,
          caller_hint: "ai_probe",
        },
      });
      if (error) throw error;
      if (handleAiResponseError(data as any)) { setAiTestState({ status: "fail", msg: (data as any)?.error || "AI error" }); return; }
      if ((data as any)?.error) throw new Error((data as any).error);
      setAiTestState({ status: "ok" });
    } catch (e) {
      setAiTestState({ status: "fail", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setAiTesting(false);
      setTimeout(() => setAiTestState({ status: "idle" }), 5000);
    }
  }, [aiTesting]);
  const { leads: remoteLeads, loading: leadsLoading } = useLeads(ghlUserMap);
  const [leads, setLeads] = useState<Lead[]>([]);
  useEffect(() => {
    if (remoteLeads.length === 0) return;
    // Adopt fresh data on first load, and again any time we're showing nothing —
    // which is what happens when the page is opened during a tenant's first sync
    // and useLeads later refetches. Deliberately never replaces a list that
    // already has rows: `leads` carries local edits (stage moves, assignment,
    // touch counts) that a refetch would otherwise wipe mid-session.
    setLeads((prev) => (prev.length === 0 ? remoteLeads : prev));
  }, [remoteLeads]);
  const [callLog, setCallLog] = useState<CallLogEntry[]>(() => { try { const s = localStorage.getItem("leadIntel_callLog"); if (s) return JSON.parse(s); } catch {} return []; });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("priority");
  const [repFilter, setRepFilter] = useState("All Reps");
  const [viewMode, setViewMode] = useState("list");
  const [activeTab, setActiveTab] = useState("today");
  const [logFilter, setLogFilter] = useState("all");
  const [leadIntelCache, setLeadIntelCache] = useState<Record<number, LeadIntelData>>({});
  const [leadIntelLoading, setLeadIntelLoading] = useState<Record<number, boolean>>({});
  const [copyFlash, setCopyFlash] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [addFlash, setAddFlash] = useState(false);
  const defaultNewLead = { name: "", phone: "", address: "", source: "Probate", stage: "New Lead", motivation: "unknown", situation: "", notes: "", value: "", assignedTo: "" };
  const [newLead, setNewLead] = useState(defaultNewLead);
  const [addError, setAddError] = useState("");
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  const [settings, setSettings] = useState<Settings>(() => { try { const s = localStorage.getItem("leadIntel_settings"); if (s) return JSON.parse(s); } catch {} return createDefaultSettings(); });
  const [settingsNav, setSettingsNav] = useState("integrations");
  const [settingsModal, setSettingsModal] = useState<string | null>(null);
  const [settingsTempForm, setSettingsTempForm] = useState<Record<string, any>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkFlash, setBulkFlash] = useState<string | null>(null);
  const [highlightedLeads, setHighlightedLeads] = useState<number[]>([]);
  const [setupComplete, setSetupComplete] = useState(() => {
    try { return localStorage.getItem("leadIntel_setupComplete") === "true"; } catch { return false; }
  });

  // Auto-bypass setup wizard if the tenant already has a GHL location configured
  // (admin set it up). Misconfigured tenants (no ghl_location_id) still see the wizard.
  useEffect(() => {
    if (currentTenant?.ghl_location_id && !setupComplete) {
      try { localStorage.setItem("leadIntel_setupComplete", "true"); } catch {}
      setSetupComplete(true);
    }
  }, [currentTenant?.ghl_location_id, setupComplete]);

  const [showHuddle, setShowHuddle] = useState(false);
  const [showReplayBriefing, setShowReplayBriefing] = useState(false);
  const [replayCount, setReplayCount] = useState(0);

  // If redirected here with ?tab=settings (e.g. from the user menu), open Settings → Account.
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "settings") {
      setActiveTab("settings");
      setSettingsNav("account");
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("tab");
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2200); }

  useEffect(() => {
    function onResize() { setWidth(window.innerWidth); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Persistence
  useEffect(() => { try { localStorage.setItem("leadIntel_settings", JSON.stringify(settings)); } catch {} }, [settings]);
  // Note: lead persistence disabled — leads are now hydrated from the backend on each load.
  useEffect(() => { try { localStorage.setItem("leadIntel_callLog", JSON.stringify(callLog)); } catch {} }, [callLog]);

  useEffect(() => { setSelectMode(false); setSelectedIds([]); }, [activeTab]);

  const allReps = ghlUsers.length > 0
    ? ["All Reps", ...ghlUsers.map(displayName).sort()]
    : ["All Reps"].concat(leads.reduce<string[]>((acc, l) => { if (l.assignedTo && !acc.includes(l.assignedTo)) acc.push(l.assignedTo); return acc; }, []));
  const repLeads = repFilter === "All Reps" ? leads : leads.filter((l) => l.assignedTo === repFilter);
  const isMobile = width < 640;

  // Same ranked top-10 as the Today view — passed to the voice assistant so its
  // "who's #1 / hottest lead / top N" answers stay consistent with the UI.
  const { scored: voiceRankedTop } = useTodaysLeads(repLeads, 10);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // AI result derived data
  const rankedLeads = result?.rankedLeads || [];
  const hotLeads = result?.hotLeads || [];
  const health = result?.pipelineHealth || { score: 0, grade: "-", activeLeads: 0, staleLeads: 0, urgentLeads: 0, avgDaysSinceContact: 0, summary: "", topIssue: "" };
  const hotLeadIds = new Set(hotLeads.map((h) => h.id));
  const intelMap: Record<number, any> = {};
  rankedLeads.forEach((r) => { intelMap[r.id] = r; });

  // Ordered leads
  const orderedLeads = rankedLeads.length > 0
    ? rankedLeads.map((r) => leads.find((l) => l.id === r.id)).filter(Boolean) as Lead[]
    : leads;
  const unrankedLeads = leads.filter((l) => !rankedLeads.find((r) => r.id === l.id));
  const allOrderedLeads = orderedLeads.concat(unrankedLeads.filter((l) => !orderedLeads.find((o) => o.id === l.id)));

  const urgencyRank: Record<string, number> = { hot: 0, warm: 1, cold: 2 };

  // Stage options derived from real GHL data present in repLeads
  const stageOptions = Array.from(new Set(repLeads.map((l) => l.stage).filter(Boolean))).sort();

  // Stage stats (seeded with legacy ALL_STAGES so FILTERS chips below keep working,
  // plus every real stage present in current data)
  const stageStats: Record<string, { count: number; value: number }> = {};
  ALL_STAGES.forEach((s) => { stageStats[s] = { count: 0, value: 0 }; });
  stageOptions.forEach((s) => { if (!stageStats[s]) stageStats[s] = { count: 0, value: 0 }; });
  repLeads.forEach((l) => {
    if (!stageStats[l.stage]) stageStats[l.stage] = { count: 0, value: 0 };
    stageStats[l.stage].count++;
    stageStats[l.stage].value += l.value || 0;
  });

  const FILTERS: [string, string, number][] = [
    ["all", "All Active", repLeads.filter((l) => l.stage !== "Dead / Not Interested").length],
    ["hot", "Hot", hotLeads.length],
    ["new", "New Leads", stageStats["New Lead"].count],
    ["offers", "Offers Out", stageStats["Offer Sent"].count],
    ["followup", "Follow-Up", stageStats["Follow-Up"].count],
    ["closing", "Closing", stageStats["Under Contract"].count + stageStats["Closed Deal"].count],
    ["dead", "Dead", stageStats["Dead / Not Interested"].count],
  ];

  // Today tab leads
  const todayLeads = allOrderedLeads.filter((l) => {
    if (filter === "hot") return hotLeadIds.has(l.id) || intelMap[l.id]?.urgency === "hot";
    if (filter === "new") return l.stage === "New Lead";
    if (filter === "offers") return l.stage === "Offer Sent";
    if (filter === "followup") return l.stage === "Follow-Up";
    return l.stage !== "Dead / Not Interested";
  });

  // Leads tab
  const leadsTabLeads = repLeads.filter((l) => {
    if (stageFilter && l.stage !== stageFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [l.name, l.phone, l.address, l.source, l.notes || ""].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sort === "urgency") {
      const au = intelMap[a.id]?.urgency || (a.motivation === "urgent" ? "hot" : a.motivation === "high" ? "warm" : "cold");
      const bu = intelMap[b.id]?.urgency || (b.motivation === "urgent" ? "hot" : b.motivation === "high" ? "warm" : "cold");
      return (urgencyRank[au] ?? 2) - (urgencyRank[bu] ?? 2);
    }
    if (sort === "silent") return b.daysSince - a.daysSince;
    if (sort === "value") return (b.value || 0) - (a.value || 0);
    if (sort === "newest") return a.daysSince - b.daysSince;
    return 0;
  });

  // Pipeline tab stage groups — derived from real stages present in data
  const stageGroups = stageOptions.map((stage) => ({
    stage,
    leads: allOrderedLeads.filter((l) => {
      if (l.stage !== stage) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return [l.name, l.phone, l.address, l.source, l.notes || ""].join(" ").toLowerCase().includes(q);
      }
      return true;
    }),
  })).filter((g) => g.leads.length > 0);

  // Log tab
  const todayDateStr = new Date().toDateString();
  const todayLogs = callLog.filter((e) => new Date(e.timestamp).toDateString() === todayDateStr);
  const logStats = {
    total: todayLogs.length,
    connected: todayLogs.filter((e) => e.disposition === "Connected").length,
    voicemail: todayLogs.filter((e) => e.disposition === "Voicemail").length,
    noAnswer: todayLogs.filter((e) => e.disposition === "No Answer").length,
  };
  const filteredCallLog = logFilter === "all" ? callLog : callLog.filter((e) => e.disposition === logFilter);

  // AI functions
  async function fetchLeadIntel(lead: Lead) {
    if (!currentTenant?.id) {
      setLeadIntelCache((prev) => ({ ...prev, [lead.id]: { error: "Select a tenant first." } }));
      return;
    }
    setLeadIntelLoading((prev) => ({ ...prev, [lead.id]: true }));
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("ai-analyze", {
        body: {
          system: LEAD_INTEL_PROMPT,
          messages: [{ role: "user", content: JSON.stringify(lead) }],
          max_tokens: 1500,
          tenant_id: currentTenant.id,
          caller_hint: "lead_intel",
          metadata: { lead_id: lead.id },
        },
      });
      if (handleAiResponseError(data as any)) { setLeadIntelCache((prev) => ({ ...prev, [lead.id]: { error: (data as any)?.error || "AI error" } })); return; }
      if (fnErr) throw new Error((data as any)?.error || fnErr.message || "Analysis failed");
      if (data?.error) throw new Error(data.error);
      const raw = (data.text || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(raw);
      setLeadIntelCache((prev) => ({ ...prev, [lead.id]: parsed }));
    } catch (e: any) {
      setLeadIntelCache((prev) => ({ ...prev, [lead.id]: { error: e.message || "Analysis failed" } }));
    } finally {
      setLeadIntelLoading((prev) => ({ ...prev, [lead.id]: false }));
    }
  }

  useEffect(() => {
    if (expanded !== null) {
      const lead = leads.find((l) => l.id === expanded);
      if (lead && !leadIntelCache[expanded] && !leadIntelLoading[expanded]) fetchLeadIntel(lead);
    }
  }, [expanded]);

  // Auto-refresh pipeline on mount if no cached result
  const hasAutoRefreshed = useRef(false);
  useEffect(() => {
    // Auto-refresh disabled — AI analysis is now opt-in via the Briefing card / pill.
    // Avoids burning credits on every page load.
  }, []);

  async function handleRefresh() {
    if (!currentTenant?.id) {
      setError("Select a tenant first.");
      return;
    }
    setLoading(true); setError(""); setProgress("Connecting to AI...");
    try {
      setProgress("Analyzing pipeline...");
      // Compress leads for faster AI analysis — strip verbose touch history to last 2 entries, shorten summaries
      const compressedLeads = leads.map(l => ({
        id: l.id, name: l.name, stage: l.stage, source: l.source,
        daysSince: l.daysSince, touches: l.touches, motivation: l.motivation,
        situation: l.situation, notes: l.notes, assignedTo: l.assignedTo,
        daysInStage: l.daysInStage, value: l.value, address: l.address,
        recentTouches: l.touchHistory.slice(0, 2).map(t => `${t.date} ${t.type}: ${t.outcome}`)
      }));
      const hour = new Date().getHours();
      const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      const systemWithTime = SYS_PROMPT + `\n\nIMPORTANT: The current time of day greeting should start with "${timeGreeting}". Use this in the dailyBriefing greeting field.`;
      const { data, error: fnErr } = await supabase.functions.invoke("ai-analyze", {
        body: {
          system: systemWithTime,
          messages: [{ role: "user", content: JSON.stringify(compressedLeads) }],
          max_tokens: 3000,
          tenant_id: currentTenant.id,
          caller_hint: "pipeline_refresh",
        },
      });
      if (handleAiResponseError(data as any)) { setProgress(""); setError((data as any)?.error || "AI error"); return; }
      if (fnErr) throw new Error((data as any)?.error || fnErr.message || "Analysis failed");
      if (data?.error) throw new Error(data.error);
      const raw = (data.text || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(raw);
      setResult(parsed);
      setProgress("");
      setShowReplayBriefing(true);

      // Slack notifications (fire silently)
      if (settings.slack.connected && settings.slack.webhookUrl) {
        const leadsMap: Record<number, Lead> = {};
        leads.forEach((l) => { leadsMap[l.id] = l; });

        // Hot lead alerts
        if (settings.slack.hotAlerts && parsed.hotLeads?.length > 0) {
          const message = `🔥 ${parsed.hotLeads.length} leads gone hot:\n` +
            parsed.hotLeads.map((h: any) => `• ${leadsMap[h.id]?.name} — ${h.signal}`).join('\n');
          fetch(settings.slack.webhookUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: message })
          }).catch(console.error);
        }

        // Daily briefing
        if (settings.slack.dailyBriefing && parsed.dailyBriefing) {
          const briefMsg = `📋 *Daily Pipeline Briefing*\n${parsed.dailyBriefing.greeting}\n` +
            (parsed.dailyBriefing.bullets || []).map((b: string) => `• ${b}`).join('\n') +
            (parsed.dailyBriefing.criticalAlert ? `\n⚠️ ${parsed.dailyBriefing.criticalAlert}` : '');
          fetch(settings.slack.webhookUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: briefMsg })
          }).catch(console.error);
        }

        // Low health warning
        if (parsed.pipelineHealth?.score < 50) {
          fetch(settings.slack.webhookUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: `⚠️ Pipeline health: ${parsed.pipelineHealth.score}/100 — ${parsed.pipelineHealth.topIssue}` })
          }).catch(console.error);
        }
      }
    } catch (e: any) {
      setError(e.message || "Failed to analyze pipeline");
      setProgress("");
    } finally {
      setLoading(false);
    }
  }

  // Export functions
  function handleCopyList() {
    const lines = todayLeads.map((lead) => {
      const intel = intelMap[lead.id];
      const rank = intel?.priority || orderedLeads.indexOf(lead) + 1;
      const urgency = intel?.urgency || (lead.motivation === "urgent" ? "hot" : lead.motivation === "high" ? "warm" : "cold");
      return `#${rank} ${lead.name} — ${lead.phone}\nStage: ${lead.stage} | Source: ${lead.source} | Urgency: ${urgency.toUpperCase()}\n${intel?.openingLine ? `Opening line: "${intel.openingLine}"\n` : ""}---`;
    }).join("\n");
    navigator.clipboard.writeText(lines).then(() => { setCopyFlash(true); setTimeout(() => setCopyFlash(false), 1500); });
  }

  function handleExportCSV() {
    const headers = ["Rank", "Name", "Phone", "Stage", "Source", "Urgency", "Days Since Contact", "Est Value"];
    const rows = todayLeads.map((lead) => {
      const intel = intelMap[lead.id];
      const rank = intel?.priority || orderedLeads.indexOf(lead) + 1;
      const urgency = intel?.urgency || (lead.motivation === "urgent" ? "hot" : lead.motivation === "high" ? "warm" : "cold");
      const esc = (v: any) => { const s = String(v ?? ""); return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
      return [rank, lead.name, lead.phone, lead.stage, lead.source, urgency, lead.daysSince, lead.value || 0].map(esc).join(",");
    });
    const csv = [headers.join(",")].concat(rows).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `lead-intel-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function handleBulkMoveStage(stage: string) {
    const count = selectedIds.length;
    setLeads((prev) => prev.map((l) => selectedIds.includes(l.id) ? { ...l, stage } : l));
    setSelectMode(false); setSelectedIds([]);
    setBulkFlash(`${count} lead${count !== 1 ? "s" : ""} updated`);
    setTimeout(() => setBulkFlash(null), 2000);
  }

  function handleBulkReassign(rep: string) {
    const count = selectedIds.length;
    setLeads((prev) => prev.map((l) => selectedIds.includes(l.id) ? { ...l, assignedTo: rep } : l));
    setSelectMode(false); setSelectedIds([]);
    setBulkFlash(`${count} lead${count !== 1 ? "s" : ""} reassigned`);
    setTimeout(() => setBulkFlash(null), 2000);
  }

  const currentLeads = activeTab === "today" ? todayLeads : activeTab === "leads" ? leadsTabLeads : activeTab === "pipeline" && viewMode === "list" ? leadsTabLeads : todayLeads;

  // Setup wizard handler
  function handleSetupComplete(data: any) {
    setSettings((prev) => ({
      ...prev,
      company: { ...prev.company, ...data.company },
      voiceWelcome: data.voiceWelcome,
      ...(data.ghl ? { ghl: { ...prev.ghl, ...data.ghl, connected: true } } : {}),
      ...(data.deepgram ? { deepgram: { ...prev.deepgram, ...data.deepgram, connected: true } } : {}),
    }));
    localStorage.setItem("leadIntel_setupComplete", "true");
    setSetupComplete(true);
  }

  // Briefing text for replay
  const briefingScript = result?.dailyBriefing
    ? (result.dailyBriefing.greeting || "") + ". " +
      (result.dailyBriefing.bullets || []).join(". ") +
      (result.dailyBriefing.criticalAlert ? ". Critical alert: " + result.dailyBriefing.criticalAlert : "")
    : "";


  function handleSkipSetup() {
    localStorage.setItem("leadIntel_setupComplete", "true");
    setSetupComplete(true);
  }

  if (!setupComplete) {
    return <SetupWizard onComplete={handleSetupComplete} onSkip={handleSkipSetup} />;
  }

  if (showHuddle && result) {
    return <HuddleExport result={result} leads={leads} onClose={() => setShowHuddle(false)} />;
  }

  if (noTenantAssigned && !tenantLoading) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.BG }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: 16, gap: 8 }}>
          <button onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{ background: "transparent", border: "1px solid " + COLORS.B1, borderRadius: 8, padding: "6px 10px", color: COLORS.T2, fontSize: 15, cursor: "pointer", lineHeight: 1 }}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <UserMenu onOpenSettings={() => { setActiveTab("settings"); setSettingsNav("account"); }} compact={isMobile} />
        </div>
        <EmptyTenantState />
      </div>
    );
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: COLORS.BG }}>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 960, margin: "0 auto", padding: isMobile ? "12px 14px" : "24px 20px" }}>
        {/* CRM not connected banner — hidden once real leads load from backend */}
        {!currentTenant?.ghl_location_id && remoteLeads.length === 0 && !leadsLoading && (
          <div style={{
            background: COLORS.AMB + "12",
            border: "1px solid " + COLORS.AMB + "30",
            borderRadius: 10,
            padding: "10px 16px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}>
            <div style={{ fontSize: 12, color: COLORS.AMB, fontFamily: "'Open Sans', sans-serif" }}>
              📊 You're viewing demo data — <strong>connect your CRM in Settings</strong> to see live pipeline data.
            </div>
            <button
              onClick={() => setActiveTab("settings")}
              style={{ background: COLORS.AMB + "20", border: "1px solid " + COLORS.AMB + "40", borderRadius: 6, padding: "4px 12px", color: COLORS.AMB, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              Connect CRM
            </button>
          </div>
        )}
        {/* Header — only shown on tabs other than Today (Today renders its own HeaderStrip) */}
        {activeTab !== "today" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src="/assets/closer-control-logo.png" alt="Closer Control" style={{ height: isMobile ? 28 : 36 }} />
                <span style={{ fontSize: 9, fontWeight: 600, color: COLORS.GRN, background: COLORS.GRN + "15", border: "1px solid " + COLORS.GRN + "25", borderRadius: 4, padding: "1px 6px" }}>AI</span>
              </div>
              {settings.company.userName ? (
                <div style={{ fontSize: 12, color: COLORS.T2, marginTop: 3, fontFamily: "'Open Sans', sans-serif" }}>
                  {new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}, <span style={{ color: COLORS.TEXT, fontWeight: 600 }}>{settings.company.userName}</span>
                  {settings.company.name ? <span style={{ color: COLORS.T3 }}> · {settings.company.name}</span> : null}
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setShowAddLead(true)}
                style={{ background: "transparent", border: "1px solid " + COLORS.GRN + "50", borderRadius: 8, padding: "6px 14px", color: COLORS.GRN, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
              >
                + Add Lead
              </button>
              <TenantSwitcher />
              <select
                value={repFilter}
                onChange={(e) => setRepFilter(e.target.value)}
                style={{ background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 8, color: COLORS.T2, fontSize: 11, padding: "6px 10px", fontFamily: "inherit", outline: "none", cursor: "pointer" }}
              >
                {allReps.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                style={{ background: "transparent", border: "1px solid " + COLORS.B1, borderRadius: 8, padding: "6px 10px", color: COLORS.T2, fontSize: 15, cursor: "pointer", lineHeight: 1 }}>
                {theme === "dark" ? "☀️" : "🌙"}
              </button>
              <UserMenu onOpenSettings={() => { setActiveTab("settings"); setSettingsNav("account"); }} compact={isMobile} />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid " + COLORS.B1, paddingBottom: 0 }}>
          {[["today", "Today"], ["pipeline", "Pipeline"], ["leads", "All Leads"], ["log", "Call Log"], ["settings", "Settings"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: activeTab === key ? "2px solid " + COLORS.GRN : "2px solid transparent",
                padding: "8px 16px",
                color: activeTab === key ? COLORS.GRN : COLORS.T3,
                fontSize: 12,
                fontWeight: activeTab === key ? 700 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all .15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Pipeline-selection prompt for tenants with no configuration yet */}
        <PipelinesNeededBanner />
        <AddCardBanner />

        {/* Toast */}
        {toast && (
          <div style={{ position: "fixed", top: 20, right: 20, background: COLORS.GRN, color: "#000", padding: "10px 20px", borderRadius: 10, fontSize: 12, fontWeight: 700, zIndex: 300 }}>
            {toast}
          </div>
        )}
        {addFlash && (
          <div style={{ position: "fixed", top: 20, right: 20, background: COLORS.GRN, color: "#000", padding: "10px 20px", borderRadius: 10, fontSize: 12, fontWeight: 700, zIndex: 300 }}>
            Lead added ✓
          </div>
        )}
        {bulkFlash && (
          <div style={{ position: "fixed", top: 20, right: 20, background: COLORS.GRN, color: "#000", padding: "10px 20px", borderRadius: 10, fontSize: 12, fontWeight: 700, zIndex: 300 }}>
            {bulkFlash}
          </div>
        )}

        {/* ═══ TODAY TAB ═══ */}
        {activeTab === "today" && (
          <TodayView
            leads={repLeads}
            isMobile={isMobile}
            reps={allReps}
            repFilter={repFilter}
            onRepChange={setRepFilter}
            onAddLead={() => setShowAddLead(true)}
            onSelectLead={openLeadDetail}
            aiStatus={loading ? "analyzing" : (error && /credit|exhaust|AI_NO_CREDITS/i.test(error)) ? "exhausted" : "ready"}
            loading={leadsLoading}
            userMenu={<><TenantSwitcher /><button onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} style={{ background: "transparent", border: "1px solid " + COLORS.B1, borderRadius: 8, padding: "6px 10px", color: COLORS.T2, fontSize: 15, cursor: "pointer", lineHeight: 1 }}>{theme === "dark" ? "☀️" : "🌙"}</button><UserMenu onOpenSettings={() => { setActiveTab("settings"); setSettingsNav("account"); }} compact={isMobile} /></>}
          />
        )}

        {/* ═══ PIPELINE TAB ═══ */}
        {activeTab === "pipeline" && (
          <div className="fade">
            <div className="stage-scroll" style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
              {stageOptions.map((stage) => {
                const stats = stageStats[stage] ?? { count: 0, value: 0 };
                return <StageCard key={stage} stage={stage} count={stats.count} totalValue={stats.value} active={stageFilter === stage} onClick={() => setStageFilter((p) => p === stage ? null : stage)} />;
              })}
            </div>

            {/* Stage grouped view */}
            <div style={{ marginBottom: 20 }}>
              {stageGroups.map((group) => {
                const sc = stageColor(group.stage);
                if (stageFilter && group.stage !== stageFilter) return null;
                return (
                  <div key={group.stage} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid " + COLORS.B1 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: sc, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: sc, letterSpacing: 0.3 }}>{group.stage}</span>
                      <span style={{ fontSize: 10, color: COLORS.T3 }} className="font-mono">{group.leads.length}</span>
                    </div>
                    {group.leads.length === 0 ? (
                      <div style={{ fontSize: 10, color: COLORS.T3, padding: "6px 0 2px 16px", fontStyle: "italic" }}>No leads in {group.stage}</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {group.leads.map((lead) => {
                          const intel = intelMap[lead.id];
                          const rank = intel?.priority || orderedLeads.indexOf(lead) + 1;
                          return (
                            <LeadRow
                              key={lead.id} lead={lead} rank={rank} intel={intel} isHot={hotLeadIds.has(lead.id)} isMobile={isMobile}
                              expanded={expanded === lead.id}
                              onToggle={() => openLeadDetail(lead)}
                              onUpdate={(id, field, value) => setLeads((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l))}
                              callLog={callLog.filter((e) => e.leadId === lead.id)}
                              onLogCall={(entry) => {
                                setCallLog((prev) => [entry, ...prev]);
                                setLeads((prev) => prev.map((l) => l.id === entry.leadId ? { ...l, touches: l.touches + 1, daysSince: 0 } : l));
                              }}
                              leadIntel={leadIntelCache[lead.id] || null}
                              leadIntelLoading={leadIntelLoading[lead.id] || false}
                              onRefreshIntel={() => {
                                setLeadIntelCache((prev) => { const o = { ...prev }; delete o[lead.id]; return o; });
                                fetchLeadIntel(leads.find((l) => l.id === lead.id)!);
                              }}
                              deepgramApiKey={settings.deepgram.apiKey}
                              deepgramConnected={settings.deepgram.connected}
                              crmConnected={!!currentTenant?.ghl_location_id}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pipeline Health — only when AI analysis has been run */}
            {result && (
              <div style={{ borderTop: "1px solid " + COLORS.B1, paddingTop: 20, marginTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.TEXT, marginBottom: 14 }}>Pipeline Health</div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "160px 1fr", gap: 16, marginBottom: 16 }}>
                  <div style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 14, padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${healthColor(health.score)},transparent)` }} />
                    <HealthRing score={health.score} size={96} />
                    <div style={{ marginTop: 8, fontSize: 9.5, color: COLORS.T3, textAlign: "center" }}>Pipeline Score</div>
                  </div>
                  <div style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 14, padding: "18px 20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
                      {([["Active", health.activeLeads, COLORS.GRN], ["Stale", health.staleLeads, COLORS.RED], ["Urgent", health.urgentLeads, COLORS.AMB], ["Avg Days", health.avgDaysSinceContact + "d", COLORS.T2]] as const).map(([label, val, color]) => (
                        <div key={label} style={{ background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 9, padding: "10px 12px", textAlign: "center" }}>
                          <div style={{ fontSize: 9, color: COLORS.T3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: 20, fontWeight: 900, color }} className="font-mono">{val}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12.5, color: COLORS.TEXT, lineHeight: 1.7, marginBottom: 8 }}>{health.summary}</div>
                    {health.topIssue && (
                      <div style={{ fontSize: 11, color: COLORS.AMB, lineHeight: 1.5 }}>⚠ {health.topIssue}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ ALL LEADS TAB ═══ */}
        {activeTab === "leads" && (
          <div className="fade">
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads..."
                style={{ flex: 1, minWidth: 160, background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 8, color: COLORS.TEXT, fontSize: 12, padding: "8px 12px", fontFamily: "inherit", outline: "none" }}
              />
              <select value={sort} onChange={(e) => setSort(e.target.value)}
                style={{ background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 8, color: COLORS.T2, fontSize: 11, padding: "8px 10px", fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                <option value="priority">AI Priority</option>
                <option value="urgency">Urgency</option>
                <option value="silent">Days Silent</option>
                <option value="value">Est. Value</option>
                <option value="newest">Newest</option>
              </select>
              <select value={stageFilter || ""} onChange={(e) => setStageFilter(e.target.value || null)}
                style={{ background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 8, color: COLORS.T2, fontSize: 11, padding: "8px 10px", fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                <option value="">All Stages</option>
                {stageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {leadsTabLeads.map((lead) => {
              const intel = intelMap[lead.id];
              const rank = intel?.priority || orderedLeads.indexOf(lead) + 1;
              return (
                <LeadRow
                  key={lead.id} lead={lead} rank={rank} intel={intel} isHot={hotLeadIds.has(lead.id)} isMobile={isMobile}
                  expanded={expanded === lead.id}
                  onToggle={() => openLeadDetail(lead)}
                  onUpdate={(id, field, value) => setLeads((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l))}
                  callLog={callLog.filter((e) => e.leadId === lead.id)}
                  onLogCall={(entry) => {
                    setCallLog((prev) => [entry, ...prev]);
                    setLeads((prev) => prev.map((l) => l.id === entry.leadId ? { ...l, touches: l.touches + 1, daysSince: 0 } : l));
                  }}
                  leadIntel={leadIntelCache[lead.id] || null}
                  leadIntelLoading={leadIntelLoading[lead.id] || false}
                  onRefreshIntel={() => {
                    setLeadIntelCache((prev) => { const o = { ...prev }; delete o[lead.id]; return o; });
                    fetchLeadIntel(leads.find((l) => l.id === lead.id)!);
                  }}
                  deepgramApiKey={settings.deepgram.apiKey}
                  deepgramConnected={settings.deepgram.connected}
                  crmConnected={!!currentTenant?.ghl_location_id}
                />
              );
            })}
            <div style={{ fontSize: 10, color: COLORS.T3, paddingTop: 12 }}>{leadsTabLeads.length} lead{leadsTabLeads.length !== 1 ? "s" : ""}</div>
          </div>
        )}

        {/* ═══ CALL LOG TAB ═══ */}
        {activeTab === "log" && (
          <div className="fade" style={{ display: "flex", justifyContent: "center", padding: "48px 16px" }}>
            <div
              style={{
                maxWidth: 480,
                width: "100%",
                background: COLORS.S1,
                border: "1px solid " + COLORS.B1,
                borderRadius: 12,
                padding: 32,
                textAlign: "center",
              }}
            >
              <Phone size={32} color={COLORS.T3} style={{ margin: "0 auto 16px", display: "block" }} strokeWidth={1.5} />
              <h2 style={{ fontSize: 18, fontWeight: 600, color: COLORS.TEXT, margin: "0 0 16px", fontFamily: "'League Spartan', sans-serif" }}>
                Call history coming soon
              </h2>
              <p style={{ fontSize: 13, color: COLORS.T2, lineHeight: 1.55, margin: "0 0 12px" }}>
                Your GHL Sales Call Dashboard already tracks call volume, talk time, and per-rep stats — Lead Intel won't duplicate that.
              </p>
              <p style={{ fontSize: 13, color: COLORS.T2, lineHeight: 1.55, margin: "0 0 24px" }}>
                What's coming here: per-lead call timelines that feed the daily briefing — so the rep knows "left 2 voicemails, last connected 3m on Tuesday" before dialing. We're holding off until call recording consent is confirmed across all states the team operates in.
              </p>
              <a
                href={`${GHL_BASE_URL}/v2/location/${GHL_LOCATION_ID}/reporting/reports`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: COLORS.GRN, textDecoration: "none", fontWeight: 500 }}
              >
                View call stats in GHL ↗
              </a>
            </div>
          </div>
        )}

        {/* ═══ SETTINGS TAB ═══ */}
        {activeTab === "settings" && (
          <div className="fade" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "180px 1fr", gap: 20 }}>
            {/* Settings Nav */}
            <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 2 }}>
              {[["integrations", "Integrations"], ["team", "Team"], ["pipeline", "Pipelines"], ["billing", "Billing"], ["company", "Company"], ["account", "Account"]].map(([key, label]) => (
                <button key={key} onClick={() => {
                  if (key === "billing") { navigate("/billing"); return; }
                  setSettingsNav(key);
                }}
                  style={{
                    background: settingsNav === key ? COLORS.S2 : "transparent",
                    border: "none",
                    borderLeft: !isMobile ? "2px solid " + (settingsNav === key ? COLORS.GRN : "transparent") : "none",
                    borderBottom: isMobile ? "2px solid " + (settingsNav === key ? COLORS.GRN : "transparent") : "none",
                    padding: "8px 14px",
                    color: settingsNav === key ? COLORS.TEXT : COLORS.T3,
                    fontSize: 12,
                    fontWeight: settingsNav === key ? 600 : 400,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Settings Content */}
            <div>
              {settingsNav === "integrations" && (
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.TEXT, marginBottom: 4 }}>Integrations</div>
                  <div style={{ fontSize: 12, color: COLORS.T3, marginBottom: 24 }}>Connect your tools to power Lead Intel</div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                    {INTEG_LIST.map((integ) => {
                      const isGhl = integ.key === "ghl";
                      const isAi = integ.key === "anthropic";
                      const connected = isGhl
                        ? ghlStatus.connected
                        : integ.always || (settings as any)[integ.key]?.connected;
                      const statusColor = connected ? COLORS.GRN : COLORS.T3;
                      const statusLabel = connected ? "Connected" : "Not connected";
                      return (
                        <div key={integ.key} style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 12, padding: "16px", display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: integ.iconColor + "15", border: "1px solid " + integ.iconColor + "25", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: integ.iconColor }}>
                              {integ.icon}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.TEXT }}>{integ.name}</div>
                            <span style={{ fontSize: 8.5, fontWeight: 600, color: statusColor, background: statusColor + "15", border: "1px solid " + statusColor + "25", borderRadius: 4, padding: "2px 8px", flexShrink: 0 }}>{statusLabel}</span>
                          </div>
                          <div style={{ fontSize: 11.5, color: COLORS.T2, lineHeight: 1.6 }}>{integ.desc}</div>
                          {isGhl && ghlStatus.connected && (
                            <div style={{ fontSize: 10, color: COLORS.T3 }}>
                              Synced <span style={{ color: COLORS.TEXT }}>{ghlStatus.contactCount.toLocaleString()}</span> contacts · last sync <span style={{ color: COLORS.TEXT }}>{relativeTime(ghlStatus.lastSyncAt)}</span>
                            </div>
                          )}
                          {(integ as any).model && (
                            <div style={{ fontSize: 10, color: COLORS.T3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span>Model: <span style={{ color: COLORS.GRN }}>{(integ as any).model}</span></span>
                              <button
                                onClick={triggerAiTest}
                                disabled={aiTesting}
                                style={{ background: "transparent", border: "1px solid " + COLORS.B1, borderRadius: 5, padding: "2px 8px", color: COLORS.T2, fontSize: 10, cursor: aiTesting ? "wait" : "pointer", fontFamily: "inherit" }}
                              >
                                {aiTesting ? "Testing…" : "Test"}
                              </button>
                              {aiTestState.status === "ok" && <span style={{ color: COLORS.GRN }}>✓ Working</span>}
                              {aiTestState.status === "fail" && <span style={{ color: COLORS.RED }} title={aiTestState.msg}>✗ Failed{aiTestState.msg ? `: ${aiTestState.msg.slice(0, 60)}` : ""}</span>}
                            </div>
                          )}
                          {isGhl ? (
                            <div style={{ marginTop: "auto" }}>
                              <button
                                onClick={triggerGhlResync}
                                disabled={resyncing}
                                style={{ background: "transparent", border: "1px solid " + COLORS.GRN + "50", borderRadius: 7, padding: "5px 14px", color: COLORS.GRN, fontSize: 11, cursor: resyncing ? "wait" : "pointer", fontFamily: "inherit", opacity: resyncing ? 0.6 : 1 }}
                              >
                                {resyncing ? "Syncing…" : ghlStatus.connected ? "Resync" : "Connect"}
                              </button>
                            </div>
                          ) : !integ.always && (
                            <div style={{ marginTop: "auto" }}>
                              {connected ? (
                                <button onClick={() => setSettings((prev) => ({ ...prev, [integ.key]: { ...(prev as any)[integ.key], connected: false } }))}
                                  style={{ background: "transparent", border: "1px solid " + COLORS.RED + "50", borderRadius: 7, padding: "5px 14px", color: COLORS.RED, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                                  Disconnect
                                </button>
                              ) : (
                                <button onClick={() => { setSettingsTempForm({ ...(settings as any)[integ.key] }); setSettingsModal(integ.key); }}
                                  style={{ background: "transparent", border: "1px solid " + COLORS.GRN + "50", borderRadius: 7, padding: "5px 14px", color: COLORS.GRN, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                                  Connect
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {settingsNav === "team" && (
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.TEXT, marginBottom: 4 }}>Team Members</div>
                  <div style={{ fontSize: 12, color: COLORS.T3, marginBottom: 24 }}>
                    {ghlUsers.length > 0
                      ? `${ghlUsers.length} reps synced from GoHighLevel`
                      : "No reps synced yet — run a sync from the Today tab"}
                  </div>
                  {(() => {
                    const hasError = (usersSyncState?.consecutive_failures ?? 0) > 0 && !!usersSyncState?.last_error;
                    const accent = hasError ? COLORS.RED : usersLastSyncAt ? COLORS.GRN : COLORS.AMB;
                    return (
                      <div style={{
                        background: accent + "10",
                        border: "1px solid " + accent + "30",
                        borderRadius: 10,
                        padding: "10px 14px",
                        marginBottom: 16,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: accent }}>
                            {hasError
                              ? `Last users sync failed (${usersSyncState!.consecutive_failures} attempt${usersSyncState!.consecutive_failures === 1 ? "" : "s"})`
                              : usersLastSyncAt
                                ? `Users synced ${relativeTime(usersLastSyncAt)}`
                                : "Users have not been synced yet"}
                          </div>
                          <div style={{ fontSize: 10, color: COLORS.T3, marginTop: 2, fontFamily: "monospace" }}>
                            {hasError
                              ? (usersSyncState?.last_error?.slice(0, 140) ?? "Unknown error")
                              : `${ghlUsers.length} active rep${ghlUsers.length === 1 ? "" : "s"} cached${usersSyncState?.last_full_sync_at ? ` · full sync ${relativeTime(usersSyncState.last_full_sync_at)}` : ""}`}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 12, overflow: "hidden" }}>
                    {ghlUsers.map((u, idx) => {
                      const name = displayName(u);
                      const ac = nameToColor(name);
                      const activeLeads = leads.filter((l) => l.assignedTo === name).length;
                      const status = u.is_active ? "Active" : "Inactive";
                      return (
                        <div key={u.ghl_user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: idx === ghlUsers.length - 1 ? "none" : "1px solid " + COLORS.B1, flexWrap: "wrap" }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: ac + "20", border: "1px solid " + ac + "30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: ac, flexShrink: 0 }}>
                            {nameInitials(name)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.TEXT }}>{name}</div>
                            {u.email && <div style={{ fontSize: 10, color: COLORS.T3, marginTop: 2 }}>{u.email}</div>}
                          </div>
                          <span style={{ fontSize: 10, color: COLORS.T3 }} className="font-mono">{activeLeads} leads</span>
                          <span style={{ fontSize: 8.5, fontWeight: 600, color: status === "Active" ? COLORS.GRN : COLORS.T3, background: (status === "Active" ? COLORS.GRN : COLORS.T3) + "15", borderRadius: 4, padding: "2px 7px" }}>{status}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {settingsNav === "pipeline" && (
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.TEXT, marginBottom: 4 }}>Pipelines</div>
                  <div style={{ fontSize: 12, color: COLORS.T3, marginBottom: 24 }}>
                    Choose which GoHighLevel pipelines Lead Intel monitors. Saving triggers a fresh opportunities sync.
                  </div>
                  {currentTenant ? (
                    <PipelineSelectionPanel
                      tenantId={currentTenant.id}
                      variant="inline"
                      onSaved={() => showToast("Pipelines saved · syncing in background")}
                    />
                  ) : (
                    <div style={{ padding: 16, color: COLORS.T3, fontSize: 13, background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 10 }}>
                      Switch to a tenant in the header to manage pipelines.
                    </div>
                  )}
                </div>
              )}

              {settingsNav === "company" && (
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.TEXT, marginBottom: 4 }}>Company Settings</div>
                  <div style={{ fontSize: 12, color: COLORS.T3, marginBottom: 24 }}>Your business details</div>
                  <div style={{ background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 12, padding: 20 }}>
                    {[["Company Name", "name"], ["Your Name", "userName"], ["Email", "email"], ["Timezone", "timezone"]].map(([label, key]) => (
                      <div key={key} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
                        <input
                          value={(settings.company as any)[key] || ""}
                          onChange={(e) => setSettings((prev) => ({ ...prev, company: { ...prev.company, [key]: e.target.value } }))}
                          style={{ width: "100%", background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 8, color: COLORS.TEXT, fontSize: 13, padding: "10px 14px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                    ))}
                    <button onClick={() => { localStorage.removeItem("leadIntel_leads"); localStorage.removeItem("leadIntel_callLog"); localStorage.removeItem("leadIntel_settings"); window.location.reload(); }}
                      style={{ background: "transparent", border: "1px solid " + COLORS.RED + "40", borderRadius: 8, padding: "8px 16px", color: COLORS.RED, fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginTop: 10 }}>
                      Reset All Data
                    </button>
                  </div>
                </div>
              )}

              {settingsNav === "account" && (
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.TEXT, marginBottom: 4, fontFamily: "'League Spartan', sans-serif" }}>Account</div>
                  <div style={{ fontSize: 12, color: COLORS.T3, marginBottom: 8 }}>Manage your sign-in credentials</div>
                  <ChangePasswordSection />
                </div>
              )}

              {settingsNav === "billing" && (
                <BillingTab tenantId={currentTenant?.id ?? null} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ ADD LEAD MODAL ═══ */}
      {showAddLead && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setShowAddLead(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 14, padding: 24, width: "100%", maxWidth: 440, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.TEXT }}>Add New Lead</div>
              <button onClick={() => setShowAddLead(false)} style={{ background: "transparent", border: "none", color: COLORS.T3, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            {([["Name", "name", "text", "Dorothy M."], ["Phone", "phone", "tel", "(602) 555-0142"], ["Address", "address", "text", "123 Main St, Phoenix AZ"]] as const).map((f) => (
              <div key={f[1]} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 5 }}>{f[0]}</div>
                <input type={f[2]} value={(newLead as any)[f[1]]} placeholder={f[3]}
                  onChange={(e) => setNewLead((p) => ({ ...p, [f[1]]: e.target.value }))}
                  style={{ width: "100%", background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 8, color: COLORS.TEXT, fontSize: 12, padding: "8px 10px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 5 }}>Source</div>
                <select value={newLead.source} onChange={(e) => setNewLead((p) => ({ ...p, source: e.target.value }))}
                  style={{ width: "100%", background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 8, color: COLORS.TEXT, fontSize: 12, padding: "8px 10px", fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                  {["Probate", "Pre-foreclosure", "PPC", "Direct Mail", "Signal Sniping", "Divorce List", "Tired Landlord", "Absentee Owner", "Referral", "Other"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 5 }}>Stage</div>
                <select value={newLead.stage} onChange={(e) => setNewLead((p) => ({ ...p, stage: e.target.value }))}
                  style={{ width: "100%", background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 8, color: COLORS.TEXT, fontSize: 12, padding: "8px 10px", fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                  {ALL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 5 }}>Situation</div>
              <textarea value={newLead.situation} rows={3}
                onChange={(e) => setNewLead((p) => ({ ...p, situation: e.target.value }))}
                style={{ width: "100%", background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 8, color: COLORS.TEXT, fontSize: 12, padding: "8px 10px", fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            </div>
            {addError && <div style={{ fontSize: 11, color: COLORS.RED, marginBottom: 10 }}>{addError}</div>}
            <button onClick={() => {
              if (!newLead.name.trim() || !newLead.phone.trim()) { setAddError("Name and phone are required."); return; }
              const newId = leads.reduce((max, l) => l.id > max ? l.id : max, 0) + 1;
              const entry: Lead = {
                ...newLead as any,
                id: newId,
                value: newLead.value ? parseInt(newLead.value) : 0,
                daysSince: 0, touches: 0, daysInStage: 0, lastTouch: 0, dealValue: 0,
                assignedTo: newLead.assignedTo || "Unassigned",
                touchHistory: [],
              };
              setLeads((prev) => [...prev, entry]);
              setShowAddLead(false);
              setNewLead(defaultNewLead);
              setAddError("");
              setAddFlash(true);
              setTimeout(() => setAddFlash(false), 2000);
            }}
              style={{ width: "100%", background: COLORS.GRN, border: "none", borderRadius: 10, padding: "12px", color: "#000", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              Add Lead
            </button>
          </div>
        </div>
      )}

      {/* Integration connect modal */}
      {settingsModal && INTEG_MODAL_CFG[settingsModal] && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setSettingsModal(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 14, padding: 24, width: "100%", maxWidth: 440 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.TEXT }}>Connect {INTEG_MODAL_CFG[settingsModal].name}</div>
              <button onClick={() => setSettingsModal(null)} style={{ background: "transparent", border: "none", color: COLORS.T3, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            {INTEG_MODAL_CFG[settingsModal].fields.map((field) => (
              <div key={field.key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 5 }}>{field.label}</div>
                <input type={field.type} value={settingsTempForm[field.key] || ""} placeholder={field.placeholder}
                  onChange={(e) => setSettingsTempForm((p) => ({ ...p, [field.key]: e.target.value }))}
                  style={{ width: "100%", background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 8, color: COLORS.TEXT, fontSize: 13, padding: "10px 14px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            {(INTEG_MODAL_CFG[settingsModal].toggles || []).map((tog) => (
              <div key={tog.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: COLORS.T2 }}>{tog.label}</span>
                <Toggle on={!!settingsTempForm[tog.key]} onChange={() => setSettingsTempForm((p) => ({ ...p, [tog.key]: !p[tog.key] }))} />
              </div>
            ))}
            <button onClick={() => {
              setSettings((prev) => ({ ...prev, [settingsModal!]: { ...(prev as any)[settingsModal!], ...settingsTempForm, connected: true } }));
              setSettingsModal(null);
              showToast("Connected ✓");
            }}
              style={{ width: "100%", background: COLORS.GRN, border: "none", borderRadius: 10, padding: "12px", color: "#000", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              Connect
            </button>
          </div>
        </div>
      )}

      {/* Floating voice assistant — available on every tab */}
      <VoiceFab
        deepgramApiKey={settings.deepgram.apiKey}
        deepgramConnected={settings.deepgram.connected}
        leads={leads}
        rankedTopLeads={voiceRankedTop}
        isMobile={isMobile}
        onHighlightLeads={setHighlightedLeads}
        onExpandLead={(id) => { setActiveTab("leads"); setExpanded(id); }}
        onChangeTab={setActiveTab}
      />

      {/* Lead detail side panel — driven by ?lead= query param */}
      <LeadDetailPanel
        lead={
          selectedLeadId
            ? leads.find(
                (l) =>
                  l.ghlContactId === selectedLeadId || String(l.id) === selectedLeadId
              ) ?? null
            : null
        }
        isMobile={isMobile}
        aiAvailable={!error || !/credit|exhaust|AI_NO_CREDITS/i.test(error)}
        onClose={closeLeadDetail}
      />
    </div>
  );
}
