import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatYmdInTimeZone, titleizeCaseState, titleizePunchType, type PresencePunchType } from "@/lib/presence";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showError, showSuccess } from "@/utils/toast";
import {
  CalendarDays,
  ClipboardCheck,
  Clock3,
  MapPin,
  ShieldAlert,
  Sparkles,
  UserRound,
  XCircle,
} from "lucide-react";

type PresenceCaseRow = {
  id: string;
  state: string;
  status: string;
  case_date: string | null;
  entity_id: string | null;
  meta_json: any;
  updated_at: string;
};

type PunchLite = {
  id: string;
  case_id: string;
  timestamp: string;
  type: PresencePunchType;
  within_radius: boolean;
  status: string;
  latitude: number | null;
  longitude: number | null;
  distance_from_location: number | null;
};

type PendLite = {
  id: string;
  case_id: string;
  type: string;
  required: boolean;
  status: string;
};

type PresenceLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type PresencePolicy = {
  id: string;
  location_id: string;
  radius_meters: number;
  lateness_tolerance_minutes: number;
  break_required: boolean;
  allow_outside_radius: boolean;
};

function shortId(id: string | null | undefined) {
  const s = String(id ?? "");
  if (!s) return "—";
  return s.slice(0, 6) + "…" + s.slice(-4);
}

function isPresenceManager(role: string | null | undefined) {
  return ["admin", "manager", "supervisor", "leader"].includes(String(role ?? "").toLowerCase());
}

function ColumnHeader({
  icon: Icon,
  title,
  count,
  tone,
}: {
  icon: any;
  title: string;
  count: number;
  tone: "neutral" | "warn" | "ok" | "closed";
}) {
  const toneCls =
    tone === "warn"
      ? "bg-amber-100 text-amber-900"
      : tone === "ok"
        ? "bg-emerald-100 text-emerald-900"
        : tone === "closed"
          ? "bg-slate-200 text-slate-700"
          : "bg-slate-100 text-slate-900";

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold", toneCls)}>
          <Icon className="h-4 w-4" />
          {title}
        </div>
      </div>
      <div className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
        {count}
      </div>
    </div>
  );
}

