import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { showError, showSuccess } from "@/utils/toast";

const PARTY_UPLOAD_LOGO_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/party-upload-logo";

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

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

async function lookupCep(cepDigits: string) {
  const cep = onlyDigits(cepDigits).slice(0, 8);
  if (cep.length !== 8) throw new Error("CEP inválido (8 dígitos)");

  const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
  if (!res.ok) throw new Error("CEP não encontrado");
  const json = await res.json();

  const street = String(json?.street ?? "").trim();
  const neighborhood = String(json?.neighborhood ?? "").trim();
  const city = String(json?.city ?? "").trim();
  const state = String(json?.state ?? "").trim();

  return { street, neighborhood, city, state };
}

export function PartyCustomerEditorCard({
  tenantId,
  partyId,
  initialMetadata,
  onUpdated,
}: {
  tenantId: string;
  partyId: string;
  initialMetadata: any;
  onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const customer = (initialMetadata?.customer ?? {}) as any;
  const logoInfo = (initialMetadata?.logo ?? null) as
    | { bucket: string; path: string; updated_at?: string }
    | null;

  const logoUrl = useMemo(() => {
    if (!logoInfo?.bucket || !logoInfo?.path) return null;
    try {
      return supabase.storage.from(logoInfo.bucket).getPublicUrl(logoInfo.path).data.publicUrl;
    } catch {
      return null;
    }
  }, [logoInfo?.bucket, logoInfo?.path]);

  const [saving, setSaving] = useState(false);
  const [fetchingCep, setFetchingCep] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [legalName, setLegalName] = useState<string>(String(customer.legal_name ?? ""));
  const [cnpj, setCnpj] = useState<string>(String(customer.cnpj ?? ""));
  const [email, setEmail] = useState<string>(String(customer.email ?? ""));
  const [phone, setPhone] = useState<string>(String(customer.phone ?? ""));

  const [cep, setCep] = useState<string>(String(customer.cep ?? ""));
  const [street, setStreet] = useState<string>(String(customer.street ?? ""));
  const [number, setNumber] = useState<string>(String(customer.number ?? ""));
  const [neighborhood, setNeighborhood] = useState<string>(String(customer.neighborhood ?? ""));
  const [city, setCity] = useState<string>(String(customer.city ?? ""));
  const [state, setState] = useState<string>(String(customer.state ?? ""));

  const addressLine = useMemo(() => {
    const parts = [street, number, neighborhood, city, state, cep].map((p) => String(p ?? "").trim()).filter(Boolean);
    return parts.join(" • ");
  }, [street, number, neighborhood, city, state, cep]);

  const save = async () => {
    setSaving(true);
    try {
      const nextMetadata = {
        ...(initialMetadata ?? {}),
        customer: {
          legal_name: legalName.trim() || null,
          cnpj: onlyDigits(cnpj).slice(0, 14) || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          cep: onlyDigits(cep).slice(0, 8) || null,
          street: street.trim() || null,
          number: number.trim() || null,
          neighborhood: neighborhood.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          address_line: addressLine || null,
          updated_at: new Date().toISOString(),
        },
      };

      const { error } = await supabase
        .from("core_entities")
        .update({ metadata: nextMetadata })
        .eq("tenant_id", tenantId)
        .eq("id", partyId)
        .is("deleted_at", null);

      if (error) throw error;

      showSuccess("Dados do cliente atualizados.");
      await qc.invalidateQueries({ queryKey: ["entity", tenantId, partyId] });
      onUpdated();
    } catch (e: any) {
      showError(e?.message ?? "Erro ao salvar" );
    } finally {
      setSaving(false);
    }
  };

  const fetchByCep = async () => {
    setFetchingCep(true);
    try {
      const res = await lookupCep(cep);
      if (res.street) setStreet(res.street);
      if (res.neighborhood) setNeighborhood(res.neighborhood);
      if (res.city) setCity(res.city);
      if (res.state) setState(res.state);
      showSuccess("Endereço preenchido pelo CEP.");
    } catch (e: any) {
      showError(e?.message ?? "Erro ao buscar CEP");
    } finally {
      setFetchingCep(false);
    }
  };

  const uploadLogo = async () => {
    if (!tenantId || !partyId) return;
    const file = fileRef.current?.files?.[0] ?? null;
    if (!file) {
      showError("Selecione um arquivo.");
      return;
    }

    setUploadingLogo(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão inválida");

      const b64 = await fileToBase64(file);

      const res = await fetch(PARTY_UPLOAD_LOGO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenantId,
          partyId,
          filename: file.name,
          contentType: file.type || "image/png",
          fileBase64: b64,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `HTTP ${res.status}`));
      }

      showSuccess("Logo do cliente enviada.");
      await qc.invalidateQueries({ queryKey: ["entity", tenantId, partyId] });
      onUpdated();
    } catch (e: any) {
      showError(e?.message ?? "Erro ao enviar logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Dados do cliente</div>
          <div className="mt-1 text-xs text-slate-600">Salvo em core_entities.metadata.customer</div>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="grid gap-2">
          <Label>Nome (razão social)</Label>
          <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} className="rounded-xl" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>CNPJ</Label>
            <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} className="rounded-xl" />
          </div>
          <div className="grid gap-2">
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-xl" />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl" />
        </div>

        <div className="grid gap-3 rounded-2xl border bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-700">Endereço</div>

          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <div className="grid gap-2">
              <Label>CEP</Label>
              <Input value={cep} onChange={(e) => setCep(e.target.value)} className="rounded-xl" />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                className="w-full rounded-xl"
                onClick={fetchByCep}
                disabled={fetchingCep || onlyDigits(cep).length !== 8}
              >
                {fetchingCep ? "Buscando…" : "Buscar CEP"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Rua</Label>
              <Input value={street} onChange={(e) => setStreet(e.target.value)} className="rounded-xl" />
            </div>
            <div className="grid gap-2">
              <Label>Número</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Bairro</Label>
              <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="rounded-xl" />
            </div>
            <div className="grid gap-2">
              <Label>Cidade</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          <div className="grid gap-2 md:w-[180px]">
            <Label>UF</Label>
            <Input value={state} onChange={(e) => setState(e.target.value)} className="rounded-xl" />
          </div>

          <div className="text-xs text-slate-600">Linha: {addressLine || "—"}</div>
        </div>

        <div className="grid gap-3 rounded-2xl border bg-white p-3">
          <div className="text-xs font-semibold text-slate-700">Logo do cliente</div>

          <div className="grid gap-2">
            <Input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="rounded-2xl file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700"
            />
            <Button className="rounded-xl" onClick={uploadLogo} disabled={uploadingLogo}>
              {uploadingLogo ? "Enviando…" : "Enviar logo"}
            </Button>
          </div>

          {logoUrl ? (
            <div className="overflow-hidden rounded-2xl border bg-slate-50">
              <div className="px-3 py-2 text-[11px] font-medium text-slate-700">Preview</div>
              <div className="p-3">
                <img src={logoUrl} alt="Logo do cliente" className="h-16 w-auto max-w-full rounded-xl bg-white p-2 shadow-sm" />
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Nenhum logo cadastrado.</div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-xl" onClick={onUpdated} disabled={saving}>
            Recarregar
          </Button>
          <Button className="rounded-xl" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
