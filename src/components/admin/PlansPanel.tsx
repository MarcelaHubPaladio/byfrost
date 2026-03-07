import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, CreditCard, Layers } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";

type Plan = {
    id: string;
    name: string;
    limits_json: Record<string, any>;
    created_at: string;
};

export function PlansPanel() {
    const qc = useQueryClient();
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [loading, setLoading] = useState(false);

    const plansQ = useQuery({
        queryKey: ["admin_plans_full"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("plans")
                .select("*")
                .is("deleted_at", null)
                .order("name");
            if (error) throw error;
            return data as Plan[];
        },
    });

    const savePlan = async (id: string | null, payload: any) => {
        setLoading(true);
        try {
            if (id) {
                const { error } = await supabase.from("plans").update(payload).eq("id", id);
                if (error) throw error;
                showSuccess("Plano atualizado.");
            } else {
                const { error } = await supabase.from("plans").insert(payload);
                if (error) throw error;
                showSuccess("Plano criado.");
            }
            qc.invalidateQueries({ queryKey: ["admin_plans_full"] });
            setEditingPlan(null);
            setIsAdding(false);
        } catch (e: any) {
            showError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const deletePlan = async (id: string) => {
        if (!confirm("Excluir este plano? (Soft delete)")) return;
        try {
            const { error } = await supabase.from("plans").update({ deleted_at: new Date().toISOString() }).eq("id", id);
            if (error) throw error;
            showSuccess("Plano removido.");
            qc.invalidateQueries({ queryKey: ["admin_plans_full"] });
        } catch (e: any) {
            showError(e.message);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-indigo-500" /> Planos de Assinatura
                    </h2>
                    <p className="text-sm text-slate-500">Defina os pacotes e limites padrão do sistema.</p>
                </div>
                <Button onClick={() => setIsAdding(true)} className="rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700">
                    <Plus className="h-4 w-4 mr-2" /> Novo Plano
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(plansQ.data ?? []).map((p) => (
                    <Card key={p.id} className="p-5 rounded-3xl border-slate-200 bg-white shadow-sm flex flex-col justify-between group hover:border-indigo-300 transition-colors">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-slate-800">{p.name}</h3>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setEditingPlan(p)}>
                                        <Edit2 className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-rose-500" onClick={() => deletePlan(p.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2 mt-4 text-xs text-slate-600">
                                <div className="flex justify-between items-center border-b border-slate-50 pb-1">
                                    <span>Usuários Máx.</span>
                                    <Badge variant="secondary" className="rounded-lg">{p.limits_json?.max_users ?? "∞"}</Badge>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-50 pb-1">
                                    <span>Instâncias WA</span>
                                    <Badge variant="secondary" className="rounded-lg">{p.limits_json?.max_wa_instances ?? "∞"}</Badge>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-50 pb-1">
                                    <span>Tokens IA</span>
                                    <Badge variant="secondary" className="rounded-lg">{p.limits_json?.max_ai_tokens?.toLocaleString() ?? "∞"}</Badge>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-50 flex items-center gap-2 text-[10px] text-slate-400">
                            <Layers className="h-3 w-3" />
                            ID: {p.id.slice(0, 8)}...
                        </div>
                    </Card>
                ))}

                {plansQ.data?.length === 0 && (
                    <div className="col-span-full py-12 text-center rounded-3xl border-2 border-dashed border-slate-200">
                        <p className="text-slate-500 text-sm">Nenhum plano cadastrado. Comece criando um agora!</p>
                    </div>
                )}
            </div>

            {(editingPlan || isAdding) && (
                <PlanEditDialog
                    plan={editingPlan}
                    onClose={() => { setEditingPlan(null); setIsAdding(false); }}
                    onSave={savePlan}
                    loading={loading}
                />
            )}
        </div>
    );
}

function PlanEditDialog({ plan, onClose, onSave, loading }: { plan: Plan | null, onClose: () => void, onSave: (id: string | null, payload: any) => void, loading: boolean }) {
    const [name, setName] = useState(plan?.name || "");
    const [maxUsers, setMaxUsers] = useState<number>(plan?.limits_json?.max_users ?? 5);
    const [maxWa, setMaxWa] = useState<number>(plan?.limits_json?.max_wa_instances ?? 1);
    const [maxAi, setMaxAi] = useState<number>(plan?.limits_json?.max_ai_tokens ?? 100000);

    const handleSave = () => {
        const limits = {
            max_users: Number(maxUsers),
            max_wa_instances: Number(maxWa),
            max_ai_tokens: Number(maxAi)
        };
        onSave(plan?.id || null, { name, limits_json: limits });
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-md rounded-[28px]">
                <DialogHeader>
                    <DialogTitle>{plan ? "Editar Plano" : "Novo Plano"}</DialogTitle>
                    <DialogDescription>Configure o nome e os limites padrão para este pacote.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    <div className="grid gap-2">
                        <Label className="text-xs font-bold uppercase text-slate-400">Nome do Plano</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Profissional" className="rounded-2xl h-11" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label className="text-xs font-bold uppercase text-slate-400">Usuários Máx.</Label>
                            <Input type="number" value={maxUsers} onChange={(e) => setMaxUsers(Number(e.target.value))} className="rounded-xl h-11" />
                        </div>
                        <div className="grid gap-2">
                            <Label className="text-xs font-bold uppercase text-slate-400">Instâncias WhatsApp</Label>
                            <Input type="number" value={maxWa} onChange={(e) => setMaxWa(Number(e.target.value))} className="rounded-xl h-11" />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label className="text-xs font-bold uppercase text-slate-400">Tokens de IA (Mensal)</Label>
                        <Input type="number" value={maxAi} onChange={(e) => setMaxAi(Number(e.target.value))} className="rounded-xl h-11" />
                        <p className="text-[10px] text-slate-500 italic">
                            Use -1 para conceder acesso ilimitado ao recurso.
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} className="rounded-2xl h-11 border-slate-200">Cancelar</Button>
                    <Button onClick={handleSave} disabled={loading || !name} className="rounded-2xl h-11 bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100">
                        {loading ? "Salvando..." : "Confirmar e Salvar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