function CaseCard({
  c,
  lastPunch,
  openRequired,
  openAny,
  onOpen,
}: {
  c: PresenceCaseRow;
  lastPunch: PunchLite | null;
  openRequired: number;
  openAny: number;
  onOpen: () => void;
}) {
  const label =
    (c.meta_json?.presence?.employee_label as string | undefined) ??
    (c.meta_json?.presence?.employeeLabel as string | undefined) ??
    null;

  const within = lastPunch?.within_radius;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full text-left rounded-[22px] border bg-white p-3 shadow-sm transition",
        "border-slate-200 hover:border-slate-300 hover:shadow",
        openRequired ? "ring-1 ring-amber-200" : ""
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-slate-400" />
            <div className="truncate text-sm font-semibold text-slate-900">
              {label ? label : shortId(c.entity_id)}
            </div>
          </div>
          <div className="mt-1 text-[11px] text-slate-600">
            Estado: <span className="font-semibold text-slate-800">{titleizeCaseState(c.state)}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          {openAny > 0 ? (
            <Badge className={cn("rounded-full border-0", openRequired ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-800")}>
              {openRequired ? `${openRequired} crítica(s)` : `${openAny} pend.`}
            </Badge>
          ) : (
            <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-900">ok</Badge>
          )}
          {typeof within === "boolean" && (
            <div className="inline-flex items-center gap-1 text-[11px] text-slate-600">
              <span className={cn("h-2 w-2 rounded-full", within ? "bg-emerald-600" : "bg-amber-600")} />
              {within ? "no raio" : "fora"}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-slate-700">Última batida</div>
          <div className="mt-0.5 truncate text-xs text-slate-700">
            {lastPunch ? titleizePunchType(lastPunch.type) : "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-slate-500">Horário</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-800">
            {lastPunch ? new Date(lastPunch.timestamp).toLocaleTimeString() : "—"}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function PresenceManage() {
  const { activeTenantId, activeTenant, isSuperAdmin } = useTenant();
  const qc = useQueryClient();

  const manager = isSuperAdmin || isPresenceManager(activeTenant?.role);

  const presenceCfgQ = useQuery({
    queryKey: ["presence_cfg", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id,config_json,journeys!inner(key)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .eq("journeys.key", "presence")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const presenceEnabled = Boolean((presenceCfgQ.data as any)?.config_json?.flags?.presence_enabled === true);
  const timeZone = String((presenceCfgQ.data as any)?.config_json?.presence?.time_zone ?? "America/Sao_Paulo");

  const today = useMemo(() => formatYmdInTimeZone(timeZone), [timeZone]);
  const [selectedDate, setSelectedDate] = useState<string>(today);

  const casesQ = useQuery({
    queryKey: ["presence_manage_cases", activeTenantId, selectedDate, presenceEnabled],
    enabled: Boolean(activeTenantId && presenceEnabled),
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,state,status,case_date,entity_id,meta_json,updated_at")
        .eq("tenant_id", activeTenantId!)
        .eq("case_type", "PRESENCE_DAY")
        .eq("case_date", selectedDate)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as any as PresenceCaseRow[];
    },
  });

  const caseIds = useMemo(() => (casesQ.data ?? []).map((c) => c.id), [casesQ.data]);

  const punchesQ = useQuery({
    queryKey: ["presence_manage_punches", activeTenantId, selectedDate, caseIds.join(",")],
    enabled: Boolean(activeTenantId && presenceEnabled && caseIds.length),
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_punches")
        .select("id,case_id,timestamp,type,within_radius,status,latitude,longitude,distance_from_location")
        .eq("tenant_id", activeTenantId!)
        .in("case_id", caseIds)
        .order("timestamp", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as any as PunchLite[];
    },
  });

  const pendQ = useQuery({
    queryKey: ["presence_manage_pend", activeTenantId, selectedDate, caseIds.join(",")],
    enabled: Boolean(activeTenantId && presenceEnabled && caseIds.length),
    refetchInterval: 10_000,
    queryFn: async () => {
      // pendencies table doesn't always have tenant_id; use case join RLS.
      const { data, error } = await supabase
        .from("pendencies")
        .select("id,case_id,type,required,status")
        .in("case_id", caseIds)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as any as PendLite[];
    },
  });

  const lastPunchByCase = useMemo(() => {
    const m = new Map<string, PunchLite>();
    for (const p of punchesQ.data ?? []) {
      if (!m.has(p.case_id)) m.set(p.case_id, p);
    }
    return m;
  }, [punchesQ.data]);

  const pendStatsByCase = useMemo(() => {
    const m = new Map<string, { openAny: number; openRequired: number }>();
    for (const p of pendQ.data ?? []) {
      const cur = m.get(p.case_id) ?? { openAny: 0, openRequired: 0 };
      if (p.status === "open") {
        cur.openAny += 1;
        if (p.required) cur.openRequired += 1;
      }
      m.set(p.case_id, cur);
    }
    return m;
  }, [pendQ.data]);

  const buckets = useMemo(() => {
    const out = {
      critical: [] as PresenceCaseRow[],
      awaiting_justification: [] as PresenceCaseRow[],
      awaiting_approval: [] as PresenceCaseRow[],
      ok: [] as PresenceCaseRow[],
      closed: [] as PresenceCaseRow[],
    };

    for (const c of casesQ.data ?? []) {
      const st = String(c.state ?? "");
      const isClosed = st === "FECHADO" || String(c.status) === "closed";
      const pend = pendStatsByCase.get(c.id) ?? { openAny: 0, openRequired: 0 };

      if (isClosed) out.closed.push(c);
      else if (st === "PENDENTE_JUSTIFICATIVA") out.awaiting_justification.push(c);
      else if (st === "PENDENTE_APROVACAO") out.awaiting_approval.push(c);
      else if (pend.openRequired > 0) out.critical.push(c);
      else out.ok.push(c);
    }

    return out;
  }, [casesQ.data, pendStatsByCase]);

  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const openCase = useMemo(() => (casesQ.data ?? []).find((c) => c.id === openCaseId) ?? null, [casesQ.data, openCaseId]);

  const caseDetailQ = useQuery({
    queryKey: ["presence_manage_case_detail", activeTenantId, openCaseId],
    enabled: Boolean(activeTenantId && openCaseId && presenceEnabled),
    queryFn: async () => {
      const [timelineRes, punchesRes, pendRes] = await Promise.all([
        supabase
          .from("timeline_events")
          .select("id,occurred_at,event_type,message,meta_json")
          .eq("tenant_id", activeTenantId!)
          .eq("case_id", openCaseId!)
          .order("occurred_at", { ascending: true })
          .limit(500),
        supabase
          .from("time_punches")
          .select("id,timestamp,type,within_radius,status,latitude,longitude,accuracy_meters,distance_from_location,source")
          .eq("tenant_id", activeTenantId!)
          .eq("case_id", openCaseId!)
          .order("timestamp", { ascending: true })
          .limit(200),
        supabase
          .from("pendencies")
          .select("id,type,question_text,required,status,answered_text,created_at")
          .eq("case_id", openCaseId!)
          .order("created_at", { ascending: true })
          .limit(500),
      ]);

      if (timelineRes.error) throw timelineRes.error;
      if (punchesRes.error) throw punchesRes.error;
      if (pendRes.error) throw pendRes.error;

      return {
        timeline: timelineRes.data ?? [],
        punches: punchesRes.data ?? [],
        pendencies: pendRes.data ?? [],
      };
    },
  });

  // --- Policy/location config (basic) ---
  const configQ = useQuery({
    queryKey: ["presence_manage_geofence", activeTenantId],
    enabled: Boolean(activeTenantId && presenceEnabled && manager),
    queryFn: async () => {
      const [locRes, polRes] = await Promise.all([
        supabase
          .from("presence_locations")
          .select("id,name,latitude,longitude")
          .eq("tenant_id", activeTenantId!)
          .order("created_at", { ascending: true })
          .limit(50),
        supabase
          .from("presence_policies")
          .select("id,location_id,radius_meters,lateness_tolerance_minutes,break_required,allow_outside_radius")
          .eq("tenant_id", activeTenantId!)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (locRes.error) throw locRes.error;
      if (polRes.error) throw polRes.error;

      return {
        locations: (locRes.data ?? []) as any as PresenceLocation[],
        policy: (polRes.data ?? null) as any as PresencePolicy | null,
      };
    },
  });

  const [newLocName, setNewLocName] = useState("");
  const [newLocLat, setNewLocLat] = useState("");
  const [newLocLng, setNewLocLng] = useState("");

  const [policyDraft, setPolicyDraft] = useState<{ location_id: string; radius_meters: string; lateness_tolerance_minutes: string; break_required: boolean; allow_outside_radius: boolean } | null>(null);

  const policyEffective = useMemo(() => {
    const policy = configQ.data?.policy ?? null;
    const locs = configQ.data?.locations ?? [];
    const base = {
      location_id: policy?.location_id ?? (locs[0]?.id ?? ""),
      radius_meters: String(policy?.radius_meters ?? 100),
      lateness_tolerance_minutes: String(policy?.lateness_tolerance_minutes ?? 10),
      break_required: policy?.break_required ?? true,
      allow_outside_radius: policy?.allow_outside_radius ?? true,
    };
    return policyDraft ?? base;
  }, [configQ.data?.policy, configQ.data?.locations, policyDraft]);

  const savePolicy = async () => {
    if (!activeTenantId || !manager) return;
    if (!policyEffective.location_id) {
      showError("Selecione um local (location_id). ");
      return;
    }

    try {
      const payload = {
        tenant_id: activeTenantId,
        location_id: policyEffective.location_id,
        radius_meters: Math.max(1, Number(policyEffective.radius_meters) || 100),
        lateness_tolerance_minutes: Math.max(0, Number(policyEffective.lateness_tolerance_minutes) || 10),
        break_required: Boolean(policyEffective.break_required),
        allow_outside_radius: Boolean(policyEffective.allow_outside_radius),
      };

      if (configQ.data?.policy?.id) {
        const { error } = await supabase
          .from("presence_policies")
          .update(payload)
          .eq("tenant_id", activeTenantId)
          .eq("id", configQ.data.policy.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("presence_policies").insert(payload);
        if (error) throw error;
      }

      showSuccess("Política de presença salva.");
      setPolicyDraft(null);
      await qc.invalidateQueries({ queryKey: ["presence_manage_geofence", activeTenantId] });
    } catch (e: any) {
      showError(e?.message ?? "Falha ao salvar política");
    }
  };

  const addLocation = async () => {
    if (!activeTenantId || !manager) return;
    const name = newLocName.trim();
    const lat = Number(newLocLat);
    const lng = Number(newLocLng);
    if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
      showError("Informe nome, latitude e longitude válidos.");
      return;
    }

    try {
      const { error } = await supabase.from("presence_locations").insert({
        tenant_id: activeTenantId,
        name,
        latitude: lat,
        longitude: lng,
      });
      if (error) throw error;
      showSuccess("Local criado.");
      setNewLocName("");
      setNewLocLat("");
      setNewLocLng("");
      await qc.invalidateQueries({ queryKey: ["presence_manage_geofence", activeTenantId] });
    } catch (e: any) {
      showError(e?.message ?? "Falha ao criar local");
    }
  };

  const [closing, setClosing] = useState(false);
  const [closeNote, setCloseNote] = useState("");

  const closeDay = async () => {
    if (!activeTenantId || !openCaseId) return;
    if (!manager) {
      showError("Apenas gestores podem fechar o dia.");
      return;
    }

    setClosing(true);
    try {
      const url = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/presence-close-day";
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId: activeTenantId, caseId: openCaseId, note: closeNote }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Falha ao fechar (${res.status})`);
      }

      showSuccess(json?.result?.ok ? "Dia fechado." : "Fechamento bloqueado; ficou pendente.");
      setCloseNote("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["presence_manage_cases", activeTenantId, selectedDate, presenceEnabled] }),
        qc.invalidateQueries({ queryKey: ["presence_manage_case_detail", activeTenantId, openCaseId] }),
      ]);
    } catch (e: any) {
      showError(e?.message ?? "Falha ao fechar dia");
    } finally {
      setClosing(false);
    }
  };

  const columns = [
    {
      key: "critical",
      title: "Pendências críticas",
      icon: ShieldAlert,
      tone: "warn" as const,
      list: buckets.critical,
    },
    {
      key: "awaiting_justification",
      title: "Aguardando justificativa",
      icon: XCircle,
      tone: "warn" as const,
      list: buckets.awaiting_justification,
    },
    {
      key: "awaiting_approval",
      title: "Aguardando aprovação",
      icon: ClipboardCheck,
      tone: "neutral" as const,
      list: buckets.awaiting_approval,
    },
    {
      key: "ok",
      title: "OK",
      icon: Sparkles,
      tone: "ok" as const,
      list: buckets.ok,
    },
    {
      key: "closed",
      title: "Fechados",
      icon: Clock3,
      tone: "closed" as const,
      list: buckets.closed,
    },
  ];

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.presence_manage">
        <AppShell>
          <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--byfrost-accent)/0.10)] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--byfrost-accent))]">
                  <ClipboardCheck className="h-4 w-4" />
                  Presença • Gestão
                </div>
                <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">Kanban</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {activeTenant?.slug ?? "—"} • fuso: <span className="font-medium">{timeZone}</span>
                </p>
              </div>

              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="h-9 w-[170px] rounded-xl border-0 bg-transparent px-1 text-sm"
                  />
                </div>

                {manager && (
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="secondary" className="h-11 rounded-2xl">
                        Configurar geofence
                      </Button>
                    </SheetTrigger>
                    <SheetContent className="w-full sm:max-w-[520px]">
                      <SheetHeader>
                        <SheetTitle>Geofence / Política</SheetTitle>
                      </SheetHeader>

                      <div className="mt-4 space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-xs font-semibold text-slate-900">Locais</div>
                          <div className="mt-2 space-y-2">
                            {(configQ.data?.locations ?? []).map((l) => (
                              <button
                                key={l.id}
                                type="button"
                                onClick={() => setPolicyDraft((prev) => ({ ...(prev ?? policyEffective), location_id: l.id }))}
                                className={cn(
                                  "w-full rounded-2xl border px-3 py-2 text-left",
                                  policyEffective.location_id === l.id
                                    ? "border-[hsl(var(--byfrost-accent)/0.45)] bg-white"
                                    : "border-slate-200 bg-white/60 hover:bg-white"
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-slate-900">{l.name}</div>
                                    <div className="mt-0.5 truncate text-[11px] text-slate-600">
                                      {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}
                                    </div>
                                  </div>
                                  <MapPin className="h-4 w-4 text-slate-400" />
                                </div>
                              </button>
                            ))}
                            {!configQ.data?.locations?.length && (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3 text-sm text-slate-600">
                                Nenhum local cadastrado.
                              </div>
                            )}
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <Input
                              value={newLocName}
                              onChange={(e) => setNewLocName(e.target.value)}
                              placeholder="Nome"
                              className="rounded-2xl bg-white"
                            />
                            <Input
                              value={newLocLat}
                              onChange={(e) => setNewLocLat(e.target.value)}
                              placeholder="Lat"
                              className="rounded-2xl bg-white"
                            />
                            <Input
                              value={newLocLng}
                              onChange={(e) => setNewLocLng(e.target.value)}
                              placeholder="Lng"
                              className="rounded-2xl bg-white"
                            />
                          </div>
                          <Button onClick={addLocation} className="mt-2 h-10 w-full rounded-2xl">
                            Adicionar local
                          </Button>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="text-xs font-semibold text-slate-900">Política</div>
                          <div className="mt-3 grid gap-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-[11px] font-semibold text-slate-700">Raio (m)</div>
                                <Input
                                  value={policyEffective.radius_meters}
                                  onChange={(e) =>
                                    setPolicyDraft((prev) => ({ ...(prev ?? policyEffective), radius_meters: e.target.value }))
                                  }
                                  className="mt-1 rounded-2xl"
                                />
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold text-slate-700">Tolerância (min)</div>
                                <Input
                                  value={policyEffective.lateness_tolerance_minutes}
                                  onChange={(e) =>
                                    setPolicyDraft((prev) => ({ ...(prev ?? policyEffective), lateness_tolerance_minutes: e.target.value }))
                                  }
                                  className="mt-1 rounded-2xl"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setPolicyDraft((prev) => ({
                                    ...(prev ?? policyEffective),
                                    break_required: !Boolean((prev ?? policyEffective).break_required),
                                  }))
                                }
                                className={cn(
                                  "rounded-2xl border px-3 py-2 text-left",
                                  policyEffective.break_required
                                    ? "border-emerald-200 bg-emerald-50"
                                    : "border-slate-200 bg-slate-50"
                                )}
                              >
                                <div className="text-xs font-semibold text-slate-900">Intervalo obrigatório</div>
                                <div className="mt-0.5 text-[11px] text-slate-600">
                                  {policyEffective.break_required ? "sim" : "não"}
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setPolicyDraft((prev) => ({
                                    ...(prev ?? policyEffective),
                                    allow_outside_radius: !Boolean((prev ?? policyEffective).allow_outside_radius),
                                  }))
                                }
                                className={cn(
                                  "rounded-2xl border px-3 py-2 text-left",
                                  policyEffective.allow_outside_radius
                                    ? "border-slate-200 bg-slate-50"
                                    : "border-rose-200 bg-rose-50"
                                )}
                              >
                                <div className="text-xs font-semibold text-slate-900">Permitir fora do raio</div>
                                <div className="mt-0.5 text-[11px] text-slate-600">
                                  {policyEffective.allow_outside_radius ? "sim (com exceção)" : "não"}
                                </div>
                              </button>
                            </div>

                            <Button
                              onClick={savePolicy}
                              className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                            >
                              Salvar política
                            </Button>
                            <div className="text-[11px] text-slate-500">
                              Observação: o sistema <span className="font-semibold">nunca bloqueia</span> a batida fora do raio.
                            </div>
                          </div>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                )}
              </div>
            </div>

            {!presenceEnabled && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Presença não está habilitada para este tenant (flag <span className="font-mono">presence_enabled</span>).
              </div>
            )}

            <div className="mt-5 overflow-x-auto">
              <div className="flex min-w-[980px] gap-4 pb-1">
                {columns.map((col) => (
                  <div key={col.key} className="w-[320px] shrink-0">
                    <ColumnHeader icon={col.icon} title={col.title} count={col.list.length} tone={col.tone} />
                    <div className="mt-3 space-y-3">
                      {col.list.map((c) => {
                        const lastPunch = lastPunchByCase.get(c.id) ?? null;
                        const pend = pendStatsByCase.get(c.id) ?? { openAny: 0, openRequired: 0 };
                        return (
                          <Sheet key={c.id} open={openCaseId === c.id} onOpenChange={(v) => setOpenCaseId(v ? c.id : null)}>
                            <SheetTrigger asChild>
                              <div>
                                <CaseCard
                                  c={c}
                                  lastPunch={lastPunch}
                                  openAny={pend.openAny}
                                  openRequired={pend.openRequired}
                                  onOpen={() => setOpenCaseId(c.id)}
                                />
                              </div>
                            </SheetTrigger>
                            <SheetContent className="w-full sm:max-w-[720px]">
                              <SheetHeader>
                                <SheetTitle>Presença do dia</SheetTitle>
                              </SheetHeader>

                              <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-semibold text-slate-900">
                                    {(c.meta_json?.presence?.employee_label as string | undefined) ?? shortId(c.entity_id)}
                                  </div>
                                  <Badge className="rounded-full border-0 bg-white text-slate-800 ring-1 ring-slate-200">
                                    {titleizeCaseState(c.state)}
                                  </Badge>
                                </div>
                                <div className="text-xs text-slate-600">case_id: {c.id}</div>
                              </div>

                              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                  <div className="text-xs font-semibold text-slate-900">Batidas</div>
                                  <div className="mt-2 space-y-2">
                                    {(caseDetailQ.data?.punches ?? []).map((p: any) => (
                                      <div key={p.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold text-slate-900">{titleizePunchType(p.type)}</div>
                                          <div className="mt-0.5 text-[11px] text-slate-600">
                                            {new Date(p.timestamp).toLocaleTimeString()} • {p.source} • {p.status}
                                          </div>
                                        </div>
                                        <div className="text-right text-[11px] text-slate-600">
                                          {typeof p.distance_from_location === "number" ? `${Math.round(p.distance_from_location)}m` : "—"}
                                        </div>
                                      </div>
                                    ))}
                                    {!caseDetailQ.data?.punches?.length && (
                                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3 text-sm text-slate-600">
                                        Sem batidas.
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                  <div className="text-xs font-semibold text-slate-900">Pendências</div>
                                  <div className="mt-2 space-y-2">
                                    {(caseDetailQ.data?.pendencies ?? []).map((p: any) => (
                                      <div key={p.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="text-xs font-semibold text-slate-900">{p.question_text}</div>
                                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
                                          <span>{p.type}</span>
                                          <span className={cn(p.status === "open" ? "text-amber-700" : "text-emerald-700")}>
                                            {p.status}
                                          </span>
                                        </div>
                                        {p.answered_text && (
                                          <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                                            {p.answered_text}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                    {!caseDetailQ.data?.pendencies?.length && (
                                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3 text-sm text-slate-600">
                                        Sem pendências.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs font-semibold text-slate-900">Timeline</div>
                                  <div className="text-[11px] text-slate-500">{caseDetailQ.data?.timeline?.length ?? 0}</div>
                                </div>
                                <ScrollArea className="mt-2 h-[220px]">
                                  <div className="space-y-2 pr-3">
                                    {(caseDetailQ.data?.timeline ?? []).map((t: any) => (
                                      <div key={t.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="text-[11px] font-semibold text-slate-800">{t.event_type}</div>
                                          <div className="text-[11px] text-slate-500">
                                            {new Date(t.occurred_at).toLocaleTimeString()}
                                          </div>
                                        </div>
                                        {t.message && <div className="mt-1 text-sm text-slate-800">{t.message}</div>}
                                      </div>
                                    ))}
                                  </div>
                                </ScrollArea>
                              </div>

                              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="text-xs font-semibold text-slate-900">Ações humanas</div>
                                    <div className="mt-0.5 text-[11px] text-slate-600">
                                      Somente gestores podem fechar. Ajustes/saldo não são automáticos.
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Textarea
                                      value={closeNote}
                                      onChange={(e) => setCloseNote(e.target.value)}
                                      className="min-h-[40px] w-[280px] rounded-2xl bg-white"
                                      placeholder="Nota (opcional)"
                                    />
                                    <Button
                                      onClick={closeDay}
                                      disabled={closing || !manager || c.state === "FECHADO"}
                                      className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                                    >
                                      {closing ? "Fechando…" : "Fechar dia"}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </SheetContent>
                          </Sheet>
                        );
                      })}

                      {!col.list.length && (
                        <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                          Nenhum case aqui.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(casesQ.isError || punchesQ.isError || pendQ.isError) && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                Erro ao carregar: {(casesQ.error as any)?.message ?? (punchesQ.error as any)?.message ?? (pendQ.error as any)?.message ?? ""}
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <span className="font-semibold">Dica:</span> para WhatsApp clocking, habilite a flag <span className="font-mono">presence_allow_whatsapp_clocking</span> na config da jornada.
            </div>
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}