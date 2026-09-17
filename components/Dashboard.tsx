"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardPayload } from "@/lib/types";
import { apiFetch } from "@/lib/apiClient";
import InfoCard from "./InfoCard";
import VolumeChart from "./VolumeChart";
import TemplateChart from "./TemplateChart";
import HistoryTable from "./HistoryTable";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL4 = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const NUM = new Intl.NumberFormat("pt-BR");
const brl = (x: number) => BRL.format(x || 0);
const brl4 = (x: number) => BRL4.format(x || 0);
const num = (x: number) => NUM.format(Math.round(x || 0));

type FilterType = "todas" | "oficial" | "standard";

export default function Dashboard() {
  const [type, setType] = useState<FilterType>("oficial");
  const [connection, setConnection] = useState("all");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    async (over?: { type?: FilterType; connection?: string }) => {
      const t = over?.type ?? type;
      const c = over?.connection ?? connection;
      setLoading(true);
      setErr(null);
      try {
        const res = await apiFetch(`/api/dashboard?type=${t}&connection=${c}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setData(json);
      } catch (e: any) {
        setErr(e?.message || "Falha ao carregar.");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [type, connection],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = document.getElementById("masthead-meta");
    if (!el || !data) return;
    el.innerHTML = `
      <div><b>Consulta</b> ${new Date(data.generatedAt).toLocaleDateString("pt-BR")}</div>
      <div><b>Conexões</b> ${data.filters.consideredCount}</div>
    `;
  }, [data]);

  function onType(t: FilterType) {
    setType(t);
    setConnection("all");
    load({ type: t, connection: "all" });
  }
  function onConnection(c: string) {
    setConnection(c);
    load({ connection: c });
  }

  async function openDebugServices() {
    try {
      const res = await apiFetch("/api/debug/services");
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      // silencioso — é só uma ferramenta de diagnóstico
    }
  }

  const cur = data?.currentMonth;
  const ind = data?.indicators;

  return (
    <>
      {loading && !data && (
        <div className="state">
          <span className="pulse" />
          Consultando…
        </div>
      )}

      {err && (
        <div className="state err">
          <b>Erro:</b> {err}
        </div>
      )}

      {data && cur && ind && (
        <>
          {/* Bullet fixo: gasto do mês — soma de todas as conexões oficiais, não muda com filtros */}
          <div className="month-bill">
            <span className="dot" />
            <span className="mb-label">
              Gasto de {cap(cur.label)} · {data.monthGlobal.officialConnections} conexões oficiais
            </span>
            {data.monthGlobal.unavailable ? (
              <span className="mb-val" style={{ color: "var(--danger, #b3261e)" }}>
                Indisponível — tente atualizar a página
              </span>
            ) : (
              <>
                <span className="mb-val">{brl(data.monthGlobal.costNow)}</span>
                {!data.ruleActiveNow && (
                  <span className="mb-proj">
                    Com a regra ativa:{" "}
                    <b>{brl(data.monthGlobal.costProjectedIfRuleActive)}</b>
                  </span>
                )}
                {data.monthGlobal.elapsedRatio < 0.98 && (
                  <span className="mb-proj">
                    Fechamento estimado: {brl(data.monthGlobal.costProjected)}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Filtros */}
          <div className="controls">
            <div className="field">
              <label>Tipo de WhatsApp</label>
              <select value={type} onChange={(e) => onType(e.target.value as FilterType)}>
                <option value="oficial">Oficial (WABA)</option>
                <option value="standard">Standard</option>
                <option value="todas">Todas</option>
              </select>
            </div>
            <div className="field">
              <label>Conexão</label>
              <select value={connection} onChange={(e) => onConnection(e.target.value)}>
                <option value="all">Todas as conexões</option>
                {data.filters.availableConnections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.connected ? "" : " (desconectada)"}
                  </option>
                ))}
              </select>
            </div>
            <button className="act" onClick={() => load()} disabled={loading}>
              {loading ? "…" : "Atualizar"}
            </button>
          </div>

          {data.filters.type === "standard" && (
            <div className="scopebar">
              Seleção <b>Standard</b>: a Meta não cobra conexões não-oficiais — custo real é{" "}
              <b>R$ 0</b>. Se virassem <b>oficiais (WABA)</b> hoje, o mês custaria{" "}
              <b>{brl(ind.monthProjectedCostIfOfficial)}</b> (fechamento estimado) e a média
              projetada seria <b>{brl(data.costAfterRuleIfOfficialBrl)}</b>/mês.
            </div>
          )}

          {/* Resumo — 4 números, batida de olho */}
          <div className="kpis">
            <InfoCard
              label={`Enviadas em ${cap(cur.label)}`}
              value={ind.unavailable ? "—" : num(ind.monthProjectedSent)}
              sub={
                ind.unavailable
                  ? "Dados indisponíveis — tente atualizar a página"
                  : `Realizado ${num(ind.monthSentTotal)} · ${Math.round(
                      cur.elapsedRatio * 100,
                    )}% do mês`
              }
              info="Total de mensagens enviadas (serviço + templates + campanhas) no mês corrente: realizado até agora e projeção de fechamento pró-rata."
            />
            <InfoCard
              accent="danger"
              label="Custo do mês hoje"
              value={ind.unavailable ? "—" : brl(ind.monthProjectedCost)}
              sub={
                ind.unavailable
                  ? "Dados indisponíveis — tente atualizar a página"
                  : data.ruleActiveNow
                    ? "Serviço + templates"
                    : `Só templates — serviço grátis até ${fmtDate(data.ruleStartsAt)}`
              }
              info="Custo de fechamento estimado do mês corrente com as regras vigentes hoje. Realizado até agora dividido pela fração de dias decorridos."
            />
            <InfoCard
              accent="danger"
              label="Custo do mês se a regra valesse"
              value={ind.unavailable ? "—" : brl(ind.monthProjectedCostIfRuleActive)}
              sub={
                ind.unavailable
                  ? "Dados indisponíveis — tente atualizar a página"
                  : data.ruleActiveNow
                    ? "Regra já em vigor"
                    : `+${brl(
                        ind.monthProjectedCostIfRuleActive - ind.monthProjectedCost,
                      )} vs. hoje`
              }
              info={
                "Simulação: quanto o mês corrente custaria se a cobrança da mensagem de serviço (01/10/2026) já estivesse ativa, sobre o volume projetado do mês."
              }
            />
            <InfoCard
              accent="danger"
              label={`Custo projetado a partir de ${cap(fmtMonthLabel(data.ruleStartsAt.slice(0, 7)))}`}
              value={brl(data.costAfterRuleBrl)}
              sub={`Média dos ${data.forecast.length} meses projetados · base ${data.forecastMonthsUsed} meses`}
              info={
                data.forecastMethod +
                " Já considera a mensagem de serviço cobrada a partir de 01/10/2026."
              }
            />
          </div>

          {/* Gráfico principal — o centro da leitura */}
          <section className="block">
            <h2>Volume e custo — histórico e projeção</h2>
            <p className="hint">
              Barras: mensagens enviadas por mês — azul escuro é realizado, azul claro é projeção
              (tendência dos últimos {data.forecastMonthsUsed} meses, um valor por mês). Linha{" "}
              <b style={{ color: "#db2727" }}>vermelha</b> = custo real de hoje; linha{" "}
              <b style={{ color: "#7c3aed" }}>roxa</b> = custo projetado para os meses futuros;
              linha <b style={{ color: "#c48b0a" }}>âmbar</b> = simulação de custo se a mensagem
              de serviço já fosse cobrada. Eixo de custo à direita.
            </p>
            <div className="panel">
              <VolumeChart data={data} />
            </div>
          </section>

          {/* Tabela */}
          <section className="block">
            <h2>Tabela mensal</h2>
            <p className="hint">
              Últimos 3 meses realizados (o mês corrente mostra também o fechamento estimado) e{" "}
              {data.forecast.length} meses de projeção, calculados sobre {data.forecastMonthsUsed}{" "}
              meses de histórico.
            </p>
            <div className="panel scroll-x">
              <HistoryTable data={data} />
            </div>
          </section>

          {/* Detalhes */}
          <details className="details">
            <summary>Templates por categoria, metodologia e fontes</summary>
            <div className="details-body">
              <h3>Templates (HSM): volume por categoria e custo</h3>
              <p className="hint">
                Barras empilhadas por categoria (roxo = marketing, verde = utility, âmbar =
                authentication) — proporção estimada por amostragem. Linha escura = custo total de
                template no mês.
              </p>
              <div className="panel">
                <TemplateChart data={data} />
              </div>

              <h3>Como os números são obtidos</h3>
              <ul className="method">
                <li>
                  <b>Volumetria:</b> contagem direta na API da Digisac (
                  <code>/api/v1/messages</code>) mês a mês, nas{" "}
                  <b>{data.filters.consideredCount}</b> conexão(ões) selecionada(s) (
                  {typeLabel(data.filters.type)}).
                </li>
                <li>
                  <b>Classificação:</b> serviço é a mensagem livre de atendente ou bot fora de
                  campanha; template é <code>type: hsm</code>; campanha é{" "}
                  <code>origin: campaign</code> (livre ou template). Recebidas contam volume, nunca
                  custo.
                </li>
                <li>
                  <b>Projeção do mês:</b> linear pró-rata — volume acumulado dividido pelos dias
                  decorridos, multiplicado pelos dias do mês.
                </li>
                <li>
                  <b>Regra Meta 01/10/2026:</b> a mensagem de serviço passa a ser cobrada.{" "}
                  {data.ruleActiveNow
                    ? "Já em vigor."
                    : `Ainda gratuita até essa data.`}{" "}
                  Templates já são cobrados hoje.
                </li>
                <li>
                  <b>Tarifa:</b>{" "}
                  {data.pricing.source === "scrape"
                    ? "obtida de agregador público"
                    : data.pricing.source === "env-override"
                      ? "definida manualmente (.env.local)"
                      : "tabela embutida"}
                  , referência de {data.pricing.asOf}. Serviço, utility e authentication a{" "}
                  {brl4(data.pricing.serviceRateBrl)} por mensagem; marketing a{" "}
                  {brl4(data.pricing.marketingRateBrl)} por mensagem. Câmbio USD→BRL{" "}
                  {data.fx.rate.toFixed(4)} ({data.fx.source}).{" "}
                  {data.pricing.sourceUrl ? (
                    <a href={data.pricing.sourceUrl} target="_blank" rel="noreferrer">
                      Ver origem
                    </a>
                  ) : null}
                </li>
                <li>
                  Conexões Standard (WhatsApp Web) não geram custo. Os valores oficiais da Meta por
                  país só são publicados até 01/09/2026 — confirme sempre contra a fatura da Digisac.
                </li>
                <li>
                  <button type="button" className="login-signout" onClick={openDebugServices}>
                    Ver classificação das conexões
                  </button>
                </li>
              </ul>
            </div>
          </details>
        </>
      )}
    </>
  );
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function typeLabel(t: string) {
  return t === "oficial" ? "Oficial / WABA" : t === "standard" ? "Standard" : "Todas";
}
/** "ago/26" -> "Ago/26" */
function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
/** "2026-10" -> "out/26" */
function fmtMonthLabel(ym: string) {
  const [y, m] = ym.split("-");
  const nome = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][
    Number(m) - 1
  ];
  return `${nome}/${y.slice(2)}`;
}
