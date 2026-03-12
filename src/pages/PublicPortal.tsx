import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export default function PublicPortal() {
    const { tenantSlug, slug } = useParams();

    const { data: page, isLoading, error } = useQuery({
        queryKey: ["public_portal_page", tenantSlug, slug],
        queryFn: async () => {
            const { data: tenant, error: tError } = await supabase
                .from("tenants")
                .select("id")
                .eq("slug", tenantSlug)
                .single();
            if (tError) throw tError;

            const { data, error: pError } = await supabase
                .from("portal_pages")
                .select("*")
                .eq("tenant_id", tenant.id)
                .eq("slug", slug)
                .eq("is_published", true)
                .single();
            if (pError) throw pError;
            return data;
        }
    });

    if (isLoading) return (
        <div className="max-w-4xl mx-auto py-20 px-6 space-y-12">
            <Skeleton className="h-48 w-full rounded-[40px]" />
            <Skeleton className="h-64 w-full rounded-[40px]" />
        </div>
    );

    if (error || !page) return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-4xl font-bold mb-4">404</h1>
            <p className="text-slate-500">Página não encontrada ou ainda não publicada.</p>
        </div>
    );

    const content = page.content_json || [];
    const sections: Section[] = (Array.isArray(content) && content.length > 0 && !content[0].blocks) 
        ? [{ id: 'migrated', settings: { paddingY: '12' }, blocks: content as Block[] }]
        : content as Section[];

    return (
        <div className="min-h-screen bg-white dark:bg-slate-950 font-sans selection:bg-blue-100 selection:text-blue-900">
            {sections.map((section) => (
                <section 
                    key={section.id} 
                    className="relative bg-cover bg-center overflow-hidden"
                    style={{
                        backgroundImage: section.settings.backgroundImage ? `url(${section.settings.backgroundImage})` : 'none',
                        backgroundColor: section.settings.backgroundColor || 'transparent',
                        paddingTop: `${(Number(section.settings.paddingY) || 0) * 4}px`,
                        paddingBottom: `${(Number(section.settings.paddingY) || 0) * 4}px`,
                    }}
                >
                    <div className="max-w-7xl mx-auto px-6">
                        {section.blocks.map((block) => (
                            <div key={block.id} className="animate-in fade-in duration-700">
                                {block.type === 'hero' && (
                                    <div className="py-12 text-center">
                                        <div className="max-w-4xl mx-auto">
                                            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-6">
                                                {block.content.title}
                                            </h1>
                                            <p className="text-xl md:text-2xl text-slate-50/70 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
                                                {block.content.subtitle}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {block.type === 'header' && (
                                    <header className={cn(
                                        "w-full py-6 px-6 md:px-12 flex items-center transition-all bg-white/80 backdrop-blur-md sticky top-0 z-[100] border-b border-slate-100 rounded-[32px] mb-8 shadow-sm",
                                        block.content.variant === 'logo-center' && "flex-col gap-6"
                                    )}>
                                        <div className={cn(
                                            "flex items-center gap-2",
                                            block.content.variant === 'logo-center' && "w-full justify-center"
                                        )}>
                                            <span className="text-2xl font-black tracking-tighter text-slate-900">
                                                {block.content.logoText}
                                            </span>
                                        </div>

                                        <nav className={cn(
                                            "hidden md:flex flex-1 items-center gap-8 mx-auto",
                                            block.content.variant === 'logo-left' && "ml-12",
                                            block.content.variant === 'logo-center' && "justify-center"
                                        )}>
                                            {(block.content.links || []).map((link: any, idx: number) => (
                                                <a 
                                                    key={idx} 
                                                    href={link.url} 
                                                    className="text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
                                                >
                                                    {link.label}
                                                </a>
                                            ))}
                                        </nav>

                                        <div className={cn(
                                            "flex items-center gap-4",
                                            block.content.variant === 'logo-center' && "hidden"
                                        )}>
                                            {block.content.cta?.label && (
                                                <a 
                                                    href={block.content.cta.url}
                                                    className="h-11 px-6 flex items-center justify-center rounded-2xl bg-slate-900 text-white text-sm font-bold hover:scale-105 transition-transform"
                                                >
                                                    {block.content.cta.label}
                                                </a>
                                            )}
                                        </div>
                                    </header>
                                )}

                                {block.type === 'text' && (
                                    <div className="max-w-3xl mx-auto py-8">
                                        <div className="prose prose-slate dark:prose-invert max-w-none text-lg text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                            {block.content.text}
                                        </div>
                                    </div>
                                )}

                                {block.type === 'html' && (
                                    <div className="w-full py-4" dangerouslySetInnerHTML={{ __html: block.content.html }} />
                                )}

                                {block.type === 'links' && (
                                    <div className="max-w-xl mx-auto py-12">
                                        <div className="flex flex-col gap-4">
                                            {block.content.items?.map((item: any, idx: number) => (
                                                <a 
                                                    key={idx} 
                                                    href={item.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="w-full py-5 px-8 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[24px] flex items-center justify-center font-bold text-lg shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                                                >
                                                    {item.label}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            ))}
            
            <footer className="py-12 text-center text-sm text-slate-400">
                <p>Feito com ❤️ Byfrost</p>
            </footer>
        </div>
    );
}
