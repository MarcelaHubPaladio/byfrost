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

function parsePtBrDateFromText(s: string) {
  const m = String(s ?? "").match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{2,4})/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  let yyyy = m[3];
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  return `${dd}/${mm}/${yyyy}`;
}

type ExtractedItem = {
  line_no: number;
  code: string | null;
  description: string;
  qty: number | null;
  value_raw: string | null;
  value_num: number | null;
};

type ExtractedFields = {
  // Supplier
  supplier_name?: string | null;
  supplier_cnpj?: string | null;
  supplier_phone?: string | null;
  supplier_city_uf?: string | null;

  // Customer / header
  local?: string | null;
  order_date_text?: string | null;
  customer_name?: string | null;
  customer_code?: string | null;
  email?: string | null;
  birth_date_text?: string | null;
  address?: string | null;
  phone_raw?: string | null;
  city?: string | null;
  cep?: string | null;
  state?: string | null;
  uf?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  ie?: string | null;
  rg?: string | null;

  // Items
  items?: ExtractedItem[];

  // Payment
  payment_terms?: string | null;
  payment_signal_date_text?: string | null;
  payment_signal_value_raw?: string | null;
  payment_origin?: string | null;
  payment_local?: string | null;
  payment_due_date_text?: string | null;
  proposal_validity_date_text?: string | null;
  delivery_forecast_text?: string | null;
  obs?: string | null;

  // Totals / signature
  total_raw?: string | null;
  signaturePresent?: boolean;

  // Raw helpers
  ocr_text_preview?: string | null;
};

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

  const pickLabelFromLine = (label: RegExp) => {
    for (const line of lines) {
      if (!label.test(line)) continue;
      const idx = line.search(label);
      const after = normalizeLine(line.slice(idx).replace(label, "").replace(/^\s*[:\-]?\s*/g, ""));
      if (after) return after;
    }
    return null;
  };

  const pickFromCombinedLine = (re: RegExp) => {
    for (const line of lines) {
      const m = line.match(re);
      if (m) return m;
    }
    return null;
  };

  const extracted: ExtractedFields = {
    ocr_text_preview: lines.slice(0, 40).join("\n").slice(0, 1200),
  };

  // ----------------------
  // Supplier (header)
  // ----------------------
  extracted.supplier_name = pickByLineRegex(/\bAGROFORTE\b.*\bLTDA\b\.?/i) ?? "AGROFORTE SOLUÇÕES AGRÍCOLAS LTDA.";

  const supplierCnpj = pickByLineRegex(/\bCNPJ\b\s*[:\-]?\s*([0-9\.\/-]{11,18})/i);
  extracted.supplier_cnpj = supplierCnpj ? toDigits(supplierCnpj) : null;

  const supplierPhone = pickByLineRegex(/\bFone\b\s*[:\-]?\s*(.+)/i) ?? pickByLineRegex(/\bFone\b\s*\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4}/i);
  if (supplierPhone) {
    const m = supplierPhone.match(/(\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4})/);
    extracted.supplier_phone = m?.[1] ? normalizeLine(m[1]) : null;
  }

  // e.g. "Prudentópolis / PR"
  extracted.supplier_city_uf = pickByLineRegex(/\b([A-Za-zÀ-ÿ]+)\s*\/\s*([A-Z]{2})\b/) ?? null;

  // ----------------------
  // Customer header fields
  // ----------------------
  // Local + Data may appear on same line
  const localData = pickFromCombinedLine(/\bLocal\b\s*:\s*(.*?)\s*(?:\bData\b\s*:\s*(.*))?$/i);
  if (localData) {
    extracted.local = normalizeLine(localData[1] ?? "") || null;
    extracted.order_date_text = parsePtBrDateFromText(localData[2] ?? "") ?? null;
  } else {
    extracted.local = pickLabelFromLine(/\bLocal\b/i);
    extracted.order_date_text = parsePtBrDateFromText(pickLabelFromLine(/\bData\b/i) ?? "") ?? null;
  }

  // Nome + Código do Cliente may appear together
  const nomeCod = pickFromCombinedLine(/\bNome\b\s*:\s*(.*?)\s*(?:\bC[oó]digo\s+do\s+Cliente\b\s*:\s*(.*))?$/i);
  if (nomeCod) {
    let name = normalizeLine(nomeCod[1] ?? "");
    name = name.replace(/\bc[oó]digo\s+do\s+cliente\b.*$/i, "").trim();
    extracted.customer_name = name || null;
    extracted.customer_code = normalizeLine(nomeCod[2] ?? "") || null;
  } else {
    extracted.customer_name = pickLabelFromLine(/\bNome\b/i);
    extracted.customer_code = pickLabelFromLine(/\bC[oó]digo\s+do\s+Cliente\b/i);
  }

  extracted.email = pickLabelFromLine(/\bE-?mail\b/i);
  extracted.birth_date_text =
    parsePtBrDateFromText(pickLabelFromLine(/\bData\s+de\s+Nascimento\b/i) ?? "") ?? null;
  extracted.address = pickLabelFromLine(/\bEndere[cç]o\b/i);

  // Phone: only accept if explicitly labeled
  const phoneLabeled = pickLabelFromLine(/\bTelefone\b/i);
  if (phoneLabeled) {
    const m = phoneLabeled.match(/(\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4})/);
    extracted.phone_raw = m?.[1] ? normalizeLine(m[1]) : null;
  }

  // Cidade / CEP / Estado / UF often appear on same line
  extracted.city = pickLabelFromLine(/\bCidade\b/i);
  extracted.cep = pickByLineRegex(/\bCEP\b\s*[:\-]?\s*([0-9]{5}-?[0-9]{3})/i);
  extracted.state = pickLabelFromLine(/\bEstado\b/i);
  extracted.uf = pickByLineRegex(/\bUF\b\s*[:\-]?\s*([A-Z]{2})\b/);

  // Documents
  const cpfCnpjRaw =
    pickByLineRegex(/\bcpf\s*\/?\s*cnpj\b\s*[:\-]?\s*([0-9\.\/-]{11,18})/i) ??
    pickByLineRegex(/\bcnpj\b\s*[:\-]?\s*([0-9\.\/-]{11,18})/i) ??
    pickByLineRegex(/\bcpf\b\s*[:\-]?\s*([0-9\.\/-]{11,18})/i);

  const cpfCnpjDigits = cpfCnpjRaw ? toDigits(cpfCnpjRaw) : null;
  extracted.cpf = cpfCnpjDigits && cpfCnpjDigits.length === 11 ? cpfCnpjDigits : null;
  extracted.cnpj = cpfCnpjDigits && cpfCnpjDigits.length === 14 ? cpfCnpjDigits : null;

  extracted.ie = pickLabelFromLine(/\bInscr\.?\s*Est\.?\b/i);

  // RG: only accept if explicitly labeled as RG (avoid picking dates)
  const rgRaw = pickByLineRegex(/\bRG\b\s*[:\-]?\s*([0-9\.\-]{6,14})/i);
  extracted.rg = rgRaw ? toDigits(rgRaw) : null;

  // ----------------------
  // Items table
  // ----------------------
  const headerIdx = lines.findIndex((l) => /\bC[oó]d\.?\b/i.test(l) && /\bDescri[cç][aã]o\b/i.test(l));
  const paymentIdx = lines.findIndex((l) => /\bCondi[cç][oõ]es\s+de\s+Pagamento\b/i.test(l));

  const items: ExtractedItem[] = [];
  if (headerIdx >= 0) {
    const start = headerIdx + 1;
    const end = paymentIdx > start ? paymentIdx : lines.length;
    const tableLines = lines.slice(start, end).filter((l) => !/^[-_]+$/.test(l));

    let current: ExtractedItem | null = null;

    const moneyRe = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;

    const flush = () => {
      if (!current) return;
      current.description = normalizeLine(current.description);
      if (current.description) items.push(current);
      current = null;
    };

    for (const raw of tableLines) {
      const line = normalizeLine(raw);
      if (!line) continue;

      // Skip obvious footer/headers
      if (/\bCondi[cç][oõ]es\b/i.test(line)) break;

      // Try parse: CODE ... QTY ... VALUE
      // Example: "CS3B PENEIRA ... 01 16.027,00"
      const moneyAll = Array.from(line.matchAll(moneyRe)).map((m) => m[1]);
      const lastMoney = moneyAll.length ? moneyAll[moneyAll.length - 1] : null;
      const valueNum = lastMoney ? parsePtBrMoneyToNumber(lastMoney) : null;

      const qtyMatch = line.match(/\b(\d{1,3})\b\s*(?:\d{1,3}(?:\.\d{3})*,\d{2})\s*$/);
      const qty = qtyMatch ? Number(qtyMatch[1]) : null;

      const codeMatch = line.match(/^([A-Z0-9]{2,10})\b\s*(.*)$/i);
      const code = codeMatch ? normalizeLine(codeMatch[1]) : null;

      // New row when it has a code and either a qty or a value
      if (code && (qty !== null || valueNum !== null)) {
        flush();
        const rest = normalizeLine(codeMatch?.[2] ?? "");
        // remove trailing qty + value
        let desc = rest;
        if (lastMoney) desc = desc.replace(new RegExp(`\\b${qty ?? ""}\\b\\s*${lastMoney.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*$`), "");
        desc = desc.replace(lastMoney ?? "", "").trim();
        current = {
          line_no: items.length + 1,
          code,
          description: desc,
          qty,
          value_raw: lastMoney,
          value_num: valueNum,
        };
        continue;
      }

      // Continuation line (handwritten description often spans multiple lines)
      if (current) {
        current.description = `${current.description}\n${line}`;
        continue;
      }

      // If no current item yet, but line looks like a description start (no header), start one.
      if (!/\bQuant\.?\b/i.test(line) && !/\bValor\b/i.test(line)) {
        current = {
          line_no: items.length + 1,
          code: code && code.length <= 10 ? code : null,
          description: line,
          qty,
          value_raw: lastMoney,
          value_num: valueNum,
        };
      }
    }

    flush();
  }

  extracted.items = items;

  // ----------------------
  // Payment section
  // ----------------------
  // Common: "Condições de Pagamento A VISTA"
  const payTermsLine = lines.find((l) => /\bCondi[cç][oõ]es\s+de\s+Pagamento\b/i.test(l));
  if (payTermsLine) {
    const t = payTermsLine.replace(/.*Condi[cç][oõ]es\s+de\s+Pagamento\b\s*/i, "").trim();
    extracted.payment_terms = t || null;
  }

  extracted.payment_origin = pickLabelFromLine(/\bOrigem\s+Financeira\b/i);
  // A second "Local:" exists in payment area; take the one after payment section if possible
  if (paymentIdx >= 0) {
    for (let i = paymentIdx; i < Math.min(lines.length, paymentIdx + 25); i++) {
      const l = lines[i];
      const m = l.match(/\bLocal\b\s*:\s*(.+)/i);
      if (m?.[1]) {
        extracted.payment_local = normalizeLine(m[1]);
        break;
      }
    }
  }

  extracted.payment_signal_date_text =
    parsePtBrDateFromText(pickLabelFromLine(/\bSinal\s+de\s+neg[oó]cio\s+em\b/i) ?? "") ?? null;
  extracted.payment_due_date_text =
    parsePtBrDateFromText(pickLabelFromLine(/\bCom\s+vencimento\s+em\b/i) ?? "") ?? null;
  extracted.proposal_validity_date_text =
    parsePtBrDateFromText(pickLabelFromLine(/\bValidade\s+da\s+Proposta\b/i) ?? "") ?? null;

  extracted.delivery_forecast_text = pickLabelFromLine(/\bData\s+prevista\s+para\s+entrega\b/i);
  extracted.obs = pickLabelFromLine(/\bObs\.?\b/i);

  // Payment signal value: look for R$ in payment block
  if (paymentIdx >= 0) {
    const block = lines.slice(paymentIdx, Math.min(lines.length, paymentIdx + 30)).join("\n");
    const m = block.match(/\bR\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
    extracted.payment_signal_value_raw = m?.[1] ? `R$ ${m[1]}` : null;
  }

  // ----------------------
  // Total and signature
  // ----------------------
  // Total: pick the largest pt-BR money-like value across the doc (works for forms with totals)
  const moneyMatches = Array.from(String(text ?? "").matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/g));
  let bestMoney: { raw: string; value: number } | null = null;
  for (const mm of moneyMatches) {
    const raw = mm?.[1] ?? "";
    const n = parsePtBrMoneyToNumber(raw);
    if (n === null) continue;
    if (!bestMoney || n > bestMoney.value) bestMoney = { raw, value: n };
  }

  // If table items have values but the document doesn't show explicit total, sum items.
  const itemsSum = items.reduce((acc, it) => acc + (it.value_num ?? 0), 0);
  if (bestMoney) {
    extracted.total_raw = `R$ ${bestMoney.raw}`;
  } else if (itemsSum > 0) {
    const raw = itemsSum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    extracted.total_raw = `R$ ${raw}`;
  } else {
    extracted.total_raw = null;
  }

  extracted.signaturePresent = /assinatura/i.test(text) || /\bCLIENTE\b\s*:/i.test(text);

  return extracted;
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
      created: { pendencies: 0, case_fields: 0, case_items: 0, attachments: 0, timeline: 0, wa_messages: 0 },
      notes: [] as string[],
    };

    const upsertCaseField = async (case_id: string, key: string, value: any, confidence: number, source: string, last_updated_by: string) => {
      if (value === null || value === undefined) return { ok: true as const, skipped: true as const };
      const row: any = {
        case_id,
        key,
        confidence,
        source,
        last_updated_by,
      };
      if (typeof value === "string") row.value_text = value;
      else row.value_json = value;

      const { error } = await supabase.from("case_fields").upsert(row);
      if (error) {
        console.error(`[${fn}] Failed to upsert case_field ${key}`, { error });
        return { ok: false as const, error };
      }
      debug.created.case_fields += 1;
      return { ok: true as const, skipped: false as const };
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

          // Persist raw OCR text
          await upsertCaseField(caseId, "ocr_text", ocr.text, 0.85, "ocr", "ocr_agent");

          const extracted = extractFieldsFromText(ocr.text);
          debug.extracted = extracted;

          // --- Customer / header ---
          await upsertCaseField(caseId, "local", extracted.local ?? null, 0.8, "ocr", "extract");
          await upsertCaseField(caseId, "order_date_text", extracted.order_date_text ?? null, 0.75, "ocr", "extract");
          await upsertCaseField(caseId, "name", extracted.customer_name ?? null, 0.75, "ocr", "extract");
          await upsertCaseField(caseId, "customer_code", extracted.customer_code ?? null, 0.65, "ocr", "extract");
          await upsertCaseField(caseId, "email", extracted.email ?? null, 0.65, "ocr", "extract");
          await upsertCaseField(caseId, "birth_date_text", extracted.birth_date_text ?? null, 0.7, "ocr", "extract");
          await upsertCaseField(caseId, "address", extracted.address ?? null, 0.6, "ocr", "extract");
          await upsertCaseField(caseId, "phone", extracted.phone_raw ?? null, extracted.phone_raw ? 0.8 : 0.0, "ocr", "extract");
          await upsertCaseField(caseId, "city", extracted.city ?? null, 0.6, "ocr", "extract");
          await upsertCaseField(caseId, "cep", extracted.cep ?? null, 0.8, "ocr", "extract");
          await upsertCaseField(caseId, "state", extracted.state ?? null, 0.55, "ocr", "extract");
          await upsertCaseField(caseId, "uf", extracted.uf ?? null, 0.85, "ocr", "extract");
          await upsertCaseField(caseId, "cpf", extracted.cpf ?? null, extracted.cpf ? 0.85 : 0.0, "ocr", "extract");
          await upsertCaseField(caseId, "cnpj", extracted.cnpj ?? null, extracted.cnpj ? 0.85 : 0.0, "ocr", "extract");
          await upsertCaseField(caseId, "rg", extracted.rg ?? null, extracted.rg ? 0.7 : 0.0, "ocr", "extract");
          await upsertCaseField(caseId, "ie", extracted.ie ?? null, 0.55, "ocr", "extract");

          // --- Supplier ---
          await upsertCaseField(caseId, "supplier_name", extracted.supplier_name ?? null, 0.7, "ocr", "extract");
          await upsertCaseField(caseId, "supplier_cnpj", extracted.supplier_cnpj ?? null, extracted.supplier_cnpj ? 0.9 : 0.0, "ocr", "extract");
          await upsertCaseField(caseId, "supplier_phone", extracted.supplier_phone ?? null, 0.75, "ocr", "extract");
          await upsertCaseField(caseId, "supplier_city_uf", extracted.supplier_city_uf ?? null, 0.6, "ocr", "extract");

          // --- Payment ---
          await upsertCaseField(caseId, "payment_terms", extracted.payment_terms ?? null, 0.6, "ocr", "extract");
          await upsertCaseField(caseId, "payment_signal_date_text", extracted.payment_signal_date_text ?? null, 0.65, "ocr", "extract");
          await upsertCaseField(caseId, "payment_signal_value_raw", extracted.payment_signal_value_raw ?? null, 0.65, "ocr", "extract");
          await upsertCaseField(caseId, "payment_origin", extracted.payment_origin ?? null, 0.6, "ocr", "extract");
          await upsertCaseField(caseId, "payment_local", extracted.payment_local ?? null, 0.6, "ocr", "extract");
          await upsertCaseField(caseId, "payment_due_date_text", extracted.payment_due_date_text ?? null, 0.65, "ocr", "extract");
          await upsertCaseField(caseId, "proposal_validity_date_text", extracted.proposal_validity_date_text ?? null, 0.7, "ocr", "extract");
          await upsertCaseField(caseId, "delivery_forecast_text", extracted.delivery_forecast_text ?? null, 0.6, "ocr", "extract");
          await upsertCaseField(caseId, "obs", extracted.obs ?? null, 0.55, "ocr", "extract");

          // --- Totals / signature ---
          await upsertCaseField(caseId, "total_raw", extracted.total_raw ?? null, extracted.total_raw ? 0.75 : 0.0, "ocr", "extract");
          await upsertCaseField(caseId, "signature_present", extracted.signaturePresent ? "yes" : "no", 0.5, "ocr", "extract");

          // --- Items ---
          if (Array.isArray(extracted.items) && extracted.items.length) {
            // replace existing
            await supabase.from("case_items").delete().eq("case_id", caseId);

            const rows = extracted.items
              .filter((it) => normalizeLine(it.description))
              .slice(0, 50)
              .map((it, idx) => ({
                case_id: caseId,
                line_no: idx + 1,
                code: it.code,
                description: normalizeLine(it.description),
                qty: it.qty,
                price: null,
                total: it.value_num,
                confidence_json: { source: "ocr", value_raw: it.value_raw },
              }));

            if (rows.length) {
              const { error: iErr } = await supabase.from("case_items").insert(rows);
              if (iErr) {
                console.error(`[${fn}] Failed to insert case_items`, { iErr });
                debug.notes.push("Failed to insert case_items");
              } else {
                debug.created.case_items += rows.length;
              }
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
        await upsertCaseField(caseId, "location", location, 1, "vendor", "simulator");

        await supabase
          .from("pendencies")
          .update({ status: "answered", answered_text: "Localização enviada", answered_payload_json: location })
          .eq("case_id", caseId)
          .eq("type", "need_location");
      }

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
          payload_json: { kind: "outbox_preview", case_id: caseId },
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