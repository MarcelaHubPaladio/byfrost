import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Image as ImageIcon, ExternalLink, Settings2, CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { showSuccess, showError } from "@/utils/toast";
import { useQueryClient, useMutation } from "@tanstack/react-query";

export function EntityMediaKitTab({ tenantId, entityId }: { tenantId: string; entityId: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();

  const entityQ = useQuery({
    queryKey: ["entity", tenantId, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("*")
        .eq("id", entityId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const updateEntityM = useMutation({
    mutationFn: async (mediaKitConfig: any) => {
      const currentMetadata = entityQ.data?.metadata || {};
      const { error } = await supabase
        .from("core_entities")
        .update({
          metadata: {
            ...currentMetadata,
            media_kit_config: mediaKitConfig
          }
        })
        .eq("id", entityId);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Configuração salva");
      qc.invalidateQueries({ queryKey: ["entity", tenantId, entityId] });
    },
    onError: (err: any) => showError(err.message),
  });

  const kitsQ = useQuery({
    queryKey: ["entity_media_kits", entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_kits")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <Card className="p-4 rounded-2xl border-slate-200 bg-slate-50/50">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="h-4 w-4 text-slate-500" />
          <div className="text-sm font-bold text-slate-900">Campos Disponíveis para Mídia Kit</div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {["display_name", "entity_type", "subtype", "status"].map(field => {
            const config = entityQ.data?.metadata?.media_kit_config || {};
            const isEnabled = !!config[field];
            
            return (
              <div 
                key={field}
                onClick={() => updateEntityM.mutate({ ...config, [field]: !isEnabled })}
                className={`flex items-center gap-2 p-2 rounded-xl border-2 transition-all cursor-pointer bg-white
                  ${isEnabled ? "border-blue-500 bg-blue-50/50" : "border-slate-100 hover:border-slate-200"}`}
              >
                {isEnabled ? <CheckCircle2 className="h-4 w-4 text-blue-500" /> : <Circle className="h-4 w-4 text-slate-200" />}
                <span className="text-xs font-medium text-slate-700 capitalize">{field.replace("_", " ")}</span>
              </div>
            );
          })}
          
          {Object.keys(entityQ.data?.metadata || {}).filter(k => k !== "media_kit_config").map(key => {
            const config = entityQ.data?.metadata?.media_kit_config || {};
            const isEnabled = !!config[key];
            
            return (
              <div 
                key={key}
                onClick={() => updateEntityM.mutate({ ...config, [key]: !isEnabled })}
                className={`flex items-center gap-2 p-2 rounded-xl border-2 transition-all cursor-pointer bg-white
                  ${isEnabled ? "border-blue-500 bg-blue-50/50" : "border-slate-100 hover:border-slate-200"}`}
              >
                {isEnabled ? <CheckCircle2 className="h-4 w-4 text-blue-500" /> : <Circle className="h-4 w-4 text-slate-200" />}
                <span className="text-xs font-medium text-slate-700">{key}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[10px] text-slate-400">
          Selecione os campos acima para que eles fiquem disponíveis como variáveis dentro do editor de Mídia Kit.
        </p>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Artes e Mídia Kits</div>
          <Button size="sm" onClick={() => nav(`/app/media-kit/editor/new?entityId=${entityId}`)} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            Nova Arte
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kitsQ.data?.map((kit) => (
            <Card key={kit.id} className="group overflow-hidden rounded-2xl border-slate-200 transition hover:border-blue-200 shadow-sm">
              <div className="aspect-video bg-slate-50 flex items-center justify-center text-slate-300">
                <ImageIcon className="h-8 w-8" />
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-semibold text-slate-900">{kit.name}</div>
                  <Button variant="ghost" size="icon" onClick={() => nav(`/app/media-kit/editor/${kit.id}`)} className="h-7 w-7 rounded-full">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-1 text-[10px] text-slate-400">
                  Atualizado em {new Date(kit.updated_at).toLocaleDateString()}
                </div>
              </div>
            </Card>
          ))}
          {kitsQ.data?.length === 0 && (
            <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/20">
              <ImageIcon className="mx-auto h-10 w-10 text-slate-200 mb-4" />
              <p className="text-sm font-medium text-slate-500">Nenhuma arte criada para este imóvel.</p>
              <p className="text-xs text-slate-400 mt-1">Crie sua primeira arte clicando no botão acima.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
