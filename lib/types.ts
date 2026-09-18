import type { MonthBucket, ServiceInfo, TemplateMix, Volume } from "./digisac";
import type { CostBreakdown } from "./costing";

export type { Volume, TemplateMix, CostBreakdown, MonthBucket };

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
  /** intervalo ISO UTC consultado — usado para buscar rankings de template/campanha deste mês */
  range: { start: string; end: string };
  /** true se a API do cliente falhou ao consultar este mês — volume/custo abaixo são 0, não reais */
  unavailable?: boolean;
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
    /** ids das conexões efetivamente consultadas — usar em chamadas de ranking */
    serviceIds: string[];
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
    /** true se a consulta ao mês corrente falhou — costNow/costProjected são 0, não reais */
    unavailable?: boolean;
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
    /** true se a consulta ao mês corrente falhou — os números abaixo são 0, não reais */
    unavailable?: boolean;
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

/**
 * Resposta de GET /api/dashboard/meta — dados leves (conexões, preço, câmbio,
 * lista de meses a buscar) para o client orquestrar as chamadas seguintes.
 * `generatedAt` e `months` devem ser reusados literalmente em toda chamada a
 * /api/dashboard/month e /api/dashboard/compute — nunca recalculados — para
 * que elapsedRatio/partial fiquem consistentes entre todas as chamadas de um
 * mesmo carregamento.
 */
export type DashboardMetaPayload = {
  generatedAt: string;
  filters: DashboardPayload["filters"];
  /** conexões consideradas pelo filtro atual — usar como serviceIds em /month */
  serviceIds: string[];
  /** todas as conexões oficiais, ignora filtro — usar para o mês corrente "global" */
  allOfficialIds: string[];
  currMonth: string; // "YYYY-MM"
  /** lista exata de meses do histórico a buscar via /api/dashboard/month, em ordem */
  months: string[];
  pricing: DashboardPayload["pricing"];
  fx: DashboardPayload["fx"];
  ruleStartsAt: string;
  ruleActiveNow: boolean;
};

/**
 * Corpo de POST /api/dashboard/compute — buckets já coletados pelo client via
 * chamadas a /api/dashboard/month; o endpoint só roda a matemática de custo/
 * projeção (sem chamar a API Digisac) e devolve o DashboardPayload final.
 */
export type DashboardComputeRequest = {
  generatedAt: string;
  filters: DashboardPayload["filters"];
  pricing: DashboardPayload["pricing"];
  fx: DashboardPayload["fx"];
  ruleStartsAt: string;
  ruleActiveNow: boolean;
  /** um bucket por mês em `months`, na mesma ordem, buscado com serviceIds filtrados */
  months: string[];
  buckets: MonthBucket[];
  /** mês corrente buscado com allOfficialIds (sem filtro) — pode ser igual a buckets[last] */
  globalBucket: MonthBucket;
  allOfficialCount: number;
};

export type { ServiceInfo };
