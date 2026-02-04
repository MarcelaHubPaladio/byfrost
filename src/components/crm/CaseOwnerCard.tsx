import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { ShieldCheck, UserRoundCog, UsersRound } from "lucide-react";

type VendorRow = {
  id: string;
  tenant_id: string;
  phone_e164: string;
  display_name: string | null;
  parent_vendor_id: string | null;
  deleted_at: string | null;
};

function isPresenceManagerRole(role: string | null | undefined) {
  return ["admin", "manager", "supervisor", "leader"].includes(String(role ?? "").toLowerCase());
}

function labelForVendor(v: VendorRow) {
  const name = (v.display_name ?? "").trim();
  if (name) return `${name} • ${v.phone_e164}`;
  return v.phone_e164;
}

export function CaseOwnerCard(props: {
  tenantId: string;
  caseId: string;
  assignedVendorId: string | null;
}) {
  const qc = useQueryClient();
  const { user } = useSession();
  const { activeTenant, isSuperAdmin } = useTenant();

  const [selected, setSelected] = useState<string>(props.assignedVendorId ?? "__unassigned__");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(props.assignedVendorId ?? "__unassigned__");
  }, [props.assignedVendorId]);

  const profileQ = useQuery({
    queryKey: ["crm_me_profile", props.tenantId, user?.id],
    enabled: Boolean(props.tenantId && user?.id),
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("role,phone_e164")
        .eq("tenant_id", props.tenantId)
        .eq("user_id", user!.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as any;
    },
  });

  const vendorsQ = useQuery({
    queryKey: ["crm_vendors", props.tenantId],
    enabled: Boolean(props.tenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id,tenant_id,phone_e164,display_name,parent_vendor_id,deleted_at")
        .eq("tenant_id", props.tenantId)
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as VendorRow[];
    },
  });

  const vendorById = useMemo(() => {
    const m = new Map<string, VendorRow>();
    for (const v of vendorsQ.data ?? []) m.set(v.id, v);
    return m;
  }, [vendorsQ.data]);

  const myRole = String(profileQ.data?.role ?? activeTenant?.role ?? "");
  const myPhone = (profileQ.data?.phone_e164 as string | null) ?? null;

  const myVendorId = useMemo(() => {
    const phone = (myPhone ?? "").trim();
    if (!phone) return null;
    return (vendorsQ.data ?? []).find((v) => v.phone_e164 === phone)?.id ?? null;
  }, [vendorsQ.data, myPhone]);

  const allowedVendors = useMemo(() => {
    const all = vendorsQ.data ?? [];
    if (isSuperAdmin) {
      return [...all].sort((a, b) => labelForVendor(a).localeCompare(labelForVendor(b)));
    }

    const role = String(myRole ?? "").toLowerCase();

    // Se não conseguimos mapear o usuário para um vendor, não dá pra calcular cascata.
    if (!myVendorId) return [] as VendorRow[];

    // Root de delegação:
    // - vendor: pode delegar dentro da subárvore do supervisor (pai). Se não tiver pai, só ele mesmo.
    // - supervisor/leader/manager/admin: subárvore do próprio vendor.
    const myVendor = vendorById.get(myVendorId) ?? null;
    const rootId = role === "vendor" ? (myVendor?.parent_vendor_id ?? myVendorId) : myVendorId;

    const childrenByParent = new Map<string, string[]>();
    for (const v of all) {
      const p = v.parent_vendor_id;
      if (!p) continue;
      const cur = childrenByParent.get(p) ?? [];
      cur.push(v.id);
      childrenByParent.set(p, cur);
    }

    const visited = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const kids = childrenByParent.get(id) ?? [];
      for (const k of kids) stack.push(k);
    }

    const list = all.filter((v) => visited.has(v.id));
    list.sort((a, b) => labelForVendor(a).localeCompare(labelForVendor(b)));
    return list;
  }, [vendorsQ.data, isSuperAdmin, myRole, myVendorId, vendorById]);

  const currentOwner = props.assignedVendorId ? vendorById.get(props.assignedVendorId) ?? null : null;

  const canSetUnassigned = isSuperAdmin || isPresenceManagerRole(myRole);

  const saveOwner = async () => {
    if (!props.tenantId || !props.caseId) return;

    const nextVendorId = selected === "__unassigned__" ? null : selected;
    if (nextVendorId === props.assignedVendorId) return;

    // Guard client-side (o banco também barra)
    if (nextVendorId && !isSuperAdmin) {
      const allowed = allowedVendors.some((v) => v.id === nextVendorId);
      if (!allowed) {
        showError("Você não tem permissão (pela cascata) para delegar para este vendedor.");
        return;
      }
    }

    setSaving(true);
    try {
      const prevVendorId = props.assignedVendorId;
      const prevLabel = prevVendorId ? labelForVendor(vendorById.get(prevVendorId)!) : "(sem dono)";
      const nextLabel = nextVendorId ? labelForVendor(vendorById.get(nextVendorId)!) : "(sem dono)";

      const { error } = await supabase
        .from("cases")
        .update({ assigned_vendor_id: nextVendorId })
        .eq("tenant_id", props.tenantId)
        .eq("id", props.caseId);
      if (error) throw error;

      // Timeline
      const { error: tlErr } = await supabase.from("timeline_events").insert({
        tenant_id: props.tenantId,
        case_id: props.caseId,
        event_type: "lead_owner_changed",
        actor_type: "admin",
        actor_id: user?.id ?? null,
        message: `Dono do lead alterado: ${prevLabel} → ${nextLabel}`,
        meta_json: {
          from_vendor_id: prevVendorId,
          to_vendor_id: nextVendorId,
          actor_user_id: user?.id ?? null,
          actor_role: myRole,
        },
        occurred_at: new Date().toISOString(),
      });
      if (tlErr) throw tlErr;

      showSuccess("Dono do lead atualizado.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["crm_cases_by_tenant", props.tenantId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao alterar dono do lead: ${e?.message ?? "erro"}`);
      setSelected(props.assignedVendorId ?? "__unassigned__");
    } finally {
      setSaving(false);
    }
  };

  const title = isPresenceManagerRole(myRole) || isSuperAdmin ? "Atribuir / reatribuir lead" : "Delegar lead";

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "grid h-9 w-9 place-items-center rounded-2xl",
              isPresenceManagerRole(myRole) || isSuperAdmin
                ? "bg-indigo-50 text-indigo-700"
                : "bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]"
            )}
          >
            {(isPresenceManagerRole(myRole) || isSuperAdmin) ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <UserRoundCog className="h-4 w-4" />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Dono do lead</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{title}</div>
          </div>
        </div>

        <Badge className="rounded-full border-0 bg-slate-100 text-slate-800 hover:bg-slate-100">cases</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <div className="text-xs font-semibold text-slate-700">Atual</div>
          <div className="mt-1 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <UsersRound className="h-4 w-4 text-slate-400" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">
                {currentOwner ? labelForVendor(currentOwner) : "(sem dono)"}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {myVendorId ? "visibilidade por cascata ativa" : "atenção: seu usuário não está mapeado a um vendor"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-end">
          <Button
            type="button"
            onClick={saveOwner}
            disabled={saving || vendorsQ.isLoading || profileQ.isLoading}
            className={cn(
              "h-11 rounded-2xl px-4 text-white",
              "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
            )}
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>

        <div className="sm:col-span-2">
          <div className="text-xs font-semibold text-slate-700">Novo dono</div>
          <Select
            value={selected}
            onValueChange={setSelected}
            disabled={saving || vendorsQ.isLoading || profileQ.isLoading}
          >
            <SelectTrigger className="mt-1 h-11 rounded-2xl bg-white">
              <SelectValue placeholder="Selecionar vendedor…" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              {canSetUnassigned && (
                <SelectItem value="__unassigned__" className="rounded-xl">
                  (sem dono)
                </SelectItem>
              )}
              {(isSuperAdmin ? (vendorsQ.data ?? []) : allowedVendors).map((v) => (
                <SelectItem key={v.id} value={v.id} className="rounded-xl">
                  {labelForVendor(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!isSuperAdmin && !myVendorId && (
            <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
              Seu usuário não está mapeado para um <span className="font-medium">vendor</span> (por phone_e164),
              então não dá para calcular sua cascata. Ajuste o cadastro em Admin → Usuários e garanta que exista
              um registro correspondente em <span className="font-medium">vendors</span>.
            </div>
          )}

          <div className="mt-2 text-[11px] text-slate-500">
            A permissão real é validada pelo banco (RLS) conforme a hierarquia em cascata.
          </div>
        </div>
      </div>
    </Card>
  );
}
