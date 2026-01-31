import { Navigate, useLocation } from "react-router-dom";
import { useTenant } from "@/providers/TenantProvider";

export function RequireTenantRole({
  roles,
  children,
}: {
  roles: string[];
  children: React.ReactNode;
}) {
  const { activeTenantId, activeTenant, loading, isSuperAdmin } = useTenant();
  const loc = useLocation();

  if (loading) return <>{children}</>; // SessionProvider already has a loading screen; keep it simple.

  if (!activeTenantId || !activeTenant) {
    return <Navigate to="/tenants" replace state={{ from: loc.pathname }} />;
  }

  if (isSuperAdmin) return <>{children}</>;

  if (roles.includes(String(activeTenant.role))) return <>{children}</>;

  return <Navigate to="/app" replace />;
}