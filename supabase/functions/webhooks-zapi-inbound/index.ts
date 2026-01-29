import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizePhoneE164Like } from "../_shared/normalize.ts";

type InboundType = "text" | "image" | "audio" | "location";

type JourneyInfo = {
  id: string;
  key: string;
  name?: string;
  default_state_machine_json?: any;
};

function pickFirst<T>(...values: Array<T | null | undefined>): T | null {
  for (const v of values) if (v !== null && v !== undefined && v !== "") return v as T;
  return null;
}

function normalizeInbound(payload: any): {
  zapiInstanceId: string | null;
  type: InboundType;
  from: string | null;
  to: string | null;
  text: string | null;
  mediaUrl: string | null;
  location: { lat: number; lng: number } | null;
  raw: any;
} {
  const zapiInstanceId = pickFirst<string>(payload?.instanceId, payload?.instance_id, payload?.instance);

  const rawType = String(
    pickFirst(
      payload?.type,
      payload?.messageType,
      payload?.data?.type,
      payload?.data?.messageType,
      payload?.message?.type
    ) ?? "text"
  ).toLowerCase();

  const type: InboundType =
    rawType.includes("image") || rawType.includes("photo")
      ? "image"
      : rawType.includes("audio") || rawType.includes("ptt")
        ? "audio"
        : rawType.includes("location")
          ? "location"
          : "text";

  const from = normalizePhoneE164Like(
    pickFirst(payload?.from, payload?.data?.from, payload?.sender?.phone, payload?.phone)
  );
  const to = normalizePhoneE164Like(pickFirst(payload?.to, payload?.data?.to));

  const text = pickFirst<string>(
    payload?.text,
    payload?.body,
    payload?.message,
    payload?.data?.text,
    payload?.data?.body,
    payload?.data?.message
  );

  const mediaUrl = pickFirst<string>(
    payload?.mediaUrl,
    payload?.media_url,
    payload?.url,
    payload?.data?.mediaUrl,
    payload?.data?.url,
    payload?.data?.media_url
  );

  const latRaw = pickFirst(
    payload?.latitude,
    payload?.data?.latitude,
    payload?.location?.latitude,
    payload?.data?.location?.latitude
  );
  const lngRaw = pickFirst(
    payload?.longitude,
    payload?.data?.longitude,
    payload?.location?.longitude,
    payload?.data?.location?.longitude
  );

  const location =
    type === "location" && latRaw != null && lngRaw != null
      ? { lat: Number(latRaw), lng: Number(lngRaw) }
      : null;

  return {
    zapiInstanceId,
    type,
    from,
    to,
    text: text ?? null,
    mediaUrl: mediaUrl ?? null,
    location,
    raw: payload,
  };
}

function safeStates(j: JourneyInfo | null | undefined) {
  const st = (j?.default_state_machine_json?.states ?? []) as any[];
  return Array.isArray(st) ? st.map((s) => String(s)).filter(Boolean) : [];
}

function pickInitialState(j: JourneyInfo, hint: string | null) {
  const states = safeStates(j);
  const def = String(j?.default_state_machine_json?.default ?? "new");
  if (hint && states.includes(hint)) return hint;
  if (states.includes(def)) return def;
  return states[0] ?? def;
}

