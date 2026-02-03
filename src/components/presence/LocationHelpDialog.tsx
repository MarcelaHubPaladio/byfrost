import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MapPinOff, Navigation, ShieldAlert } from "lucide-react";

export type LocationHelpReason =
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "insecure_context"
  | "unavailable"
  | "unknown";

function reasonCopy(reason: LocationHelpReason) {
  switch (reason) {
    case "permission_denied":
      return {
        title: "Permissão de localização bloqueada",
        desc: "Seu navegador está bloqueando o acesso à sua localização. Sem isso, não dá para registrar a batida.",
      };
    case "position_unavailable":
      return {
        title: "Não foi possível obter a localização",
        desc: "O GPS/sinal pode estar indisponível no momento. Tente novamente ou vá para um local com melhor sinal.",
      };
    case "timeout":
      return {
        title: "Tempo esgotado ao obter localização",
        desc: "Demorou mais do que o esperado para validar sua posição. Tente novamente.",
      };
    case "insecure_context":
      return {
        title: "Localização só funciona em HTTPS",
        desc: "Por segurança, o navegador só libera geolocalização em páginas HTTPS. Abra o sistema pelo link seguro.",
      };
    case "unavailable":
      return {
        title: "Geolocalização indisponível",
        desc: "Seu dispositivo/navegador não suporta geolocalização ou ela está desativada.",
      };
    default:
      return {
        title: "Localização necessária",
        desc: "Para registrar a batida, precisamos da sua localização atual.",
      };
  }
}

export function LocationHelpDialog({
  open,
  onOpenChange,
  reason,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: LocationHelpReason;
  onRetry: () => void;
}) {
  const copy = reasonCopy(reason);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[28px] border-slate-200 p-0 sm:max-w-[520px]">
        <div className="rounded-[28px] bg-white p-5">
          <DialogHeader>
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
              <MapPinOff className="h-4 w-4" />
              A batida exige localização
            </div>
            <DialogTitle className="mt-3 text-lg tracking-tight text-slate-900">{copy.title}</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-slate-600">{copy.desc}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-2">
              <Navigation className="mt-0.5 h-4 w-4 text-[hsl(var(--byfrost-accent))]" />
              <div className="text-sm text-slate-700">
                <div className="font-semibold text-slate-900">Como liberar</div>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-700">
                  <li>
                    Ative o <span className="font-semibold">GPS/Localização</span> do celular.
                  </li>
                  <li>
                    No navegador, permita <span className={cn("font-semibold", "text-slate-900")}>
                      Localização
                    </span>{" "}
                    para este site.
                  </li>
                  <li>
                    Se estiver bloqueado, remova o bloqueio em: <span className="font-semibold">Configurações</span> →
                    <span className="font-semibold"> Privacidade</span> → <span className="font-semibold">Localização</span>
                    (varia por aparelho).
                  </li>
                </ul>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-700" />
              <div className="text-sm text-slate-700">
                Se você marcou “<span className="font-semibold">Não perguntar novamente</span>”, o navegador não vai abrir
                o popup — é necessário desbloquear manualmente nas configurações.
              </div>
            </div>
          </div>

          <DialogFooter className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" className="h-11 rounded-2xl" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button
              className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
              onClick={onRetry}
            >
              Tentar novamente
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
