import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizePhoneE164Like } from "../_shared/normalize.ts";
import { fetchAsBase64 } from "../_shared/crypto.ts";

function toDigits(s: string) {
  return (s ?? "").replace(/\D/g, "");
}

function normalizeLine(s: string) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function parsePtBrMoneyToNumber(value: string) {
  // "16.029,00" -> 16029.00
  const v = (value ?? "").trim();
  if (!v) return null;
  const cleaned = v.replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function extractFieldsFromText(text: string) {
  // IMPORTANT: OCR text can contain multiple fields on the same line (forms).
  // Prefer "label -> value" parsing line-by-line; avoid generic digit matches (which often capture dates).
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const pickByLineRegex = (re: RegExp) => {
    for (const line of lines) {
      const m = line.match(re);
      if (m?.[1]) return normalizeLine(m[1]);
    }
    return null;
  };

  // --- Name ---
  let name = pickByLineRegex(/\bnome\b\s*[:\-]?\s*(.+)/i);
  if (name) {
    // remove trailing "Código do Cliente" (often appears on same line)
    name = name.replace(/\bc[oó]digo\s+do\s+cliente\b.*$/i, "").trim();
    // If we still have a stray label on the tail, cut at common ones
    name = name.replace(/\b(e-?mail|end(er|e)en?c?o|telefone|data|cpf|cnpj|rg)\b.*$/i, "").trim();
    if (name.length > 80) name = name.slice(0, 80).trim();
  }

  // --- Document numbers ---
  // CPF (11 digits) or CNPJ (14 digits) often appears as "CPF/CNPJ: ..."
  const cpfCnpjRaw =
    pickByLineRegex(/\bcpf\s*\/?\s*cnpj\b\s*[:\-]?\s*([0-9\.\/-]{11,18})/i) ??
    pickByLineRegex(/\bcnpj\b\s*[:\-]?\s*([0-9\.\/-]{11,18})/i) ??
    pickByLineRegex(/\bcpf\b\s*[:\-]?\s*([0-9\.\/-]{11,18})/i);

  const cpfCnpjDigits = cpfCnpjRaw ? toDigits(cpfCnpjRaw) : null;
  const cpf = cpfCnpjDigits && cpfCnpjDigits.length === 11 ? cpfCnpjDigits : null;

  // RG: only accept if explicitly labeled as RG (avoid picking dates)
  const rgRaw = pickByLineRegex(/\brg\b\s*[:\-]?\s*([0-9\.\-]{6,14})/i);
  const rg = rgRaw ? toDigits(rgRaw) : null;

  // --- Dates ---
  const birth_date_text = pickByLineRegex(
    /\bdata\s+de\s+nascimento\b\s*[:\-]?\s*(\d{1,2}\s*[\/\-]\s*\d{1,2}\s*[\/\-]\s*\d{2,4})/i
  );

  // Order date (useful later)
  const order_date_text = pickByLineRegex(
    /\bdata\b\s*[:\-]?\s*(\d{1,2}\s*[\/\-]\s*\d{1,2}\s*[\/\-]\s*\d{2,4})/i
  );

  // --- Phone ---
  // Only accept phone if explicitly labeled to avoid grabbing dates like 28/01/2026
  const phoneLabeled = pickByLineRegex(/\btelefone\b\s*[:\-]?\s*(.+)/i);
  let phone_raw: string | null = null;
  if (phoneLabeled) {
    // Typical: (42) 9 8871-0710
    const m = phoneLabeled.match(/(\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4})/);
    phone_raw = m?.[1] ? normalizeLine(m[1]) : null;
  }

  // --- Total ---
  // In many forms, there is no "R$" prefix. Pick the largest pt-BR money-like value.
  const moneyMatches = Array.from(String(text ?? "").matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/g));
  let bestMoney: { raw: string; value: number } | null = null;
  for (const mm of moneyMatches) {
    const raw = mm?.[1] ?? "";
    const n = parsePtBrMoneyToNumber(raw);
    if (n === null) continue;
    if (!bestMoney || n > bestMoney.value) bestMoney = { raw, value: n };
  }
  const total_raw = bestMoney ? `R$ ${bestMoney.raw}` : null;

  const signaturePresent = /assinatura/i.test(text);

  return {
    name,
    cpf,
    rg,
    birth_date_text,
    order_date_text,
    phone_raw,
    total_raw,
    signaturePresent,
  };
}

