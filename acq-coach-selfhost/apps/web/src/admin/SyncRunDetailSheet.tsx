// Drilldown into a single sync run: what was scanned, what was saved, errors, sample messages.
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAdminQuery, type SyncRun } from "./api";
import { StatusPill, EmptyState, ErrorBox } from "./shared";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, MessageSquare, Clock, ArrowRight } from "lucide-react";

export function SyncRunDetailSheet({
  run, open, onOpenChange,
}: { run: SyncRun | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, isLoading, error } = useAdminQuery<{ run: SyncRun; sample_messages: any[]; sample_conversations: any[] }>(
    ["admin", "sync-run-detail", run?.id || ""],
    { action: "sync-run-detail", run_id: run?.id },
    { enabled: !!run?.id, staleTime: 60_000 },
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="cc-admin w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="font-display flex items-center gap-2">
            Sync run detail
            {run && <StatusPill status={run.status} />}
          </SheetTitle>
          <SheetDescription>
            {run ? `Trigger: ${run.trigger} · started ${new Date(run.started_at).toLocaleString()}` : ""}
          </SheetDescription>
        </SheetHeader>

        {error ? <ErrorBox>{(error as any).message}</ErrorBox> : null}

        {!run ? <EmptyState>No run selected</EmptyState> : (
          <div className="space-y-5">
            {/* What's being synced — explainer */}
            <div className="rounded-md border border-border bg-card/60 p-3 text-xs text-muted-foreground">
              <div className="font-bold text-foreground text-[11px] uppercase tracking-wider mb-1">What this sync does</div>
              Pulls GHL conversations newer than the cursor, saves any <span className="text-primary">call-type messages</span>{" "}
              (TYPE_CALL) into <code className="text-foreground">ghl_messages</code>, advances the cursor, and logs a run row.
              History is never backfilled before the customer's integration date.
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat icon={<MessageSquare className="h-3 w-3" />} label="Conversations scanned" value={String(run.conversations_scanned)} />
              <Stat icon={<MessageSquare className="h-3 w-3" />} label="Conversations saved" value={String(run.conversations_saved)} />
              <Stat icon={<Phone className="h-3 w-3" />} label="Call messages found" value={String(run.call_messages_found)} />
              <Stat icon={<Phone className="h-3 w-3" />} label="Messages saved" value={String(run.messages_saved)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <KV label="Cursor before" value={run.cursor_before_ms ? new Date(Number(run.cursor_before_ms)).toLocaleString() : "—"} />
              <KV label="Cursor after" value={run.cursor_after_ms ? new Date(Number(run.cursor_after_ms)).toLocaleString() : "—"} />
              <KV label="Started" value={new Date(run.started_at).toLocaleString()} />
              <KV label="Finished" value={run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"} />
              <KV label="Duration" value={run.duration_ms ? `${(run.duration_ms / 1000).toFixed(2)}s` : "—"} />
              <KV label="Trigger" value={run.trigger} />
            </div>

            {run.error_message && (
              <div className="border border-destructive/40 bg-destructive/10 text-destructive text-xs rounded-md p-3 whitespace-pre-wrap">
                <div className="font-bold uppercase tracking-wider mb-1">Error</div>
                {run.error_message}
              </div>
            )}

            <div>
              <div className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <Phone className="h-3 w-3" /> Call messages saved during this run
              </div>
              {isLoading ? <Skeleton className="h-24" /> :
                (data?.sample_messages || []).length === 0 ? <EmptyState>No call messages were saved in this run.</EmptyState> :
                <div className="space-y-1.5">
                  {data!.sample_messages.map(m => (
                    <div key={m.ghl_message_id} className="rounded border border-border bg-card p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{m.message_date ? new Date(m.message_date).toLocaleString() : "—"}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px]">{m.direction || "—"}</Badge>
                          {m.call_duration ? <Badge variant="outline" className="text-[9px]"><Clock className="h-2.5 w-2.5 mr-0.5" />{m.call_duration}s</Badge> : null}
                        </div>
                      </div>
                      <div className="text-muted-foreground mt-1 truncate">contact: {m.contact_id || "—"} · user: {m.user_id || "—"}</div>
                    </div>
                  ))}
                </div>}
            </div>

            <div>
              <div className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <ArrowRight className="h-3 w-3" /> Conversations touched
              </div>
              {isLoading ? <Skeleton className="h-12" /> :
                (data?.sample_conversations || []).length === 0 ? <EmptyState>No conversations updated.</EmptyState> :
                <div className="space-y-1.5">
                  {data!.sample_conversations.map((c, i) => (
                    <div key={c.ghl_conversation_id || i} className="rounded border border-border bg-card p-2 text-xs">
                      <div className="text-muted-foreground">{c.last_message_date ? new Date(c.last_message_date).toLocaleString() : "—"} · {c.last_message_type || "—"}</div>
                      {c.last_message_body && <div className="truncate mt-1">{c.last_message_body}</div>}
                    </div>
                  ))}
                </div>}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <div className="font-display text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
