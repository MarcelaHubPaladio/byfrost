import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { showError, showSuccess } from "@/utils/toast";
import {
  FileText,
  Plus,
  Copy,
  Trash2,
  Search,
  ChevronRight,
  Loader2,
  X
} from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/core/ConfirmDeleteDialog";

export type ContractTemplate = {
  id: string;
  name: string;
  body: string;
  updated_at: string;
};

function randomId() {
  return `ct_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

const DEFAULT_BODY = `CONTRATO / PROPOSTA\n\nTenant: {{tenant_name}}\nCliente: {{party_name}}\nPortal do cliente: {{portal_link}}\n\nCliente (documento): {{party_document}}\nCliente (whatsapp): {{party_whatsapp}}\nCliente (email): {{party_email}}\nCliente (endereço): {{party_address_full}}\n\nPrazo: {{contract_term}}\nValor total: {{contract_total_value}}\nForma de pagamento: {{payment_method}}\nVencimento das parcelas: {{installments_due_date}}\n\nESCOPO (deliverables)\n{{scope_lines}}\n\nObservações\n{{scope_notes}}\n\nGerado em: {{generated_at}}\n`;

export default function ContractTemplates() {
  const qc = useQueryClient();
  const { activeTenantId, isSuperAdmin } = useTenant();

  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const tenantQ = useQuery({
    queryKey: ["tenant_contract_templates", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id,branding_json")
        .eq("id", activeTenantId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Tenant não encontrado");
      return data as any;
    },
    staleTime: 3_000,
  });

  const templates = useMemo(() => {
    const bj = tenantQ.data?.branding_json ?? {};
    const list = ensureArray(bj.contract_templates).filter(Boolean) as ContractTemplate[];
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(t => t.name.toLowerCase().includes(s));
  }, [tenantQ.data, search]);

  // Fix: only auto-select if we don't have an activeId and aren't explicitly creating/duplicating
  useEffect(() => {
    if (activeId || isCreating) return;
    const bj = tenantQ.data?.branding_json ?? {};
    const list = ensureArray(bj.contract_templates).filter(Boolean) as ContractTemplate[];
    const first = list[0]?.id ?? null;
    if (first) setActiveId(String(first));
  }, [activeId, isCreating, tenantQ.data]);

  const activeTemplate = useMemo(() => {
    if (!activeId || isCreating) return null;
    const bj = tenantQ.data?.branding_json ?? {};
    const list = ensureArray(bj.contract_templates).filter(Boolean) as ContractTemplate[];
    return list.find((t) => String(t.id) === String(activeId)) ?? null;
  }, [activeId, isCreating, tenantQ.data]);

  const [draftName, setDraftName] = useState("Modelo padrão");
  const [draftBody, setDraftBody] = useState(DEFAULT_BODY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isCreating) {
      // Don't overwrite if we just set it in handleCreate
      return;
    }
    if (!activeTemplate) {
      setDraftName("Modelo padrão");
      setDraftBody(DEFAULT_BODY);
      return;
    }
    setDraftName(activeTemplate.name);
    setDraftBody(activeTemplate.body);
  }, [activeTemplate?.id, isCreating]);

  const handleCreate = () => {
    setIsCreating(true);
    setActiveId(null);
    setDraftName("Novo modelo");
    setDraftBody(DEFAULT_BODY);
  };

  const handleDuplicate = () => {
    if (!activeTemplate) return;
    setIsCreating(true);
    setActiveId(null);
    setDraftName(`${activeTemplate.name} (cópia)`);
    setDraftBody(activeTemplate.body);
  };

  const handleCancel = () => {
    setIsCreating(false);
    const bj = tenantQ.data?.branding_json ?? {};
    const list = ensureArray(bj.contract_templates).filter(Boolean) as ContractTemplate[];
    setActiveId(list[0]?.id ?? null);
  };

  const save = async () => {
    if (!activeTenantId) return;
    if (!isSuperAdmin) {
      showError("Sem permissão para salvar no tenant (RLS). Ative Super-admin (RLS) em Configurações.");
      return;
    }
    if (!draftName.trim()) {
      showError("Informe um nome.");
      return;
    }
    if (!draftBody.trim()) {
      showError("O conteúdo do template não pode ficar vazio.");
      return;
    }

    setSaving(true);
    try {
      const { data: freshTenant, error: freshErr } = await supabase
        .from("tenants")
        .select("branding_json")
        .eq("id", activeTenantId)
        .maybeSingle();
      if (freshErr) throw freshErr;

      const freshestBj = (freshTenant as any)?.branding_json ?? {};
      const freshestTemplates = ensureArray(freshestBj.contract_templates).filter(Boolean) as ContractTemplate[];

      const nextTemplates = [...freshestTemplates];

      const idx = activeTemplate
        ? nextTemplates.findIndex((t) => String(t.id) === String(activeTemplate.id))
        : -1;

      const nextRow: ContractTemplate = {
        id: activeTemplate?.id ?? randomId(),
        name: draftName.trim(),
        body: draftBody,
        updated_at: nowIso(),
      };

      if (idx >= 0) nextTemplates[idx] = nextRow;
      else nextTemplates.unshift(nextRow);

      const nextBj = { ...freshestBj, contract_templates: nextTemplates };
      const { error } = await supabase.from("tenants").update({ branding_json: nextBj }).eq("id", activeTenantId);
      if (error) throw error;

      showSuccess("Template salvo.");
      setIsCreating(false);
      setActiveId(nextRow.id);
      await qc.invalidateQueries({ queryKey: ["tenant_contract_templates", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["tenant_settings", activeTenantId] });
    } catch (e: any) {
      showError(e?.message ?? "Erro ao salvar template");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!activeTenantId || !activeTemplate) return;
    if (!isSuperAdmin) {
      showError("Sem permissão para remover no tenant (RLS). Ative Super-admin (RLS) em Configurações.");
      return;
    }

    setSaving(true);
    try {
      const { data: freshTenant, error: freshErr } = await supabase
        .from("tenants")
        .select("branding_json")
        .eq("id", activeTenantId)
        .maybeSingle();
      if (freshErr) throw freshErr;

      const currentBj = (freshTenant as any)?.branding_json ?? {};
      const currentTemplates = ensureArray(currentBj.contract_templates).filter(Boolean) as ContractTemplate[];

      const nextTemplates = currentTemplates.filter((t) => String(t.id) !== String(activeTemplate.id));
      const nextBj = { ...currentBj, contract_templates: nextTemplates };
      const { error } = await supabase.from("tenants").update({ branding_json: nextBj }).eq("id", activeTenantId);
      if (error) throw error;

      showSuccess("Template removido.");
      setActiveId(nextTemplates[0]?.id ?? null);
      await qc.invalidateQueries({ queryKey: ["tenant_contract_templates", activeTenantId] });
    } catch (e: any) {
      showError(e?.message ?? "Erro ao remover template");
    } finally {
      setSaving(false);
      setDeleteOpen(false);
    }
  };

  const insertVariable = (v: string) => {
    const txt = `{{${v}}}`;
    setDraftBody((b) => {
      if (!b.endsWith("\n") && b.length) return `${b}\n${txt}\n`;
      return `${b}${txt}\n`;
    });
  };

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.settings">
        <AppShell>
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xl font-bold text-slate-900">Templates de contrato</div>
                <div className="mt-1 text-sm text-slate-600">
                  Modelos usados para gerar PDF e prévia de propostas.
                </div>
              </div>
              <Button onClick={handleCreate} className="rounded-xl shadow-sm transition-all hover:shadow-md">
                <Plus className="mr-2 h-4 w-4" />
                Novo template
              </Button>
            </div>

            {!isSuperAdmin ? (
              <Card className="rounded-2xl border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Você está em modo somente leitura. Para salvar templates, ative Super-admin (RLS) em Configurações.
              </Card>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[300px,1fr]">
              <Card className="flex flex-col overflow-hidden rounded-2xl border-slate-200 bg-white/50 backdrop-blur-sm">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Meus Modelos</div>
                    <Badge variant="secondary" className="rounded-lg">{templates.length}</Badge>
                  </div>
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Buscar modelos..."
                      className="rounded-xl pl-9"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-4">
                  <div className="grid gap-1">
                    {tenantQ.isLoading ? (
                      <div className="flex justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                      </div>
                    ) : templates.length === 0 ? (
                      <div className="px-3 py-8 text-center text-sm text-slate-500">
                        {search ? "Nenhum resultado para a busca." : "Nenhum template cadastrado."}
                      </div>
                    ) : (
                      templates.map((t) => {
                        const isActive = String(t.id) === String(activeId);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setActiveId(String(t.id));
                              setIsCreating(false);
                            }}
                            className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${isActive
                                ? "bg-slate-900 text-white shadow-lg shadow-slate-200"
                                : "text-slate-700 hover:bg-slate-100"
                              }`}
                          >
                            <FileText className={`h-4 w-4 shrink-0 ${isActive ? "text-slate-300" : "text-slate-400"}`} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold">{t.name}</div>
                              <div className={`mt-0.5 text-[10px] ${isActive ? "text-slate-400" : "text-slate-500"}`}>
                                {new Date(t.updated_at).toLocaleString("pt-BR", { dateStyle: 'short', timeStyle: 'short' })}
                              </div>
                            </div>
                            <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isActive ? "opacity-100" : "opacity-0 group-hover:translate-x-1 group-hover:opacity-100"}`} />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </Card>

              <Card className="rounded-2xl border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-lg font-bold text-slate-900">
                      {isCreating ? "Novo Template" : activeTemplate?.name ?? "Editor"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Use variáveis dinâmicas para personalizar o contrato.</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isCreating && (
                      <Button variant="ghost" onClick={handleCancel} className="rounded-xl">
                        Cancelar
                      </Button>
                    )}
                    {!isCreating && activeTemplate && (
                      <Button variant="outline" onClick={handleDuplicate} className="rounded-xl border-slate-200">
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicar
                      </Button>
                    )}
                    <Button onClick={save} disabled={saving || tenantQ.isLoading} className="min-w-[100px] rounded-xl">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                    </Button>
                    {!isCreating && activeTemplate && (
                      <Button
                        variant="ghost"
                        onClick={() => setDeleteOpen(true)}
                        className="rounded-xl text-red-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid gap-6">
                  <div className="grid gap-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Nome do Modelo</Label>
                    <Input
                      placeholder="Ex: Contrato de Prestação de Serviços"
                      className="h-12 rounded-xl border-slate-200 bg-slate-50/50 text-base font-semibold focus:bg-white"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Conteúdo do Documento</Label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="cursor-help border-slate-100 bg-slate-50 px-2 py-1 text-[10px] text-slate-500">
                          Variáveis:
                        </Badge>
                        {[
                          "tenant_name", "party_name", "portal_link", "party_document",
                          "party_whatsapp", "party_email", "party_address_full"
                        ].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => insertVariable(v)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 transition-colors hover:border-slate-900 hover:bg-slate-900 hover:text-white"
                          >
                            +{v}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Textarea
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      rows={20}
                      className="min-h-[400px] resize-y rounded-2xl border-slate-200 bg-slate-50/30 p-4 font-mono text-sm leading-relaxed focus:bg-white"
                      placeholder="Escreva o conteúdo do contrato aqui..."
                    />

                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-600">i</div>
                      <span>
                        Dica: Use <strong># Título</strong> para cabeçalhos. O sistema substituirá as chaves <strong>{"{{...}}"}</strong> automaticamente na geração.
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <ConfirmDeleteDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Remover este modelo?"
            description={`O modelo "${activeTemplate?.name}" será removido permanentemente.`}
            confirmLabel={saving ? "Removendo..." : "Sim, remover"}
            onConfirm={remove}
            disabled={saving}
          />
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}