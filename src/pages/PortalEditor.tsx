import { useState, useEffect, useCallback } from "react";
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
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type BlockType = 'header' | 'hero' | 'text' | 'image' | 'links' | 'divider' | 'html';

type Block = {
    id: string;
    type: BlockType;
    content: any;
};

type Section = {
    id: string;
    settings: {
        backgroundImage?: string;
        backgroundSize?: 'cover' | 'contain';
        backgroundColor?: string;
        paddingY?: string;
        paddingX?: string;
        columns?: number;
    };
    blocks: Block[];
};

export default function PortalEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [sections, setSections] = useState<Section[]>([]);
    const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

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
            const content = page.content_json;
            // Migration for old structure if necessary
            if (Array.isArray(content) && content.length > 0 && !content[0].blocks) {
                setSections([{
                    id: 'default-section',
                    settings: { paddingY: '12' },
                    blocks: content as Block[]
                }]);
            } else {
                setSections(content as Section[]);
            }
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

    const addSection = () => {
        const newSection: Section = {
            id: crypto.randomUUID(),
            settings: { paddingY: '12', backgroundColor: '#ffffff' },
            blocks: []
        };
        setSections([...sections, newSection]);
    };

    const addBlock = (sectionId: string, type: BlockType) => {
        const newBlock: Block = {
            id: crypto.randomUUID(),
            type,
            content: type === 'header' ? { 
                        variant: 'logo-left', 
                        logoText: page?.title || 'Byfrost',
                        links: [{ label: 'Início', url: '#' }, { label: 'Sobre', url: '#' }],
                        cta: { label: 'Contato', url: '#' }
                     } :
                     type === 'hero' ? { title: 'Bem-vindo', subtitle: 'Subtítulo aqui' } :
                     type === 'text' ? { text: 'Seu texto aqui...' } :
                     type === 'links' ? { items: [{ label: 'Botão 1', url: '#' }] } :
                     type === 'html' ? { html: '<div class="p-4 bg-slate-100 rounded-xl">Custom HTML</div>' } :
                     {},
        };
        setSections(sections.map(s => s.id === sectionId ? { ...s, blocks: [...s.blocks, newBlock] } : s));
    };

    const removeSection = (sectionId: string) => {
        setSections(sections.filter(s => s.id !== sectionId));
    };

    const removeBlock = (sectionId: string, blockId: string) => {
        setSections(sections.map(s => s.id === sectionId ? { ...s, blocks: s.blocks.filter(b => b.id !== blockId) } : s));
    };

    const updateBlockContent = (sectionId: string, blockId: string, newContent: any) => {
        setSections(sections.map(s => s.id === sectionId ? {
            ...s,
            blocks: s.blocks.map(b => b.id === blockId ? { ...b, content: { ...b.content, ...newContent } } : b)
        } : s));
    };

    const updateSectionSettings = (sectionId: string, settings: Partial<Section['settings']>) => {
        setSections(sections.map(s => s.id === sectionId ? { ...s, settings: { ...s.settings, ...settings } } : s));
    };

    const handleDragEnd = (event: any) => {
        const { active, over } = event;
        if (!over) return;

        if (active.id !== over.id) {
            setSections((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleSave = () => {
        saveM.mutate({
            content_json: sections,
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
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Estrutura</p>
                    <Button variant="outline" className="w-full rounded-xl gap-2 border-dashed" onClick={addSection}>
                        <Plus className="h-4 w-4" /> Nova Seção
                    </Button>

                    <div className="pt-4 space-y-4">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Componentes</p>
                        <div className="grid grid-cols-2 gap-3">
                            <BlockButton icon={<Layout />} label="Header" onClick={() => activeSectionId && addBlock(activeSectionId, 'header')} active={!!activeSectionId} />
                            <BlockButton icon={<Layout />} label="Hero" onClick={() => activeSectionId && addBlock(activeSectionId, 'hero')} active={!!activeSectionId} />
                            <BlockButton icon={<Type />} label="Texto" onClick={() => activeSectionId && addBlock(activeSectionId, 'text')} active={!!activeSectionId} />
                            <BlockButton icon={<ImageIcon />} label="Imagem" onClick={() => activeSectionId && addBlock(activeSectionId, 'image')} active={!!activeSectionId} />
                            <BlockButton icon={<LinkIcon />} label="Links" onClick={() => activeSectionId && addBlock(activeSectionId, 'links')} active={!!activeSectionId} />
                            <BlockButton icon={<Plus />} label="HTML" onClick={() => activeSectionId && addBlock(activeSectionId, 'html')} active={!!activeSectionId} />
                        </div>
                        {!activeSectionId && (
                            <p className="text-[10px] text-amber-600 bg-amber-50 p-2 rounded-lg">Selecione uma seção no palco para adicionar blocos.</p>
                        )}
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
                            <DndContext 
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext 
                                    items={sections.map(s => s.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {sections.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center p-20 text-center opacity-40">
                                            <Layout className="h-12 w-12 mb-4" />
                                            <p>Sua página está vazia.<br/>Comece adicionando uma seção.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4 p-4">
                                            {sections.map((section) => (
                                                <SortableSectionItem 
                                                    key={section.id}
                                                    section={section}
                                                    active={activeSectionId === section.id}
                                                    onSelect={() => setActiveSectionId(section.id)}
                                                    onRemove={() => removeSection(section.id)}
                                                    onUpdateSettings={(sets) => updateSectionSettings(section.id, sets)}
                                                    onUpdateBlock={(bid, content) => updateBlockContent(section.id, bid, content)}
                                                    onRemoveBlock={(bid) => removeBlock(section.id, bid)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </SortableContext>
                            </DndContext>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function BlockButton({ icon, label, onClick, active }: { icon: React.ReactNode, label: string, onClick: () => void, active?: boolean }) {
    return (
        <button 
            disabled={!active && label !== 'Header' /* temporary fix to force section select */}
            onClick={onClick}
            className={cn(
                "flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border transition-all text-slate-600 dark:text-slate-400",
                active 
                  ? "border-blue-200 bg-blue-50/50 hover:border-blue-500 hover:text-blue-600" 
                  : "border-slate-100 dark:border-slate-800 opacity-50 cursor-not-allowed"
            )}
        >
            <div className={cn("p-2 rounded-xl", active ? "bg-blue-100" : "bg-slate-50")}>
                {icon}
            </div>
            <span className="text-xs font-medium">{label}</span>
        </button>
    );
}

function SortableSectionItem({ section, active, onSelect, onRemove, onUpdateSettings, onUpdateBlock, onRemoveBlock }: any) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: section.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div 
            ref={setNodeRef} 
            style={{
                backgroundImage: section.settings.backgroundImage ? `url(${section.settings.backgroundImage})` : 'none',
                backgroundColor: section.settings.backgroundColor || 'transparent',
                paddingTop: `${(Number(section.settings.paddingY) || 0) * 4}px`,
                paddingBottom: `${(Number(section.settings.paddingY) || 0) * 4}px`,
                ...style,
            }}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            className={cn(
                "relative group rounded-[32px] border-2 transition-all overflow-hidden",
                active ? "border-blue-500 ring-4 ring-blue-500/10 shadow-xl" : "border-transparent hover:border-slate-200",
                "bg-cover bg-center"
            )}
        >
            {/* Section Controls */}
            <div className="absolute right-4 top-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full shadow-lg bg-white/90" onClick={onRemove}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
                <div {...attributes} {...listeners} className="h-9 w-9 rounded-full shadow-lg bg-white/90 flex items-center justify-center cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </div>
            </div>

            {/* Section Settings Overlay (visible when active) */}
            {active && (
                <div className="absolute left-4 top-4 flex flex-col gap-2 z-20 bg-white/90 backdrop-blur p-4 rounded-2xl shadow-xl border border-slate-100 w-64 animate-in zoom-in-95 duration-200">
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Imagem de Fundo URL</Label>
                            <Input 
                                className="h-8 text-xs rounded-lg" 
                                placeholder="https://..." 
                                value={section.settings.backgroundImage || ''}
                                onChange={(e) => onUpdateSettings({ backgroundImage: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Padding Vertical ({section.settings.paddingY})</Label>
                            <input 
                                type="range" min="0" max="40" step="1"
                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                value={section.settings.paddingY || '12'}
                                onChange={(e) => onUpdateSettings({ paddingY: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Cor de Fundo</Label>
                            <div className="flex gap-2">
                                <input 
                                    type="color" 
                                    className="h-8 w-8 rounded-lg overflow-hidden border-none"
                                    value={section.settings.backgroundColor || '#ffffff'}
                                    onChange={(e) => onUpdateSettings({ backgroundColor: e.target.value })}
                                />
                                <Input 
                                    className="h-8 text-xs rounded-lg flex-1" 
                                    value={section.settings.backgroundColor || '#ffffff'}
                                    onChange={(e) => onUpdateSettings({ backgroundColor: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="relative z-10 space-y-4 px-8">
                {section.blocks.length === 0 && (
                    <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl opacity-40">
                        <Plus className="h-8 w-8 mx-auto mb-2" />
                        <p className="text-sm font-medium">Seção vazia.<br/>Adicione componentes.</p>
                    </div>
                )}
                {section.blocks.map((block: Block) => (
                    <EditorBlockItem 
                        key={block.id} 
                        block={block} 
                        onUpdate={(content: any) => onUpdateBlock(block.id, content)}
                        onRemove={() => onRemoveBlock(block.id)}
                    />
                ))}
            </div>
        </div>
    );
}

function EditorBlockItem({ block, onUpdate, onRemove }: any) {
    return (
        <div className="group/block relative p-4 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100">
            <Button 
                variant="ghost" size="icon" 
                className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-white shadow-sm border border-slate-100 opacity-0 group-hover/block:opacity-100 transition-opacity z-30"
                onClick={onRemove}
            >
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>

            {block.type === 'header' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-4 bg-white/50 p-4 rounded-xl">
                        <Input 
                            className="w-auto font-black text-lg border-none bg-transparent p-0 h-auto"
                            value={block.content.logoText}
                            onChange={(e) => onUpdate({ logoText: e.target.value })}
                        />
                        <div className="flex-1 flex gap-4">
                            {(block.content.links || []).map((link: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-1 group/link">
                                    <Input 
                                        className="w-20 text-xs font-bold border-none bg-transparent p-0 h-auto text-slate-600"
                                        value={link.label}
                                        onChange={(e) => {
                                            const links = [...block.content.links];
                                            links[idx].label = e.target.value;
                                            onUpdate({ links });
                                        }}
                                    />
                                    <button 
                                        className="opacity-0 group-hover/link:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                                        onClick={() => {
                                            const links = block.content.links.filter((_: any, i: number) => i !== idx);
                                            onUpdate({ links });
                                        }}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] rounded-full" onClick={() => {
                                const links = [...(block.content.links || [])];
                                links.push({ label: 'Novo Item', url: '#' });
                                onUpdate({ links });
                            }}>+ Link</Button>
                        </div>
                        <Input 
                            className="w-24 text-center text-[10px] font-black uppercase tracking-widest border-none bg-slate-900 text-white rounded-lg h-8"
                            value={block.content.cta?.label}
                            onChange={(e) => onUpdate({ cta: { ...block.content.cta, label: e.target.value } })}
                        />
                    </div>
                </div>
            )}

            {block.type === 'hero' && (
                <div className="text-center py-6">
                    <Input 
                        className="text-4xl font-black text-center border-none bg-transparent hover:bg-slate-100 focus:bg-slate-100 p-2 h-auto mb-2 rounded-xl"
                        value={block.content.title}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                    />
                    <Input 
                        className="text-lg text-slate-500 text-center border-none bg-transparent hover:bg-slate-100 focus:bg-slate-100 p-2 h-auto rounded-xl"
                        value={block.content.subtitle}
                        onChange={(e) => onUpdate({ subtitle: e.target.value })}
                    />
                </div>
            )}

            {block.type === 'text' && (
                <textarea 
                    className="w-full min-h-[80px] border-none bg-transparent hover:bg-slate-100 focus:bg-slate-100 p-3 rounded-xl resize-none text-slate-700 font-medium"
                    value={block.content.text}
                    onChange={(e) => onUpdate({ text: e.target.value })}
                />
            )}

            {block.type === 'html' && (
                <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Custom HTML/CSS</Label>
                    <textarea 
                        className="w-full min-h-[120px] font-mono text-xs border border-slate-200 bg-slate-900 text-green-400 p-3 rounded-xl resize-none"
                        value={block.content.html}
                        onChange={(e) => onUpdate({ html: e.target.value })}
                    />
                </div>
            )}

            {block.type === 'links' && (
                <div className="flex flex-col items-center gap-3 py-4 w-full max-w-sm mx-auto">
                    {(block.content.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="w-full flex items-center gap-2">
                            <Input 
                                className="flex-1 h-12 bg-slate-900 text-white rounded-xl text-center font-bold"
                                value={item.label}
                                onChange={(e) => {
                                    const items = [...block.content.items];
                                    items[idx].label = e.target.value;
                                    onUpdate({ items });
                                }}
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => {
                                const items = block.content.items.filter((_: any, i: number) => i !== idx);
                                onUpdate({ items });
                            }}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    <Button variant="outline" size="sm" className="rounded-full h-8 px-4" onClick={() => {
                        const items = [...(block.content.items || [])];
                        items.push({ label: 'Novo Botão', url: '#' });
                        onUpdate({ items });
                    }}>+ Adicionar Botão</Button>
                </div>
            )}
        </div>
    );
}
