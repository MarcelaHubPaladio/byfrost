import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

export function PublicPortalLoading({ label }: { label?: string }) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid place-items-center py-10">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--public-card-text)" as any }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          {label ?? "Carregando…"}
        </div>
      </div>

      <div className="grid gap-4">
        <Card className="rounded-[34px] border-black/10 bg-white/85 p-5 shadow-sm">
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-72 max-w-[80%]" />
            <Skeleton className="h-4 w-52" />
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-[28px] border-black/10 bg-white/85 p-5 shadow-sm">
            <div className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[85%]" />
            </div>
          </Card>
          <Card className="rounded-[28px] border-black/10 bg-white/85 p-5 shadow-sm">
            <div className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[70%]" />
            </div>
          </Card>
        </div>

        <Card className="rounded-[28px] border-black/10 bg-white/85 p-5 shadow-sm">
          <div className="space-y-3">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[78%]" />
          </div>
        </Card>
      </div>
    </div>
  );
}
