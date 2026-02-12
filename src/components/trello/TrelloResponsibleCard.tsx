import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { UserRound } from "lucide-react";
import { useSession } from "@/providers/SessionProvider";

type VendorRow = {
  id: string;
  phone_e164: string;
  display_name: string | null;
};

function labelForVendor(v: VendorRow) {
  const name = (v.display_name ?? "").trim();
  if (name) return `${name} • ${v.phone_e164}`;
  return v.phone_e164;
}

export function TrelloResponsibleCard(props: {
  tenantId: string;
  caseId: string;
  assignedVendorId: string | null;
}) {
  const qc = useQueryClient();
  const { user } = useSession();

  const vendorsQ = useQuery({
    queryKey: ["trello_vendors", props.tenantId],
    enabled: Boolean(props.tenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id,phone_e164,display_name")
        .eq("tenant_id", props.tenantId)
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw error;
      const list = (data ?? []) as VendorRow[];
      list.sort((a, b) => labelForVendor(a).localeCompare(labelForVendor(b)));
      return list;
    },
  });

  const vendorById = useMemo(() => {
    const m = new Map<string, VendorRow>();
    for (const v of vendorsQ.data ?? []) m.set(v.id, v);
    return m;
  }, [vendorsQ.data]);

  const [selected, setSelected] = useState<string>(props.assignedVendorId ?? "__unassigned__");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(props.assignedVendorId ?? "__unassigned__");
  }, [props.assignedVendorId]);

  const current = props.assignedVendorId ? vendorById.get(props.assignedVendorId) ?? null : null;

  const save = async () => {
    if (!props.tenantId || !props.caseId) return;

    const nextVendorId = selected === "__unassigned__" ? null : selected;
    if (nextVendorId === props.assignedVendorId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("cases")
        .update({ assigned_vendor_id: nextVendorId })
        .eq("tenant_id", props.tenantId)
        .eq("id", props.caseId);
      if (error) throw error;

      const prevLabel = current ? labelForVendor(current) : "(sem responsável)";
      const nextLabel = nextVendorId
        ? labelForVendor(vendorById.get(nextVendorId) ?? { id: nextVendorId, phone_e164: "(desconhecido)", display_name: null })
        : "(sem responsável)";

      await supabase.from("timeline_events").insert({
        tenant_id: props.tenantId,
        case_id: props.caseId,
        event_type: "card_responsible_changed",
        actor_type: "admin",
        actor_id: user?.id ?? null,
        message: `Responsável alterado: ${prevLabel} → ${nextLabel}`,
        meta_json: { from_vendor_id: props.assignedVendorId, to_vendor_id: nextVendorId },
        occurred_at: new Date().toISOString(),
      });

      showSuccess("Responsável atualizado.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["trello_case", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["cases_by_tenant", props.tenantId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao atualizar responsável: ${e?.message ?? "erro"}`);
      setSelected(props.assignedVendorId ?? "__unassigned__");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 text-slate-700">
            <UserRound className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Responsável</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Opcional (pode ficar sem)</div>
          </div>
        </div>

        <Button
          type="button"
          onClick={save}
          disabled={saving || vendorsQ.isLoading}
          className={cn(
            "h-10 rounded-2xl px-4 text-white",
            "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
          )}
        >
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-700">Atual</div>
        <div className="mt-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
          {current ? labelForVendor(current) : "(sem responsável)"}
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs font-semibold text-slate-700">Novo responsável</div>
        <Select value={selected} onValueChange={setSelected} disabled={saving || vendorsQ.isLoading}>
          <SelectTrigger className="mt-1 h-11 rounded-2xl bg-white">
            <SelectValue placeholder="Selecionar…" />
          </SelectTrigger>
          <SelectContent className="rounded-2xl">
            <SelectItem value="__unassigned__" className="rounded-xl">
              (sem responsável)
            </SelectItem>
            {(vendorsQ.data ?? []).map((v) => (
              <SelectItem key={v.id} value={v.id} className="rounded-xl">
                {labelForVendor(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {vendorsQ.isError ? (
          <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-900">
            Erro ao carregar responsáveis: {(vendorsQ.error as any)?.message ?? ""}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
