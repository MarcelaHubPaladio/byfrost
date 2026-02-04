import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { ImagePlus, ScanText } from "lucide-react";

const EXTRACT_URL = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/sales-order-extract";

type OcrProvider = "google_vision" | "google_document_ai";

async function fileToBase64(file: File) {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

export function SalesOrderAddAttachmentExtractDialog(props: {
  tenantId: string;
  caseId: string;
  className?: string;
}) {
  const { tenantId, caseId, className } = props;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<OcrProvider>("google_document_ai");
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [mediaBase64, setMediaBase64] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);

  const reset = () => {
    setProvider("google_document_ai");
    setMimeType("image/jpeg");
    setMediaBase64("");
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPick = async (file?: File | null) => {
    if (!file) {
      reset();
      return;
    }

    setReading(true);
    try {
      setMimeType(file.type || "image/jpeg");
      const url = URL.createObjectURL(file);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      const b64 = await fileToBase64(file);
      setMediaBase64(b64);
    } finally {
      setReading(false);
    }
  };

  const hint = useMemo(() => {
    return provider === "google_document_ai"
      ? "Document AI costuma extrair melhor tabelas (itens)."
      : "Vision costuma funcionar bem para texto corrido.";
  }, [provider]);

  const run = async () => {
    if (!tenantId || !caseId) return;
    if (!mediaBase64) {
      showError("Selecione uma imagem.");
      return;
    }

    setSending(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? null;
      if (!token) throw new Error("Sessão expirada.");

      const res = await fetch(EXTRACT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenantId,
          caseId,
          ocrProvider: provider,
          mimeType,
          mediaBase64,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      showSuccess(
        `Extração concluída. Campos: ${(json.fieldsWritten?.length ?? 0)} • Itens inseridos: ${json.itemsInserted ?? 0}.`
      );

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case_attachments", tenantId, caseId] }),
        qc.invalidateQueries({ queryKey: ["case_fields", tenantId, caseId] }),
        qc.invalidateQueries({ queryKey: ["case_items", caseId] }),
        qc.invalidateQueries({ queryKey: ["timeline", tenantId, caseId] }),
        qc.invalidateQueries({ queryKey: ["wa_messages_case", tenantId, caseId] }),
      ]);

      setOpen(false);
      reset();
    } catch (e: any) {
      showError(`Falha ao extrair: ${e?.message ?? "erro"}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className={cn("h-9 rounded-2xl", className)}
          title="Adicionar anexo e extrair campos/itens"
        >
          <ImagePlus className="mr-2 h-4 w-4" />
          Adicionar e extrair
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] max-w-[780px] rounded-[24px] border-slate-200 bg-white p-0 shadow-xl max-h-[90vh] overflow-hidden">
        <div className="max-h-[90vh] overflow-y-auto p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900">Novo anexo (OCR)</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Adicione uma foto do pedido para tentar extrair dados e itens.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-3 sm:grid-cols-[220px_1fr]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">
                Preview
              </div>
              <div className="p-3">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="h-40 w-full rounded-xl border border-slate-200 bg-slate-50 object-cover"
                  />
                ) : (
                  <div className="grid h-40 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500">
                    sem imagem
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">Leitura</div>
                  <div className="mt-1 text-xs text-slate-600">
                    Não sobrescreve campos preenchidos manualmente (source=admin). Itens só são inseridos se o pedido
                    ainda não tiver itens.
                  </div>
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                  <ScanText className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <Label className="text-xs">Imagem</Label>
                  <Input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                    className={cn(
                      "mt-1 rounded-2xl",
                      "file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700"
                    )}
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    {reading
                      ? "Convertendo para Base64…"
                      : mediaBase64
                        ? `Pronto (${Math.round(mediaBase64.length / 1024)} KB)`
                        : "Selecione uma foto"}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Motor de OCR</Label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as OcrProvider)}
                    className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                  >
                    <option value="google_document_ai">Google Document AI</option>
                    <option value="google_vision">Google Vision</option>
                  </select>
                  <div className="mt-1 text-[11px] text-slate-500">{hint}</div>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 rounded-2xl"
                    onClick={() => setOpen(false)}
                    disabled={sending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-5 text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                    onClick={run}
                    disabled={sending || reading || !mediaBase64}
                  >
                    {sending ? "Extraindo…" : "Extrair"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
