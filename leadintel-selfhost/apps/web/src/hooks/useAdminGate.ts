import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";

/**
 * Redirects non-super-admins to "/" with a toast.
 * Returns { ready: true } once the role is known and the user is a super admin.
 */
export function useAdminGate() {
  const { role, loading } = useCurrentTenant();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (role !== "super_admin") {
      toast.error("Admin access required");
      navigate("/", { replace: true });
    }
  }, [role, loading, navigate]);

  return { ready: !loading && role === "super_admin", loading };
}