// Precificação — aplica a rate card da Meta sobre a volumetria.
//
// Regras (ver alteracao_projeto_volumetria.md + decisões):
//  - Standard (whatsapp-web): custo R$ 0 sempre (Meta só cobra WABA).
//  - Recebidas: R$ 0 sempre (só volumetria).
//  - Mensagem de serviço (livre + campanha free-form): grátis até 30/09/2026,
//    passa a custar `serviceRateBrl` a partir de 01/10/2026 (data-aware).
//  - Template (avulso + campanha): já cobrado hoje.
//      · categoria MARKETING  -> marketingRateBrl
//      · categoria UTILITY/AUTH -> serviceRateBrl (mesma tarifa)
//
// Limitação conhecida, não implementada: a Meta também isenta conversas de
// serviço iniciadas via "free entry point" (clique-para-WhatsApp / botão do
// Facebook) por 72h — o simulador oficial da Digisac pede ao usuário o % de
// conversas nessa origem para descontar. Nosso cálculo não diferencia a
// origem da conversa (a API Digisac não expõe isso de forma direta em
// `/api/v1/messages`), então TODA mensagem de serviço é cobrada igual —
// pode superestimar o custo em contas com volume relevante de FEP.

import type { TemplateMix, Volume } from "./digisac";
import { BR_UTILITY_AUTH_TIERS, tieredCost } from "./meta-pricing";

export const RULE_STARTS_AT = "2026-10-01";

export type Rates = {
  /** tarifa list rate (sem tier) de utility/auth/service — usada só como referência/exibição; o cálculo real usa BR_UTILITY_AUTH_TIERS */
  serviceRateBrl: number;
  marketingRateBrl: number;
};

export type CostBreakdown = {
  service: number; // msg de serviço + campanha free-form
  template: number; // templates avulsos + de campanha, por categoria
  total: number;
};

/** A regra de cobrança de serviço está ativa nesta data de referência (ISO ou YYYY-MM-DD)? */
export function ruleActiveAt(refIso: string): boolean {
  return refIso.slice(0, 10) >= RULE_STARTS_AT;
}

/**
 * Custo de um bloco de templates dado o mix de categoria. Marketing é tarifa
 * fixa; utility/authentication usam os volume tiers oficiais do Brasil
 * (progressivo, aplicado sobre o volume estimado de templates utility+auth
 * deste bloco — simplificação: a Meta soma todo volume utility/auth da conta
 * no mês, incluindo mensagem de serviço cobrada como utility; aqui cada
 * bloco — templates e serviço — tieriza separadamente, o que superestima
 * levemente o custo em contas de volume alto, já que cada bloco reinicia do
 * tier 1 em vez de continuar a progressão do outro).
 */
export function templateCost(count: number, mix: TemplateMix, rates: Rates): number {
  const mkt = count * mix.marketing * rates.marketingRateBrl;
  const utilAuthCount = count * (mix.utility + mix.authentication);
  const util = tieredCost(utilAuthCount, BR_UTILITY_AUTH_TIERS);
  return mkt + util;
}

export type TemplateByCategory = {
  marketing: number;
  utility: number;
  authentication: number;
};

/** Converte o total de templates do mês (avulsos + campanha) em contagem
 * absoluta por categoria, aplicando a proporção estimada por amostragem. */
export function templateByCategory(volume: Volume, mix: TemplateMix): TemplateByCategory {
  const total = volume.template + volume.campaignTemplate;
  return {
    marketing: Math.round(total * mix.marketing),
    utility: Math.round(total * mix.utility),
    authentication: Math.round(total * mix.authentication),
  };
}

// Franquia mensal de mensagens de serviço grátis por número WABA. Confirmada
// pelo simulador oficial da própria Digisac (digisac.com.br/conteudos/
// simulador-de-custos-whatsapp, consultado em 22/09/2026): "A Meta concede
// uma franquia de 1.000 mensagens gratuitas por número de WhatsApp, por mês
// ... a partir da 1.001ª mensagem de cada número. A franquia não é
// cumulativa" — bate com o valor já usado aqui. A doc técnica genérica da
// Meta (developers.facebook.com/documentation/business-messaging/whatsapp/
// pricing/non-template-messages, consultada em 21/09/2026) não menciona essa
// franquia explicitamente ("Meta does not offer volume tiers for service
// messages"), mas trata de volume tiers de tarifa, não da franquia inicial —
// não é necessariamente contraditório. Duas fontes independentes (Digisac +
// material de terceiros anterior) convergem no mesmo número.
export const FREE_SERVICE_MESSAGES_PER_NUMBER = 1000;

/**
 * @param volume volumetria do período
 * @param mix    proporção de categoria dos templates do período
 * @param rates  tarifas em BRL
 * @param isOfficial conexão(ões) via API oficial da Meta? Standard => tudo R$ 0
 * @param serviceCharged a regra de cobrança de serviço vale para o período?
 * @param wabaCount quantidade de números WABA no escopo — cada um dá direito a
 *   FREE_SERVICE_MESSAGES_PER_NUMBER mensagens de serviço grátis/mês. A
 *   franquia é aplicada de forma agregada (soma do volume de serviço do
 *   conjunto menos a soma das franquias) — é uma aproximação: se um número
 *   individual usar menos que sua franquia, o excedente não é "transferível"
 *   para outro número na conta real da Meta, mas aqui a soma agregada tem o
 *   mesmo efeito na prática, desde que a maioria dos números use volume
 *   relevante (caso comum). Templates nunca têm franquia — são cobrados desde
 *   sempre, sem isenção.
 */
