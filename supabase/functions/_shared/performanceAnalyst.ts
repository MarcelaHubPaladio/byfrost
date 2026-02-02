type MetricPoint = {
  window_days: number;
  impressions: number | null;
  profile_visits: number | null;
  follows: number | null;
  messages: number | null;
};

function safeNum(n: any) {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function diff(a: number | null, b: number | null) {
  if (a == null || b == null) return null;
  return b - a;
}

function pct(a: number | null, b: number | null) {
  if (a == null || b == null || a <= 0) return null;
  return (b - a) / a;
}

function fmtPct(v: number) {
  const p = Math.round(v * 100);
  return `${p}%`;
}

export function buildPerformanceReport({
  points,
  channel,
}: {
  points: MetricPoint[];
  channel: string;
}) {
  const sorted = [...points]
    .map((p) => ({
      window_days: p.window_days,
      impressions: safeNum(p.impressions),
      profile_visits: safeNum(p.profile_visits),
      follows: safeNum(p.follows),
      messages: safeNum(p.messages),
    }))
    .sort((a, b) => a.window_days - b.window_days);

  const last = sorted[sorted.length - 1] ?? null;
  const d1 = sorted.find((p) => p.window_days === 1) ?? null;
  const d3 = sorted.find((p) => p.window_days === 3) ?? null;
  const d7 = sorted.find((p) => p.window_days === 7) ?? null;

  const growth = {
    imp_d1_d3: d1 ? diff(d1.impressions, d3?.impressions ?? null) : null,
    imp_d3_d7: d3 ? diff(d3.impressions, d7?.impressions ?? null) : null,
    imp_pct_d1_d3: d1 ? pct(d1.impressions, d3?.impressions ?? null) : null,
    imp_pct_d3_d7: d3 ? pct(d3.impressions, d7?.impressions ?? null) : null,
  };

  const patterns: string[] = [];
  const recommendations: string[] = [];

  if (last?.impressions != null) {
    if (last.impressions < 500) patterns.push("Alcance baixo para o período — provável falta de distribuição inicial ou criativo pouco atrativo.");
    else if (last.impressions < 3000) patterns.push("Alcance moderado — há tração, mas ainda com espaço para otimização.");
    else patterns.push("Alcance forte — conteúdo com boa distribuição e interesse inicial.");
  } else {
    patterns.push("Impressões não disponíveis via API para este post/conta (ver permissões e tipo de mídia). ");
  }

  if (growth.imp_pct_d1_d3 != null) {
    if (growth.imp_pct_d1_d3 < 0.15) patterns.push("Crescimento fraco após D+1 — o post não ganhou ‘segunda onda’. ");
    else patterns.push(`Crescimento saudável após D+1 (+${fmtPct(growth.imp_pct_d1_d3)} até D+3).`);
  }

  if (growth.imp_pct_d3_d7 != null) {
    if (growth.imp_pct_d3_d7 < 0.1) patterns.push("Conteúdo esgota rápido — pouca cauda longa.");
    else patterns.push(`Boa cauda longa (+${fmtPct(growth.imp_pct_d3_d7)} entre D+3 e D+7).`);
  }

  if (channel === "ig_story") {
    recommendations.push("Use stickers (enquete/pergunta) para aumentar replies; isso melhora retenção e sinais de conversa.");
    recommendations.push("Abra com um gancho nos 2 primeiros segundos (texto grande + promessa clara).");
  } else {
    recommendations.push("Otimize a primeira linha da legenda (gancho) e inclua CTA claro (salvar, comentar, enviar). ");
    recommendations.push("Teste variações de capa e 1º frame — o CTR do feed depende muito disso.");
  }

  recommendations.push("Republique nos Stories nas primeiras 24h com contexto (‘por que isso importa’).");
  recommendations.push("Padronize horários: replique em 2-3 janelas por semana e compare D+1 vs D+3.");

  const summaryParts: string[] = [];
  summaryParts.push(`Canal: ${channel}.`);
  if (last?.impressions != null) summaryParts.push(`Impressões até D+${last.window_days}: ${last.impressions}.`);
  if (last?.profile_visits != null) summaryParts.push(`Visitas ao perfil (janela): ${last.profile_visits}.`);
  if (last?.follows != null) summaryParts.push(`Novos follows (janela): ${last.follows}.`);
  if (last?.messages != null) summaryParts.push(`Mensagens/replies (janela): ${last.messages}.`);

  const reportText =
    `Resumo\n` +
    `- ${summaryParts.join(" ")}\n\n` +
    `Padrões observados\n` +
    patterns.map((p) => `- ${p}`).join("\n") +
    `\n\nRecomendações\n` +
    recommendations.map((r) => `- ${r}`).join("\n");

  return {
    summary: summaryParts.join(" "),
    patterns,
    recommendations,
    reportText,
    derived: { growth },
  };
}
