import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { UsersRound, RefreshCw, Network, Search } from "lucide-react";

type VendorRow = {
  id: string;
  tenant_id: string;
  phone_e164: string;
  display_name: string | null;
  parent_vendor_id: string | null;
  active: boolean;
  deleted_at: string | null;
};

function labelFor(v: VendorRow) {
  const name = (v.display_name ?? "").trim();
  if (name) return `${name} • ${v.phone_e164}`;
  return v.phone_e164;
}

export function VendorHierarchyPanel() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const vendorsQ = useQuery({
    queryKey: ["admin_vendors", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id,tenant_id,phone_e164,display_name,parent_vendor_id,active,deleted_at")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("display_name", { ascending: true })
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

  const options = useMemo(() => {
    const list = [...(vendorsQ.data ?? [])];
    list.sort((a, b) => labelFor(a).localeCompare(labelFor(b)));
    return list;
  }, [vendorsQ.data]);

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const base = vendorsQ.data ?? [];
    if (!qq) return base;

    return base.filter((v) => {
      const parent = v.parent_vendor_id ? vendorById.get(v.parent_vendor_id) : null;
      const t = `${labelFor(v)} ${parent ? labelFor(parent) : ""}`.toLowerCase();
      return t.includes(qq);
    });
  }, [q, vendorsQ.data, vendorById]);

  const setParent = async (vendorId: string, parentId: string | null) => {
    if (!activeTenantId) return;

    setSavingId(vendorId);
    try {
      if (parentId === vendorId) throw new Error("Um vendedor não pode ser pai dele mesmo.");

      const { error } = await supabase
        .from("vendors")
        .update({ parent_vendor_id: parentId })
        .eq("tenant_id", activeTenantId)
        .eq("id", vendorId);
      if (error) throw error;

      showSuccess("Hierarquia atualizada.");
      await qc.invalidateQueries({ queryKey: ["admin_vendors", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao salvar hierarquia: ${e?.message ?? "erro"}`);
    } finally {
      setSavingId(null);
    }
  };

  if (!activeTenantId) {
    return (
      <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Selecione um tenant (botão "Trocar") para configurar a hierarquia de vendedores.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Card className="rounded-[22px] border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Hierarquia de vendedores</div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Defina o <span className="font-medium">supervisor (pai)</span> de cada vendedor via
                <span className="font-medium"> parent_vendor_id</span>.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className="rounded-full border-0 bg-slate-100 text-slate-800 hover:bg-slate-100">
              vendors
            </Badge>
            <Button
              type="button"
              variant="secondary"
              className="h-10 rounded-2xl"
              onClick={() => vendorsQ.refetch()}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, telefone ou supervisor…"
              className="h-11 rounded-2xl pl-10"
            />
          </div>
        </div>

        {vendorsQ.isError && (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            Erro ao carregar vendedores: {(vendorsQ.error as any)?.message ?? ""}
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[1fr_1fr_180px] gap-0 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">
            <div>Vendedor</div>
            <div>Supervisor (pai)</div>
            <div className="text-right">Status</div>
          </div>
          <div className="divide-y divide-slate-200 bg-white">
            {rows.map((v) => {
              const parent = v.parent_vendor_id ? vendorById.get(v.parent_vendor_id) : null;
              const isSaving = savingId === v.id;

              const display = labelFor(v);

              // Avoid allowing a parent loop from UI; DB still allows deeper loops, but keep UI safe.
              const selectableParents = options.filter((p) => p.id !== v.id);

              return (
                <div key={v.id} className="grid grid-cols-[1fr_1fr_180px] items-center gap-0 px-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 text-slate-700">
                        <UsersRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{display}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">id: {v.id.slice(0, 8)}…</div>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <Select
                      value={v.parent_vendor_id ?? "__none__"}
                      onValueChange={(next) => {
                        const pid = next === "__none__" ? null : next;
                        if (pid === v.parent_vendor_id) return;
                        setParent(v.id, pid);
                      }}
                      disabled={isSaving}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-10 rounded-2xl bg-white",
                          isSaving ? "opacity-60" : ""
                        )}
                      >
                        <SelectValue placeholder="(sem supervisor)" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl">
                        <SelectItem value="__none__" className="rounded-xl">
                          (sem supervisor)
                        </SelectItem>
                        {selectableParents.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="rounded-xl">
                            {labelFor(p)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {parent ? (
                      <div className="mt-1 truncate text-[11px] text-slate-500">Atual: {labelFor(parent)}</div>
                    ) : (
                      <div className="mt-1 text-[11px] text-slate-400">Topo (sem pai)</div>
                    )}
                  </div>

                  <div className="flex items-center justify-end">
                    <Badge
                      className={cn(
                        "rounded-full border-0",
                        v.active
                          ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-100"
                      )}
                    >
                      {v.active ? "ativo" : "inativo"}
                    </Badge>
                  </div>
                </div>
              );
            })}

            {rows.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-slate-500">Nenhum vendedor encontrado.</div>
            )}
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
          Dica: para o CRM aplicar a cascata corretamente, os usuários (supervisor/leader/manager/admin) também
          precisam ter um registro em <span className="font-medium">vendors</span> (mesmo phone_e164 do users_profile).
        </div>
      </Card>
    </div>
  );
}