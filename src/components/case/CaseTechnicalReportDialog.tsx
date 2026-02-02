import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Clipboard, FileText, Info, List, MessagesSquare, Webhook } from "lucide-react";
import { showSuccess } from "@/utils/toast";

type CaseRow = {
  id: string;
  tenant_id: string;
  journey_id: string | null;
  status: string;
  state: string;
  is_chat: boolean;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  meta_json: any;
};

type WaMessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  type: string;
  from_phone: string | null;
  to_phone: string | null;
  body_text: string | null;
  correlation_id: string | null;
  occurred_at: string;
  payload_json: any;
};

type WebhookInboxRow = {
  id: string;
  received_at: string;
  direction: string;
  ok: boolean;
  http_status: number;
  reason: string | null;
  from_phone: string | null;
  to_phone: string | null;
  meta_json: any;
  payload_json: any;
};

type TimelineRow = {
  id: string;
  event_type: string;
  actor_type: string;
  message: string;
  meta_json: any;
  occurred_at: string;
};

type WaInstanceRow = { id: string; phone_number: string | null };

type CustomerRow = { id: string; phone_e164: string; name: string | null };

type RelatedCaseRow = { id: string; status: string; state: string; is_chat: boolean; created_at: string; updated_at: string; deleted_at: string | null };

function fmtDT(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function digitsTail(s: string | null | undefined, tail = 11) {
  const d = String(s ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length > tail ? d.slice(-tail) : d;
}

function samePhoneLoose(a: string | null | undefined, b: string | null | undefined) {
  const da = digitsTail(a);
  const db = digitsTail(b);
  if (!da || !db) return false;
  if (Math.min(da.length, db.length) < 10) return false;
  return da === db;
}

function prettyJson(v: any) {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return String(v ?? "");
  }
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
  showSuccess("Copiado.");
}

function Pill({ tone, children }: { tone: "slate" | "amber" | "rose" | "emerald" | "indigo"; children: any }) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-900"
      : tone === "rose"
        ? "bg-rose-100 text-rose-900"
        : tone === "amber"
          ? "bg-amber-100 text-amber-900"
          : tone === "indigo"
            ? "bg-indigo-100 text-indigo-900"
            : "bg-slate-100 text-slate-800";
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{children}</span>;
}

