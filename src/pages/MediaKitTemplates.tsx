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
import { Plus, Trash2, Pencil, Ruler } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type Template = {
  id: string;
  name: string;
  width: number;
  height: number;
};

export default function MediaKitTemplates() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({ name: "", width: 1080, height: 1080 });

  const templatesQ = useQuery({
    queryKey: ["media_kit_templates", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_kit_templates")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as Template[];
    },
  });

  const upsertM = useMutation({
    mutationFn: async (template: Partial<Template>) => {
      if (editingTemplate) {
        const { error } = await supabase
          .from("media_kit_templates")
          .update({ ...template, updated_at: new Date().toISOString() })
          .eq("id", editingTemplate.id)
          .eq("tenant_id", activeTenantId!);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("media_kit_templates")
          .insert([{ ...template, tenant_id: activeTenantId! }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media_kit_templates"] });
      setIsDialogOpen(false);
      setEditingTemplate(null);
      setFormData({ name: "", width: 1080, height: 1080 });
      showSuccess(editingTemplate ? "Template atualizado" : "Template criado");
    },
    onError: (err: any) => showError(err.message),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("media_kit_templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", activeTenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media_kit_templates"] });
      showSuccess("Template removido");
    },
    onError: (err: any) => showError(err.message),
  });

  const handleEdit = (t: Template) => {
    setEditingTemplate(t);
    setFormData({ name: t.name, width: t.width, height: t.height });
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormData({ name: "", width: 1080, height: 1080 });
    setIsDialogOpen(true);
  };

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.media_kit">
        <AppShell>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Templates de Mídia</h1>
                <p className="text-slate-500">Gerencie os tamanhos das artes que serão exportadas.</p>
              </div>
              <Button onClick={handleCreate} className="rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Novo Template
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templatesQ.data?.map((t) => (
                <Card key={t.id} className="group relative overflow-hidden rounded-2xl border-slate-200 p-5 transition hover:border-blue-200 hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
                      <Ruler className="h-6 w-6" />
                    </div>
                    <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(t)} className="h-8 w-8 rounded-full">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteM.mutate(t.id)} className="h-8 w-8 rounded-full text-red-500 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4">
                    <h3 className="font-semibold text-slate-900">{t.name}</h3>
                    <p className="text-sm text-slate-500">{t.width} x {t.height} px</p>
                  </div>
                </Card>
              ))}
              {templatesQ.data?.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500">
                  Nenhum template cadastrado. Comece criando um novo.
                </div>
              )}
            </div>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="rounded-2xl sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{editingTemplate ? "Editar Template" : "Novo Template"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome (ex: Instagram Post)</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="width">Largura (px)</Label>
                    <Input
                      id="width"
                      type="number"
                      value={formData.width}
                      onChange={(e) => setFormData({ ...formData, width: parseInt(e.target.value) })}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height">Altura (px)</Label>
                    <Input
                      id="height"
                      type="number"
                      value={formData.height}
                      onChange={(e) => setFormData({ ...formData, height: parseInt(e.target.value) })}
                      className="rounded-xl"
                    />
                  </div>
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
