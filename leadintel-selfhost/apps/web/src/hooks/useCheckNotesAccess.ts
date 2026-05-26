import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_TENANTS_OVERVIEW_KEY } from "@/hooks/useAdminTenantsOverview";

export interface CheckNotesResult {
  tenant_id: string;
  tenant_name: string;
  accessible: boolean;
  exist: boolean;
  sample_count: number;
  sample_note: string | null;
  contacts_checked: number;
  error?: string;
}

export interface CheckNotesResponse {
  ok: boolean;
  result?: CheckNotesResult;
  results?: CheckNotesResult[];
  error?: string;
}

export function useCheckNotesAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: { tenant_id?: string; run_all?: boolean },
    ): Promise<CheckNotesResponse> => {
      const { data, error } = await supabase.functions.invoke("check-notes-access", { body });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "check failed");
      return data as CheckNotesResponse;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ADMIN_TENANTS_OVERVIEW_KEY });
      if (data.results) {
        const ok = data.results.filter((r) => r.accessible).length;
        const withNotes = data.results.filter((r) => r.exist).length;
        toast.success(`Checked ${data.results.length} tenants — ${ok} accessible, ${withNotes} with notes`);
      } else if (data.result) {
        const r = data.result;
        toast.success(
          r.accessible
            ? r.exist
              ? `${r.tenant_name}: ${r.sample_count} note(s) found`
              : `${r.tenant_name}: scope OK, no notes`
            : `${r.tenant_name}: no scope (${r.error ?? "denied"})`,
        );
      }
    },
    onError: (e: any) => {
      toast.error(`Check failed: ${e?.message ?? "unknown"}`);
    },
  });
}