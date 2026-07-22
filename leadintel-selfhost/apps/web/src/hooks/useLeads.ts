import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/data/leads";
import { displayName, type GhlUser } from "@/hooks/useGhlUsers";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { useSyncHistory } from "@/hooks/useSyncHistory";

type OppRow = {
  ghl_contact_id: string;
  stage_name: string | null;
  pipeline_name: string | null;
  monetary_value: number | null;
  ghl_date_updated: string | null;
  pipeline_stage_id?: string | null;
};

type ConvRow = {
  ghl_contact_id: string;
  last_message_at: string | null;
  inbound_count_last_30d: number | null;
  outbound_count_last_30d: number | null;
};

function mapSource(niche: string | null): string {
  if (niche === "probate") return "Probate";
  if (niche === "auction") return "Auction";
  if (niche === "pre-foreclosure") return "Pre-foreclosure";
  return "Unknown";
}

const DISPOSITION_TO_STAGE: Record<string, string> = {
  "Hit List": "Interested / Warm",
  "Interested": "Interested / Warm",
  "Appointment Set": "Appointment Set",
  "Offer Needed": "Needs Underwriting",
  "Offer Delivered": "Offer Sent",
  "Offer Rejected": "Follow-Up",
  "Needs Underwriting": "Needs Underwriting",
  "Under Contract": "Under Contract",
  "Cold Follow Up": "Follow-Up",
  "Already Sold": "Dead / Not Interested",
  "Signed Elsewhere": "Dead / Not Interested",
  "Listed with Agent": "Dead / Not Interested",
  "Not Interested": "Dead / Not Interested",
  "Bad Number": "Dead / Not Interested",
  "Unresponsive After Contact": "Dead / Not Interested",
};

function mapStage(opp: OppRow | null, disposition: string | null): string {
  if (opp?.stage_name) return opp.stage_name;
  if (disposition && DISPOSITION_TO_STAGE[disposition]) return DISPOSITION_TO_STAGE[disposition];
  return "New Lead";
}

function mapMotivation(disposition: string | null): string {
  if (!disposition) return "unknown";
  if (disposition === "Hit List") return "urgent";
  if (disposition === "Interested" || disposition === "Appointment Set" || disposition === "Offer Needed" || disposition === "Offer Delivered") return "high";
  if (disposition === "Cold Follow Up" || disposition === "Offer Rejected") return "medium";
  return "unknown";
}