async function runOcrGoogleVision(input: { imageUrl?: string | null; imageBase64?: string | null }) {
  const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";
  if (!apiKey) return { ok: false as const, error: "Missing GOOGLE_VISION_API_KEY" };

  const imageUrl = input.imageUrl ?? null;
  const imageBase64 = input.imageBase64 ?? null;

  if (!imageUrl && !imageBase64) {
    return { ok: false as const, error: "Missing mediaUrl/mediaBase64" };
  }

  const content = imageBase64 ?? (await fetchAsBase64(imageUrl!));

  const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
  const visionReq = {
    requests: [
      {
        image: { content },
        imageContext: {
          // Helps with PT-BR forms (labels like "Telefone", "Data", "Código do Cliente")
          languageHints: ["pt"],
        },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      },
    ],
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(visionReq),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) return { ok: false as const, error: `Vision API error: ${res.status}`, raw: json };
  const annotation = json?.responses?.[0]?.fullTextAnnotation;
  return { ok: true as const, text: annotation?.text ?? "", raw: json?.responses?.[0] ?? json };
}

async function ensureSalesOrderJourney(supabase: ReturnType<typeof createSupabaseAdmin>) {
  const fn = "simulator-whatsapp";

  // 1) Try to find the expected seeded journey
  const { data: journeyExisting, error: jErr } = await supabase
    .from("journeys")
    .select("id")
    .eq("key", "sales_order")
    .maybeSingle();

  if (jErr) {
    console.error(`[${fn}] Failed to query journeys`, { jErr });
  }

  if (journeyExisting?.id) return journeyExisting.id as string;

  // 2) If missing (db without seeds), recreate minimal catalog rows so simulator can run.
  console.warn(`[${fn}] Journey sales_order missing; attempting to (re)seed minimal catalog rows`);

  let sectorId: string | null = null;
  const { data: sector } = await supabase.from("sectors").select("id").eq("name", "Vendas").maybeSingle();
  sectorId = sector?.id ?? null;

  if (!sectorId) {
    const { data: createdSector, error: sErr } = await supabase
      .from("sectors")
      .insert({ name: "Vendas", description: "Templates para fluxos de vendas" })
      .select("id")
      .single();

    if (sErr || !createdSector?.id) {
      console.error(`[${fn}] Failed to create sector Vendas`, { sErr });
      return null;
    }

    sectorId = createdSector.id;
  }

  const defaultStateMachine = {
    states: [
      "new",
      "awaiting_ocr",
      "awaiting_location",
      "pending_vendor",
      "ready_for_review",
      "confirmed",
      "in_separation",
      "in_route",
      "delivered",
      "finalized",
    ],
    default: "new",
  };

  const { data: createdJourney, error: cjErr } = await supabase
    .from("journeys")
    .upsert(
      {
        sector_id: sectorId,
        key: "sales_order",
        name: "Pedido (WhatsApp + Foto)",
        description: "Captura de pedido por foto com OCR e pendências",
        default_state_machine_json: defaultStateMachine,
      },
      { onConflict: "sector_id,key" }
    )
    .select("id")
    .single();

  if (cjErr || !createdJourney?.id) {
    console.error(`[${fn}] Failed to upsert journey sales_order`, { cjErr });
    return null;
  }

  console.log(`[${fn}] Seeded journey sales_order`, { journeyId: createdJourney.id });
  return createdJourney.id as string;
}

