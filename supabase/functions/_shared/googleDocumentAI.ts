import { getGoogleAccessToken } from "./googleAuth.ts";

export type DocAIProcessResult = {
  document?: any;
  [k: string]: any;
};

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

  const endpoint = `https://documentai.googleapis.com/v1/${input.processorName}:process`;
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
    throw new Error(`Document AI error: ${res.status}`);
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
