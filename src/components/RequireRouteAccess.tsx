import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";

export function RequireRouteAccess({
  routeKey,
  children,
}: {
  routeKey: string;
  children: ReactNode;
}) {
  const { activeTenantId, activeTenant, loading, isSuperAdmin } = useTenant();
  const loc = useLocation();

  const roleKey = activeTenant?.role ?? "";

  const accessQ = useQuery({
    queryKey: ["route_access", activeTenantId, roleKey, routeKey],
    enabled: Boolean(!loading && activeTenantId && roleKey && routeKey && !isSuperAdmin),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("check_route_access", {
        p_tenant_id: activeTenantId,
        p_role_key: roleKey,
        p_route_key: routeKey,
      });
      if (error) throw error;
      return Boolean(data);
    },
    staleTime: 10_000,
  });

  if (loading) return <>{children}</>;

  if (!activeTenantId || !activeTenant) {
    return <Navigate to="/tenants" replace state={{ from: loc.pathname }} />;
  }

  if (isSuperAdmin) return <>{children}</>;

  if (accessQ.isLoading) {
    return (
      <div className="min-h-[50vh] rounded-[28px] border border-slate-200 bg-white/60 p-5 text-sm text-slate-700 shadow-sm backdrop-blur">
        Carregando permissões…
      </div>
    );
  }

  if (accessQ.isError) {
    // Fallback seguro: em caso de erro, bloqueia.
    return <Navigate to="/app" replace />;
  }

  if (accessQ.data) return <>{children}</>;

  return <Navigate to="/app" replace />;
}
