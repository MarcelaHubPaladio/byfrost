import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase, SUPABASE_URL_IN_USE } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ParticipantsMultiSelect } from "@/components/admin/ParticipantsMultiSelect";
import { showError, showSuccess } from "@/utils/toast";
import { CalendarClock, Pencil, Trash2 } from "lucide-react";

const BUCKET = "tenant-assets";
const UPLOAD_URL =
  `${SUPABASE_URL_IN_USE}/functions/v1/upload-tenant-asset`;

type ParticipantRow = {
  id: string;
  tenant_id: string;
  name: string;
  display_name: string | null;
};

type CampaignRow = {
  id: string;
  tenant_id: string;
  name: string;
  status: "draft" | "active" | "finished";
  visibility: "public" | "private";
};

type EventRow = {
  id: string;
  tenant_id: string;
  campaign_id: string;
  participant_id: string;
  event_type: "sale" | "indication" | "points" | "bonus";
  value: number | null;
  points: number | null;
  order_number: string | null;
  commission_rate: number | null;
  commission_value: number | null;
  source_entity_id: string | null;
  related_entity_id: string | null;
  attachment_url: string | null;
  created_at: string;
};

type EntityRow = {
  id: string;
  display_name: string;
  subtype: string | null;
};


async function uploadTenantAsset(params: {
  tenantId: string;
  kind: "events";
  file: File;
}) {
  const fd = new FormData();
  fd.append("tenantId", params.tenantId);
  fd.append("kind", params.kind);
  fd.append("file", params.file);

  const { data: json, error: upError } = await supabase.functions.invoke("upload-tenant-asset", {
    body: fd,
  });

  if (upError || !json?.ok) {
    throw new Error(upError?.message || json?.error || "Erro no upload");
  }

  return {
    bucket: String(json.bucket ?? BUCKET),
    path: String(json.path ?? ""),
    signedUrl: (json.signedUrl as string | null | undefined) ?? null,
  };
}

