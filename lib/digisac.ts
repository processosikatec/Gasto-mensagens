// Cliente da API Digisac (server-only, multi-tenant).
//  - host + token vêm de `DigisacCreds` (sessão do cliente logado), nunca de
//    estado de módulo — múltiplos clientes no mesmo processo Node não podem
//    vazar credencial um pro outro.
//  - Feathers/Sequelize: filtro via ?query=<JSON urlencoded> com {where, order, include}
//  - operadores: $between, $ne, $gte, $lte, $in
//  - resposta paginada: { data, total, limit, skip, currentPage, lastPage }
//  - contamos sempre com perPage=1 e lendo apenas `total`
//
// Classificação de mensagem (descoberto por probing da conta ikatec):
//  - isFromMe:false, type:"chat"        => recebida (só volumetria, sem custo)
//  - isFromMe:true, type:"hsm"          => template (HSM) — categoria via include:["hsm"]
//  - isFromMe:true, type:"chat", hsmId:null, isComment:false => mensagem livre (serviço)
//  - origin:"campaign"                  => enviada por campanha (pode ser hsm ou chat)
//  - origin possíveis: bot | user | campaign
//  - isComment:true                     => comentário interno, não vai pro WhatsApp

import type { DigisacCreds } from "./session";

export type { DigisacCreds };

// Conexões pela API oficial da Meta (WhatsApp Business Platform / WABA via BSP).
// Só elas geram cobrança. "whatsapp" puro (QR code) = Standard, custo zero.
const OFFICIAL_WA_TYPES = new Set([
  "waba",
  "whatsapp-cloud",
  "whatsappcloud",
  "whatsapp-api",
  "whatsappapi",
  "whatsapp-official",
  "whatsapp-business",
  "wababusiness",
  "cloud-api",
  "gupshup",
  "360dialog",
]);

export type ServiceKind = "oficial" | "standard" | "webchat" | "outro";

export function classifyService(s: any): ServiceKind {
  const t = String(s?.type || "").toLowerCase();
  if (OFFICIAL_WA_TYPES.has(t)) return "oficial";

  const d = s?.data || {};
  const hasBsp =
    !!d.hub360PartnerId ||
    !!d.hub360ApiKey ||
    !!s?.settings?.tokenSandBox360 ||
    !!d.wabaId ||
    !!d.wabaAccountId ||
    !!d.phoneNumberId ||
    (s?.internalData?.waba_account &&
      Object.keys(s.internalData.waba_account).length > 0);

  if (t.includes("whatsapp")) {
    const isWeb =
      d.waAutoUpdate !== undefined ||
      s?.isMultiDevice !== undefined ||
      d.isManuallyDisconnected !== undefined ||
      (!!s?.token && !hasBsp);
    if (hasBsp && !isWeb) return "oficial";
    return "standard"; // WhatsApp Web (não-oficial)
  }

  if (t === "webchat") return "webchat";
  return "outro";
}

export type Range = { start: string; end: string }; // ISO UTC

const REQUEST_TIMEOUT_MS = 30_000; // margem para clientes com volume grande, mesmo com consultas sequenciais

async function apiGet(
  creds: DigisacCreds,
  path: string,
  params: Record<string, string>,
  opts: { cache?: boolean } = {},
): Promise<any> {
  const base = creds.baseUrl.replace(/\/$/, "");
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: "Bearer " + creds.token, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...(opts.cache === false ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    // não embute o corpo da resposta na mensagem: em caso de SSRF (host
    // adulterado) isso vazaria conteúdo de um serviço arbitrário para quem
    // fez a requisição. Só o status é seguro de repassar.
    throw new Error(`Digisac ${path} -> HTTP ${res.status}`);
  }
  return json;
}

async function countMessages(creds: DigisacCreds, where: Record<string, unknown>): Promise<number> {
  const query = JSON.stringify({ where });
  const json = await apiGet(creds, "/api/v1/messages", { perPage: "1", query });
  return Number(json?.total) || 0;
}

function scopeToServices(
  where: Record<string, unknown>,
  ids?: string[],
): Record<string, unknown> {
  if (!ids) return where;
  if (ids.length === 0) return { ...where, serviceId: "__none__" }; // força zero
  return { ...where, serviceId: { $in: ids } };
}

function betweenTimestamp(r: Range) {
  return { timestamp: { $between: [r.start, r.end] } };
}

// ---------- amostragem de categoria de template ----------

export type HsmCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION" | "OUTRO";

async function sampleHalf(
  creds: DigisacCreds,
  where: Record<string, unknown>,
  dir: "ASC" | "DESC",
  perPage: number,
): Promise<any[]> {
  const query = JSON.stringify({
    where: { ...where, type: "hsm", isFromMe: true },
    include: ["hsm"],
    order: [["timestamp", dir]],
  });
  const json = await apiGet(
    creds,
    "/api/v1/messages",
    { perPage: String(perPage), query },
    { cache: false },
  );
  return json?.data || [];
}

