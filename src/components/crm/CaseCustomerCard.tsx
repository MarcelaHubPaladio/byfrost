import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Phone, UserRound, Mail, Link2, ExternalLink, MapPin, Plus, Check, ChevronsUpDown } from "lucide-react";
import { useSession } from "@/providers/SessionProvider";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type CustomerRow = {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  phone_e164: string;
  name: string | null;
  email: string | null;
  deleted_at: string | null;
  meta_json?: any;
};

function normalizePhoneLoose(v: string) {
  const s = (v ?? "").trim();
  if (!s) return "";
  if (s.startsWith("+")) return s;
  const digits = s.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export function CaseCustomerCard(props: {
  tenantId: string;
  caseId: string;
  customerId: string | null;
  assignedUserId: string | null;
  suggestedPhone?: string | null;
}) {
  const qc = useQueryClient();
  const { user } = useSession();
  const [saving, setSaving] = useState(false);

  const [entityHandling, setEntityHandling] = useState<"none" | "create" | "link">("none");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [searchEntity, setSearchEntity] = useState("");
  const [openEntity, setOpenEntity] = useState(false);
  const [debouncedSearchEntity, setDebouncedSearchEntity] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchEntity(searchEntity), 300);
    return () => clearTimeout(t);
  }, [searchEntity]);

  const entitiesQ = useQuery({
    queryKey: ["crm_parties_search", props.tenantId, debouncedSearchEntity],
    enabled: Boolean(props.tenantId && entityHandling === "link"),
    queryFn: async () => {
      let q = supabase
        .from("core_entities")
        .select("id, display_name")
        .eq("tenant_id", props.tenantId)
        .in("entity_type", ["party", "tenant"])
        .is("deleted_at", null)
        .order("display_name", { ascending: true })
        .limit(20);

      if (debouncedSearchEntity) {
        q = q.ilike("display_name", `%${debouncedSearchEntity}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const customerQ = useQuery({
    queryKey: ["customer_account", props.tenantId, props.customerId],
    enabled: Boolean(props.tenantId && props.customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_accounts")
        .select("id,tenant_id,entity_id,phone_e164,name,email,deleted_at,meta_json")
        .eq("tenant_id", props.tenantId)
        .eq("id", props.customerId!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CustomerRow | null;
    },
  });

  const initialDraft = useMemo(() => {
    const c = customerQ.data;
    return {
      phone: c?.phone_e164 ?? normalizePhoneLoose(props.suggestedPhone ?? ""),
      name: c?.name ?? "",
      email: c?.email ?? "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerQ.data?.id, props.suggestedPhone]);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    setPhone(initialDraft.phone);
    setName(initialDraft.name);
    setEmail(initialDraft.email);
  }, [initialDraft.phone, initialDraft.name, initialDraft.email]);

  const logTimeline = async (message: string, meta_json: any = {}) => {
    await supabase.from("timeline_events").insert({
      tenant_id: props.tenantId,
      case_id: props.caseId,
      event_type: "customer_updated",
      actor_type: "admin",
      actor_id: user?.id ?? null,
      message,
      meta_json,
      occurred_at: new Date().toISOString(),
    });
  };

  const entityId = customerQ.data?.entity_id ?? null;

  const save = async () => {
    const p = normalizePhoneLoose(phone);
    if (!p) {
      showError("Informe o WhatsApp do cliente (ex: +5541999999999). ");
      return;
    }

    setSaving(true);
    try {
      let finalEntityId: string | null = entityId;

      if (entityHandling === "create") {
        const { data: entityRes, error: entityErr } = await supabase.from("core_entities").insert({
          tenant_id: props.tenantId,
          entity_type: "party",
          subtype: "cliente",
          display_name: name.trim() || phone,
          status: "active",
          metadata: {
            source: "crm_manual_detail",
            whatsapp: phone.replace(/\D/g, ""),
            email: email.trim().toLowerCase() || null,
          }
        }).select("id").single();
        if (entityErr) throw entityErr;
        finalEntityId = entityRes.id;
      } else if (entityHandling === "link" && selectedEntityId) {
        finalEntityId = selectedEntityId;
      }

      // 1) Se já existe customer_id, só atualiza.
      if (props.customerId) {
        const { error } = await supabase
          .from("customer_accounts")
          .update({
            phone_e164: p,
            name: name.trim() || null,
            email: email.trim() || null,
            entity_id: finalEntityId,
            meta_json: {
              ...(customerQ.data?.meta_json || {}),
              email: email.trim() || null,
            }
          })
          .eq("tenant_id", props.tenantId)
          .eq("id", props.customerId);
        if (error) throw error;

        // Sincroniza também no case para garantir atualização do header
        if (finalEntityId) {
          await supabase
            .from("cases")
            .update({ customer_entity_id: finalEntityId })
            .eq("tenant_id", props.tenantId)
            .eq("id", props.caseId);
        }

        await logTimeline("Dados do cliente atualizados.", {
          action: "updated",
          customer_id: props.customerId,
          phone_e164: p,
          name: name.trim() || null,
          email: email.trim() || null,
          entity_id: finalEntityId,
        });

        showSuccess("Cliente atualizado.");
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["customer_account", props.tenantId, props.customerId] }),
          qc.invalidateQueries({ queryKey: ["case", props.tenantId, props.caseId] }),
          qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
        ]);
        setEntityHandling("none");
        setSelectedEntityId(null);
        return;
      }

      // 2) Se não existe, tenta reutilizar por telefone.
      const { data: existing, error: findErr } = await supabase
        .from("customer_accounts")
        .select("id")
        .eq("tenant_id", props.tenantId)
        .eq("phone_e164", p)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (findErr) throw findErr;

      const createdNew = !existing?.id;

      const idToLink = existing?.id
        ? (existing.id as string)
        : (
          await (async () => {
            const { data: created, error: createErr } = await supabase
              .from("customer_accounts")
              .insert({
                tenant_id: props.tenantId,
                phone_e164: p,
                name: name.trim() || null,
                email: email.trim() || null,
                assigned_user_id: props.assignedUserId,
                meta_json: {},
              })
              .select("id")
              .single();
            if (createErr) throw createErr;
            return created.id as string;
          })()
        );

      // 3) Vincula no case
      const { error: linkErr } = await supabase
        .from("cases")
        .update({ 
          customer_id: idToLink,
          customer_entity_id: finalEntityId 
        })
        .eq("tenant_id", props.tenantId)
        .eq("id", props.caseId);
      if (linkErr) throw linkErr;

      if (finalEntityId) {
        await supabase
          .from("customer_accounts")
          .update({ entity_id: finalEntityId })
          .eq("tenant_id", props.tenantId)
          .eq("id", idToLink);
      }

      await logTimeline(createdNew ? "Cliente criado e vinculado ao case." : "Cliente vinculado ao case.", {
        action: createdNew ? "created_and_linked" : "linked",
        customer_id: idToLink,
        phone_e164: p,
      });

      showSuccess(existing?.id ? "Cliente vinculado ao case." : "Cliente criado e vinculado ao case.");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["customer_account", props.tenantId, idToLink] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
      ]);
      setEntityHandling("none");
      setSelectedEntityId(null);
    } catch (e: any) {
      showError(`Falha ao salvar cliente: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };


  return (
    <Card className="rounded-[22px] border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
              <UserRound className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Cliente</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                {props.customerId ? (
                  <span className="inline-flex items-center gap-1">
                    <Link2 className="h-3.5 w-3.5" /> vinculado
                  </span>
                ) : (
                  "não vinculado"
                )}

                {entityId ? (
                  <Link
                    to={`/app/entities/${encodeURIComponent(entityId)}`}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50"
                    title="Abrir entidade"
                  >
                    entidade <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={save}
          disabled={saving}
          className={cn(
            "h-10 rounded-2xl px-4 text-white",
            "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
          )}
        >
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      {customerQ.isError && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Erro ao carregar cliente: {(customerQ.error as any)?.message ?? ""}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <Label className="text-xs">WhatsApp</Label>
          <div className="relative mt-1">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11 rounded-2xl pl-10"
              placeholder="+5541999999999"
            />
          </div>
        </div>

        <div className="sm:col-span-1">
          <Label className="text-xs">Nome</Label>
          <div className="relative mt-1">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-2xl pl-10"
              placeholder="Ex: Maria Souza"
            />
          </div>
        </div>

        <div className="sm:col-span-1">
          <Label className="text-xs">Email</Label>
          <div className="relative mt-1">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-2xl pl-10"
              placeholder="email@exemplo.com"
            />
          </div>
        </div>
      </div>

      {!entityId && (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
          <Label className="mb-3 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Vínculo de Entidade</Label>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={entityHandling === "none" ? "default" : "outline"}
              className={cn("h-9 rounded-xl px-4 text-xs font-medium", entityHandling === "none" ? "bg-slate-900 text-white" : "border-slate-200 bg-white")}
              onClick={() => {
                setEntityHandling("none");
                setSelectedEntityId(null);
              }}
            >
              Não vincular
            </Button>
            <Button
              type="button"
              variant={entityHandling === "create" ? "default" : "outline"}
              className={cn("h-9 rounded-xl px-4 text-xs font-medium", entityHandling === "create" ? "bg-slate-900 text-white" : "border-slate-200 bg-white")}
              onClick={() => {
                setEntityHandling("create");
                setSelectedEntityId(null);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Criar entidade
            </Button>
            <Button
              type="button"
              variant={entityHandling === "link" ? "default" : "outline"}
              className={cn("h-9 rounded-xl px-4 text-xs font-medium", entityHandling === "link" ? "bg-slate-900 text-white" : "border-slate-200 bg-white")}
              onClick={() => setEntityHandling("link")}
            >
              Existente
            </Button>
          </div>

          {entityHandling === "link" && (
            <Popover open={openEntity} onOpenChange={setOpenEntity}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openEntity}
                  className="flex h-11 w-full items-center justify-between rounded-2xl border-slate-200 bg-white px-4 text-sm font-normal text-slate-900"
                >
                  <div className="truncate">
                    {selectedEntityId
                      ? entitiesQ.data?.find(e => e.id === selectedEntityId)?.display_name || "Entidade selecionada"
                      : <span className="text-slate-400">Selecione uma entidade...</span>}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] rounded-2xl p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Buscar entidade..."
                    value={searchEntity}
                    onValueChange={setSearchEntity}
                    className="h-11 border-none focus:ring-0"
                  />
                  <CommandList className="max-h-[250px]">
                    <CommandEmpty>
                      <div className="p-4 text-center text-sm text-slate-500">
                        Nenhuma entidade encontrada.
                      </div>
                    </CommandEmpty>
                    {entitiesQ.data?.map((ent) => (
                      <CommandItem
                        key={ent.id}
                        value={ent.id}
                        onSelect={() => {
                          setSelectedEntityId(ent.id);
                          setOpenEntity(false);
                        }}
                        className="m-1 rounded-xl"
                      >
                        <Check className={cn("mr-2 h-4 w-4 text-emerald-600", selectedEntityId === ent.id ? "opacity-100" : "opacity-0")} />
                        {ent.display_name}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      {(customerQ.data?.meta_json?.latitude || customerQ.data?.meta_json?.longitude) && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-tight text-slate-500">Localização Fixada</div>
            <div className="mt-0.5 truncate font-mono text-xs text-slate-600">
              {customerQ.data.meta_json.latitude?.toFixed(6) ?? "0"}, {customerQ.data.meta_json.longitude?.toFixed(6) ?? "0"}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => {
              const lat = customerQ.data?.meta_json?.latitude;
              const lng = customerQ.data?.meta_json?.longitude;
              window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
            }}
          >
            Abrir Mapa
          </Button>
        </div>
      )}

      <div className="mt-3 text-[11px] text-slate-500">
        Dica: ao salvar, o cliente do CRM também fica sincronizado com o módulo Entidades (core_entities).
      </div>
    </Card>
  );
}