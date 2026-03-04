import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Package, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function LinkedOrdersAccordion({ tenantId, caseId }: { tenantId: string; caseId: string }) {
    const ordersQ = useQuery({
        queryKey: ["crm_linked_orders", tenantId, caseId],
        enabled: Boolean(tenantId && caseId),
        queryFn: async () => {
            // Find cases where journey_id is sales_order and parent_case_id in meta_json matches this case
            const { data: journeyData } = await supabase
                .from("journeys")
                .select("id, default_state_machine_json")
                .eq("key", "sales_order")
                .maybeSingle();

            if (!journeyData) return { orders: [], journey: null };

            const { data, error } = await supabase
                .from("cases")
                .select("id, status, state, created_at, title")
                .eq("tenant_id", tenantId)
                .eq("journey_id", journeyData.id)
                .contains("meta_json", { parent_case_id: caseId })
                .is("deleted_at", null)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return { orders: data ?? [], journey: journeyData };
        },
    });

    const { orders = [], journey } = ordersQ.data ?? {};

    if (ordersQ.isLoading) {
        return (
            <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando pedidos...
            </div>
        );
    }

    if (orders.length === 0) {
        return null; // Return nothing if there are no linked orders.
    }

    const getStateLabel = (stateKey: string) => {
        if (!journey?.default_state_machine_json?.states) return stateKey;
        const states = journey.default_state_machine_json.states;
        if (Array.isArray(states)) return stateKey;
        return states[stateKey]?.label ?? stateKey;
    };

    return (
        <div className="mt-4">
            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="orders" className="border-slate-200 bg-slate-50 rounded-2xl px-4">
                    <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-2">
                            <div className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
                                <Package className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-semibold text-slate-800">
                                Pedidos Vinculados <Badge variant="secondary" className="ml-1 px-1.5">{orders.length}</Badge>
                            </span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-1 pb-3">
                        <div className="space-y-2 mt-2">
                            {orders.map((order: any) => (
                                <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                                    <div>
                                        <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                                            {order.title || `Pedido ${order.id.split("-")[0]}`}
                                            <Badge variant="outline" className="text-[10px] h-5 bg-slate-50 text-slate-600">
                                                {getStateLabel(order.state)}
                                            </Badge>
                                        </div>
                                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                                            <span>{format(new Date(order.created_at), "dd/MM/yyyy HH:mm")}</span>
                                            <span>•</span>
                                            <span className="uppercase text-[10px] tracking-wider text-slate-400 font-medium">#{order.id.slice(0, 8)}</span>
                                        </div>
                                    </div>
                                    <Link
                                        to={`/app/cases/${order.id}`}
                                        target="_blank"
                                        className="inline-flex h-8 items-center justify-center rounded-xl bg-slate-100 px-3 text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors"
                                    >
                                        Ver <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}
