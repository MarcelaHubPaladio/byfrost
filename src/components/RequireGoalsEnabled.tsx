import React, { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useTenant } from "@/providers/TenantProvider";

function isGoalsEnabled(modulesJson: any) {
    return Boolean(modulesJson?.goals_enabled === true);
}

export function RequireGoalsEnabled({ children }: { children: ReactNode }) {
    const { activeTenant, isSuperAdmin } = useTenant();

    if (!activeTenant) return <>{children}</>;

    const enabled = isGoalsEnabled(activeTenant.modules_json);

    if (isSuperAdmin || enabled) {
        return <>{children}</>;
    }

    return <Navigate to="/app" replace />;
}