function daysSince(iso: string | null): number {
  if (!iso) return 999;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export function useLeads(userMap?: Map<string, GhlUser>) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { tenantFilter, ready } = useTenantFilter();

  // This hook used to fetch exactly once. Open the app during a tenant's first
  // GHL sync — as every new customer does — and it read a still-empty
  // ghl_contacts, showed "No leads in this filter", and never looked again,
  // while the "Synced Xm ago" and "AI ready" badges polled on their own and
  // cheerfully reported success. The app looked broken until a manual reload.
  //
  // useSyncHistory already polls every 5s while any sweep is running, so use it
  // as the trigger: refetch when a sync finishes, and — only while we still have
  // nothing to show — poll during a long first sync so leads appear as they land.
  const { rows: syncRows } = useSyncHistory(tenantFilter, 10);
  const syncing = syncRows.some((r) => r.status === "running");
  const [reloadKey, setReloadKey] = useState(0);
  const wasSyncing = useRef(false);

  useEffect(() => {
    if (wasSyncing.current && !syncing) setReloadKey((k) => k + 1);
    wasSyncing.current = syncing;
  }, [syncing]);

  useEffect(() => {
    // Refetching all six queries is not cheap, so only do this while a sync is
    // running AND the screen is empty — i.e. the first-sync case this fixes.
    if (!syncing || leads.length > 0) return;
    const t = setInterval(() => setReloadKey((k) => k + 1), 30_000);
    return () => clearInterval(t);
  }, [syncing, leads.length]);

  // Never hand back one tenant's rows while fetching another's. Without this the
  // hook keeps serving the previous tenant's leads for the whole refetch, and a
  // consumer that just cleared its list on the tenant switch would immediately
  // re-adopt them — the stale rows reappear under the new tenant's name.
  const fetchedFor = useRef<string | null>(tenantFilter);
  if (fetchedFor.current !== tenantFilter) {
    fetchedFor.current = tenantFilter;
    if (leads.length > 0) setLeads([]);
  }

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const tf = tenantFilter;
        let contactsQ: any = supabase.from("ghl_contacts").select("*");
        if (tf) contactsQ = contactsQ.eq("tenant_id", tf);
        let oppsQ: any = supabase.from("ghl_opportunities").select("ghl_contact_id, stage_name, pipeline_name, pipeline_stage_id, monetary_value, ghl_date_updated");
        if (tf) oppsQ = oppsQ.eq("tenant_id", tf);
        let convsQ: any = supabase.from("ghl_conversations").select("ghl_contact_id, last_message_at, inbound_count_last_30d, outbound_count_last_30d");
        if (tf) convsQ = convsQ.eq("tenant_id", tf);
        let tagsQ: any = supabase.from("ghl_contact_tags").select("ghl_contact_id, tag");
        if (tf) tagsQ = tagsQ.eq("tenant_id", tf);
        let tasksQ: any = supabase.from("ghl_tasks").select("ghl_contact_id, due_date").eq("completed", false);
        if (tf) tasksQ = tasksQ.eq("tenant_id", tf);
        let notesQ: any = supabase.from("ghl_contact_notes").select("ghl_contact_id");
        if (tf) notesQ = notesQ.eq("tenant_id", tf);
        const [contactsRes, oppsRes, convsRes, tagsRes, tasksRes, notesRes] = await Promise.all([
          contactsQ.limit(2000),
          oppsQ.limit(3000),
          convsQ.limit(3000),
          tagsQ.limit(20000),
          tasksQ.limit(20000),
          notesQ.limit(20000),
        ]);
        if (contactsRes.error) throw contactsRes.error;
        if (oppsRes.error) throw oppsRes.error;
        if (convsRes.error) throw convsRes.error;
        if (tagsRes.error) throw tagsRes.error;
        // tasksRes errors are non-fatal — leads still render without task signals

        // Latest inbound message per contact (last 60 days window for performance).
        const inboundCutoff = new Date(Date.now() - 60 * 86_400_000).toISOString();
        let inboundQ = supabase
          .from("ghl_messages")
          .select("ghl_contact_id, date_added")
          .eq("direction", "inbound")
          .gte("date_added", inboundCutoff);
        if (tenantFilter) inboundQ = inboundQ.eq("tenant_id", tenantFilter);
        const inboundRes = await inboundQ
          .order("date_added", { ascending: false })
          .limit(20000);
        const lastInboundByContact = new Map<string, string>();
        for (const m of (inboundRes.data ?? []) as Array<{ ghl_contact_id: string; date_added: string }>) {
          if (!lastInboundByContact.has(m.ghl_contact_id)) {
            lastInboundByContact.set(m.ghl_contact_id, m.date_added);
          }
        }

        // Latest opp per contact (by ghl_date_updated desc, null-safe)
        const oppByContact = new Map<string, OppRow>();
        for (const o of (oppsRes.data ?? []) as OppRow[]) {
          const existing = oppByContact.get(o.ghl_contact_id);
          if (!existing) { oppByContact.set(o.ghl_contact_id, o); continue; }
          const a = o.ghl_date_updated ? Date.parse(o.ghl_date_updated) : 0;
          const b = existing.ghl_date_updated ? Date.parse(existing.ghl_date_updated) : 0;
          if (a > b) oppByContact.set(o.ghl_contact_id, o);
        }

        const convByContact = new Map<string, ConvRow>();
        for (const c of (convsRes.data ?? []) as ConvRow[]) {
          convByContact.set(c.ghl_contact_id, c);
        }

        const tagsByContact = new Map<string, string[]>();
        for (const t of tagsRes.data ?? []) {
          const arr = tagsByContact.get(t.ghl_contact_id) ?? [];
          arr.push(t.tag);
          tagsByContact.set(t.ghl_contact_id, arr);
        }

        const taskSummary = new Map<string, { open: number; overdue: number; mostOverdueDays: number | null }>();
        const tasksByContact = new Map<string, { is_overdue: boolean }[]>();
        for (const row of (tasksRes.data ?? []) as Array<{ ghl_contact_id: string; due_date: string | null }>) {
          const s = taskSummary.get(row.ghl_contact_id) ?? { open: 0, overdue: 0, mostOverdueDays: null };
          s.open++;
          let isOverdue = false;
          if (row.due_date) {
            const days = Math.floor((Date.now() - new Date(row.due_date).getTime()) / 86_400_000);
            if (days > 0) {
              s.overdue++;
              isOverdue = true;
              if (s.mostOverdueDays === null || days > s.mostOverdueDays) s.mostOverdueDays = days;
            }
          }
          taskSummary.set(row.ghl_contact_id, s);
          const arr = tasksByContact.get(row.ghl_contact_id) ?? [];
          arr.push({ is_overdue: isOverdue });
          tasksByContact.set(row.ghl_contact_id, arr);
        }

        const hasNotesByContact = new Set<string>();
        for (const n of (notesRes?.data ?? []) as Array<{ ghl_contact_id: string }>) {
          hasNotesByContact.add(n.ghl_contact_id);
        }

        const mapped: Lead[] = (contactsRes.data ?? []).map((c: any, idx: number) => {
          const opp = oppByContact.get(c.ghl_contact_id) ?? null;
          const conv = convByContact.get(c.ghl_contact_id) ?? null;
          const tags = tagsByContact.get(c.ghl_contact_id) ?? [];
          const ts = taskSummary.get(c.ghl_contact_id);
          const lastTouchDays = daysSince(conv?.last_message_at ?? c.last_called_date ?? null);
          const touches = (conv?.inbound_count_last_30d ?? 0) + (conv?.outbound_count_last_30d ?? 0);
          const resolvedStageName = opp?.stage_name ?? null;
          const lastContactAt = conv?.last_message_at ?? c.last_called_date ?? null;
          const lastInboundAt = lastInboundByContact.get(c.ghl_contact_id) ?? null;
          const rawName = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
          const realStage = resolvedStageName ?? mapStage(opp, c.seller_disposition);
          const lastContactDays = lastContactAt
            ? Math.max(0, Math.floor((Date.now() - new Date(lastContactAt).getTime()) / 86_400_000))
            : null;
          return {
            id: idx + 1,
            name: rawName || "Unknown",
            phone: c.primary_phone ?? "",
            stage: realStage,
            source: mapSource(c.niche_motivation),
            lastTouch: lastTouchDays,
            daysSince: lastTouchDays,
            touches,
            motivation: mapMotivation(c.seller_disposition),
            situation: tags.slice(0, 3).join(", "),
            notes: "",
            assignedTo: c.assigned_user_id
              ? (userMap?.get(c.assigned_user_id)
                  ? displayName(userMap.get(c.assigned_user_id)!)
                  : "Assigned")
              : "",
            daysInStage: daysSince(opp?.ghl_date_updated ?? c.ghl_date_updated ?? null),
            value: Number(c.market_value ?? opp?.monetary_value ?? 0),
            dealValue: Number(opp?.monetary_value ?? 0),
            address: c.full_address ?? c.mailing_address ?? "",
            touchHistory: [],
            ghlContactId: c.ghl_contact_id,
            firstName: c.first_name ?? null,
            lastName: c.last_name ?? null,
            tags,
            sellerDisposition: c.seller_disposition ?? null,
            niche: c.niche_motivation ?? null,
            pipelineStageId: opp?.pipeline_stage_id ?? null,
            pipelineStageName: resolvedStageName ?? null,
            estimatedEquity: c.estimated_equity != null ? Number(c.estimated_equity) : null,
            marketValue: c.market_value != null ? Number(c.market_value) : null,
            lastContactAt,
            lastInboundAt,
            createdAt: c.ghl_date_added ?? null,
            openTaskCount: ts?.open ?? 0,
            overdueTaskCount: ts?.overdue ?? 0,
            mostOverdueDays: ts?.mostOverdueDays ?? null,
            // Weight-3 custom fields + derived signals
            seller_disposition: c.seller_disposition ?? null,
            seller_temperature: c.seller_temperature ?? null,
            last_offer_date: c.last_offer_date ?? null,
            last_offer_feedback: c.last_offer_feedback ?? null,
            last_offer_type: c.last_offer_type ?? null,
            last_offer_made: c.last_offer_made != null ? Number(c.last_offer_made) : null,
            timeline: c.timeline ?? null,
            asking_price: c.asking_price != null ? Number(c.asking_price) : null,
            condition: c.condition ?? null,
            motivation_text: c.motivation ?? null,
            seller_note: c.seller_note ?? null,
            lead_identity: c.lead_identity ?? null,
            lead_source: c.lead_source ?? null,
            personality_type: c.personality_type ?? null,
            niche_motivation: c.niche_motivation ?? null,
            campaign_name: c.campaign_name ?? null,
            follow_up_due_date: c.follow_up_due_date ?? null,
            auction_date: c.auction_date ?? null,
            has_notes: hasNotesByContact.has(c.ghl_contact_id),
            last_contact_days: lastContactDays,
            tasks: tasksByContact.get(c.ghl_contact_id) ?? [],
          };
        });

        if (!cancelled) setLeads(mapped);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? "Failed to load leads");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userMap, tenantFilter, ready, reloadKey]);

  return { leads, loading, error };
}