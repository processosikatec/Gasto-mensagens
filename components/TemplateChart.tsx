"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardPayload } from "@/lib/types";
import { AXIS, C, tooltipStyle } from "./chartTheme";

const NUM = new Intl.NumberFormat("pt-BR");
const BRL0 = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const kNum = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

// tons de azul distintos
const T = {
  marketing: "#7ab0e0", // primary-400
  utility: "#a5cbeb", // primary-300
  authentication: "#4679ca", // primary-600
  costLine: "#212e4a", // primary-950
};

/**
 * Detalhe de templates (dentro do colapsável): volume por categoria (estimado por
 * amostragem) + linha de custo de template.
 */
export default function TemplateChart({ data }: { data: DashboardPayload }) {
  const sRate = data.pricing.serviceRateBrl;
  const mRate = data.pricing.marketingRateBrl;

  const rows = data.history.map((h) => {
    const tpl = h.volume.template + h.volume.campaignTemplate;
    // aplica o mix — mas o mix não está no payload novo; recalcula via cost/rates
    // (o custo de template já vem consolidado; aqui distribuímos por proporção)
    // usamos o próprio cost.template para a linha
    return {
      label: h.label,
      total: tpl,
      custo: h.cost.template,
    };
  });

  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: C.line }}
            interval="preserveStartEnd"
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
            tick={{ ...AXIS, fill: T.costLine }}
            tickLine={false}
            axisLine={{ stroke: C.line }}
            width={58}
            tickFormatter={(v) => BRL0.format(v)}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: C.dim }}
            formatter={(v: any, name: any) =>
              name === "Custo (R$)" ? [BRL0.format(v), name] : [NUM.format(v), name]
            }
          />
          <Legend
            wrapperStyle={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.dim }}
          />
          <Bar
            yAxisId="vol"
            dataKey="total"
            name="Templates enviados"
            fill={T.authentication}
            maxBarSize={26}
            radius={[2, 2, 0, 0]}
          />
          <Line
            yAxisId="cost"
            dataKey="custo"
            name="Custo (R$)"
            stroke={T.costLine}
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: T.costLine }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