serve(async (req) => {
  const fn = "simulator-whatsapp";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const body = await req.json().catch(() => null);
    if (!body) return new Response("Invalid JSON", { status: 400, headers: corsHeaders });

    const tenantId = body.tenantId as string | undefined;
    const instanceIdRaw = body.instanceId as string | undefined; // wa_instances.id (opcional)
    const instanceId = instanceIdRaw ? String(instanceIdRaw).trim() : null;

    // Optional: allow testing with a different journey
    const journeyKeyRaw = body.journeyKey as string | undefined;
    const journeyIdRaw = body.journeyId as string | undefined;
    const journeyKey = journeyKeyRaw ? String(journeyKeyRaw).trim() : "";
    const journeyIdOverride = journeyIdRaw ? String(journeyIdRaw).trim() : "";

    const type = (body.type as string | undefined) ?? "text";
    const from = normalizePhoneE164Like(body.from);
    const to = normalizePhoneE164Like(body.to);
    const text = (body.text as string | undefined) ?? null;
    const mediaUrl = (body.mediaUrl as string | undefined) ?? null;
    const mediaBase64 = (body.mediaBase64 as string | undefined) ?? null;
    const location = body.location as { lat: number; lng: number } | undefined;

    if (!tenantId || !from) {
      return new Response(JSON.stringify({ ok: false, error: "Missing tenantId/from" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const correlationId = `sim:${crypto.randomUUID()}`;

    const supabase = createSupabaseAdmin();

    // Ensure vendor
    let vendorId: string | null = null;
    const { data: vendor } = await supabase
      .from("vendors")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("phone_e164", from)
      .maybeSingle();
    vendorId = vendor?.id ?? null;
    if (!vendorId) {
      const { data: createdVendor } = await supabase
        .from("vendors")
        .insert({ tenant_id: tenantId, phone_e164: from, display_name: "Vendedor (sim)" })
        .select("id")
        .single();
      vendorId = createdVendor?.id ?? null;
    }

    // Decide which journey to use
    let journeyId: string | null = null;
    if (journeyIdOverride) {
      const { data: j } = await supabase.from("journeys").select("id").eq("id", journeyIdOverride).maybeSingle();
      journeyId = j?.id ?? null;
    } else if (journeyKey) {
      const { data: j } = await supabase.from("journeys").select("id").eq("key", journeyKey).maybeSingle();
      journeyId = j?.id ?? null;
    } else {
      journeyId = await ensureSalesOrderJourney(supabase);
    }

    if (!journeyId) {
      return new Response(
        JSON.stringify({ ok: false, error: journeyKey || journeyIdOverride ? "Journey not found" : "Journey sales_order missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Case creation flow (MVP)
    let caseId: string | null = null;

    // Debug payload to help you validate what happened
    const debug: any = {
      journey: { journeyId, journeyKey: journeyKey || "(default: sales_order)" },
      ocr: { attempted: false, ok: false, error: null as string | null, textPreview: null as string | null },
      extracted: null as any,
      created: { pendencies: 0, case_fields: 0, attachments: 0, timeline: 0, wa_messages: 0 },
      notes: [] as string[],
    };

    if (type === "image") {
      const { data: createdCase, error: cErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: tenantId,
          journey_id: journeyId,
          case_type: "order",
          // NOTE: DB enforces cases_status_check; use the canonical status.
          status: "open",
          state: "awaiting_ocr",
          created_by_channel: "api",
          created_by_vendor_id: vendorId,
          assigned_vendor_id: vendorId,
          title: "Pedido (simulador)",
          meta_json: { correlation_id: correlationId, simulator: true },
        })
        .select("id")
        .single();

      if (cErr || !createdCase) {
        console.error(`[${fn}] Failed to create case`, { cErr });
        return new Response(JSON.stringify({ ok: false, error: "Failed to create case" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      caseId = createdCase.id;

      // Persist inbound (linked to case)
      {
        const { error: wErr } = await supabase.from("wa_messages").insert({
          tenant_id: tenantId,
          instance_id: instanceId,
          case_id: caseId,
          direction: "inbound",
          from_phone: from,
          to_phone: to,
          type: type === "image" ? "image" : type === "audio" ? "audio" : type === "location" ? "location" : "text",
          body_text: text,
          media_url: mediaUrl,
          payload_json: body,
          correlation_id: correlationId,
          occurred_at: new Date().toISOString(),
        });
        if (wErr) {
          console.error(`[${fn}] Failed to insert inbound wa_message`, { wErr });
          debug.notes.push("Failed to insert inbound wa_message");
        } else {
          debug.created.wa_messages += 1;
        }
      }

      // attachment (URL-based) or placeholder (inline base64)
      if (mediaUrl) {
        const { error: aErr } = await supabase.from("case_attachments").insert({
          case_id: caseId,
          kind: "image",
          storage_path: mediaUrl,
          meta_json: { source: "simulator" },
        });
        if (aErr) {
          console.error(`[${fn}] Failed to insert case_attachment`, { aErr });
          debug.notes.push("Failed to insert case_attachment (mediaUrl)");
        } else {
          debug.created.attachments += 1;
        }
      } else if (mediaBase64) {
        const { error: aErr } = await supabase.from("case_attachments").insert({
          case_id: caseId,
          kind: "image",
          storage_path: `inline://simulator/${correlationId}`,
          meta_json: { source: "simulator", inline_base64: true, note: "inline image not stored" },
        });
        if (aErr) {
          console.error(`[${fn}] Failed to insert case_attachment`, { aErr });
          debug.notes.push("Failed to insert case_attachment (mediaBase64)");
        } else {
          debug.created.attachments += 1;
        }
      }

      // IMPORTANT: pendencies table is keyed by case_id (no tenant_id column)
      {
        const { error: pErr } = await supabase.from("pendencies").insert([
          {
            case_id: caseId,
            type: "need_location",
            assigned_to_role: "vendor",
            question_text: "Envie sua localização (WhatsApp: Compartilhar localização). Sem isso não conseguimos registrar o pedido.",
            required: true,
            status: "open",
            due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          },
          {
            case_id: caseId,
            type: "need_more_pages",
            assigned_to_role: "vendor",
            question_text: "Tem mais alguma folha desse pedido? Se sim, envie as próximas fotos. Se não, responda: última folha.",
            required: false,
            status: "open",
            due_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          },
        ]);
        if (pErr) {
          console.error(`[${fn}] Failed to insert pendencies`, { pErr });
          debug.notes.push("Failed to insert pendencies");
        } else {
          debug.created.pendencies += 2;
        }
      }

      {
        const { error: tErr } = await supabase.from("timeline_events").insert({
          tenant_id: tenantId,
          case_id: caseId,
          event_type: "sim_inbound_image",
          actor_type: "vendor",
          actor_id: vendorId,
          message: "Simulador: foto do pedido recebida.",
          meta_json: { correlation_id: correlationId },
          occurred_at: new Date().toISOString(),
        });
        if (tErr) {
          console.error(`[${fn}] Failed to insert timeline event`, { tErr });
          debug.notes.push("Failed to insert timeline event");
        } else {
          debug.created.timeline += 1;
        }
      }

      // OCR + extraction + validation (inline)
      if (mediaUrl || mediaBase64) {
        debug.ocr.attempted = true;
        const ocr = await runOcrGoogleVision({ imageUrl: mediaUrl, imageBase64: mediaBase64 });
        if (ocr.ok) {
          debug.ocr.ok = true;
          debug.ocr.textPreview = ocr.text ? String(ocr.text).slice(0, 1200) : "";

          // case_fields table is keyed by case_id (no tenant_id column)
          {
            const { error: fErr } = await supabase.from("case_fields").upsert({
              case_id: caseId,
              key: "ocr_text",
              value_text: ocr.text,
              confidence: 0.85,
              source: "ocr",
              last_updated_by: "ocr_agent",
            });
            if (fErr) {
              console.error(`[${fn}] Failed to upsert case_field ocr_text`, { fErr });
              debug.notes.push("Failed to upsert case_field ocr_text");
            } else {
              debug.created.case_fields += 1;
            }
          }

          const extracted = extractFieldsFromText(ocr.text);
          debug.extracted = extracted;

          const upserts: any[] = [];
          if (extracted.name)
            upserts.push({ case_id: caseId, key: "name", value_text: extracted.name, confidence: 0.75, source: "ocr", last_updated_by: "extract" });
          if (extracted.cpf)
            upserts.push({ case_id: caseId, key: "cpf", value_text: extracted.cpf, confidence: extracted.cpf.length === 11 ? 0.85 : 0.4, source: "ocr", last_updated_by: "extract" });
          if (extracted.rg)
            upserts.push({ case_id: caseId, key: "rg", value_text: extracted.rg, confidence: extracted.rg.length >= 7 ? 0.7 : 0.4, source: "ocr", last_updated_by: "extract" });
          if (extracted.birth_date_text)
            upserts.push({ case_id: caseId, key: "birth_date_text", value_text: extracted.birth_date_text, confidence: 0.7, source: "ocr", last_updated_by: "extract" });
          if (extracted.order_date_text)
            upserts.push({ case_id: caseId, key: "order_date_text", value_text: extracted.order_date_text, confidence: 0.75, source: "ocr", last_updated_by: "extract" });
          if (extracted.phone_raw) {
            const digits = toDigits(extracted.phone_raw);
            const conf = digits.length >= 10 && digits.length <= 13 ? 0.8 : 0.55;
            upserts.push({ case_id: caseId, key: "phone", value_text: extracted.phone_raw, confidence: conf, source: "ocr", last_updated_by: "extract" });
          }
          if (extracted.total_raw)
            upserts.push({ case_id: caseId, key: "total_raw", value_text: extracted.total_raw, confidence: 0.7, source: "ocr", last_updated_by: "extract" });
          upserts.push({ case_id: caseId, key: "signature_present", value_text: extracted.signaturePresent ? "yes" : "no", confidence: 0.5, source: "ocr", last_updated_by: "extract" });

          if (upserts.length) {
            const { error: fuErr } = await supabase.from("case_fields").upsert(upserts);
            if (fuErr) {
              console.error(`[${fn}] Failed to upsert extracted case_fields`, { fuErr });
              debug.notes.push("Failed to upsert extracted case_fields");
            } else {
              debug.created.case_fields += upserts.length;
            }
          }
        } else {
          debug.ocr.ok = false;
          debug.ocr.error = ocr.error;
          console.warn(`[${fn}] OCR failed`, { error: ocr.error });
        }
      }

      // apply location if provided
      if (location) {
        {
          const { error: lErr } = await supabase.from("case_fields").upsert({
            case_id: caseId,
            key: "location",
            value_json: location,
            value_text: `${location.lat},${location.lng}`,
            confidence: 1,
            source: "vendor",
            last_updated_by: "simulator",
          });
          if (lErr) {
            console.error(`[${fn}] Failed to upsert case_field location`, { lErr });
            debug.notes.push("Failed to upsert case_field location");
          } else {
            debug.created.case_fields += 1;
          }
        }

        await supabase
          .from("pendencies")
          .update({ status: "answered", answered_text: "Localização enviada", answered_payload_json: location })
          .eq("case_id", caseId)
          .eq("type", "need_location");
      }

      // Validate
      const { data: fields, error: fieldsErr } = await supabase
        .from("case_fields")
        .select("key, value_text, value_json")
        .eq("case_id", caseId);

      if (fieldsErr) {
        console.error(`[${fn}] Failed to read case_fields for validation`, { fieldsErr });
        debug.notes.push("Failed to read case_fields for validation");
      }

      const fm = new Map<string, any>();
      for (const f of fields ?? []) fm.set(f.key, f.value_text ?? f.value_json);

      const missing: string[] = [];
      if (!fm.get("name")) missing.push("nome");
      if (!fm.get("cpf") || String(fm.get("cpf")).length < 11) missing.push("cpf");
      if (!fm.get("rg") || String(fm.get("rg")).length < 7) missing.push("rg");
      if (!fm.get("birth_date_text")) missing.push("data_nascimento");
      if (!fm.get("phone")) missing.push("telefone");
      if (!fm.get("location")) missing.push("localizacao");

      // Outbox preview (pendency list)
      const { data: pends, error: pendsErr } = await supabase
        .from("pendencies")
        .select("question_text, required")
        .eq("case_id", caseId)
        .eq("assigned_to_role", "vendor")
        .eq("status", "open")
        .order("created_at", { ascending: true });

      if (pendsErr) {
        console.error(`[${fn}] Failed to load pendencies for outbox preview`, { pendsErr });
        debug.notes.push("Failed to load pendencies for outbox preview");
      }

      if (pends?.length) {
        const list = pends.map((p, i) => `${i + 1}) ${p.question_text}${p.required ? "" : " (opcional)"}`).join("\n");
        const msg = `Byfrost.ia — Pendências do pedido:\n\n${list}`;
        const { error: oErr } = await supabase.from("wa_messages").insert({
          tenant_id: tenantId,
          instance_id: instanceId,
          case_id: caseId,
          direction: "outbound",
          from_phone: to,
          to_phone: from,
          type: "text",
          body_text: msg,
          payload_json: { kind: "outbox_preview", case_id: caseId, missing },
          correlation_id: correlationId,
          occurred_at: new Date().toISOString(),
        });
        if (oErr) {
          console.error(`[${fn}] Failed to insert outbound wa_message`, { oErr });
          debug.notes.push("Failed to insert outbound wa_message");
        } else {
          debug.created.wa_messages += 1;
        }
      }

      await supabase.rpc("append_audit_ledger", {
        p_tenant_id: tenantId,
        p_payload: { kind: "simulator_run", correlation_id: correlationId, case_id: caseId },
      });
    } else {
      // Persist inbound (not linked to case) for non-image simulator payloads
      await supabase.from("wa_messages").insert({
        tenant_id: tenantId,
        instance_id: instanceId,
        case_id: null,
        direction: "inbound",
        from_phone: from,
        to_phone: to,
        type: type === "image" ? "image" : type === "audio" ? "audio" : type === "location" ? "location" : "text",
        body_text: text,
        media_url: mediaUrl,
        payload_json: body,
        correlation_id: correlationId,
        occurred_at: new Date().toISOString(),
      });
    }

    const { data: outbox } = await supabase
      .from("wa_messages")
      .select("id, to_phone, type, body_text, media_url, occurred_at")
      .eq("tenant_id", tenantId)
      .eq("direction", "outbound")
      .eq("correlation_id", correlationId)
      .order("occurred_at", { ascending: true });

    return new Response(
      JSON.stringify({ ok: true, correlationId, caseId, instanceId, journeyId, outbox: outbox ?? [], debug }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error(`[simulator-whatsapp] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});