async function sampleHsmCategories(
  creds: DigisacCreds,
  where: Record<string, unknown>,
  sampleSize = 200,
): Promise<Record<HsmCategory, number>> {
  const half = Math.ceil(sampleSize / 2);
  const a = await sampleHalf(creds, where, "ASC", half);
  const b = await sampleHalf(creds, where, "DESC", half);
  const seen = new Set<string>();
  const dist: Record<HsmCategory, number> = {
    MARKETING: 0,
    UTILITY: 0,
    AUTHENTICATION: 0,
    OUTRO: 0,
  };
  for (const m of [...a, ...b]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const cat = String(m?.hsm?.category || "").toUpperCase();
    if (cat === "MARKETING" || cat === "UTILITY" || cat === "AUTHENTICATION") {
      dist[cat] += 1;
    } else {
      dist.OUTRO += 1;
    }
  }
  return dist;
}

// ---------- volumetria mensal ----------

export type Volume = {
  /** total enviadas ao cliente (serviço + template + campanha), exclui comentários */
  sent: number;
  /** recebidas de clientes (só volumetria, sem custo) */
  received: number;
  /** enviadas livres NÃO-campanha (bot + agente) — custo de serviço */
  service: number;
  /** campanha em mensagem livre (type chat) — custo de serviço */
  campaignFreeform: number;
  /** templates NÃO-campanha — custo por categoria */
  template: number;
  /** templates disparados por campanha — custo por categoria */
  campaignTemplate: number;
};

export type TemplateMix = {
  marketing: number;
  utility: number;
  authentication: number;
  /** tamanho da amostra usada p/ estimar as proporções */
  sample: number;
};

export type MonthBucket = {
  /** "YYYY-MM" */
  month: string;
  /** intervalo consultado em ISO UTC (até agora, se mês corrente) */
  range: Range;
  /** mês ainda em curso */
  partial: boolean;
  /** dias decorridos / dias do mês (1 se completo) — capturado no momento da consulta */
  elapsedRatio: number;
  volume: Volume;
  /** proporção de categoria dos templates (aplicada a template + campaignTemplate) */
  templateMix: TemplateMix;
  /** true se a consulta a este mês falhou (timeout/erro) — volume é 0 mas não é real */
  unavailable?: boolean;
};

function daysInMonth(y: number, m1: number): number {
  return new Date(Date.UTC(y, m1, 0)).getUTCDate();
}

/**
 * @param creds credenciais Digisac do cliente logado
 * @param month "YYYY-MM"
 * @param serviceIds conexões a considerar (undefined = todas)
 * @param nowIso instante de referência (define o mês corrente e o elapsedRatio)
 */
export async function fetchMonth(
  creds: DigisacCreds,
  month: string,
  serviceIds: string[] | undefined,
  nowIso: string,
): Promise<MonthBucket> {
  const [y, m] = month.split("-").map(Number);
  const now = new Date(nowIso);
  const currMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const partial = month === currMonth;
  const future = month > currMonth;

  const startD = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0)); // 00:00 BRT = 03:00 UTC
  const fullEndD = new Date(Date.UTC(y, m, 1, 2, 59, 59, 999));
  const endD = partial ? now : fullEndD;
  const range: Range = { start: startD.toISOString(), end: endD.toISOString() };

  // dia do mês em BRT (UTC-3)
  const nowBrt = new Date(now.getTime() - 3 * 3600_000);
  const dim = daysInMonth(y, m);
  const elapsedRatio = partial ? Math.min(1, nowBrt.getUTCDate() / dim) : 1;

  const empty: MonthBucket = {
    month,
    range,
    partial,
    elapsedRatio,
    volume: {
      sent: 0,
      received: 0,
      service: 0,
      campaignFreeform: 0,
      template: 0,
      campaignTemplate: 0,
    },
    templateMix: { marketing: 0, utility: 0, authentication: 0, sample: 0 },
  };
  if (future) return empty;

  const ts = betweenTimestamp(range);
  const S = (w: Record<string, unknown>) => scopeToServices(w, serviceIds);

  // sequencial, não Promise.all: em contas com muito volume, algumas dessas
  // contagens (as que filtram type:"chat", ver comentário em fetchHistory)
  // já são lentas sozinhas — paralelizar só faz todas competirem pelo mesmo
  // timeout ao mesmo tempo, sem ganho real.
  //
  // Se qualquer contagem deste mês falhar (timeout/erro), o mês inteiro vira
  // "unavailable" em vez de derrubar o dashboard todo — os demais meses e
  // conexões continuam disponíveis; o front avisa que este mês não carregou
  // (nunca mostra volume 0 como se fosse um dado real).
  try {
    const service = await countMessages(
      creds,
      S({
        isFromMe: true,
        isComment: false,
        type: "chat",
        hsmId: null,
        origin: { $ne: "campaign" },
        ...ts,
      }),
    );
    const campaignFreeform = await countMessages(
      creds,
      S({ isFromMe: true, isComment: false, type: "chat", origin: "campaign", ...ts }),
    );
    const template = await countMessages(
      creds,
      S({ isFromMe: true, type: "hsm", origin: { $ne: "campaign" }, ...ts }),
    );
    const campaignTemplate = await countMessages(
      creds,
      S({ isFromMe: true, type: "hsm", origin: "campaign", ...ts }),
    );
    const received = await countMessages(creds, S({ isFromMe: false, type: "chat", ...ts }));
    const mix = await sampleHsmCategories(creds, S({ ...ts })).catch(() => ({
      MARKETING: 0,
      UTILITY: 0,
      AUTHENTICATION: 0,
      OUTRO: 0,
    }));

    const sampleN = mix.MARKETING + mix.UTILITY + mix.AUTHENTICATION + mix.OUTRO;

    return {
      month,
      range,
      partial,
      elapsedRatio,
      volume: {
        sent: service + campaignFreeform + template + campaignTemplate,
        received,
        service,
        campaignFreeform,
        template,
        campaignTemplate,
      },
      templateMix: {
        marketing: sampleN > 0 ? mix.MARKETING / sampleN : 0,
        utility: sampleN > 0 ? mix.UTILITY / sampleN : 0,
        authentication: sampleN > 0 ? mix.AUTHENTICATION / sampleN : 0,
        sample: sampleN,
      },
    };
  } catch {
    return { ...empty, unavailable: true };
  }
}

