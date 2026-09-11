import type { ServiceInfo, TemplateMix, Volume } from "./digisac";
import type { CostBreakdown } from "./costing";

export type { Volume, TemplateMix, CostBreakdown };

/** Contagem absoluta de templates enviados no mês, por categoria da Meta. */
export type TemplateByCategory = {
  marketing: number;
  utility: number;
  authentication: number;
};

export type MonthRow = {
  month: string; // "YYYY-MM"
  label: string; // "Ago/26"
  partial: boolean;
  elapsedRatio: number;
  volume: Volume;
  cost: CostBreakdown;
  /** custo do mês se a regra de serviço (01/10/2026) já valesse */
  costIfRule: number;
  /** templates (avulsos + campanha) do mês, por categoria — estimado por amostragem */
  templateByCategory: TemplateByCategory;
  /** só preenchido no mês corrente: fechamento projetado */
  projectedVolume: Volume | null;
  projectedCost: CostBreakdown | null;
  projectedCostIfRule: number | null;
};

/**
 * Mês futuro projetado. O volume é fixo — média dos últimos meses completos,
 * repetida igual em todos os meses do horizonte — só o custo varia conforme a
 * regra de serviço já valha ou não naquele mês.
 */
export type ForecastRow = {
  month: string; // "YYYY-MM"
  label: string; // "Out/26"
  volume: Volume; // fixo, igual em todos os meses do horizonte
  cost: CostBreakdown; // custo com a regra vigente naquele mês
  /** custo do mês sempre cobrando o serviço (comparação) */
  costIfRule: number;
  /** custo do mês se a conexão fosse oficial (WABA), forçando serviço cobrado */
  costAsOfficial: number;
  /** templates projetados por categoria — mesmo mix de base, repetido */
  templateByCategory: TemplateByCategory;
  serviceCharged: boolean; // a regra de serviço já vale nesse mês?
};

export type ConnectionOption = {
  id: string;
  name: string;
  kind: string;
  connected: boolean;
};

export type DashboardPayload = {
  generatedAt: string;
  filters: {
    type: "todas" | "oficial" | "standard";
    connectionId: string | null; // null = todas do tipo
    availableConnections: ConnectionOption[];
    consideredCount: number; // conexões efetivamente consultadas
    isOfficial: boolean; // seleção gera custo?
  };
  pricing: {
    serviceRateBrl: number;
    marketingRateBrl: number;
    serviceRateUsd: number;
    marketingRateUsd: number;
    source: string;
    asOf: string;
    sourceUrl?: string;
    note: string;
  };
  fx: { rate: number; source: string; asOf: string };
  ruleStartsAt: string; // "2026-10-01"
  ruleActiveNow: boolean;
  /** custo do mês corrente somando TODAS as conexões oficiais — não muda com filtros */
  monthGlobal: {
    month: string;
    label: string;
    officialConnections: number;
    costNow: number;
    costProjected: number;
    /** fechamento do mês simulando a regra de serviço já ativa */
    costProjectedIfRuleActive: number;
    elapsedRatio: number;
  };
  currentMonth: MonthRow;
  history: MonthRow[]; // meses anteriores + currentMonth como último item
  /** meses futuros projetados (a partir do mês seguinte ao corrente) — volume fixo */
  forecast: ForecastRow[];
  forecastMethod: string;
  /** quantos meses de histórico entraram na média fixa */
  forecastMonthsUsed: number;
  /** custo mensal projetado depois que a regra de serviço entra (01/10/2026) */
  costAfterRuleBrl: number;
  /** custo mensal projetado se a seleção fosse oficial (relevante p/ filtro Standard) */
  costAfterRuleIfOfficialBrl: number;
  indicators: {
    // "Este mês" — realizado até agora
    monthSentTotal: number; // enviadas (todas)
    monthSent: number; // enviadas de serviço (livre, sem template)
    monthReceived: number;
    monthCostNow: number;
    // "Estimativa deste mês" — fechamento projetado
    monthProjectedSent: number;
    monthProjectedReceived: number;
    monthProjectedCost: number;
    // simulação: mês atual como se a regra de serviço (01/10/2026) já valesse
    monthCostIfRuleActive: number; // custo realizado até agora, cobrando o serviço
    monthProjectedCostIfRuleActive: number; // fechamento estimado, cobrando o serviço
    // simulação: conexão(ões) Standard como se fossem oficiais (WABA), serviço sempre cobrado
    monthCostIfOfficial: number;
    monthProjectedCostIfOfficial: number;
  };
};

export type { ServiceInfo };
