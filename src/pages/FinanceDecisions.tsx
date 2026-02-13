import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { FinancialDecisionsPanel } from "@/components/finance/FinancialDecisionsPanel";

export default function FinanceDecisions() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-4">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Financeiro • Decisões
            </h1>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Cards gerados a partir de tensões, com ações recomendadas e status.
            </div>
          </div>

          <FinancialDecisionsPanel />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
