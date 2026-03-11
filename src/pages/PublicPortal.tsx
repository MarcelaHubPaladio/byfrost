import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Block = {
    id: string;
    type: 'hero' | 'text' | 'image' | 'links' | 'divider';
    content: any;
};

export default function PublicPortal() {
    const { tenantSlug, slug } = useParams();

    const { data: page, isLoading, error } = useQuery({
        queryKey: ["public_portal_page", tenantSlug, slug],
        queryFn: async () => {
            // 1. First find the tenant by slug
            const { data: tenant, error: tError } = await supabase
                .from("tenants")
                .select("id")
                .eq("slug", tenantSlug)
                .single();
            if (tError) throw tError;

            // 2. Find the page for that tenant
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

    const blocks = (page.content_json || []) as Block[];

    return (
        <div className="min-h-screen bg-white dark:bg-slate-950 font-sans selection:bg-blue-100 selection:text-blue-900">
            {blocks.map((block) => (
                <section key={block.id} className="animate-in fade-in duration-700">
                    {block.type === 'hero' && (
                        <div className="py-24 px-6 text-center bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
                            <div className="max-w-4xl mx-auto">
                                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-6">
                                    {block.content.title}
                                </h1>
                                <p className="text-xl md:text-2xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
                                    {block.content.subtitle}
                                </p>
                            </div>
                        </div>
                    )}

                    {block.type === 'text' && (
                        <div className="max-w-3xl mx-auto py-12 px-6">
                            <div className="prose prose-slate dark:prose-invert max-w-none text-lg text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {block.content.text}
                            </div>
                        </div>
                    )}

                    {block.type === 'links' && (
                        <div className="max-w-xl mx-auto py-12 px-6">
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
                </section>
            ))}
            
            <footer className="py-12 text-center text-sm text-slate-400">
                <p>Feito com ❤️ Byfrost</p>
            </footer>
        </div>
    );
}
