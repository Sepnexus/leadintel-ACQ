import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "./useCurrentTenant";

export interface TenantPipelinesConfig {
  /** null = legacy tenant (no rows) → sync all. otherwise list of selected pipeline ids. */
  selectedPipelineIds: string[] | null;
  /** True if rows exist but none are selected. */
  hasNoSelection: boolean;
  /** True if there are no rows at all (first-login case). */
  needsSetup: boolean;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useTenantPipelinesConfig(): TenantPipelinesConfig {
  const { tenant, loading: tenantLoading } = useCurrentTenant();
  const [state, setState] = useState<Omit<TenantPipelinesConfig, "refetch">>({
    selectedPipelineIds: null,
    hasNoSelection: false,
    needsSetup: false,
    loading: true,
  });

  const load = useCallback(async () => {
    if (!tenant?.id) {
      setState({ selectedPipelineIds: null, hasNoSelection: false, needsSetup: false, loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const { data, error } = await supabase
      .from("tenant_pipelines")
      .select("ghl_pipeline_id, selected")
      .eq("tenant_id", tenant.id);
    if (error) {
      setState({ selectedPipelineIds: null, hasNoSelection: false, needsSetup: false, loading: false });
      return;
    }
    const rows = data ?? [];
    if (rows.length === 0) {
      setState({ selectedPipelineIds: null, hasNoSelection: false, needsSetup: true, loading: false });
      return;
    }
    const selected = rows.filter((r: any) => r.selected).map((r: any) => r.ghl_pipeline_id as string);
    setState({
      selectedPipelineIds: selected,
      hasNoSelection: selected.length === 0,
      needsSetup: false,
      loading: false,
    });
  }, [tenant?.id]);

  useEffect(() => {
    if (tenantLoading) return;
    load();
  }, [tenantLoading, load]);

  return { ...state, refetch: load };
}