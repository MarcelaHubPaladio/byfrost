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
import { Textarea } from "@/components/ui/textarea";

export type CoreEntityType = "party" | "offering";

export type EntityUpsertInput = {
  id?: string;
  tenant_id: string;
  entity_type: CoreEntityType;
  subtype: string | null;
  display_name: string;
  status: string | null;
  metadata: any;
};

type JsonParseOk = { ok: true; value: any };
type JsonParseErr = { ok: false; error: string };

function safeJsonParse(s: string): JsonParseOk | JsonParseErr {
  const trimmed = s.trim();
  if (!trimmed) return { ok: true as const, value: {} };
  try {
    return { ok: true as const, value: JSON.parse(trimmed) };
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? "JSON inválido" };
  }
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

  const [entityType, setEntityType] = useState<CoreEntityType>("party");
  const [subtype, setSubtype] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [metadataText, setMetadataText] = useState<string>("{}");

  useEffect(() => {
    if (!open) return;
    setEntityType((initial?.entity_type as CoreEntityType) ?? "party");
    setSubtype(String(initial?.subtype ?? ""));
    setDisplayName(String(initial?.display_name ?? ""));
    setStatus(String(initial?.status ?? ""));
    setMetadataText(JSON.stringify(initial?.metadata ?? {}, null, 2));
  }, [open, initial?.id]);

  const jsonCheck = useMemo(() => safeJsonParse(metadataText), [metadataText]);

  const canSave =
    Boolean(tenantId) &&
    displayName.trim().length >= 2 &&
    entityType &&
    jsonCheck.ok &&
    !saving;

  const title = isEdit ? "Editar entidade" : "Nova entidade";

  const save = async () => {
    if (!canSave) return;

    const parsed = safeJsonParse(metadataText);
    if (!parsed.ok) {
      showError(`metadata: ${"error" in parsed ? parsed.error : "JSON inválido"}`);
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase
          .from("core_entities")
          .update({
            entity_type: entityType,
            subtype: subtype.trim() ? subtype.trim() : null,
            display_name: displayName.trim(),
            status: status.trim() ? status.trim() : null,
            metadata: parsed.value ?? {},
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
            subtype: subtype.trim() ? subtype.trim() : null,
            display_name: displayName.trim(),
            status: status.trim() ? status.trim() : null,
            metadata: parsed.value ?? {},
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Campos básicos do Core. O campo <span className="font-semibold">metadata</span> aceita JSON.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={entityType} onValueChange={(v) => setEntityType(v as CoreEntityType)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="party">party (cliente/fornecedor/pessoa)</SelectItem>
                  <SelectItem value="offering">offering (produto/serviço)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Subtipo (opcional)</Label>
              <Input
                value={subtype}
                onChange={(e) => setSubtype(e.target.value)}
                placeholder="ex: customer, supplier, service…"
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nome da entidade"
                className="rounded-xl"
              />
              <div className="text-[11px] text-slate-500">Mínimo: 2 caracteres.</div>
            </div>

            <div className="grid gap-2">
              <Label>Status (opcional)</Label>
              <Input
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="ex: active, prospect, blocked…"
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>metadata (JSON)</Label>
              {!jsonCheck.ok ? (
                <div className="text-xs font-semibold text-red-600">{"error" in jsonCheck ? jsonCheck.error : "JSON inválido"}</div>
              ) : (
                <div className="text-xs text-slate-500">ok</div>
              )}

            </div>
            <Textarea
              value={metadataText}
              onChange={(e) => setMetadataText(e.target.value)}
              className="min-h-[160px] rounded-xl font-mono text-xs"
            />
          </div>
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
