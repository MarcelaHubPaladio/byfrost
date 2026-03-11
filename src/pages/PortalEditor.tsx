import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
    ChevronLeft, 
    Save, 
    Plus, 
    Type, 
    Image as ImageIcon, 
    Link as LinkIcon, 
    Layout,
    Trash2,
    GripVertical,
    Eye,
    Monitor,
    Smartphone
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Block = {
    id: string;
    type: 'hero' | 'text' | 'image' | 'links' | 'divider';
    content: any;
};

export default function PortalEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

    const { data: page, isLoading } = useQuery({
        queryKey: ["portal_page", id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("portal_pages")
                .select("*")
                .eq("id", id)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: !!id,
    });

    useEffect(() => {
        if (page?.content_json) {
            setBlocks(page.content_json as Block[]);
        }
    }, [page]);

    const saveM = useMutation({
        mutationFn: async (payload: any) => {
            const { error } = await supabase
                .from("portal_pages")
                .update(payload)
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["portal_page", id] });
            toast.success("Página salva com sucesso!");
        },
        onError: (err: any) => {
            toast.error(err.message || "Erro ao salvar");
        }
    });

    const addBlock = (type: Block['type']) => {
        const newBlock: Block = {
            id: crypto.randomUUID(),
            type,
            content: type === 'hero' ? { title: 'Bem-vindo', subtitle: 'Subtítulo aqui' } :
                     type === 'text' ? { text: 'Seu texto aqui...' } :
                     type === 'links' ? { items: [{ label: 'Botão 1', url: '#' }] } :
                     {},
        };
        setBlocks([...blocks, newBlock]);
    };

    const removeBlock = (blockId: string) => {
        setBlocks(blocks.filter(b => b.id !== blockId));
    };

    const updateBlockContent = (blockId: string, newContent: any) => {
        setBlocks(blocks.map(b => b.id === blockId ? { ...b, content: { ...b.content, ...newContent } } : b));
    };

    const handleSave = () => {
        saveM.mutate({
            content_json: blocks,
            updated_at: new Date().toISOString(),
        });
    };

    if (isLoading) return <div className="p-20"><Skeleton className="h-full w-full rounded-3xl" /></div>;

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
            {/* Sidebar - Blocks */}
            <div className="w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => navigate('/app/portal')}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h2 className="font-semibold">Editor de Portal</h2>
                </div>
                
                <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Adicionar Blocos</p>
                    <div className="grid grid-cols-2 gap-3">
                        <BlockButton icon={<Layout />} label="Hero" onClick={() => addBlock('hero')} />
                        <BlockButton icon={<Type />} label="Texto" onClick={() => addBlock('text')} />
                        <BlockButton icon={<ImageIcon />} label="Imagem" onClick={() => addBlock('image')} />
                        <BlockButton icon={<LinkIcon />} label="Links" onClick={() => addBlock('links')} />
                    </div>

                    <div className="pt-8 space-y-6">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Configurações</p>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm">Publicado</Label>
                                <Switch 
                                    checked={page?.is_published} 
                                    onCheckedChange={(val) => saveM.mutate({ is_published: val })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm">URL da Página</Label>
                                <Input value={page?.slug} readOnly className="bg-slate-50 text-xs h-9 rounded-lg" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 dark:border-slate-800">
                    <Button className="w-full rounded-xl gap-2 h-11" onClick={handleSave} disabled={saveM.isPending}>
                        <Save className="h-4 w-4" />
                        {saveM.isPending ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                </div>
            </div>

            {/* Main Editor Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-8">
                    <div className="flex items-center gap-2">
                        <Button 
                            variant={previewMode === 'desktop' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            className="rounded-lg h-9"
                            onClick={() => setPreviewMode('desktop')}
                        >
                            <Monitor className="h-4 w-4 mr-2" /> Desktop
                        </Button>
                        <Button 
                            variant={previewMode === 'mobile' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            className="rounded-lg h-9"
                            onClick={() => setPreviewMode('mobile')}
                        >
                            <Smartphone className="h-4 w-4 mr-2" /> Mobile
                        </Button>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-500 font-medium">{page?.title}</span>
                        <div className="h-4 w-[1px] bg-slate-200" />
                        <Button variant="outline" size="sm" className="rounded-lg h-9 gap-2" onClick={() => window.open(`/l/${page?.slug}`, '_blank')}>
                            <Eye className="h-4 w-4" /> Visualizar
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-12 bg-slate-100 dark:bg-slate-950 flex justify-center">
                    <div className={cn(
                        "transition-all duration-500 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden min-h-[800px]",
                        previewMode === 'desktop' ? "w-full max-w-5xl rounded-[40px]" : "w-[375px] rounded-[60px] border-[12px] border-slate-800"
                    )}>
                        {/* Render Editor Blocks */}
                        <div className="h-full">
                            {blocks.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center p-20 text-center opacity-40">
                                    <Layout className="h-12 w-12 mb-4" />
                                    <p>Sua página está vazia.<br/>Arraste ou clique em um bloco para começar.</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {blocks.map((block) => (
                                        <div key={block.id} className="group relative border-b border-transparent hover:border-blue-200 transition-all">
                                            <div className="absolute right-4 top-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full shadow-md" onClick={() => removeBlock(block.id)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                                <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full shadow-md cursor-grab">
                                                    <GripVertical className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            
                                            <div className="p-8">
                                                {block.type === 'hero' && (
                                                    <div className="text-center py-12">
                                                        <Input 
                                                            className="text-4xl font-bold text-center border-none bg-transparent hover:bg-slate-50 focus:bg-slate-50 p-0 h-auto mb-4"
                                                            value={block.content.title}
                                                            onChange={(e) => updateBlockContent(block.id, { title: e.target.value })}
                                                        />
                                                        <Input 
                                                            className="text-xl text-slate-500 text-center border-none bg-transparent hover:bg-slate-50 focus:bg-slate-50 p-0 h-auto"
                                                            value={block.content.subtitle}
                                                            onChange={(e) => updateBlockContent(block.id, { subtitle: e.target.value })}
                                                        />
                                                    </div>
                                                )}

                                                {block.type === 'text' && (
                                                    <textarea 
                                                        className="w-full min-h-[100px] border-none bg-transparent hover:bg-slate-50 focus:bg-slate-50 p-4 rounded-xl resize-none text-slate-700"
                                                        value={block.content.text}
                                                        onChange={(e) => updateBlockContent(block.id, { text: e.target.value })}
                                                    />
                                                )}

                                                {block.type === 'links' && (
                                                    <div className="flex flex-col items-center gap-4 py-8 w-full max-w-md mx-auto">
                                                        {block.content.items?.map((item: any, idx: number) => (
                                                            <div key={idx} className="w-full h-14 bg-slate-900 text-white rounded-[20px] flex items-center justify-center font-medium shadow-lg">
                                                                {item.label}
                                                            </div>
                                                        ))}
                                                        <Button variant="outline" size="sm" className="rounded-full mt-4 h-8" onClick={() => {
                                                            const items = [...(block.content.items || [])];
                                                            items.push({ label: 'Novo Botão', url: '#' });
                                                            updateBlockContent(block.id, { items });
                                                        }}>
                                                            + Botão
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function BlockButton({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
    return (
        <button 
            onClick={onClick}
            className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
        >
            <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30">
                {icon}
            </div>
            <span className="text-xs font-medium">{label}</span>
        </button>
    );
}
