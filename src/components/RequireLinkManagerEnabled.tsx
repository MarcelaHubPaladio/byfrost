import { PropsWithChildren } from "react";
import { useTenant } from "@/providers/TenantProvider";
import { Navigate } from "react-router-dom";

export function isLinkManagerEnabled(modulesJson: any) {
    return Boolean(modulesJson?.link_manager_enabled === true);
}

export function RequireLinkManagerEnabled({ children }: PropsWithChildren) {
    const { activeTenant, isSuperAdmin } = useTenant();

    const enabled = isSuperAdmin || isLinkManagerEnabled(activeTenant?.modules_json);

    if (!enabled) {
        return <Navigate to="/app" replace />;
    }

    return <>{children}</>;
}
