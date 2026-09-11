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

// cada categoria com cor bem distinta das outras (não tons próximos de azul)
const T = {
  marketing: "#7c3aed", // violet-600
  utility: "#0d9488", // teal-600
  authentication: "#c48b0a", // warning-600 (âmbar)
  costLine: "#212e4a", // primary-950
};

/**
 * Detalhe de templates: uma barra empilhada por mês, com uma cor por categoria
 * (marketing, utility, authentication — proporção estimada por amostragem),
 * mais uma linha de custo total. Inclui os meses reais e os projetados.
 */
export default function TemplateChart({ data }: { data: DashboardPayload }) {
  const hist = data.history.map((h) => ({
    label: h.label,
    marketing: h.templateByCategory.marketing,
    utility: h.templateByCategory.utility,
    authentication: h.templateByCategory.authentication,
    custo: h.cost.template,
  }));

  const fc = data.forecast.map((f) => ({
    label: f.label,
    marketing: f.templateByCategory.marketing,
    utility: f.templateByCategory.utility,
    authentication: f.templateByCategory.authentication,
    custo: f.cost.template,
  }));

  const rows = [...hist, ...fc];

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
            dataKey="marketing"
            name="Marketing"
            stackId="tpl"
            fill={T.marketing}
            maxBarSize={30}
          />
          <Bar
            yAxisId="vol"
            dataKey="utility"
            name="Utility"
            stackId="tpl"
            fill={T.utility}
            maxBarSize={30}
          />
          <Bar
            yAxisId="vol"
            dataKey="authentication"
            name="Authentication"
            stackId="tpl"
            fill={T.authentication}
            maxBarSize={30}
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