export function CaseTechnicalReportDialog({ caseId, className }: { caseId: string; className?: string }) {
  const { activeTenantId } = useTenant();

  const caseQ = useQuery({
    queryKey: ["case_tech_report_case", activeTenantId, caseId],
    enabled: Boolean(activeTenantId && caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,tenant_id,journey_id,status,state,is_chat,customer_id,created_at,updated_at,deleted_at,meta_json")
        .eq("tenant_id", activeTenantId!)
        .eq("id", caseId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Case não encontrado");
      return data as CaseRow;
    },
  });

  const instanceQ = useQuery({
    queryKey: ["case_tech_report_instance", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_instances")
        .select("id,phone_number")
        .eq("tenant_id", activeTenantId!)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WaInstanceRow | null;
    },
  });

  const customerQ = useQuery({
    queryKey: ["case_tech_report_customer", activeTenantId, caseQ.data?.customer_id],
    enabled: Boolean(activeTenantId && caseQ.data?.customer_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_accounts")
        .select("id,phone_e164,name")
        .eq("tenant_id", activeTenantId!)
        .eq("id", caseQ.data!.customer_id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CustomerRow | null;
    },
  });

  const msgsQ = useQuery({
    queryKey: ["case_tech_report_msgs", activeTenantId, caseId],
    enabled: Boolean(activeTenantId && caseId),
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_messages")
        .select("id,direction,type,from_phone,to_phone,body_text,correlation_id,occurred_at,payload_json")
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", caseId)
        .order("occurred_at", { ascending: true })
        .limit(250);
      if (error) throw error;
      return (data ?? []) as WaMessageRow[];
    },
  });

  const timelineQ = useQuery({
    queryKey: ["case_tech_report_timeline", activeTenantId, caseId],
    enabled: Boolean(activeTenantId && caseId),
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("id,event_type,actor_type,message,meta_json,occurred_at")
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", caseId)
        .order("occurred_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as TimelineRow[];
    },
  });

  const webhooksQ = useQuery({
    queryKey: ["case_tech_report_webhooks", activeTenantId, caseId],
    enabled: Boolean(activeTenantId && caseId),
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_webhook_inbox")
        .select("id,received_at,direction,ok,http_status,reason,from_phone,to_phone,meta_json,payload_json")
        .eq("tenant_id", activeTenantId!)
        // PostgREST JSON path filter
        .eq("meta_json->>case_id", caseId)
        .order("received_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as WebhookInboxRow[];
    },
  });

  const webhooksNearCreationQ = useQuery({
    queryKey: ["case_tech_report_webhooks_near", activeTenantId, caseId, caseQ.data?.created_at],
    enabled: Boolean(activeTenantId && caseId && caseQ.data?.created_at),
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const createdAt = new Date(caseQ.data!.created_at);
      const start = new Date(createdAt.getTime() - 10 * 60_000).toISOString();
      const end = new Date(createdAt.getTime() + 10 * 60_000).toISOString();

      const { data, error } = await supabase
        .from("wa_webhook_inbox")
        .select("id,received_at,direction,ok,http_status,reason,from_phone,to_phone,meta_json,payload_json")
        .eq("tenant_id", activeTenantId!)
        .gte("received_at", start)
        .lte("received_at", end)
        .order("received_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as WebhookInboxRow[];
    },
  });

  const relatedCasesQ = useQuery({
    queryKey: ["case_tech_report_related_cases", activeTenantId, caseQ.data?.customer_id, caseId],
    enabled: Boolean(activeTenantId && caseQ.data?.customer_id),
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,status,state,is_chat,created_at,updated_at,deleted_at")
        .eq("tenant_id", activeTenantId!)
        .eq("customer_id", caseQ.data!.customer_id!)
        .neq("id", caseId)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as RelatedCaseRow[];
    },
  });

  const instPhone = instanceQ.data?.phone_number ?? null;

  const derived = useMemo(() => {
    const msgs = msgsQ.data ?? [];
    const first = msgs[0] ?? null;
    const last = msgs[msgs.length - 1] ?? null;

    const firstLooksOutboundButSavedInbound =
      first?.direction === "inbound" &&
      (samePhoneLoose(instPhone, first.from_phone) || (first.payload_json?.fromMe === true || first.payload_json?.isFromMe === true));

    const caseMeta = caseQ.data?.meta_json ?? {};
    const openedBy = String(caseMeta?.opened_by ?? "").trim() || null;

    const suspicion: Array<{ tone: "rose" | "amber" | "emerald" | "slate"; label: string }> = [];

    if (!msgs.length) {
      suspicion.push({ tone: "amber", label: "Case sem wa_messages (a UI não vai mostrar conversa)" });
    }

    if (firstLooksOutboundButSavedInbound) {
      suspicion.push({ tone: "rose", label: "Primeira mensagem parece outbound, mas foi salva como inbound (provável misclassificação no webhook)" });
    }

    if (!openedBy) suspicion.push({ tone: "slate", label: "meta_json.opened_by ausente (pode ser case antigo/gerado por outro caminho)" });

    if (caseQ.data?.deleted_at) suspicion.push({ tone: "amber", label: "Case está soft-deleted (deleted_at preenchido)" });

    return {
      first,
      last,
      openedBy,
      firstLooksOutboundButSavedInbound,
      suspicion,
    };
  }, [msgsQ.data, instPhone, caseQ.data?.meta_json, caseQ.data?.deleted_at]);

  const exportBundle = useMemo(() => {
    return {
      case: caseQ.data ?? null,
      customer: customerQ.data ?? null,
      instance_phone: instPhone,
      wa_messages: msgsQ.data ?? [],
      webhooks_case: webhooksQ.data ?? [],
      webhooks_near_case_created_at: webhooksNearCreationQ.data ?? [],
      timeline_events: timelineQ.data ?? [],
      related_cases_same_customer: relatedCasesQ.data ?? [],
      derived,
    };
  }, [caseQ.data, customerQ.data, instPhone, msgsQ.data, webhooksQ.data, webhooksNearCreationQ.data, timelineQ.data, relatedCasesQ.data, derived]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className={cn("h-10 rounded-2xl", className)}
        >
          <FileText className="mr-2 h-4 w-4" /> Relatório
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-[980px] rounded-[24px] p-0">
        <DialogHeader className="border-b border-slate-200 bg-white/80 px-5 py-4 backdrop-blur">
          <DialogTitle className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">Relatório técnico • {caseId}</span>
            <Button
              type="button"
              variant="secondary"
              className="h-9 rounded-2xl"
              onClick={() => copyToClipboard(prettyJson(exportBundle))}
              disabled={caseQ.isLoading}
              title="Copia um bundle completo (JSON) para colar no chat"
            >
              <Clipboard className="mr-2 h-4 w-4" /> Copiar JSON
            </Button>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="summary" className="p-4">
          <TabsList className="grid w-full grid-cols-4 rounded-2xl bg-slate-100 p-1">
            <TabsTrigger value="summary" className="rounded-xl">
              <Info className="mr-2 h-4 w-4" /> Resumo
            </TabsTrigger>
            <TabsTrigger value="messages" className="rounded-xl">
              <MessagesSquare className="mr-2 h-4 w-4" /> Mensagens
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="rounded-xl">
              <Webhook className="mr-2 h-4 w-4" /> Webhook
            </TabsTrigger>
            <TabsTrigger value="timeline" className="rounded-xl">
              <List className="mr-2 h-4 w-4" /> Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-4">
            <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
              <Card className="rounded-[22px] border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">Identidade</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Tenant: <span className="font-mono">{caseQ.data?.tenant_id ?? "—"}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Customer: <span className="font-mono">{caseQ.data?.customer_id ?? "—"}</span>
                      {customerQ.data?.phone_e164 ? (
                        <span className="ml-2 text-slate-500">({customerQ.data.phone_e164}{customerQ.data.name ? ` • ${customerQ.data.name}` : ""})</span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Instância (ativa): <span className="font-mono">{instPhone ?? "—"}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Badge className="rounded-full border-0 bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.12)]">
                      {caseQ.data?.is_chat ? "CHAT" : "CASE"}
                    </Badge>
                    <Pill tone={caseQ.data?.status === "open" ? "emerald" : "slate"}>{caseQ.data?.status ?? "—"}</Pill>
                    <Pill tone="indigo">{caseQ.data?.state ?? "—"}</Pill>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <div>
                    <span className="font-semibold">Criado:</span> {caseQ.data?.created_at ? fmtDT(caseQ.data.created_at) : "—"}
                  </div>
                  <div>
                    <span className="font-semibold">Atualizado:</span> {caseQ.data?.updated_at ? fmtDT(caseQ.data.updated_at) : "—"}
                  </div>
                  <div>
                    <span className="font-semibold">meta_json.opened_by:</span> {derived.openedBy ?? "(vazio)"}
                  </div>
                </div>

                {derived.suspicion.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {derived.suspicion.map((s, idx) => (
                      <Pill key={idx} tone={s.tone}>{s.label}</Pill>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-2 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold text-slate-900">Primeira mensagem</div>
                    <div className="mt-1 text-[11px] text-slate-600">
                      {derived.first ? `${derived.first.direction} • ${fmtDT(derived.first.occurred_at)}` : "—"}
                    </div>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-2xl bg-slate-50 p-2 text-[11px] text-slate-700">
                      {derived.first ? prettyJson({
                        id: derived.first.id,
                        direction: derived.first.direction,
                        from: derived.first.from_phone,
                        to: derived.first.to_phone,
                        text: derived.first.body_text,
                        correlation_id: derived.first.correlation_id,
                      }) : "null"}
                    </pre>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold text-slate-900">Última mensagem</div>
                    <div className="mt-1 text-[11px] text-slate-600">
                      {derived.last ? `${derived.last.direction} • ${fmtDT(derived.last.occurred_at)}` : "—"}
                    </div>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-2xl bg-slate-50 p-2 text-[11px] text-slate-700">
                      {derived.last ? prettyJson({
                        id: derived.last.id,
                        direction: derived.last.direction,
                        from: derived.last.from_phone,
                        to: derived.last.to_phone,
                        text: derived.last.body_text,
                        correlation_id: derived.last.correlation_id,
                      }) : "null"}
                    </pre>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-900">Cases relacionados (mesmo customer)</div>
                    <Pill tone="slate">{(relatedCasesQ.data ?? []).length}</Pill>
                  </div>
                  <div className="mt-2 grid gap-2">
                    {(relatedCasesQ.data ?? []).slice(0, 6).map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-slate-900">{r.id}</div>
                          <div className="mt-0.5 text-[11px] text-slate-600">{r.status} • {r.state} • {r.is_chat ? "chat" : "case"}</div>
                        </div>
                        <div className="shrink-0 text-[11px] text-slate-500">{fmtDT(r.updated_at)}</div>
                      </div>
                    ))}
                    {(relatedCasesQ.data ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3 text-xs text-slate-600">
                        Nenhum outro case para este customer_id.
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>

              <Card className="rounded-[22px] border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">Export rápido</div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 rounded-2xl"
                    onClick={() => copyToClipboard(prettyJson({ case: caseQ.data, derived }))}
                    disabled={!caseQ.data}
                  >
                    <Clipboard className="mr-2 h-4 w-4" /> Copiar resumo
                  </Button>
                </div>

                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-900">Como interpretar</div>
                  <ul className="mt-2 list-disc pl-5 text-xs text-slate-700 space-y-1">
                    <li><span className="font-semibold">Primeira mensagem inbound vindo do número da instância</span> → quase sempre indica webhook outbound classificado errado.</li>
                    <li><span className="font-semibold">meta_json.opened_by = text/image/location</span> → indica criação via inbound automation.</li>
                    <li>Se <span className="font-semibold">webhooks_near_case_created_at</span> tem direção inbound mas payload tem fromMe/isFromMe → bug de classificação.</li>
                  </ul>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-semibold text-slate-900">meta_json</div>
                  <ScrollArea className="mt-2 h-[320px] rounded-2xl border border-slate-200 bg-slate-50">
                    <pre className="p-3 text-[11px] text-slate-800">{prettyJson(caseQ.data?.meta_json)}</pre>
                  </ScrollArea>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="messages" className="mt-4">
            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">wa_messages (por case_id)</div>
                <Pill tone="slate">{(msgsQ.data ?? []).length}</Pill>
              </div>
              <div className="mt-3 grid gap-2">
                {(msgsQ.data ?? []).map((m) => (
                  <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Pill tone={m.direction === "outbound" ? "indigo" : "slate"}>{m.direction}</Pill>
                        <Pill tone="slate">{m.type}</Pill>
                        {instPhone && samePhoneLoose(instPhone, m.from_phone) ? (
                          <Pill tone="amber">from = instância</Pill>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-slate-500">{fmtDT(m.occurred_at)}</div>
                    </div>

                    <div className="mt-2 text-xs text-slate-700">
                      <div><span className="font-semibold">from:</span> <span className="font-mono">{m.from_phone ?? "—"}</span></div>
                      <div><span className="font-semibold">to:</span> <span className="font-mono">{m.to_phone ?? "—"}</span></div>
                      <div><span className="font-semibold">correlation_id:</span> <span className="font-mono">{m.correlation_id ?? "—"}</span></div>
                    </div>

                    {m.body_text ? (
                      <div className="mt-2 rounded-2xl bg-slate-50 p-2 text-xs text-slate-800">{m.body_text}</div>
                    ) : null}

                    <div className="mt-2 flex items-center justify-end gap-2">
                      <Button type="button" variant="secondary" className="h-8 rounded-2xl" onClick={() => copyToClipboard(prettyJson(m.payload_json))}>
                        <Clipboard className="mr-2 h-4 w-4" /> Copiar payload
                      </Button>
                    </div>
                  </div>
                ))}

                {(msgsQ.data ?? []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                    Nenhuma mensagem vinculada a este case.
                  </div>
                ) : null}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="webhooks" className="mt-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="rounded-[22px] border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">wa_webhook_inbox (meta_json.case_id = case)</div>
                  <Pill tone="slate">{(webhooksQ.data ?? []).length}</Pill>
                </div>
                <ScrollArea className="mt-3 h-[520px] rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="space-y-2 p-3">
                    {(webhooksQ.data ?? []).map((w) => (
                      <div key={w.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Pill tone={w.direction === "outbound" ? "indigo" : "slate"}>{w.direction}</Pill>
                            {w.ok ? <Pill tone="emerald">ok</Pill> : <Pill tone="rose">erro</Pill>}
                            {w.reason ? <Pill tone="amber">{w.reason}</Pill> : null}
                          </div>
                          <div className="text-[11px] text-slate-500">{fmtDT(w.received_at)}</div>
                        </div>

                        <div className="mt-2 text-[11px] text-slate-700">
                          <div><span className="font-semibold">from:</span> <span className="font-mono">{w.from_phone ?? "—"}</span></div>
                          <div><span className="font-semibold">to:</span> <span className="font-mono">{w.to_phone ?? "—"}</span></div>
                          <div className="mt-1 text-slate-600">
                            forced: <span className="font-mono">{String(w.meta_json?.forced_direction ?? "") || "—"}</span> • inferred: <span className="font-mono">{String(w.meta_json?.inferred_direction ?? "") || "—"}</span> • strong_outbound: <span className="font-mono">{String(w.meta_json?.strong_outbound ?? "") || "—"}</span>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-end gap-2">
                          <Button type="button" variant="secondary" className="h-8 rounded-2xl" onClick={() => copyToClipboard(prettyJson(w.meta_json))}>
                            <Clipboard className="mr-2 h-4 w-4" /> Copiar meta
                          </Button>
                          <Button type="button" variant="secondary" className="h-8 rounded-2xl" onClick={() => copyToClipboard(prettyJson(w.payload_json))}>
                            <Clipboard className="mr-2 h-4 w-4" /> Copiar payload
                          </Button>
                        </div>
                      </div>
                    ))}

                    {(webhooksQ.data ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                        Nenhum webhook foi registrado com meta_json.case_id = este case.
                      </div>
                    ) : null}
                  </div>
                </ScrollArea>
              </Card>

              <Card className="rounded-[22px] border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">Webhooks perto da criação (±10min)</div>
                  <Pill tone="slate">{(webhooksNearCreationQ.data ?? []).length}</Pill>
                </div>

                <ScrollArea className="mt-3 h-[520px] rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="space-y-2 p-3">
                    {(webhooksNearCreationQ.data ?? []).map((w) => (
                      <div key={w.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Pill tone={w.direction === "outbound" ? "indigo" : "slate"}>{w.direction}</Pill>
                            {w.ok ? <Pill tone="emerald">ok</Pill> : <Pill tone="rose">erro</Pill>}
                            {w.reason ? <Pill tone="amber">{w.reason}</Pill> : null}
                          </div>
                          <div className="text-[11px] text-slate-500">{fmtDT(w.received_at)}</div>
                        </div>

                        <div className="mt-2 text-[11px] text-slate-700">
                          <div><span className="font-semibold">from:</span> <span className="font-mono">{w.from_phone ?? "—"}</span></div>
                          <div><span className="font-semibold">to:</span> <span className="font-mono">{w.to_phone ?? "—"}</span></div>
                          <div className="mt-1 text-slate-600">
                            case_id(meta): <span className="font-mono">{String(w.meta_json?.case_id ?? "") || "—"}</span>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-end gap-2">
                          <Button type="button" variant="secondary" className="h-8 rounded-2xl" onClick={() => copyToClipboard(prettyJson(w.payload_json))}>
                            <Clipboard className="mr-2 h-4 w-4" /> Copiar payload
                          </Button>
                        </div>
                      </div>
                    ))}

                    {(webhooksNearCreationQ.data ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                        Nenhum webhook no intervalo.
                      </div>
                    ) : null}
                  </div>
                </ScrollArea>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">timeline_events</div>
                <Pill tone="slate">{(timelineQ.data ?? []).length}</Pill>
              </div>

              <ScrollArea className="mt-3 h-[620px] rounded-2xl border border-slate-200 bg-slate-50">
                <div className="space-y-2 p-3">
                  {(timelineQ.data ?? []).map((t) => (
                    <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Pill tone="slate">{t.event_type}</Pill>
                          <Pill tone="indigo">{t.actor_type}</Pill>
                        </div>
                        <div className="text-[11px] text-slate-500">{fmtDT(t.occurred_at)}</div>
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-900">{t.message}</div>
                      <div className="mt-2 flex items-center justify-end">
                        <Button type="button" variant="secondary" className="h-8 rounded-2xl" onClick={() => copyToClipboard(prettyJson(t.meta_json))}>
                          <Clipboard className="mr-2 h-4 w-4" /> Copiar meta
                        </Button>
                      </div>
                    </div>
                  ))}

                  {(timelineQ.data ?? []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                      Sem eventos.
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
