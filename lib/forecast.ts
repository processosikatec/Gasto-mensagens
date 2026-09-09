// Projeção de volume para meses futuros.
//
// Base de cálculo: até 24 meses de histórico (2 ciclos anuais). Para cada campo:
//   1. tendência = regressão linear por mínimos quadrados sobre a série completa;
//   2. índice sazonal por mês do ano = média do (valor / tendência) de cada mês
//      calendário nos anos disponíveis — capta baixa de dez, alta de jan, etc.;
//   3. projeção do mês k = tendência(k) × índice sazonal do mês de k.
// A tendência só é aplicada se for forte o bastante (>= MIN_SLOPE_RATIO da média);
// senão usa a média histórica como nível. Banda de incerteza = ±1σ dos resíduos.

import type { Volume } from "./digisac";

const BLEND_TREND = 0.6;
const MIN_SLOPE_RATIO = 0.015; // tendência < 1.5% da média/mês => nível flat
const MIN_MONTHS_FOR_SEASONALITY = 12; // precisa de >= 1 ciclo p/ índice sazonal

export type ProjectedField = { base: number; low: number; high: number };
export type ProjectedVolume = { [K in keyof Volume]: ProjectedField };

function linreg(ys: number[]): { slope: number; intercept: number } {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const sx = ((n - 1) * n) / 2;
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxy = ys.reduce((a, y, i) => a + i * y, 0);
  const sxx = ys.reduce((a, _, i) => a + i * i, 0);
  const d = n * sxx - sx * sx;
  if (d === 0) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / d;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

/**
 * @param values série mensal (cronológica) de 1 campo
 * @param monthsOfYear mês do ano (1-12) de cada ponto de `values`, na mesma ordem
 * @param futureMonthsOfYear mês do ano (1-12) de cada mês a projetar
 */
function projectSeries(
  values: number[],
  monthsOfYear: number[],
  futureMonthsOfYear: number[],
): ProjectedField[] {
  const n = values.length;
  const horizon = futureMonthsOfYear.length;
  if (n === 0) {
    return futureMonthsOfYear.map(() => ({ base: 0, low: 0, high: 0 }));
  }

  const avgAll = values.reduce((a, b) => a + b, 0) / n;
  const { slope, intercept } = linreg(values);
  const trendMatters = avgAll > 0 && Math.abs(slope) >= MIN_SLOPE_RATIO * avgAll;
  const trendAt = (i: number) => (trendMatters ? intercept + slope * i : avgAll);

  // índice sazonal por mês do ano: média de (valor / tendência) nesse mês
  const seasonal = new Map<number, number>();
  if (n >= MIN_MONTHS_FOR_SEASONALITY) {
    const byMonth = new Map<number, number[]>();
    values.forEach((v, i) => {
      const t = trendAt(i);
      if (t > 0) {
        const arr = byMonth.get(monthsOfYear[i]) ?? [];
        arr.push(v / t);
        byMonth.set(monthsOfYear[i], arr);
      }
    });
    for (const [m, ratios] of byMonth) {
      const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      // limita o ajuste sazonal a ±30% p/ não distorcer demais
      seasonal.set(m, Math.min(1.3, Math.max(0.7, mean)));
    }
  }
  const seasonalFor = (moy: number) => seasonal.get(moy) ?? 1;

  // dispersão dos resíduos em torno de tendência × sazonal
  const recent = values.slice(-3);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const resid = values.map((v, i) => v - trendAt(i) * seasonalFor(monthsOfYear[i]));
  const absSorted = resid.map(Math.abs).sort((a, b) => a - b);
  const mad = absSorted.length ? absSorted[Math.floor(absSorted.length / 2)] : avgAll * 0.15;
  const sigma = Math.max(1.4826 * mad, avgAll * 0.08);

  const out: ProjectedField[] = [];
  for (let k = 1; k <= horizon; k++) {
    const trend = trendAt(n - 1 + k);
    const season = seasonalFor(futureMonthsOfYear[k - 1]);
    let base: number;
    if (trendMatters) {
      base = (BLEND_TREND * trend + (1 - BLEND_TREND) * avgRecent) * season;
    } else {
      base = avgAll * season;
    }
    base = Math.max(0, base);
    let spread = sigma * Math.sqrt(k) * 0.9;
    spread = Math.min(spread, base * 0.5);
    out.push({
      base: Math.round(base),
      low: Math.max(0, Math.round(base - spread)),
      high: Math.round(base + spread),
    });
  }
  return out;
}

const FIELDS: (keyof Volume)[] = [
  "sent",
  "received",
  "service",
  "campaignFreeform",
  "template",
  "campaignTemplate",
];

/**
 * @param history volumes mensais (cronológico, só meses COMPLETOS) — até 24
 * @param historyMonths "YYYY-MM" de cada item de `history`, mesma ordem
 * @param futureMonths "YYYY-MM" dos meses a projetar
 */
export function forecastVolumes(
  history: Volume[],
  historyMonths: string[],
  futureMonths: string[],
): {
  months: ProjectedVolume[];
  method: string;
  slopePerMonthSent: number;
  monthsUsed: number;
  seasonalityApplied: boolean;
} {
  const moy = historyMonths.map((m) => Number(m.split("-")[1]));
  const futMoy = futureMonths.map((m) => Number(m.split("-")[1]));
  const horizon = futureMonths.length;

  const byField = {} as Record<keyof Volume, ProjectedField[]>;
  for (const f of FIELDS) {
    byField[f] = projectSeries(
      history.map((v) => v[f]),
      moy,
      futMoy,
    );
  }

  const months: ProjectedVolume[] = Array.from({ length: horizon }, (_, k) => {
    const row = {} as ProjectedVolume;
    for (const f of FIELDS) row[f] = byField[f][k];
    return row;
  });

  const sentSeries = history.map((v) => v.sent);
  const { slope } = linreg(sentSeries);
  const avgSent = sentSeries.length
    ? sentSeries.reduce((a, b) => a + b, 0) / sentSeries.length
    : 0;
  const trendMatters = avgSent > 0 && Math.abs(slope) >= MIN_SLOPE_RATIO * avgSent;
  const seasonalityApplied = history.length >= MIN_MONTHS_FOR_SEASONALITY;

  const parts: string[] = [`Base: ${history.length} meses de histórico.`];
  parts.push(
    trendMatters
      ? `Tendência de ${slope >= 0 ? "+" : ""}${Math.round(slope).toLocaleString(
          "pt-BR",
        )} enviadas/mês.`
      : "Volume sem tendência relevante — nível pela média histórica.",
  );
  if (seasonalityApplied) parts.push("Ajuste sazonal por mês do ano aplicado.");
  parts.push("Banda de ±1σ dos resíduos.");

  return {
    months,
    method: parts.join(" "),
    slopePerMonthSent: trendMatters ? Math.round(slope) : 0,
    monthsUsed: history.length,
    seasonalityApplied,
  };
}

export function baseVolume(p: ProjectedVolume): Volume {
  return {
    sent: p.sent.base,
    received: p.received.base,
    service: p.service.base,
    campaignFreeform: p.campaignFreeform.base,
    template: p.template.base,
    campaignTemplate: p.campaignTemplate.base,
  };
}

export function boundVolume(p: ProjectedVolume, bound: "low" | "high"): Volume {
  return {
    sent: p.sent[bound],
    received: p.received[bound],
    service: p.service[bound],
    campaignFreeform: p.campaignFreeform[bound],
    template: p.template[bound],
    campaignTemplate: p.campaignTemplate[bound],
  };
}
