import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTenant } from "@/providers/TenantProvider";
import { AccessRedirect } from "@/components/AccessRedirect";

function isPortalEnabled(modulesJson: any) {
  return Boolean(modulesJson?.portal_enabled === true);
}

export function RequirePortalEnabled({ children }: { children: ReactNode }) {
  const { activeTenantId, activeTenant, loading } = useTenant();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-sm text-slate-500 animate-pulse">Validando módulo de portal…</div>
      </div>
    );
  }

  if (!activeTenantId || !activeTenant) {
    return <Navigate to="/tenants" replace state={{ from: loc.pathname }} />;
  }

  const enabled = isPortalEnabled(activeTenant.modules_json);
  if (enabled) return <>{children}</>;

  return (
    <AccessRedirect
      title="Portal desabilitado"
      description="O módulo de Construtor de Páginas (Portal) não está habilitado para este tenant. Peça ao admin para ativar."
      to="/app"
      toLabel="Voltar ao início"
      details={[
        { label: "tenant", value: activeTenantId },
        { label: "módulo", value: "portal" },
      ]}
    />
  );
}
