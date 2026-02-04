import { getGoogleAccessToken } from "./googleAuth.ts";

export type DocAIProcessResult = {
  document?: any;
  [k: string]: any;
};

function inferDocAiHostFromProcessorName(processorName: string) {
  // processorName format: projects/.../locations/<location>/processors/...
  const m = String(processorName ?? "").match(/\/locations\/([^/]+)\//i);
  const location = m?.[1] ? String(m[1]).trim() : "";

  // Use regional endpoint whenever we can infer a location.
  // This avoids 404s that can happen when calling a regional processor via the global host.
  if (location) return `${location}-documentai.googleapis.com`;

  return "documentai.googleapis.com";
}

export async function processWithGoogleDocumentAI(input: {
  processorName: string; // full resource name: projects/.../locations/.../processors/...
  serviceAccountJson: string;
  contentBase64: string;
  mimeType: string;
}) {
  const token = await getGoogleAccessToken({
    serviceAccountJson: input.serviceAccountJson,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const host = inferDocAiHostFromProcessorName(input.processorName);
  const endpoint = `https://${host}/v1/${input.processorName}:process`;

  const payload = {
    rawDocument: {
      content: input.contentBase64,
      mimeType: input.mimeType,
    },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json().catch(() => null)) as DocAIProcessResult | null;
  if (!res.ok || !json) {
    const errMsg = (json as any)?.error?.message ? String((json as any).error.message) : "";
    const errStatus = (json as any)?.error?.status ? String((json as any).error.status) : "";
    const suffix = [errStatus, errMsg].filter(Boolean).join(" - ");
    throw new Error(`Document AI error: ${res.status}${suffix ? ` (${suffix})` : ""}`);
  }

  return json;
}

export function docAiTextFromAnchor(doc: any, anchor: any) {
  const text = String(doc?.text ?? "");
  const segs = anchor?.textSegments ?? [];
  if (!Array.isArray(segs) || !segs.length) return "";

  let out = "";
  for (const s of segs) {
    const start = Number(s?.startIndex ?? 0);
    const end = Number(s?.endIndex ?? 0);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    out += text.slice(start, end);
  }
  return out;
}

export function docAiExtractFormFields(doc: any) {
  const out: Array<{ label: string; value: string }> = [];
  const pages = doc?.pages ?? [];
  for (const p of pages) {
    const fields = p?.formFields ?? [];
    for (const f of fields) {
      const label = docAiTextFromAnchor(doc, f?.fieldName?.textAnchor);
      const value = docAiTextFromAnchor(doc, f?.fieldValue?.textAnchor);
      const l = String(label ?? "").replace(/\s+/g, " ").trim();
      const v = String(value ?? "").replace(/\s+/g, " ").trim();
      if (l || v) out.push({ label: l, value: v });
    }
  }
  return out;
}

export function docAiExtractTables(doc: any) {
  const pages = doc?.pages ?? [];
  const tables: any[] = [];
  for (const p of pages) {
    for (const t of p?.tables ?? []) {
      tables.push(t);
    }
  }
  return tables;
}