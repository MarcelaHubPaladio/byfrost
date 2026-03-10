import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { formatCurrency, formatDate } from "@/utils/format";
import { useTenant } from "@/providers/TenantProvider";

export function ReceiptPdfDialog({
  open,
  onOpenChange,
  receipt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: any;
}) {
  const { activeTenant } = useTenant();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const win = window.open("", "_blank");
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>Recibo - ${receipt.recipient_name}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.6; }
            .container { max-width: 800px; margin: 0 auto; border: 1px solid #eee; padding: 40px; border-radius: 8px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
            .header-info div { margin-bottom: 4px; }
            .receipt-title { font-size: 24px; font-weight: bold; }
            .amount-box { background: #f9f9f9; padding: 15px; border: 1px solid #ddd; font-size: 20px; font-weight: bold; text-align: right; margin-bottom: 30px; }
            .content-section { margin-bottom: 40px; }
            .label { font-weight: bold; color: #666; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; }
            .value { font-size: 16px; margin-bottom: 20px; }
            .signature-area { margin-top: 80px; display: flex; flex-direction: column; align-items: center; }
            .signature-line { width: 300px; border-top: 1px solid #333; margin-bottom: 10px; }
            .tenant-footer { margin-top: 40px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="receipt-title">RECIBO</div>
              <div class="header-info">
                <div style="font-weight: bold;">Nº ${receipt.id.slice(0, 8).toUpperCase()}</div>
                <div>Data: ${formatDate(receipt.occurred_at)}</div>
              </div>
            </div>

            <div class="amount-box">
              VALOR: ${formatCurrency(receipt.amount)}
            </div>

            <div class="content-section">
              <div class="label">Recebemos de:</div>
              <div class="value">${receipt.recipient_name} ${receipt.recipient_document ? `(${receipt.recipient_document})` : ""}</div>

              <div class="label">A importância de:</div>
              <div class="value">${formatCurrency(receipt.amount)}</div>

              <div class="label">Referente a:</div>
              <div class="value">${receipt.description || "Prestação de serviços"}</div>
            </div>

            <div class="signature-area">
              ${activeTenant?.branding_json?.receipt_signature
        ? `<img src="${activeTenant.branding_json.receipt_signature}" style="height: 60px; margin-bottom: 5px; mix-blend-multiply;" />`
        : `<div class="signature-line"></div>`
      }
              <div style="font-weight: bold;">${activeTenant?.name || "Prestador"}</div>
              <div style="font-size: 14px; color: #666;">Emitente</div>
            </div>

            <div class="tenant-footer">
              Este recibo é um documento comprobatório de pagamento.<br/>
              Gerado via ${activeTenant?.name || "Byfrost"}.
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Visualização do Recibo</DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="p-8 border rounded-xl bg-white shadow-sm font-sans text-slate-900 leading-relaxed">
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">RECIBO</h1>
              <p className="text-sm text-slate-500 mt-1">Nº {receipt.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{activeTenant?.name}</p>
              <p className="text-sm text-slate-500">{formatDate(receipt.occurred_at)}</p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-6 rounded-lg text-2xl font-bold text-right mb-8">
            VALOR: {formatCurrency(receipt.amount)}
          </div>

          <div className="space-y-6">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Recebemos de:</p>
              <p className="text-lg font-medium">{receipt.recipient_name} {receipt.recipient_document ? <span className="text-slate-500 font-normal">({receipt.recipient_document})</span> : ""}</p>
            </div>

            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">A importância de:</p>
              <p className="text-lg">{formatCurrency(receipt.amount)}</p>
            </div>

            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Referente a:</p>
              <p className="text-lg whitespace-pre-wrap">{receipt.description || "Prestação de serviços"}</p>
            </div>
          </div>

          <div className="mt-20 flex flex-col items-center">
            {activeTenant?.branding_json?.receipt_signature ? (
              <div className="mb-2">
                <img
                  src={activeTenant.branding_json.receipt_signature}
                  alt="Assinatura"
                  className="h-16 w-auto object-contain mix-blend-multiply"
                />
              </div>
            ) : (
              <div className="w-64 border-t border-slate-900 mb-2"></div>
            )}
            <p className="font-bold">{activeTenant?.name}</p>
            <p className="text-sm text-slate-500">Emitente</p>
          </div>

          <div className="mt-12 pt-6 border-t border-slate-100 text-center text-[10px] text-slate-400 italic">
            Este recibo é um documento comprobatório de pagamento gerado digitalmente.
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handlePrint} className="bg-slate-900 text-white hover:bg-slate-800">
            <Printer className="mr-2 h-4 w-4" />
            Imprimir / Salvar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
