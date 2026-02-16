import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CoreEntityType = "party" | "offering";

type PartySubtype = "cliente" | "fornecedor" | "indicador" | "banco";
type OfferingSubtype = "servico" | "produto";
export type UiSubtype = PartySubtype | OfferingSubtype;

export type EntityUpsertInput = {
  id?: string;
  tenant_id: string;
  entity_type: CoreEntityType;
  subtype: string | null;
  display_name: string;
  status: string | null;
  metadata: any;
};

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

function isValidEmail(s: string) {
  const v = String(s ?? "").trim();
  if (!v) return false;
  // Simple (good-enough) email validation.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function subtypeToEntityType(subtype: UiSubtype): CoreEntityType {
  return subtype === "servico" || subtype === "produto" ? "offering" : "party";
}

async function lookupCnpj(cnpjDigits: string) {
  const cnpj = onlyDigits(cnpjDigits);
  if (cnpj.length !== 14) throw new Error("CNPJ inválido (use 14 dígitos)");

  const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!resp.ok) {
    throw new Error("CNPJ não encontrado na BrasilAPI");
  }
  const json = await resp.json();

  const name =
    (json?.razao_social as string | undefined) ??
    (json?.nome_fantasia as string | undefined) ??
    null;

  return {
    displayName: name?.trim() ? name.trim() : null,
    raw: json,
  };
}

