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
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { showError, showSuccess } from "@/utils/toast";

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
        } else {
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
