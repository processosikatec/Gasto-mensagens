"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardPayload } from "@/lib/types";
import { AXIS, C, SERIES, tooltipStyle } from "./chartTheme";

const NUM = new Intl.NumberFormat("pt-BR");
const BRL0 = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const kNum = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

function renderBarLabel(props: any, rows: any[]) {
  const { x, y, width, value, index } = props;
  if (value == null) return null;
  const row = rows[index];
  if (!row) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 5}
      textAnchor="middle"
      fontSize={9}
      fontFamily="'IBM Plex Mono', monospace"
      fill="#586171"
    >
      {kNum(value)}
    </text>
  );
}

/**
 * Uma barra de volume por mês (3 reais + 5 projetados, azul claro na projeção —
 * a projeção segue a tendência linear dos últimos meses, um valor por mês).
 * Três linhas no eixo de custo (direita), cada uma com cor própria:
 *   - vermelho "Custo hoje": o que realmente se paga com as regras vigentes;
 *   - roxo "Custo projetado": continuação da linha vermelha nos meses futuros;
 *   - âmbar "Custo com a regra da Meta": simulação do mesmo volume cobrando
 *     a mensagem de serviço, em todos os meses (passados e futuros).
 */
export default function VolumeChart({ data }: { data: DashboardPayload }) {
  const ruleMonth = data.ruleStartsAt.slice(0, 7);

  const hist = data.history.map((h) => {
    const projected = h.partial && h.elapsedRatio >= 0.2;
    const enviadas = projected ? h.projectedVolume?.sent ?? h.volume.sent : h.volume.sent;
    return {
      label: h.label,
      month: h.month,
      realizado: projected ? null : enviadas,
      projecao: projected ? enviadas : null,
      isProjection: projected,
      custo: projected ? h.projectedCost?.total ?? h.cost.total : h.cost.total,
      custoFut: null as number | null,
      custoRegra:
        projected && h.projectedCostIfRule != null ? h.projectedCostIfRule : h.costIfRule,
    };
  });

  const fc = data.forecast.map((f) => ({
    label: f.label,
    month: f.month,
    realizado: null as number | null,
    projecao: f.volume.sent,
    isProjection: true,
    custo: null as number | null,
    custoFut: f.cost.total,
    custoRegra: f.costIfRule,
  }));

  const rows = [...hist, ...fc];
  // conecta a linha de custo projetado ao último ponto real
  const lastReal = [...hist].reverse().find((r) => !r.isProjection);
  if (lastReal) {
    lastReal.custoFut = lastReal.custo;
  }

  const ruleLabel = rows.find((r) => r.month === ruleMonth)?.label;

  return (
    <div className="chart-frame tall">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 14, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: C.line }}
          />
          <YAxis
            yAxisId="vol"
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: C.line }}
            width={44}
            tickFormatter={kNum}
          />
          <YAxis
            yAxisId="cost"
            orientation="right"
            tick={{ ...AXIS, fill: SERIES.cost }}
            tickLine={false}
            axisLine={{ stroke: C.line }}
            width={64}
            tickFormatter={(v) => BRL0.format(v)}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: C.dim }}
            formatter={(v: any, name: any) => {
              if (v == null) return null;
              return String(name).toLowerCase().includes("custo")
                ? [BRL0.format(v), name]
                : [NUM.format(v), "Enviadas"];
            }}
          />
          <Legend
            wrapperStyle={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.dim }}
          />

          {ruleLabel && (
            <ReferenceLine
              yAxisId="vol"
              x={ruleLabel}
              stroke={SERIES.cost}
              strokeDasharray="4 3"
              label={{
                value: "Regra Meta",
                position: "top",
                fill: SERIES.cost,
                fontSize: 10,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            />
          )}

          <Bar
            yAxisId="vol"
            dataKey="realizado"
            name="Enviadas (realizado)"
            fill={SERIES.service}
            stackId="vol"
            maxBarSize={34}
            radius={[3, 3, 0, 0]}
          >
            <LabelList
              dataKey="realizado"
              content={(props: any) => renderBarLabel(props, rows)}
            />
          </Bar>
          <Bar
            yAxisId="vol"
            dataKey="projecao"
            name="Enviadas (projeção)"
            fill={SERIES.projected}
            stackId="vol"
            maxBarSize={34}
            radius={[3, 3, 0, 0]}
          >
            <LabelList
              dataKey="projecao"
              content={(props: any) => renderBarLabel(props, rows)}
            />
          </Bar>

          <Line
            yAxisId="cost"
            dataKey="custoRegra"
            name="Custo com a regra da Meta"
            stroke={SERIES.costRule}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="cost"
            dataKey="custo"
            name="Custo hoje"
            stroke={SERIES.cost}
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
          />
          <Line
            yAxisId="cost"
            dataKey="custoFut"
            name="Custo projetado"
            stroke={SERIES.costForecast}
            strokeWidth={2.5}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
