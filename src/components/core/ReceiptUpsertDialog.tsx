import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { showError, showSuccess } from "@/utils/toast";
import { useTenant } from "@/providers/TenantProvider";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import { useState } from "react";

const receiptSchema = z.object({
    amount: z.coerce.number().min(0.01, "O valor deve ser maior que zero"),
    description: z.string().min(3, "A descrição deve ter pelo menos 3 caracteres"),
    occurred_at: z.string(),
    recipient_name: z.string().min(1, "O nome do favorecido é obrigatório"),
    recipient_document: z.string().optional(),
});

type ReceiptFormValues = z.infer<typeof receiptSchema>;

export function ReceiptUpsertDialog({
    open,
    onOpenChange,
    tenantId,
    partyId,
    initialData,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tenantId: string;
    partyId: string;
    initialData?: any;
    onSaved: () => void;
}) {
    const { activeTenantId, activeTenant, refresh } = useTenant();
    const [uploading, setUploading] = useState(false);
    const signatureUrl = activeTenant?.branding_json?.receipt_signature;

    const form = useForm<ReceiptFormValues>({
        resolver: zodResolver(receiptSchema),
        defaultValues: {
            amount: 0,
            description: "",
            occurred_at: new Date().toISOString().split("T")[0],
            recipient_name: "",
            recipient_document: "",
        },
    });

    // Load party data to pre-fill
    const partyQ = useQuery({
        queryKey: ["party_for_receipt", partyId],
        enabled: open && !initialData,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("core_entities")
                .select("display_name, metadata")
                .eq("id", partyId)
                .single();
            if (error) throw error;
            return data;
        },
    });

    useEffect(() => {
        if (initialData) {
            form.reset({
                amount: initialData.amount,
                description: initialData.description,
                occurred_at: initialData.occurred_at.split("T")[0],
                recipient_name: initialData.recipient_name,
                recipient_document: initialData.recipient_document || "",
            });
        } else if (partyQ.data) {
            form.reset({
                amount: 0,
                description: "",
                occurred_at: new Date().toISOString().split("T")[0],
                recipient_name: partyQ.data.display_name,
                recipient_document: partyQ.data.metadata?.cpf_cnpj || partyQ.data.metadata?.document || "",
            });
        } else if (open) {
            form.reset({
                amount: 0,
                description: "",
                occurred_at: new Date().toISOString().split("T")[0],
                recipient_name: "",
                recipient_document: "",
            });
        }
    }, [initialData, partyQ.data, open, form]);

    const onSubmit = async (values: ReceiptFormValues) => {
        try {
            const payload = {
                tenant_id: tenantId,
                party_entity_id: partyId,
                amount: values.amount,
                description: values.description,
                occurred_at: new Date(values.occurred_at).toISOString(),
                recipient_name: values.recipient_name,
                recipient_document: values.recipient_document,
            };

            if (initialData) {
                const { error } = await supabase
                    .from("core_receipts")
                    .update(payload)
                    .eq("id", initialData.id);
                if (error) throw error;
                showSuccess("Recibo atualizado.");
            } else {
                const { error } = await supabase.from("core_receipts").insert(payload);
                if (error) throw error;
                showSuccess("Recibo criado.");
            }

            onSaved();
            onOpenChange(false);
        } catch (e: any) {
            showError(e.message || "Erro ao salvar recibo.");
        }
    };

    const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeTenantId) return;

        setUploading(true);
        try {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve((reader.result as string).split(",")[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const b64 = await base64Promise;

            const { data: json, error: upError } = await supabase.functions.invoke("upload-tenant-asset", {
                body: {
                    tenantId: activeTenantId,
                    kind: "branding", // Added kind
                    mediaBase64: b64,
                    mimeType: file.type,
                    fileName: `signature_${Date.now()}`,
                },
            });

            if (upError || !json?.ok) {
                throw new Error(upError?.message || json?.error || "Erro no upload");
            }

            const currentBj = activeTenant?.branding_json || {};
            const nextBj = { ...currentBj, receipt_signature: json.publicUrl };

            const { error: patchError } = await supabase
                .from("tenants")
                .update({ branding_json: nextBj })
                .eq("id", activeTenantId);

            if (patchError) throw patchError;

            showSuccess("Assinatura salva com sucesso!");
            await refresh();
        } catch (err: any) {
            showError(`Erro ao subir assinatura: ${err.message}`);
        } finally {
            setUploading(false);
        }
    };

    const removeSignature = async () => {
        if (!activeTenantId || !confirm("Remover assinatura salva?")) return;

        try {
            const currentBj = activeTenant?.branding_json || {};
            const { receipt_signature, ...nextBj } = currentBj;

            const { error: patchError } = await supabase
                .from("tenants")
                .update({ branding_json: nextBj })
                .eq("id", activeTenantId);

            if (patchError) throw patchError;

            showSuccess("Assinatura removida.");
            await refresh();
        } catch (err: any) {
            showError(`Erro: ${err.message}`);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{initialData ? "Editar Recibo" : "Novo Recibo"}</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="recipient_name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Favorecido (Nome/Razão Social)</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="Nome do cliente/fornecedor" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="recipient_document"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Documento (CPF/CNPJ)</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="000.000.000-00" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="amount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Valor (R$)</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="number" step="0.01" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="occurred_at"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Data</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="date" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Descrição / Referente a</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            {...field}
                                            placeholder="Ex: Prestação de serviços de marketing digital"
                                            className="min-h-[100px]"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="space-y-3 pt-2">
                            <Label className="text-sm font-bold flex items-center gap-2">
                                <ImageIcon className="h-4 w-4 text-slate-400" />
                                Assinatura (Opcional)
                            </Label>

                            {signatureUrl ? (
                                <div className="relative group w-fit">
                                    <div className="h-24 w-48 rounded-xl border bg-slate-50 flex items-center justify-center overflow-hidden">
                                        <img src={signatureUrl} alt="Assinatura" className="max-h-full max-w-full object-contain" />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={removeSignature}
                                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm hover:bg-red-600 transition"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                    <p className="text-[10px] text-slate-400 mt-1 italic">Esta assinatura será usada em todos os recibos do tenant.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept="image/png"
                                            onChange={handleSignatureUpload}
                                            className="hidden"
                                            id="signature-upload"
                                            disabled={uploading}
                                        />
                                        <label
                                            htmlFor="signature-upload"
                                            className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition"
                                        >
                                            <Upload className="h-6 w-6 text-slate-400 mb-2" />
                                            <span className="text-xs text-slate-500">{uploading ? "Subindo..." : "Subir Assinatura (PNG)"}</span>
                                        </label>
                                    </div>
                                    <FormDescription className="text-[10px]">
                                        Suba um arquivo PNG com fundo transparente para melhores resultados.
                                    </FormDescription>
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? "Salvando..." : "Salvar Recibo"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