export function EntityUpsertDialog({
  open,
  onOpenChange,
  tenantId,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  initial?: Partial<EntityUpsertInput> | null;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const isEdit = Boolean(initial?.id);

  const [saving, setSaving] = useState(false);
  const [fetchingDoc, setFetchingDoc] = useState(false);

  const lockedEntityType = (initial?.entity_type as CoreEntityType | undefined) ?? null;

  const [subtype, setSubtype] = useState<UiSubtype>("cliente");
  const [displayName, setDisplayName] = useState<string>("");
  const [doc, setDoc] = useState<string>("");
  const [whatsapp, setWhatsapp] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    if (!open) return;

    // subtype
    const initialSubtype = String(initial?.subtype ?? "").toLowerCase().trim();
    const subtypeFromInitial = (
      ["cliente", "fornecedor", "indicador", "banco", "servico", "produto"].includes(initialSubtype)
        ? (initialSubtype as UiSubtype)
        : null
    );

    const defaultSubtype: UiSubtype = lockedEntityType === "offering" ? "servico" : "cliente";
    setSubtype(subtypeFromInitial ?? defaultSubtype);

    setDisplayName(String(initial?.display_name ?? ""));

    const md = (initial?.metadata ?? {}) as any;
    setDoc(String(md?.cpf_cnpj ?? md?.cpfCnpj ?? md?.document ?? ""));
    setWhatsapp(String(md?.whatsapp ?? md?.phone ?? md?.phone_e164 ?? ""));
    setEmail(String(md?.email ?? ""));
  }, [open, initial?.id]);

  const entityType: CoreEntityType = useMemo(() => {
    if (lockedEntityType) return lockedEntityType;
    return subtypeToEntityType(subtype);
  }, [lockedEntityType, subtype]);

  const docDigits = useMemo(() => onlyDigits(doc), [doc]);
  const whatsappDigits = useMemo(() => onlyDigits(whatsapp), [whatsapp]);

  const requiresDocAndContacts = entityType === "party";

  const canLookupCnpj = entityType === "party" && docDigits.length === 14 && !fetchingDoc;

  const emailOk = email.trim().length > 0 ? isValidEmail(email) : true;

  const canSave =
    Boolean(tenantId) &&
    displayName.trim().length >= 2 &&
    // Party: require doc + whatsapp + email
    (!requiresDocAndContacts || (docDigits.length >= 11 && whatsappDigits.length >= 10 && Boolean(email.trim()))) &&
    emailOk &&
    !saving;

  const title = isEdit ? "Editar entidade" : "Nova entidade";

  const doLookup = async () => {
    if (!canLookupCnpj) return;
    setFetchingDoc(true);
    try {
      const res = await lookupCnpj(docDigits);
      if (res.displayName) {
        setDisplayName(res.displayName);
        showSuccess("Nome preenchido a partir do CNPJ.");
      } else {
        showError("Não consegui obter o nome a partir do CNPJ.");
      }
    } catch (e: any) {
      showError(e?.message ?? "Erro ao buscar CNPJ");
    } finally {
      setFetchingDoc(false);
    }
  };

  const save = async () => {
    if (!canSave) return;

    setSaving(true);
    try {
      const baseMetadata = (initial?.metadata ?? {}) as any;
      const nextMetadata = {
        ...baseMetadata,
        cpf_cnpj: requiresDocAndContacts ? docDigits : baseMetadata?.cpf_cnpj,
        whatsapp: requiresDocAndContacts ? whatsappDigits : baseMetadata?.whatsapp,
        email: requiresDocAndContacts ? email.trim() : baseMetadata?.email,
      };

      if (isEdit) {
        const { error } = await supabase
          .from("core_entities")
          .update({
            // NOTE: avoid changing entity_type in edit (can break downstream constraints).
            subtype: subtype,
            display_name: displayName.trim(),
            status: (initial?.status as string | null | undefined) ?? "active",
            metadata: nextMetadata,
          })
          .eq("tenant_id", tenantId)
          .eq("id", String(initial?.id))
          .is("deleted_at", null);
        if (error) throw error;

        showSuccess("Entidade atualizada.");
        await qc.invalidateQueries({ queryKey: ["entities"] });
        await qc.invalidateQueries({ queryKey: ["entity"] });
        onSaved?.(String(initial?.id));
        onOpenChange(false);
      } else {
        const { data, error } = await supabase
          .from("core_entities")
          .insert({
            tenant_id: tenantId,
            entity_type: entityType,
            subtype: subtype,
            display_name: displayName.trim(),
            status: "active",
            metadata: nextMetadata,
          })
          .select("id")
          .single();
        if (error) throw error;

        const newId = String((data as any)?.id ?? "");
        showSuccess("Entidade criada.");
        await qc.invalidateQueries({ queryKey: ["entities"] });
        onSaved?.(newId);
        onOpenChange(false);
      }
    } catch (e: any) {
      showError(e?.message ?? "Erro ao salvar entidade");
    } finally {
      setSaving(false);
    }
  };

  const subtypeOptions: Array<{ value: UiSubtype; label: string; type: CoreEntityType }> = [
    { value: "cliente", label: "Cliente", type: "party" },
    { value: "fornecedor", label: "Fornecedor", type: "party" },
    { value: "indicador", label: "Indicador", type: "party" },
    { value: "banco", label: "Banco", type: "party" },
    { value: "servico", label: "Serviço", type: "offering" },
    { value: "produto", label: "Produto", type: "offering" },
  ];

  const visibleSubtypes = lockedEntityType
    ? subtypeOptions.filter((o) => o.type === lockedEntityType)
    : subtypeOptions;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Cadastre os dados básicos. <span className="font-semibold">Status</span> inicia como <span className="font-semibold">ativo</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Subtipo</Label>
            <Select value={subtype} onValueChange={(v) => setSubtype(v as UiSubtype)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {visibleSubtypes.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!lockedEntityType ? (
              <div className="text-[11px] text-slate-500">Serviço/Produto criam uma entidade do tipo offering; demais criam party.</div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nome da entidade"
              className="rounded-xl"
            />
          </div>

          {entityType === "party" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>CPF ou CNPJ</Label>
                <Input
                  value={doc}
                  onChange={(e) => setDoc(e.target.value)}
                  placeholder="Somente números"
                  className="rounded-xl"
                />
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">CPF (11) • CNPJ (14)</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-xl"
                    onClick={doLookup}
                    disabled={!canLookupCnpj}
                    title={canLookupCnpj ? "Buscar nome pelo CNPJ" : "Informe um CNPJ com 14 dígitos"}
                  >
                    {fetchingDoc ? "Buscando…" : "Buscar CNPJ"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>WhatsApp</Label>
                <Input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="ex: 11999998888"
                  className="rounded-xl"
                />
                <div className="text-[11px] text-slate-500">Somente números (DDD + número).</div>
              </div>
            </div>
          ) : null}

          {entityType === "party" ? (
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="rounded-xl"
              />
              {!emailOk ? <div className="text-[11px] font-semibold text-red-600">E-mail inválido.</div> : null}
            </div>
          ) : null}

          {entityType === "offering" ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              Para <span className="font-semibold">Serviço/Produto</span>, esta primeira versão não exige CPF/CNPJ/contato.
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button className="rounded-xl" onClick={save} disabled={!canSave}>
            {saving ? "Salvando…" : isEdit ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}