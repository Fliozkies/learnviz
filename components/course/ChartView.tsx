"use client";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartBlock } from "@/types/curriculum";

// recharts needs concrete hex/rgb values for SVG fill; CSS vars work in modern
// browsers but can be unreliable in some recharts internals. We use a mixed
// approach: CSS vars for borders/containers, hardcoded fallback palette for
// fills so bar/line colors always render.
const HEX_COLORS = [
  "#0056b3",
  "#6366f1",
  "#22863a",
  "#d97706",
  "#d73a49",
  "#8b5cf6",
  "#06b6d4",
  "#f43f5e",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Flatten datasets into the row-object format recharts expects for Bar/Line */
function toRowData(
  labels: string[] | undefined,
  datasets: ChartBlock["datasets"],
): Record<string, string | number>[] {
  if (!labels || labels.length === 0) {
    // No labels: use dataset indices as x
    const len = Math.max(...datasets.map((d) => d.data.length), 0);
    return Array.from({ length: len }, (_, i) => {
      const row: Record<string, string | number> = { _label: String(i) };
      for (const ds of datasets) {
        const val = ds.data[i];
        row[ds.key] =
          typeof val === "number"
            ? val
            : ((val as { x: number; y: number }).y ?? 0);
      }
      return row;
    });
  }
  return labels.map((lbl, i) => {
    const row: Record<string, string | number> = { _label: lbl };
    for (const ds of datasets) {
      const val = ds.data[i];
      row[ds.key] =
        val === undefined
          ? 0
          : typeof val === "number"
            ? val
            : ((val as { x: number; y: number }).y ?? 0);
    }
    return row;
  });
}

/** Flatten a single dataset into {x, y} points for scatter */
function toScatterData(
  ds: ChartBlock["datasets"][0],
): { x: number; y: number }[] {
  return ds.data.map((v, i) => {
    if (typeof v === "object") return v as { x: number; y: number };
    return { x: i, y: v as number };
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  chart: ChartBlock;
  height?: number;
}

export default function ChartView({ chart, height = 300 }: Props) {
  const { chartType, chartTitle, labels, datasets } = chart;

  const containerStyle: React.CSSProperties = {
    border: "1px solid var(--border-color)",
    borderRadius: "4px",
    padding: "16px",
    background: "var(--bg-secondary)",
    marginBottom: "16px",
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--text-secondary)",
    marginBottom: "12px",
  };

  const tooltipStyle: React.CSSProperties = {
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border-color)",
    borderRadius: "4px",
    fontSize: "12px",
    color: "var(--text-primary)",
  };

  if (!datasets || datasets.length === 0) {
    return (
      <div
        style={{
          ...containerStyle,
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
        }}
      >
        No chart data.
      </div>
    );
  }

  // ── Bar ──────────────────────────────────────────────────────────────────
  if (chartType === "bar") {
    const data = toRowData(labels, datasets);
    return (
      <div style={containerStyle}>
        {chartTitle && <p style={titleStyle}>📊 {chartTitle}</p>}
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
            />
            <XAxis
              dataKey="_label"
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
            <Tooltip contentStyle={tooltipStyle} />
            {datasets.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {datasets.map((ds, i) => (
              <Bar
                key={ds.key}
                dataKey={ds.key}
                name={ds.label}
                fill={ds.color ?? HEX_COLORS[i % HEX_COLORS.length]}
                radius={[3, 3, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Line ─────────────────────────────────────────────────────────────────
  if (chartType === "line") {
    const data = toRowData(labels, datasets);
    return (
      <div style={containerStyle}>
        {chartTitle && <p style={titleStyle}>📈 {chartTitle}</p>}
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={data}
            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
            />
            <XAxis
              dataKey="_label"
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
            <Tooltip contentStyle={tooltipStyle} />
            {datasets.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {datasets.map((ds, i) => (
              <Line
                key={ds.key}
                type="monotone"
                dataKey={ds.key}
                name={ds.label}
                stroke={ds.color ?? HEX_COLORS[i % HEX_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Pie ──────────────────────────────────────────────────────────────────
  if (chartType === "pie") {
    // Pie uses first dataset; data values are the slice sizes, labels are names
    const ds = datasets[0];
    const pieData = ds.data.map((v, i) => ({
      name: labels?.[i] ?? `Item ${i + 1}`,
      value: typeof v === "number" ? v : (v as { x: number; y: number }).y,
    }));
    return (
      <div style={containerStyle}>
        {chartTitle && <p style={titleStyle}>🥧 {chartTitle}</p>}
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={Math.min(height / 2 - 20, 120)}
              label={({ name, percent }) =>
                `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
              }
              labelLine={true}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={HEX_COLORS[i % HEX_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Scatter ───────────────────────────────────────────────────────────────
  if (chartType === "scatter") {
    return (
      <div style={containerStyle}>
        {chartTitle && <p style={titleStyle}>🔵 {chartTitle}</p>}
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
            />
            <XAxis
              dataKey="x"
              name={chart.xKey ?? "x"}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              type="number"
            />
            <YAxis
              dataKey="y"
              name={chart.yKey ?? "y"}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              type="number"
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ strokeDasharray: "3 3" }}
            />
            {datasets.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {datasets.map((ds, i) => (
              <Scatter
                key={ds.key}
                name={ds.label}
                data={toScatterData(ds)}
                fill={ds.color ?? HEX_COLORS[i % HEX_COLORS.length]}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Fallback
  return (
    <div
      style={{
        ...containerStyle,
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
      }}
    >
      Unsupported chart type: {chartType}
    </div>
  );
}