export function monthsBack(n: number, refIso: string): string[] {
  const ref = new Date(refIso);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function fetchHistory(
  creds: DigisacCreds,
  months: string[],
  serviceIds: string[] | undefined,
  nowIso: string,
): Promise<MonthBucket[]> {
  // Meses fechados são rápidos, inclusive em paralelo alto. Em algumas contas
  // com muito volume, 1+ contagens do mês CORRENTE (que filtram type:"chat",
  // ex: mensagens de serviço) são estruturalmente lentas na API da Digisac
  // (medido: 30-60s+ mesmo isoladas e sequenciais — provável falta de índice
  // do lado deles para esse padrão de filtro em tabela grande; não é
  // concorrência do nosso lado). Isola o mês corrente do resto para não
  // atrasar os fechados; se ele estourar o timeout, vira "unavailable" (ver
  // fetchMonth) em vez de derrubar o dashboard inteiro.
  const now = new Date(nowIso);
  const currMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const closedMonths = months.filter((mo) => mo !== currMonth);
  const currentMonths = months.filter((mo) => mo === currMonth);

  const CHUNK = 12;
  const out: MonthBucket[] = [];
  for (let i = 0; i < closedMonths.length; i += CHUNK) {
    const chunk = closedMonths.slice(i, i + CHUNK);
    out.push(...(await Promise.all(chunk.map((mo) => fetchMonth(creds, mo, serviceIds, nowIso)))));
  }
  for (const mo of currentMonths) {
    out.push(await fetchMonth(creds, mo, serviceIds, nowIso));
  }
  // reordena para a ordem original de `months` (currMonth normalmente já é o último)
  const byMonth = new Map(out.map((b) => [b.month, b]));
  return months.map((mo) => byMonth.get(mo)!);
}

// ---------- conexões ----------

export type ServiceInfo = {
  id: string;
  name: string;
  type: string;
  kind: ServiceKind;
  connected: boolean;
  archived: boolean;
};

export async function fetchServices(creds: DigisacCreds): Promise<ServiceInfo[]> {
  const json = await apiGet(creds, "/api/v1/services", { perPage: "200" });
  const list: any[] = json?.data || json?.results || (Array.isArray(json) ? json : []);
  return list.map((s) => ({
    id: s.id,
    name: s.name || s.label || s.id,
    type: String(s?.type || "?"),
    kind: classifyService(s),
    connected: !!s?.data?.status?.isConnected,
    archived: !!s?.archivedAt || !!s?.deletedAt,
  }));
}

/** Dump cru dos serviços (debug) — sem tokens. */
export async function fetchServicesRaw(creds: DigisacCreds): Promise<any[]> {
  const json = await apiGet(creds, "/api/v1/services", { perPage: "200" });
  const list: any[] = json?.data || json?.results || (Array.isArray(json) ? json : []);
  return list.map((s) => {
    const { token, ...rest } = s;
    return rest;
  });
}
