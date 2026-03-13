import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pencil, Palette, Layout } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type Mask = {
  id: string;
  name: string;
  config: {
    layouts: Record<string, any[]>; // layers by template_id
  };
};

export default function MediaKitMasks() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMask, setEditingMask] = useState<Mask | null>(null);
  const [formData, setFormData] = useState({ name: "" });

  const masksQ = useQuery({
    queryKey: ["media_kit_masks", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_kit_masks")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as Mask[];
    },
  });

  const upsertM = useMutation({
    mutationFn: async (mask: Partial<Mask>) => {
      const payload = {
        name: mask.name,
        tenant_id: activeTenantId!,
      };

      if (editingMask) {
        const { error } = await supabase
          .from("media_kit_masks")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editingMask.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("media_kit_masks")
          .insert([{ ...payload, config: { layouts: {} } }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media_kit_masks"] });
      setIsDialogOpen(false);
      setEditingMask(null);
      setFormData({ name: "" });
      showSuccess(editingMask ? "Máscara atualizada" : "Máscara criada");
    },
    onError: (err: any) => showError(err.message),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("media_kit_masks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media_kit_masks"] });
      showSuccess("Máscara removida");
    },
    onError: (err: any) => showError(err.message),
  });

  const handleEdit = (m: Mask) => {
    setEditingMask(m);
    setFormData({ name: m.name });
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingMask(null);
    setFormData({ name: "" });
    setIsDialogOpen(true);
  };

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.media_kit">
        <AppShell>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Máscaras de Design</h1>
                <p className="text-slate-500">Defina conjuntos de camadas pré-moldadas para seus templates.</p>
              </div>
              <Button onClick={handleCreate} className="rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Nova Máscara
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {masksQ.data?.map((m) => (
                <Card key={m.id} className="group relative overflow-hidden rounded-2xl border-slate-200 p-5 transition hover:border-blue-200 hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600 transition group-hover:bg-purple-600 group-hover:text-white">
                      <Layout className="h-6 w-6" />
                    </div>
                    <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(m)} className="h-8 w-8 rounded-full">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteM.mutate(m.id)} className="h-8 w-8 rounded-full text-red-500 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4">
                    <h3 className="font-semibold text-slate-900">{m.name}</h3>
                    <p className="text-sm text-slate-500">{Object.keys(m.config?.layouts || {}).length} templates configurados</p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-50">
                     <Button variant="outline" size="sm" className="w-full rounded-lg text-xs" onClick={() => showError("Edição de camadas da máscara será implementada via editor")}>
                       Editar Camadas
                     </Button>
                  </div>
                </Card>
              ))}
              {masksQ.data?.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-2xl border-2 border-dashed border-slate-100">
                  Nenhuma máscara cadastrada.
                </div>
              )}
            </div>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="rounded-2xl sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{editingMask ? "Editar Máscara" : "Nova Máscara"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Máscara (ex: Minimalista Premium)</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl">Cancelar</Button>
                <Button onClick={() => upsertM.mutate(formData)} disabled={upsertM.isPending} className="rounded-xl">
                  {upsertM.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}
