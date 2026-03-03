import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Loader2, UploadCloud, Link as LinkIcon, Youtube, Plus, Check, X } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";

export default function PublicEntityTvUpload() {
    const { token } = useParams();
    const qc = useQueryClient();
    const [loadingMedia, setLoadingMedia] = useState(false);
    const [mediaType, setMediaType] = useState<"supabase_storage" | "youtube_link" | "google_drive_link">("google_drive_link");
    const [mediaUrl, setMediaUrl] = useState("");
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaName, setMediaName] = useState("");

    const portalQ = useQuery({
        queryKey: ["public_tv_entity", token],
        enabled: Boolean(token),
        queryFn: async () => {
            const { data, error } = await supabase.rpc("public_get_tv_entity_data", { p_token: token });
            if (error) throw error;
            if (!data.valid) throw new Error(data.reason || "Invalid link");
            return data;
        },
    });

    const handleAddMedia = async () => {
        if (!portalQ.data) return;
        const { entity_id, tenant_id } = portalQ.data;

        if (mediaType === "supabase_storage" && !mediaFile) return showError("Selecione um arquivo de vídeo");
        if (mediaType !== "supabase_storage" && !mediaUrl.trim()) return showError("Informe o link do vídeo");

        setLoadingMedia(true);
        try {
            let finalUrl = mediaUrl.trim();

            if (mediaType === "supabase_storage" && mediaFile) {
                const fileExt = mediaFile.name.split('.').pop();
                const fileName = `public/${entity_id}/${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
                const { error: uploadError, data } = await supabase.storage
                    .from("tv-corporativa-media")
                    .upload(fileName, mediaFile);

                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage
                    .from("tv-corporativa-media")
                    .getPublicUrl(data.path);

                finalUrl = publicUrlData.publicUrl;
            }

            // Use RPC to add media via token
            const { data: rpcData, error: rpcError } = await supabase.rpc("public_add_tv_media_via_token", {
                p_token: token,
                p_media_type: mediaType,
                p_url: finalUrl,
                p_name: mediaName.trim() || (mediaType === "supabase_storage" ? mediaFile?.name : "Nova Mídia"),
            });

            if (rpcError) throw rpcError;
            if (!rpcData.success) throw new Error(rpcData.error || "Erro ao salvar mídia");

            showSuccess("Mídia enviada com sucesso!");
            setMediaUrl("");
            setMediaFile(null);
            setMediaName("");
            qc.invalidateQueries({ queryKey: ["public_tv_entity", token] });
        } catch (e: any) {
            showError(e?.message ?? "Erro ao adicionar mídia");
        } finally {
            setLoadingMedia(false);
        }
    };

    const handleDeleteMedia = async (id: string) => {
        if (!confirm("Remover esta mídia?")) return;
        try {
            const { data: rpcData, error: rpcError } = await supabase.rpc("public_delete_tv_media_via_token", {
                p_token: token,
                p_media_id: id
            });

            if (rpcError) throw rpcError;
            if (!rpcData.success) throw new Error(rpcData.error || "Erro ao remover mídia");

            showSuccess("Mídia removida");
            qc.invalidateQueries({ queryKey: ["public_tv_entity", token] });
        } catch (e: any) {
            showError("Erro ao remover: " + e.message);
        }
    };

    if (portalQ.isLoading) {
        return (
            <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-50 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 font-medium">Carregando portal de acesso...</p>
            </div>
        );
    }

    if (portalQ.isError || !portalQ.data?.valid) {
        return (
            <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-50 text-slate-500 p-6 text-center">
                <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-md">
                    <X className="h-12 w-12 text-rose-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Link Inválido ou Expirado</h2>
                    <p className="text-sm text-slate-600 mb-6">Parece que este link de acesso não é mais válido. Entre em contato com o suporte para receber um novo link.</p>
                </div>
            </div>
        );
    }

    const { entity_name, tenant_name, media } = portalQ.data;

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Acesso Facilitado • {tenant_name}</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">{entity_name}</h1>
                        <p className="text-slate-500 mt-1">Gerencie os conteúdos exibidos na sua TV Corporativa.</p>
                    </div>
                </header>

                <div className="grid gap-8 lg:grid-cols-[1fr,350px]">
                    <section className="space-y-6">
                        <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
                            <div className="p-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <Plus className="h-5 w-5 text-indigo-500" /> Adicionar Novo Conteúdo
                                </h2>

                                <div className="space-y-4">
                                    <div>
                                        <Label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Onde está o vídeo?</Label>
                                        <div className="grid grid-cols-3 gap-2">
                                            <Button
                                                variant={mediaType === "google_drive_link" ? "default" : "outline"}
                                                size="sm"
                                                className="rounded-xl"
                                                onClick={() => setMediaType("google_drive_link")}
                                            >
                                                <LinkIcon className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Link</span>
                                            </Button>
                                            <Button
                                                variant={mediaType === "youtube_link" ? "default" : "outline"}
                                                size="sm"
                                                className="rounded-xl"
                                                onClick={() => setMediaType("youtube_link")}
                                            >
                                                <Youtube className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">YouTube</span>
                                            </Button>
                                            <Button
                                                variant={mediaType === "supabase_storage" ? "default" : "outline"}
                                                size="sm"
                                                className="rounded-xl"
                                                onClick={() => setMediaType("supabase_storage")}
                                            >
                                                <UploadCloud className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Upload</span>
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-slate-400 uppercase">Nome ou Título</Label>
                                            <Input
                                                placeholder="Ex: Campanha Verão..."
                                                className="rounded-xl"
                                                value={mediaName}
                                                onChange={e => setMediaName(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-slate-400 uppercase">
                                                {mediaType === "supabase_storage" ? "Selecionar Arquivo" : "URL / Link do Vídeo"}
                                            </Label>
                                            {mediaType === "supabase_storage" ? (
                                                <Input
                                                    type="file"
                                                    accept="video/*"
                                                    className="rounded-xl bg-white"
                                                    onChange={e => setMediaFile(e.target.files?.[0] || null)}
                                                />
                                            ) : (
                                                <Input
                                                    placeholder="https://..."
                                                    className="rounded-xl bg-white"
                                                    value={mediaUrl}
                                                    onChange={e => setMediaUrl(e.target.value)}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    <Button
                                        className="w-full h-12 rounded-2xl shadow-lg shadow-indigo-200 text-lg font-bold transition-transform active:scale-95"
                                        disabled={loadingMedia || (mediaType === "supabase_storage" ? !mediaFile : !mediaUrl.trim())}
                                        onClick={handleAddMedia}
                                    >
                                        {loadingMedia ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Plus className="mr-2 h-5 w-5" />}
                                        Enviar para TV
                                    </Button>
                                </div>
                            </div>
                        </Card>

                        <div className="grid gap-4 sm:grid-cols-2">
                            {media?.length === 0 ? (
                                <div className="sm:col-span-2 py-12 text-center bg-white rounded-3xl border border-dashed border-slate-300">
                                    <p className="text-slate-400">Nenhum vídeo cadastrado ainda.</p>
                                </div>
                            ) : (
                                media?.map((m: any) => (
                                    <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-slate-50 text-indigo-600">
                                                    {m.media_type === 'youtube_link' ? <Youtube className="h-5 w-5" /> : <LinkIcon className="h-5 w-5" />}
                                                </div>
                                                <div className="overflow-hidden">
                                                    <p className="font-bold text-slate-900 truncate">{m.name || "Sem título"}</p>
                                                    <p className="text-[10px] text-slate-400 uppercase">{new Date(m.created_at).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleDeleteMedia(m.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <a href={m.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline truncate">
                                            {m.url}
                                        </a>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    <aside className="space-y-6">
                        <Card className="rounded-3xl border-slate-200 p-6 bg-indigo-900 text-white shadow-xl shadow-indigo-200">
                            <h3 className="text-lg font-bold mb-4">Informações Importantes</h3>
                            <ul className="space-y-4 text-indigo-100 text-sm">
                                <li className="flex gap-3">
                                    <div className="h-5 w-5 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">1</div>
                                    <p>Os vídeos são exibidos em <b>loop infinito</b> conforme a programação da TV.</p>
                                </li>
                                <li className="flex gap-3">
                                    <div className="h-5 w-5 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">2</div>
                                    <p>Links do <b>Google Drive</b> devem estar com permissão de "Qualquer pessoa com o link".</p>
                                </li>
                                <li className="flex gap-3">
                                    <div className="h-5 w-5 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">3</div>
                                    <p>Arquivos de <b>upload direto</b> são mais rápidos e garantem melhor estabilidade na TV.</p>
                                </li>
                            </ul>
                        </Card>

                        <div className="p-6 bg-white border border-slate-200 rounded-3xl text-center">
                            <p className="text-xs text-slate-400 mb-2 font-bold uppercase tracking-wider">Dúvidas?</p>
                            <p className="text-sm text-slate-600">Se precisar de ajuda com formatos ou links, entre em contato com nosso time.</p>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}