serve(async (req) => {
  const fn = "webhooks-zapi-inbound";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
    }

    const normalized = normalizeInbound(payload);
    if (!normalized.zapiInstanceId) {
      console.warn(`[${fn}] Missing instance id`, { keys: Object.keys(payload ?? {}) });
      return new Response("Missing instanceId", { status: 400, headers: corsHeaders });
    }

    const secretHeader = req.headers.get("x-webhook-secret") ?? req.headers.get("x-byfrost-webhook-secret");
    const secretQuery = new URL(req.url).searchParams.get("secret");
    const providedSecret = secretHeader ?? secretQuery;

    const supabase = createSupabaseAdmin();

    const { data: instance, error: instErr } = await supabase
      .from("wa_instances")
      .select("id, tenant_id, webhook_secret, default_journey_id")
      .eq("zapi_instance_id", normalized.zapiInstanceId)
      .maybeSingle();

    if (instErr) {
      console.error(`[${fn}] Failed to load wa_instance`, { instErr });
      return new Response("Failed to load instance", { status: 500, headers: corsHeaders });
    }

    if (!instance) {
      return new Response("Unknown instance", { status: 404, headers: corsHeaders });
    }

    if (!providedSecret || providedSecret !== instance.webhook_secret) {
      console.warn(`[${fn}] Invalid webhook secret`, { hasProvided: Boolean(providedSecret) });
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const correlationId = String(payload?.correlation_id ?? crypto.randomUUID());

    // Write inbound message
    const { error: msgErr } = await supabase.from("wa_messages").insert({
      tenant_id: instance.tenant_id,
      instance_id: instance.id,
      direction: "inbound",
      from_phone: normalized.from,
      to_phone: normalized.to,
      type: normalized.type,
      body_text: normalized.text,
      media_url: normalized.mediaUrl,
      payload_json: payload,
      correlation_id: correlationId,
      occurred_at: new Date().toISOString(),
    });

    if (msgErr) {
      console.error(`[${fn}] Failed to insert wa_message`, { msgErr });
      return new Response("Failed to insert message", { status: 500, headers: corsHeaders });
    }

    // Usage event
    await supabase.from("usage_events").insert({
      tenant_id: instance.tenant_id,
      type: "message",
      qty: 1,
      ref_type: "wa_message",
      meta_json: { direction: "inbound", wa_type: normalized.type },
      occurred_at: new Date().toISOString(),
    });

    // Vendor identification (by WhatsApp number)
    let vendorId: string | null = null;
    if (normalized.from) {
      const { data: vendor } = await supabase
        .from("vendors")
        .select("id")
        .eq("tenant_id", instance.tenant_id)
        .eq("phone_e164", normalized.from)
        .maybeSingle();
      if (vendor?.id) vendorId = vendor.id;
      if (!vendorId) {
        const { data: createdVendor, error: vErr } = await supabase
          .from("vendors")
          .insert({
            tenant_id: instance.tenant_id,
            phone_e164: normalized.from,
            display_name: payload?.senderName ?? payload?.sender?.name ?? null,
            active: true,
          })
          .select("id")
          .single();
        if (vErr) console.error(`[${fn}] Failed to create vendor`, { vErr });
        vendorId = createdVendor?.id ?? null;
      }
    }

    // Journey routing:
    // 1) instance.default_journey_id (if set)
    // 2) first enabled tenant_journey
    // 3) fallback to sales_order
    let journey: JourneyInfo | null = null;

    if (instance.default_journey_id) {
      const { data: j } = await supabase
        .from("journeys")
        .select("id,key,name,default_state_machine_json")
        .eq("id", instance.default_journey_id)
        .maybeSingle();
      if (j?.id) journey = j as any;
    }

    if (!journey) {
      const { data: tj } = await supabase
        .from("tenant_journeys")
        .select("journey_id, journeys(id,key,name,default_state_machine_json)")
        .eq("tenant_id", instance.tenant_id)
        .eq("enabled", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (tj?.journeys?.id) journey = tj.journeys as any;
    }

    if (!journey) {
      const { data: j } = await supabase
        .from("journeys")
        .select("id,key,name,default_state_machine_json")
        .eq("key", "sales_order")
        .maybeSingle();
      if (j?.id) journey = j as any;
    }

    if (!journey) {
      console.error(`[${fn}] No journey available for routing`, { tenantId: instance.tenant_id });
      return new Response("Journey not configured", { status: 500, headers: corsHeaders });
    }

    const enqueueJob = async (type: string, idempotencyKey: string, payloadJson: any) => {
      const { error } = await supabase.from("job_queue").insert({
        tenant_id: instance.tenant_id,
        type,
        idempotency_key: idempotencyKey,
        payload_json: payloadJson,
        status: "pending",
        run_after: new Date().toISOString(),
      });
      // Ignore conflict (idempotency)
      if (error && !String(error.message ?? "").toLowerCase().includes("duplicate")) {
        console.error(`[${fn}] Failed to enqueue job`, { type, error });
      }
    };

    const findLatestCaseForVendor = async () => {
      if (!vendorId) return null;
      const { data } = await supabase
        .from("cases")
        .select("id,state")
        .eq("tenant_id", instance.tenant_id)
        .eq("journey_id", journey!.id)
        .eq("assigned_vendor_id", vendorId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as any) ?? null;
    };

    // Routing
    if (normalized.type === "image") {
      if (!vendorId) {
        return new Response("Missing vendor phone", { status: 400, headers: corsHeaders });
      }

      const initial = pickInitialState(journey, "awaiting_ocr");

      const { data: createdCase, error: cErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: instance.tenant_id,
          journey_id: journey.id,
          case_type: "order",
          status: "in_progress",
          state: initial,
          created_by_channel: "whatsapp",
          created_by_vendor_id: vendorId,
          assigned_vendor_id: vendorId,
          title: journey.key === "sales_order" ? "Pedido (foto recebida)" : `Novo caso (${journey.name ?? journey.key})`,
          meta_json: { correlation_id: correlationId, journey_key: journey.key, photo_attempt: 1 },
        })
        .select("id")
        .single();

      if (cErr || !createdCase) {
        console.error(`[${fn}] Failed to create case`, { cErr });
        return new Response("Failed to create case", { status: 500, headers: corsHeaders });
      }

      if (normalized.mediaUrl) {
        await supabase.from("case_attachments").insert({
          tenant_id: instance.tenant_id,
          case_id: createdCase.id,
          kind: "image",
          storage_path: normalized.mediaUrl,
          original_filename: payload?.fileName ?? null,
          content_type: payload?.mimeType ?? null,
          meta_json: { source: "zapi" },
        });
      }

      await supabase.from("timeline_events").insert({
        tenant_id: instance.tenant_id,
        case_id: createdCase.id,
        event_type: "inbound_image",
        actor_type: "vendor",
        actor_id: vendorId,
        message:
          journey.key === "sales_order"
            ? "Foto do pedido recebida. Iniciando OCR e validações."
            : "Imagem recebida via WhatsApp.",
        meta_json: { correlation_id: correlationId, journey_key: journey.key },
        occurred_at: new Date().toISOString(),
      });

      if (journey.key === "sales_order") {
        // Initial pendencies (legacy flow)
        await supabase.from("pendencies").insert([
          {
            tenant_id: instance.tenant_id,
            case_id: createdCase.id,
            type: "need_location",
            assigned_to_role: "vendor",
            question_text: "Envie sua localização (WhatsApp: Compartilhar localização). Sem isso não conseguimos registrar o pedido.",
            required: true,
            status: "open",
            due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          },
          {
            tenant_id: instance.tenant_id,
            case_id: createdCase.id,
            type: "need_more_pages",
            assigned_to_role: "vendor",
            question_text: "Tem mais alguma folha desse pedido? Se sim, envie as próximas fotos. Se não, responda: última folha.",
            required: false,
            status: "open",
            due_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          },
        ]);

        await enqueueJob("OCR_IMAGE", `OCR_IMAGE:${createdCase.id}`, {
          case_id: createdCase.id,
          correlation_id: correlationId,
        });
        await enqueueJob("VALIDATE_FIELDS", `VALIDATE_FIELDS:${createdCase.id}`, {
          case_id: createdCase.id,
          correlation_id: correlationId,
        });
        await enqueueJob("ASK_PENDENCIES", `ASK_PENDENCIES:${createdCase.id}:${Date.now()}`, {
          case_id: createdCase.id,
          correlation_id: correlationId,
        });
      }

      await supabase.rpc("append_audit_ledger", {
        p_tenant_id: instance.tenant_id,
        p_payload: {
          kind: "wa_inbound_routed",
          correlation_id: correlationId,
          case_id: createdCase.id,
          from: normalized.from,
          instance: normalized.zapiInstanceId,
          journey_id: journey.id,
          journey_key: journey.key,
        },
      });

      return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, case_id: createdCase.id, journey_id: journey.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (normalized.type === "location") {
      if (!vendorId || !normalized.location) {
        return new Response("Missing vendor or location", { status: 400, headers: corsHeaders });
      }

      const openCase = await findLatestCaseForVendor();
      if (!openCase?.id) {
        return new Response(JSON.stringify({ ok: true, note: "No open case" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("case_fields").upsert({
        tenant_id: instance.tenant_id,
        case_id: openCase.id,
        key: "location",
        value_json: normalized.location,
        value_text: `${normalized.location.lat},${normalized.location.lng}`,
        confidence: 1,
        source: "vendor",
        last_updated_by: "whatsapp_location",
      });

      // only sales_order has the need_location pendency by default
      await supabase
        .from("pendencies")
        .update({ status: "answered", answered_text: "Localização enviada", answered_payload_json: normalized.location })
        .eq("tenant_id", instance.tenant_id)
        .eq("case_id", openCase.id)
        .eq("type", "need_location")
        .eq("status", "open");

      await supabase.from("timeline_events").insert({
        tenant_id: instance.tenant_id,
        case_id: openCase.id,
        event_type: "location_received",
        actor_type: "vendor",
        actor_id: vendorId,
        message: "Localização recebida via WhatsApp.",
        meta_json: { correlation_id: correlationId, ...normalized.location, journey_key: journey.key },
        occurred_at: new Date().toISOString(),
      });

      const nextState = pickInitialState(journey, "ready_for_review");
      await supabase.from("cases").update({ state: nextState }).eq("id", openCase.id);

      return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, case_id: openCase.id, journey_id: journey.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // text/audio
    if (normalized.type === "text" || normalized.type === "audio") {
      if (!vendorId) {
        return new Response(JSON.stringify({ ok: true, note: "No vendor" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const openCase = await findLatestCaseForVendor();
      if (!openCase?.id) {
        return new Response(JSON.stringify({ ok: true, note: "No open case" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const answerText = normalized.type === "audio" ? "(áudio recebido - transcrição pendente)" : normalized.text;

      if (journey.key === "sales_order") {
        // Answer the oldest open vendor pendency (legacy flow)
        const { data: pendency } = await supabase
          .from("pendencies")
          .select("id")
          .eq("tenant_id", instance.tenant_id)
          .eq("case_id", openCase.id)
          .eq("assigned_to_role", "vendor")
          .eq("status", "open")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (pendency?.id) {
          await supabase
            .from("pendencies")
            .update({ status: "answered", answered_text: answerText, answered_payload_json: payload })
            .eq("id", pendency.id);
        }

        await enqueueJob("VALIDATE_FIELDS", `VALIDATE_FIELDS:${openCase.id}:${Date.now()}`, {
          case_id: openCase.id,
          correlation_id: correlationId,
        });
        await enqueueJob("ASK_PENDENCIES", `ASK_PENDENCIES:${openCase.id}:${Date.now()}`, {
          case_id: openCase.id,
          correlation_id: correlationId,
        });
      }

      await supabase.from("timeline_events").insert({
        tenant_id: instance.tenant_id,
        case_id: openCase.id,
        event_type: "vendor_reply",
        actor_type: "vendor",
        actor_id: vendorId,
        message: `Mensagem do vendedor recebida${normalized.type === "audio" ? " (áudio)" : ""}.`,
        meta_json: { correlation_id: correlationId, journey_key: journey.key },
        occurred_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, case_id: openCase.id, journey_id: journey.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, note: "Ignored" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[webhooks-zapi-inbound] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});