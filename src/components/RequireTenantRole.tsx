import { Navigate, useLocation } from "react-router-dom";
import { useTenant } from "@/providers/TenantProvider";

export type TenantRole = "admin" | "supervisor" | "manager" | "vendor" | "leader";

export function RequireTenantRole({
  roles,
  children,
}: {
  roles: TenantRole[];
  children: React.ReactNode;
}) {
  const { activeTenantId, activeTenant, loading, isSuperAdmin } = useTenant();
  const loc = useLocation();

  if (loading) return <>{children}</>; // SessionProvider already has a loading screen; keep it simple.

  if (!activeTenantId || !activeTenant) {
    return <Navigate to="/tenants" replace state={{ from: loc.pathname }} />;
  }

  if (isSuperAdmin) return <>{children}</>;

  if (roles.includes(activeTenant.role as TenantRole)) return <>{children}</>;

  return <Navigate to="/app" replace />;
}
