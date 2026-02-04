import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CaseCustomerDataEditorCard } from "@/components/case/CaseCustomerDataEditorCard";
import { SalesOrderItemsEditorCard } from "@/components/case/SalesOrderItemsEditorCard";
import { ExternalLink, Image as ImageIcon } from "lucide-react";

type FieldRow = {
  key: string;
  value_text: string | null;
  source?: string | null;
  confidence?: number | null;
};

export function SalesOrderReviewDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  imageUrl: string | null;
  fields: FieldRow[] | undefined;
}) {
  const { open, onOpenChange, caseId, imageUrl, fields } = props;

  const safeUrl = useMemo(() => {
    const u = (imageUrl ?? "").trim();
    return u || null;
  }, [imageUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1000px] rounded-[24px] border-slate-200 bg-white p-0 shadow-xl">
        <div className="grid max-h-[80vh] grid-rows-[auto_1fr] overflow-hidden">
          <DialogHeader className="px-5 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-semibold text-slate-900">
                  Revisão do pedido
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs text-slate-600">
                  Abra a imagem e preencha manualmente os dados ao lado.
                </DialogDescription>
              </div>

              {safeUrl ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 rounded-2xl"
                  onClick={() => window.open(safeUrl, "_blank", "noopener,noreferrer")}
                  title="Abrir imagem em uma nova aba"
                >
                  <ExternalLink className="mr-2 h-4 w-4" /> Abrir
                </Button>
              ) : null}
            </div>
          </DialogHeader>

          <div className="grid gap-0 overflow-hidden md:grid-cols-[1.05fr_0.95fr]">
            {/* Left: image */}
            <div className="relative overflow-hidden border-t border-slate-200 bg-slate-50 md:border-r">
              {safeUrl ? (
                <div className="h-full w-full">
                  <img
                    src={safeUrl}
                    alt="Anexo do pedido"
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-slate-600">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-sm">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900">Sem imagem</div>
                  <div className="text-xs text-slate-600">Este anexo não tem URL.</div>
                </div>
              )}
            </div>

            {/* Right: editable fields */}
            <div className="border-t border-slate-200 bg-white">
              <ScrollArea className="h-[60vh] md:h-[calc(80vh-88px)]">
                <div className="p-4">
                  <CaseCustomerDataEditorCard caseId={caseId} fields={fields} />
                  <Separator className="my-4" />
                  <SalesOrderItemsEditorCard caseId={caseId} />
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