export default function IncentivesEventsManage() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();

  // create
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [eventType, setEventType] = useState<EventRow["event_type"]>("sale");
  const [value, setValue] = useState<string>("");
  const [points, setPoints] = useState<string>("");
  const [orderNumber, setOrderNumber] = useState("");
  const [commissionRate, setCommissionRate] = useState("");
  const [sourceEntityId, setSourceEntityId] = useState<string | null>(null);
  const [relatedEntityId, setRelatedEntityId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const eventFileRef = useRef<HTMLInputElement | null>(null);

  // quick participant create
  const [showQuickParticipant, setShowQuickParticipant] = useState(false);
  const [qName, setQName] = useState("");
  const [qCpf, setQCpf] = useState("");
  const [qWhatsapp, setQWhatsapp] = useState("");
  const [creatingP, setCreatingP] = useState(false);

  // edit
  const [editOpen, setEditOpen] = useState(false);
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editType, setEditType] = useState<EventRow["event_type"]>("points");
  const [editValue, setEditValue] = useState<string>("");
  const [editPoints, setEditPoints] = useState<string>("");
  const [editOrderNumber, setEditOrderNumber] = useState("");
  const [editCommissionRate, setEditCommissionRate] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const participantsQ = useQuery({
    queryKey: ["incentives_manage_participants", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incentive_participants")
        .select("id,tenant_id,name,display_name")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as ParticipantRow[];
    },
  });

  const campaignsQ = useQuery({
    queryKey: ["incentives_manage_campaigns", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id,tenant_id,name,status,visibility")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });

  const eventsQ = useQuery({
    queryKey: ["incentives_manage_events", activeTenantId, campaignId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("incentive_events")
        .select("id,tenant_id,campaign_id,participant_id,event_type,value,points,order_number,commission_rate,commission_value,source_entity_id,related_entity_id,attachment_url,created_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (campaignId) q = q.eq("campaign_id", campaignId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const entitiesQ = useQuery({
    queryKey: ["incentives_manage_entities", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name, subtype")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .in("subtype", ["fornecedor", "pintor"]);
      if (error) throw error;
      return (data ?? []) as EntityRow[];
    },
  });

  const suppliers = useMemo(() => (entitiesQ.data ?? []).filter(e => e.subtype === "fornecedor"), [entitiesQ.data]);
  const painters = useMemo(() => (entitiesQ.data ?? []).filter(e => e.subtype === "pintor"), [entitiesQ.data]);

  const participantsById = useMemo(() => {
    const m = new Map<string, ParticipantRow>();
    for (const p of participantsQ.data ?? []) m.set(p.id, p);
    return m;
  }, [participantsQ.data]);

  const campaignsById = useMemo(() => {
    const m = new Map<string, CampaignRow>();
    for (const c of campaignsQ.data ?? []) m.set(c.id, c);
    return m;
  }, [campaignsQ.data]);

  const openEdit = (e: EventRow) => {
    setEditEventId(e.id);
    setEditType(e.event_type);
    setEditValue(e.value == null ? "" : String(e.value));
    setEditPoints(e.points == null ? "" : String(e.points));
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!activeTenantId || !editEventId) return;
    setSavingEdit(true);
    try {
      const valueNum = editValue.trim() ? Number(editValue.replace(",", ".")) : null;
      const pointsNum = editPoints.trim() ? Number(editPoints.replace(",", ".")) : null;
      const commRateNum = editCommissionRate.trim() ? Number(editCommissionRate.replace(",", ".")) : null;
      const commValue = (valueNum && commRateNum) ? (valueNum * commRateNum) / 100 : null;

      const { error } = await supabase
        .from("incentive_events")
        .update({
          event_type: editType,
          value: Number.isFinite(valueNum as any) ? valueNum : null,
          points: Number.isFinite(pointsNum as any) ? pointsNum : null,
          order_number: editOrderNumber || null,
          commission_rate: Number.isFinite(commRateNum as any) ? commRateNum : null,
          commission_value: Number.isFinite(commValue as any) ? commValue : null,
        })
        .eq("tenant_id", activeTenantId)
        .eq("id", editEventId);

      if (error) throw error;
      showSuccess("Evento atualizado.");
      setEditOpen(false);
      await qc.invalidateQueries({ queryKey: ["incentives_manage_events", activeTenantId, campaignId] });
    } catch (e: any) {
      showError(`Falha ao editar evento: ${e?.message ?? "erro"}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteEvent = async (id: string) => {
    if (!activeTenantId) return;
    try {
      const { error } = await supabase
        .from("incentive_events")
        .delete()
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;
      showSuccess("Evento removido.");
      await qc.invalidateQueries({ queryKey: ["incentives_manage_events", activeTenantId, campaignId] });
    } catch (e: any) {
      showError(`Falha ao remover evento: ${e?.message ?? "erro"}`);
    }
  };

  const createEvents = async () => {
    if (!activeTenantId) return;
    if (!campaignId || participantIds.length === 0) {
      showError("Selecione campanha e pelo menos 1 participante.");
      return;
    }

    setCreating(true);
    try {
      const file = eventFileRef.current?.files?.[0] ?? null;
      let attachmentPath: string | null = null;

      if (file) {
        const up = await uploadTenantAsset({ tenantId: activeTenantId, kind: "events", file });
        attachmentPath = up.path || null;
      }

      const valueNum = value.trim() ? Number(value.replace(",", ".")) : null;
      const pointsNum = points.trim() ? Number(points.replace(",", ".")) : null;
      const commRateNum = commissionRate.trim() ? Number(commissionRate.replace(",", ".")) : null;
      const commValue = (valueNum && commRateNum) ? (valueNum * commRateNum) / 100 : null;

      const rows = participantIds.map((pid) => ({
        tenant_id: activeTenantId,
        campaign_id: campaignId,
        participant_id: pid,
        event_type: eventType,
        value: Number.isFinite(valueNum as any) ? valueNum : null,
        points: Number.isFinite(pointsNum as any) ? pointsNum : null,
        order_number: orderNumber || null,
        commission_rate: Number.isFinite(commRateNum as any) ? commRateNum : null,
        commission_value: Number.isFinite(commValue as any) ? commValue : null,
        source_entity_id: sourceEntityId,
        related_entity_id: relatedEntityId,
        attachment_url: attachmentPath,
      }));

      const { error } = await supabase.from("incentive_events").insert(rows);
      if (error) throw error;

      setValue("");
      setPoints("");
      setOrderNumber("");
      setCommissionRate("");
      setParticipantIds([]);
      setSourceEntityId(null);
      setRelatedEntityId(null);
      if (eventFileRef.current) eventFileRef.current.value = "";

      showSuccess(`Evento lançado para ${rows.length} participante(s).`);
      await qc.invalidateQueries({ queryKey: ["incentives_manage_events", activeTenantId, campaignId] });
    } catch (e: any) {
      showError(`Falha ao lançar evento: ${e?.message ?? "erro"}`);
    } finally {
      setCreating(false);
    }
  };

  const createQuickParticipant = async () => {
    if (!activeTenantId || !qName.trim() || !qCpf.trim()) {
      showError("Nome e CPF são obrigatórios.");
      return;
    }
    setCreatingP(true);
    try {
      const { error } = await supabase.from("incentive_participants").insert({
        tenant_id: activeTenantId,
        name: qName.trim(),
        cpf: qCpf.trim(),
        whatsapp: qWhatsapp.trim(),
      });
      if (error) throw error;
      showSuccess("Vendedor cadastrado com sucesso.");
      setQName(""); setQCpf(""); setQWhatsapp("");
      setShowQuickParticipant(false);
      await qc.invalidateQueries({ queryKey: ["incentives_manage_participants", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao cadastrar: ${e?.message ?? "erro"}`);
    } finally {
      setCreatingP(false);
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="grid gap-4">
          <Card className="rounded-[22px] border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <CalendarClock className="h-4 w-4" />
                  Incentivos • Gestão de eventos
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Crie eventos (um por participante selecionado) e edite/remova eventos recentes.
                </div>
              </div>
              <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => eventsQ.refetch()}>
                Atualizar
              </Button>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Lançar evento</div>
              <div className="mt-4 grid gap-3">
                <div>
                  <Label className="text-xs">Campanha</Label>
                  <Select value={campaignId ?? ""} onValueChange={(v) => setCampaignId(v)}>
                    <SelectTrigger className="mt-1 h-11 rounded-2xl">
                      <SelectValue placeholder="Selecione uma campanha" />
                    </SelectTrigger>
                    <SelectContent>
                      {(campaignsQ.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Participante (Vendedor)</Label>
                    <div className="mt-1">
                      <ParticipantsMultiSelect
                        options={(participantsQ.data ?? []).map((p) => ({
                          value: p.id,
                          label: p.display_name ?? p.name,
                        }))}
                        value={participantIds}
                        onChange={setParticipantIds}
                        placeholder="Selecione 1 ou mais participantes"
                        disabled={creating}
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="mt-6 h-11 rounded-2xl border-dashed"
                    onClick={() => setShowQuickParticipant(true)}
                  >
                    + Novo
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Fornecedor (Opcional)</Label>
                    <Select value={sourceEntityId ?? "none"} onValueChange={(v) => setSourceEntityId(v === "none" ? null : v)}>
                      <SelectTrigger className="mt-1 h-11 rounded-2xl">
                        <SelectValue placeholder="Selecione o fornecedor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.display_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Pintor (Opcional)</Label>
                    <Select value={relatedEntityId ?? "none"} onValueChange={(v) => setRelatedEntityId(v === "none" ? null : v)}>
                      <SelectTrigger className="mt-1 h-11 rounded-2xl">
                        <SelectValue placeholder="Selecione o pintor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {painters.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Tipo de Lançamento</Label>
                    <Select value={eventType} onValueChange={(v) => setEventType(v as any)}>
                      <SelectTrigger className="mt-1 h-11 rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sale">Venda</SelectItem>
                        <SelectItem value="indication">Indicação</SelectItem>
                        <SelectItem value="points">Pontos Avulsos</SelectItem>
                        <SelectItem value="bonus">Bônus</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Número do Pedido</Label>
                    <Input
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      className="mt-1 h-11 rounded-2xl"
                      placeholder="Ex: #12345"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Valor do Pedido (R$)</Label>
                    <Input
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="mt-1 h-11 rounded-2xl"
                      placeholder="Ex: 1500"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">% Comissão (Calc. Aut.)</Label>
                    <Input
                      value={commissionRate}
                      onChange={(e) => setCommissionRate(e.target.value)}
                      className="mt-1 h-11 rounded-2xl"
                      placeholder="Ex: 5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pontos Ganhos</Label>
                    <Input
                      value={points}
                      onChange={(e) => setPoints(e.target.value)}
                      className="mt-1 h-11 rounded-2xl"
                      placeholder="Ex: 10"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Anexo (opcional)</Label>
                  <Input ref={eventFileRef} type="file" className="mt-1 rounded-2xl" />
                  <div className="mt-1 text-[11px] text-slate-500">Armazenado no bucket privado tenant-assets.</div>
                </div>

                <Button onClick={createEvents} disabled={creating} className="h-11 rounded-2xl">
                  {creating
                    ? "Enviando…"
                    : participantIds.length > 1
                      ? `Lançar evento (${participantIds.length})`
                      : "Lançar evento"}
                </Button>
              </div>
            </Card>

            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Eventos recentes</div>
                <div className="text-xs text-slate-500">{(eventsQ.data ?? []).length}</div>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Campanha</TableHead>
                      <TableHead>Participante</TableHead>
                      <TableHead>Tipo</TableHead>
                       <TableHead className="text-right">Venda/Pontos</TableHead>
                       <TableHead className="text-right">Comissão (R$)</TableHead>
                       <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(eventsQ.data ?? []).map((e) => {
                      const p = participantsById.get(e.participant_id);
                      const pn = p ? p.display_name ?? p.name : e.participant_id.slice(0, 8) + "…";
                      const c = campaignsById.get(e.campaign_id);
                      const cn = c ? c.name : e.campaign_id.slice(0, 8) + "…";
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs text-slate-600">{new Date(e.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-sm font-medium text-slate-900">{cn}</TableCell>
                          <TableCell className="text-sm font-medium text-slate-900">{pn}</TableCell>
                          <TableCell>
                            <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">{e.event_type}</Badge>
                          </TableCell>
                           <TableCell className="text-right text-sm font-semibold text-slate-900">
                             {e.value ? `R$ ${e.value}` : "—"} / {e.points ?? "—"}
                             {e.order_number && <div className="text-[10px] text-slate-400 font-normal">{e.order_number}</div>}
                           </TableCell>
                           <TableCell className="text-right text-sm font-semibold text-emerald-600">
                             {e.commission_value ? `R$ ${e.commission_value}` : "—"}
                           </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => openEdit(e)}>
                                <Pencil className="h-4 w-4" />
                              </Button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="secondary" className="h-9 rounded-2xl" title="Remover">
                                    <Trash2 className="h-4 w-4 text-rose-600" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-3xl">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remover evento?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação não pode ser desfeita. O evento será excluído do ranking.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                                    <AlertDialogAction className="rounded-2xl" onClick={() => deleteEvent(e.id)}>
                                      Remover
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {(eventsQ.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                          Nenhum evento.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        </div>

         <Dialog open={editOpen} onOpenChange={setEditOpen}>
           <DialogContent className="max-w-lg rounded-3xl">
             <DialogHeader>
               <DialogTitle>Editar evento</DialogTitle>
               <DialogDescription>Altere tipo/venda/comissão/pontos.</DialogDescription>
             </DialogHeader>
 
             <div className="grid gap-3">
               <div>
                 <Label className="text-xs">Tipo</Label>
                 <Select value={editType} onValueChange={(v) => setEditType(v as any)}>
                   <SelectTrigger className="mt-1 h-11 rounded-2xl">
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="sale">Venda</SelectItem>
                     <SelectItem value="indication">Indicação</SelectItem>
                     <SelectItem value="points">Pontos Avulsos</SelectItem>
                     <SelectItem value="bonus">Bônus</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
 
               <div>
                 <Label className="text-xs">Número do Pedido</Label>
                 <Input value={editOrderNumber} onChange={(e) => setEditOrderNumber(e.target.value)} className="mt-1 h-11 rounded-2xl" />
               </div>
 
               <div className="grid gap-3 sm:grid-cols-3">
                 <div>
                   <Label className="text-xs">Valor Venda</Label>
                   <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="mt-1 h-11 rounded-2xl" />
                 </div>
                 <div>
                   <Label className="text-xs">% Comissão</Label>
                   <Input value={editCommissionRate} onChange={(e) => setEditCommissionRate(e.target.value)} className="mt-1 h-11 rounded-2xl" />
                 </div>
                 <div>
                   <Label className="text-xs">Pontos</Label>
                   <Input value={editPoints} onChange={(e) => setEditPoints(e.target.value)} className="mt-1 h-11 rounded-2xl" />
                 </div>
               </div>
             </div>
 
             <DialogFooter>
               <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => setEditOpen(false)}>
                 Cancelar
               </Button>
               <Button className="h-10 rounded-2xl" onClick={saveEdit} disabled={savingEdit}>
                 {savingEdit ? "Salvando…" : "Salvar"}
               </Button>
             </DialogFooter>
           </DialogContent>
         </Dialog>
 
         <Dialog open={showQuickParticipant} onOpenChange={setShowQuickParticipant}>
           <DialogContent className="max-w-md rounded-3xl">
             <DialogHeader>
               <DialogTitle>Cadastro Simplificado de Vendedor</DialogTitle>
               <DialogDescription>Adicione um novo participante rapidamente.</DialogDescription>
             </DialogHeader>
             <div className="grid gap-3">
               <div>
                 <Label className="text-xs">Nome Completo</Label>
                 <Input value={qName} onChange={(e) => setQName(e.target.value)} placeholder="Ex: João da Silva" className="mt-1 h-11 rounded-2xl" />
               </div>
               <div>
                 <Label className="text-xs">CPF (Somente números)</Label>
                 <Input value={qCpf} onChange={(e) => setQCpf(e.target.value)} placeholder="00000000000" className="mt-1 h-11 rounded-2xl" />
               </div>
               <div>
                 <Label className="text-xs">WhatsApp (Opcional)</Label>
                 <Input value={qWhatsapp} onChange={(e) => setQWhatsapp(e.target.value)} placeholder="11999998888" className="mt-1 h-11 rounded-2xl" />
               </div>
             </div>
             <DialogFooter>
               <Button variant="secondary" onClick={() => setShowQuickParticipant(false)} className="rounded-2xl">Cancelar</Button>
               <Button onClick={createQuickParticipant} disabled={creatingP} className="rounded-2xl">
                 {creatingP ? "Cadastrando…" : "Cadastrar"}
               </Button>
             </DialogFooter>
           </DialogContent>
         </Dialog>
       </AppShell>
     </RequireAuth>
   );
 }
