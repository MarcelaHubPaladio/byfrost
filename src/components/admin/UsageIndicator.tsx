import { cn } from "@/lib/utils";

interface UsageIndicatorProps {
    label: string;
    current: number;
    max: number;
    icon: any;
}

export function UsageIndicator({ label, current, max, icon: Icon }: UsageIndicatorProps) {
    const percent = max > 0 ? Math.min(Math.round((current / max) * 100), 100) : 0;
    const color = percent > 90 ? "bg-rose-500" : percent > 70 ? "bg-amber-500" : "bg-indigo-500";

    return (
        <div className="flex flex-col gap-1 min-w-[80px]">
            <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-400 tracking-tighter">
                <span className="flex items-center gap-1">
                    <Icon className="h-2.5 w-2.5" /> {label}
                </span>
                <span className={cn(percent > 90 ? "text-rose-600" : "text-slate-500")}>
                    {current}{max > 0 ? `/${max}` : ""}
                </span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner dark:bg-slate-800">
                <div
                    className={cn("h-full transition-all duration-500 ease-out", color)}
                    style={{ width: `${max > 0 ? percent : 0}%` }}
                />
            </div>
        </div>
    );
}
