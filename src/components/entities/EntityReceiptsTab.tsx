import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Trash2, Pencil, Download } from "lucide-react";
import { formatCurrency } from "@/utils/format";
import { formatDate } from "@/utils/format";
import { ReceiptUpsertDialog } from "@/components/core/ReceiptUpsertDialog";
import { ConfirmDeleteDialog } from "@/components/core/ConfirmDeleteDialog";
import { ReceiptPdfDialog } from "@/components/core/ReceiptPdfDialog";
import { showError, showSuccess } from "@/utils/toast";

type ReceiptRow = {
    id: string;
    amount: number;
    description: string;
    occurred_at: string;
    recipient_name: string;
    recipient_document: string;
    created_at: string;
};

export function EntityReceiptsTab({
    tenantId,
    partyId,
}: {
    tenantId: string;
    partyId: string;
}) {
    const qc = useQueryClient();
    const [upsertOpen, setUpsertOpen] = useState(false);
    const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRow | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [pdfOpen, setPdfOpen] = useState(false);

    const receiptsQ = useQuery({
        queryKey: ["entity_receipts", tenantId, partyId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("core_receipts")
                .select("*")
                .eq("tenant_id", tenantId)
                .eq("party_entity_id", partyId)
                .is("deleted_at", null)
                .order("occurred_at", { ascending: false });
            if (error) throw error;
            return (data || []) as ReceiptRow[];
        },
    });

    const handleDelete = async () => {
        if (!selectedReceipt) return;
        setDeleting(true);
        try {
            const { error } = await supabase
                .from("core_receipts")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", selectedReceipt.id);
            if (error) throw error;
            showSuccess("Recibo excluído com sucesso.");
            qc.invalidateQueries({ queryKey: ["entity_receipts", tenantId, partyId] });
            setDeleteOpen(false);
        } catch (e: any) {
            showError(e.message || "Erro ao excluir recibo.");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Gerador de Recibos</h3>
                <Button
                    onClick={() => {
                        setSelectedReceipt(null);
                        setUpsertOpen(true);
                    }}
                    className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Recibo
                </Button>
            </div>

            <div className="grid gap-3">
                {receiptsQ.isLoading ? (
                    <div className="py-8 text-center text-sm text-slate-500">Carregando recibos...</div>
                ) : receiptsQ.data?.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center border-dashed p-8 text-center text-slate-500">
                        <FileText className="mb-2 h-12 w-12 opacity-20" />
                        <p className="text-sm">Nenhum recibo gerado ainda.</p>
                    </Card>
                ) : (
                    receiptsQ.data?.map((r) => (
                        <Card key={r.id} className="flex items-center justify-between p-4 transition-all hover:border-slate-300">
                            <div className="flex gap-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="font-semibold text-slate-900">{formatCurrency(r.amount)}</div>
                                    <div className="text-sm text-slate-600 line-clamp-1">{r.description || "(sem descrição)"}</div>
                                    <div className="text-xs text-slate-400">{formatDate(r.occurred_at)}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        setSelectedReceipt(r);
                                        setPdfOpen(true);
                                    }}
                                    title="Ver PDF"
                                >
                                    <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        setSelectedReceipt(r);
                                        setUpsertOpen(true);
                                    }}
                                    title="Editar"
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        setSelectedReceipt(r);
                                        setDeleteOpen(true);
                                    }}
                                    title="Excluir"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            <ReceiptUpsertDialog
                open={upsertOpen}
                onOpenChange={setUpsertOpen}
                tenantId={tenantId}
                partyId={partyId}
                initialData={selectedReceipt}
                onSaved={() => {
                    qc.invalidateQueries({ queryKey: ["entity_receipts", tenantId, partyId] });
                }}
            />

            <ConfirmDeleteDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Excluir Recibo"
                description="Tem certeza que deseja excluir este recibo? Esta ação não pode ser desfeita."
                onConfirm={handleDelete}
                confirmLabel={deleting ? "Excluindo..." : "Excluir"}
                disabled={deleting}
            />

            {selectedReceipt && (
                <ReceiptPdfDialog
                    open={pdfOpen}
                    onOpenChange={setPdfOpen}
                    receipt={selectedReceipt}
                />
            )}
        </div>
    );
}