export function costOf(
  volume: Volume,
  mix: TemplateMix,
  rates: Rates,
  isOfficial: boolean,
  serviceCharged: boolean,
  wabaCount = 0,
): CostBreakdown {
  if (!isOfficial) return { service: 0, template: 0, total: 0 };

  const serviceVolume = volume.service + volume.campaignFreeform;
  const freeQuota = wabaCount * FREE_SERVICE_MESSAGES_PER_NUMBER;
  const billableServiceVolume = Math.max(0, serviceVolume - freeQuota);
  const service = serviceCharged ? tieredCost(billableServiceVolume, BR_UTILITY_AUTH_TIERS) : 0;
  const template =
    templateCost(volume.template, mix, rates) +
    templateCost(volume.campaignTemplate, mix, rates);

  return { service, template, total: service + template };
}

/** Projeção linear pró-rata do fechamento do mês: cada contagem / elapsedRatio. */
export function projectVolume(volume: Volume, elapsedRatio: number): Volume {
  const r = elapsedRatio > 0 ? elapsedRatio : 1;
  const up = (n: number) => Math.round(n / r);
  return {
    sent: up(volume.sent),
    received: up(volume.received),
    service: up(volume.service),
    campaignFreeform: up(volume.campaignFreeform),
    template: up(volume.template),
    campaignTemplate: up(volume.campaignTemplate),
  };
}

const EMPTY_VOLUME: Volume = {
  sent: 0,
  received: 0,
  service: 0,
  campaignFreeform: 0,
  template: 0,
  campaignTemplate: 0,
};

/** Média campo-a-campo de N volumes (para projetar meses futuros). */
export function averageVolume(volumes: Volume[]): Volume {
  if (volumes.length === 0) return { ...EMPTY_VOLUME };
  const acc = volumes.reduce(
    (a, v) => ({
      sent: a.sent + v.sent,
      received: a.received + v.received,
      service: a.service + v.service,
      campaignFreeform: a.campaignFreeform + v.campaignFreeform,
      template: a.template + v.template,
      campaignTemplate: a.campaignTemplate + v.campaignTemplate,
    }),
    { ...EMPTY_VOLUME },
  );
  const n = volumes.length;
  return {
    sent: Math.round(acc.sent / n),
    received: Math.round(acc.received / n),
    service: Math.round(acc.service / n),
    campaignFreeform: Math.round(acc.campaignFreeform / n),
    template: Math.round(acc.template / n),
    campaignTemplate: Math.round(acc.campaignTemplate / n),
  };
}

/** Média campo-a-campo de N TemplateMix. */
export function averageMix(mixes: TemplateMix[]): TemplateMix {
  const usable = mixes.filter((m) => m.sample > 0);
  if (usable.length === 0) {
    return { marketing: 0, utility: 0, authentication: 0, sample: 0 };
  }
  const n = usable.length;
  return {
    marketing: usable.reduce((a, m) => a + m.marketing, 0) / n,
    utility: usable.reduce((a, m) => a + m.utility, 0) / n,
    authentication: usable.reduce((a, m) => a + m.authentication, 0) / n,
    sample: Math.round(usable.reduce((a, m) => a + m.sample, 0) / n),
  };
}

/** Lista de "YYYY-MM" dos próximos `n` meses após `fromMonth` (exclusivo). */
export function nextMonths(fromMonth: string, n: number): string[] {
  const [y, m] = fromMonth.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Reta de mínimos quadrados sobre uma série (índice 0..n-1 como eixo x). */
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
 * Projeta cada campo de `Volume` `horizon` meses à frente por regressão linear
 * simples (mínimos quadrados) sobre o histórico — sem sazonalidade, sem banda
 * de incerteza. Cada mês projetado tem seu próprio valor, seguindo a tendência
 * (crescimento/queda) observada nos últimos meses. Nunca projeta abaixo de 0.
 */
export function projectTrend(history: Volume[], horizon: number): Volume[] {
  const fields: (keyof Volume)[] = [
    "sent",
    "received",
    "service",
    "campaignFreeform",
    "template",
    "campaignTemplate",
  ];
  const n = history.length;
  const models = Object.fromEntries(
    fields.map((f) => [f, linreg(history.map((v) => v[f]))]),
  ) as Record<keyof Volume, { slope: number; intercept: number }>;

  const out: Volume[] = [];
  for (let k = 1; k <= horizon; k++) {
    const idx = n - 1 + k;
    const row = {} as Volume;
    for (const f of fields) {
      const { slope, intercept } = models[f];
      row[f] = Math.max(0, Math.round(intercept + slope * idx));
    }
    out.push(row);
  }
  return out;
}
