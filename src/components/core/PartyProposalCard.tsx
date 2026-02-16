import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";

function randomToken() {
  // simple + url-safe
  const a = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function PartyProposalCard({
  tenantId,
  partyId,
  tenantSlug,
}: {
  tenantId: string;
  partyId: string;
  tenantSlug: string;
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const proposalsQ = useQuery({
    queryKey: ["party_proposals", tenantId, partyId],
    enabled: Boolean(tenantId && partyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("party_proposals")
        .select("id,token,status,approved_at,selected_commitment_ids,created_at")
        .eq("tenant_id", tenantId)
        .eq("party_entity_id", partyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 3_000,
  });

  const proposal = (proposalsQ.data ?? [])[0] ?? null;

  const commitmentsQ = useQuery({
    queryKey: ["party_commitments", tenantId, partyId],
    enabled: Boolean(tenantId && partyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select("id,commitment_type,status,created_at")
        .eq("tenant_id", tenantId)
        .eq("customer_entity_id", partyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 5_000,
  });

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // hydrate selection from existing proposal
  useMemo(() => {
    if (!proposal?.selected_commitment_ids) return;
    const map: Record<string, boolean> = {};
    for (const id of proposal.selected_commitment_ids as string[]) map[String(id)] = true;
    setSelected((prev) => ({ ...map, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal?.id]);

  const selectedIds = useMemo(() => {
    return Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
  }, [selected]);

  const proposalUrl = useMemo(() => {
    if (!proposal?.token) return null;
    return `${window.location.origin}/p/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(proposal.token)}`;
  }, [proposal?.token, tenantSlug]);

  const saveProposal = async () => {
    if (!tenantId || !partyId) return;

    setSaving(true);
    try {
      if (proposal) {
        const { error } = await supabase
          .from("party_proposals")
          .update({ selected_commitment_ids: selectedIds })
          .eq("tenant_id", tenantId)
          .eq("id", proposal.id)
          .is("deleted_at", null);
        if (error) throw error;
        showSuccess("Proposta atualizada.");
      } else {
        const { error } = await supabase.from("party_proposals").insert({
          tenant_id: tenantId,
          party_entity_id: partyId,
          token: randomToken(),
          selected_commitment_ids: selectedIds,
          status: "draft",
        });
        if (error) throw error;
        showSuccess("Proposta criada.");
      }

      await qc.invalidateQueries({ queryKey: ["party_proposals", tenantId, partyId] });
    } catch (e: any) {
      showError(e?.message ?? "Erro ao salvar proposta");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!proposalUrl) return;
    try {
      await navigator.clipboard.writeText(proposalUrl);
      showSuccess("Link copiado.");
    } catch {
      showError("Não consegui copiar.");
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Proposta pública</div>
          <div className="mt-1 text-xs text-slate-600">
            Selecione compromissos para compor o escopo. Um link público permitirá aprovar e assinar.
          </div>
        </div>
        <Badge variant="secondary">{proposal?.status ?? "sem proposta"}</Badge>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-2xl border bg-white p-3">
          <div className="text-xs font-semibold text-slate-700">Compromissos do cliente</div>
          <div className="mt-2 grid gap-2">
            {(commitmentsQ.data ?? []).length === 0 ? (
              <div className="text-sm text-slate-600">Nenhum compromisso encontrado para este cliente.</div>
            ) : (
              (commitmentsQ.data ?? []).map((c: any) => (
                <label key={c.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={Boolean(selected[c.id])}
                      onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [c.id]: Boolean(v) }))}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {String(c.commitment_type)} • {String(c.id).slice(0, 8)}
                      </div>
                      <div className="text-xs text-slate-600">status: {c.status ?? "—"}</div>
                    </div>
                  </div>
                  <Badge variant="outline">{new Date(c.created_at).toLocaleDateString("pt-BR")}</Badge>
                </label>
              ))
            )}
          </div>

          <div className="mt-3 flex justify-end">
            <Button className="rounded-xl" onClick={saveProposal} disabled={saving}>
              {saving ? "Salvando…" : proposal ? "Atualizar proposta" : "Criar proposta"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-3">
          <Label className="text-xs">Link público</Label>
          <Input value={proposalUrl ?? "Crie a proposta para gerar o link"} readOnly className="mt-1 rounded-xl" />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={copy} disabled={!proposalUrl}>
              Copiar link
            </Button>
            <Button className="rounded-xl" onClick={() => proposalUrl && window.open(proposalUrl, "_blank")} disabled={!proposalUrl}>
              Abrir
            </Button>
          </div>
          {proposal?.approved_at ? (
            <div className="mt-2 text-xs text-slate-600">Aprovado em: {new Date(proposal.approved_at).toLocaleString("pt-BR")}</div>
          ) : (
            <div className="mt-2 text-xs text-slate-600">Ainda não aprovado.</div>
          )}
        </div>
      </div>
    </Card>
  );
}
