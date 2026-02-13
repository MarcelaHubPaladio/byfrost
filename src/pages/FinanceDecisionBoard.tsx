import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { FinancialDecisionBoard } from "@/components/finance/FinancialDecisionBoard";

export default function FinanceDecisionBoard() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="mb-4">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Financeiro • Quadro de Decisões
            </h1>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Arraste cards entre colunas. Estados são persistidos e auditáveis.
            </div>
          </div>

          <FinancialDecisionBoard />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
