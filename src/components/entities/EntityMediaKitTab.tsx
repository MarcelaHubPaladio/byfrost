import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Image as ImageIcon, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function EntityMediaKitTab({ tenantId, entityId }: { tenantId: string; entityId: string }) {
  const nav = useNavigate();

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
          <Card key={kit.id} className="group overflow-hidden rounded-2xl border-slate-200 transition hover:border-blue-200">
            <div className="aspect-video bg-slate-50 flex items-center justify-center text-slate-300">
              <ImageIcon className="h-8 w-8" />
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-semibold">{kit.name}</div>
                <Button variant="ghost" size="icon" onClick={() => nav(`/app/media-kit/editor/${kit.id}`)} className="h-7 w-7 rounded-full">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                {new Date(kit.updated_at).toLocaleDateString()}
              </div>
            </div>
          </Card>
        ))}
        {kitsQ.data?.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-100 rounded-2xl">
            <ImageIcon className="mx-auto h-8 w-8 text-slate-200" />
            <p className="mt-2 text-sm text-slate-500">Nenhuma arte criada para este imóvel.</p>
          </div>
        )}
      </div>
    </div>
  );
}
