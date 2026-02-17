import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type PublicReportData = {
  commitments_selected: number;
  deliverables_in_scope: number;
  cases_related: number;
  timeline_events: number;
  publications_scheduled: number;
  publications_published: number;
};

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="rounded-[28px] border-black/10 bg-white/85 p-4 shadow-sm">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </Card>
  );
}

export function PublicReport({ report }: { report: PublicReportData }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" style={{ color: "var(--public-card-text)" as any }}>
        <Badge variant="secondary">Relatório</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Compromissos (selecionados na proposta)" value={report.commitments_selected} />
        <MetricCard label="Deliverables no escopo" value={report.deliverables_in_scope} />
        <MetricCard label="Casos relacionados (jornadas)" value={report.cases_related} />
        <MetricCard label="Eventos no histórico" value={report.timeline_events} />
        <MetricCard label="Postagens agendadas" value={report.publications_scheduled} />
        <MetricCard label="Postagens publicadas" value={report.publications_published} />
      </div>

      <Card className="rounded-[28px] border-black/10 bg-white/85 p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Resumo</div>
        <div className="mt-2 text-sm text-slate-700">
          Esta visão pública reúne escopo, agenda de postagens e histórico de interações para a entidade relacionada.
        </div>
      </Card>
    </div>
  );
}
