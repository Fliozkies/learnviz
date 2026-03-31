"use client";
import { ContentBlock, resolveText, ChartBlock } from "@/types/curriculum";
import RichText from "@/components/ui/RichText";
import GraphView from "@/components/ai/GraphView";
import ChartView from "@/components/course/ChartView";
import InlineEditor from "@/components/editor/InlineEditor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Letters that are free parameters in Desmos (not the axis variable x or
// standard math constants). If an extracted expression contains any of these
// as a standalone token, Desmos will render nothing — so we skip it.
const FREE_PARAM_RE = /(?<![a-zA-Z])([nNmMkKaAbBcC])(?![a-zA-Z(])/;

// Check whether a LaTeX expression string is plottable by Desmos:
//   - must define a function or y= relationship
//   - must not contain unresolved free parameters (letters other than x)
function isPlottable(expr: string): boolean {
  // Must look like a function/equation definition
  if (!/^[yYfFgGhH]\s*(?:\(x\))?\s*=/.test(expr)) return false;
  // Strip the LHS (everything up to and including the first =)
  const rhs = expr.slice(expr.indexOf("=") + 1);
  // If the RHS contains free parameter letters, it's not directly plottable
  if (FREE_PARAM_RE.test(rhs)) return false;
  return true;
}

function extractBlockExpressions(block: ContentBlock): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (e: string) => {
    const c = e.trim();
    if (c && !seen.has(c) && isPlottable(c)) {
      seen.add(c);
      found.push(c);
    }
  };

  if (block.latex) add(block.latex);

  const body =
    typeof block.body === "string"
      ? block.body
      : ((block.body as { content?: string })?.content ?? "");
  for (const m of body.matchAll(/\$([^$\n]{2,60})\$/g)) {
    add(m[1]);
  }
  return found.slice(0, 6);
}

type RawBlock = Record<string, unknown>;

function blockBody(block: ContentBlock): string {
  const raw = block as unknown as RawBlock;
  if (block.body != null) return resolveText(block.body);
  if (raw["content"] != null) {
    const c = raw["content"];
    if (typeof c === "string") return c;
    if (typeof c === "object") {
      const obj = c as RawBlock;
      if (typeof obj["content"] === "string") return obj["content"] as string;
      if (typeof obj["default"] === "string") return obj["default"] as string;
    }
  }
  return "";
}

function blockSteps(block: ContentBlock): Array<{
  step?: number;
  action: string;
  result?: string;
  annotation?: string;
}> {
  if (block.steps && block.steps.length > 0) {
    return block.steps.map((s, i) => ({
      step: s.step ?? i + 1,
      action: resolveText(s.action),
      result: s.result != null ? resolveText(s.result) : undefined,
      annotation: s.annotation != null ? resolveText(s.annotation) : undefined,
    }));
  }
  const raw = block as unknown as RawBlock;
  const rawContent = raw["content"];
  if (rawContent && typeof rawContent === "object") {
    const contentObj = rawContent as RawBlock;
    const steps = contentObj["steps"];
    if (Array.isArray(steps)) {
      return steps.map((s: unknown, i: number) => {
        if (typeof s === "string") return { step: i + 1, action: s };
        const obj = s as RawBlock;
        return {
          step: Number(obj["step"] ?? i + 1),
          action: String(obj["action"] ?? obj["text"] ?? obj["content"] ?? ""),
          result: obj["result"] != null ? String(obj["result"]) : undefined,
          annotation:
            obj["annotation"] != null ? String(obj["annotation"]) : undefined,
        };
      });
    }
  }
  return [];
}

/** Extract chart data from a ContentBlock of type 'chart' */
function extractChartBlock(block: ContentBlock): ChartBlock | null {
  const raw = block as unknown as RawBlock;

  // chart type is required
  const chartType = (block.chartType ??
    raw["chartType"] ??
    raw["chart_type"]) as string | undefined;
  if (!chartType) return null;

  // ChartBlock has top-level datasets/labels; also accept nested chartData from raw JSON variants
  type RawChartData = { datasets?: ChartBlock["datasets"]; labels?: string[] };
  const rawChartData = (raw["chartData"] ?? raw["chart_data"]) as
    | RawChartData
    | undefined;
  const datasets =
    block.datasets ??
    rawChartData?.datasets ??
    (raw["datasets"] as ChartBlock["datasets"] | undefined) ??
    [];
  const labels =
    block.labels ??
    rawChartData?.labels ??
    (raw["labels"] as string[] | undefined);
  const chartTitle =
    block.chartTitle ??
    (raw["chartTitle"] as string | undefined) ??
    (raw["chart_title"] as string | undefined) ??
    resolveText(block.title);

  if (!datasets || datasets.length === 0) return null;

  return {
    chartType: chartType as ChartBlock["chartType"],
    chartTitle: chartTitle || undefined,
    labels,
    datasets,
    xKey: block.xKey,
    yKey: block.yKey,
  };
}

// ─── Icons + styles ───────────────────────────────────────────────────────────

const BLOCK_ICONS: Record<string, string> = {
  definition: "📌",
  theorem: "📐",
  proof: "🔍",
  formula: "∑",
  explanation: "💬",
  worked_example: "✏️",
  example: "📎",
  counterexample: "⚠",
  note: "📝",
  tip: "💡",
  warning: "🚨",
  summary: "📋",
  algorithm: "⚙️",
  case_study: "🗂️",
  activity: "🎯",
  discussion_prompt: "💭",
  table: "📊",
  callout: "📣",
  chart: "📈",
};

const BLOCK_STYLES: Record<string, React.CSSProperties> = {
  definition: {
    borderLeft: "4px solid var(--accent-primary)",
    background:
      "color-mix(in srgb, var(--accent-primary) 6%, var(--bg-secondary))",
  },
  theorem: {
    borderLeft: "4px solid var(--accent-math)",
    background:
      "color-mix(in srgb, var(--accent-math) 6%, var(--bg-secondary))",
  },
  formula: {
    border: "2px dashed var(--accent-math)",
    borderRadius: "4px",
    textAlign: "center" as const,
    background:
      "color-mix(in srgb, var(--accent-math) 4%, var(--bg-secondary))",
  },
  warning: {
    borderLeft: "4px solid var(--accent-danger)",
    background:
      "color-mix(in srgb, var(--accent-danger) 6%, var(--bg-secondary))",
  },
  tip: {
    borderLeft: "4px solid var(--accent-success)",
    background:
      "color-mix(in srgb, var(--accent-success) 6%, var(--bg-secondary))",
  },
  note: {
    borderLeft: "4px solid var(--accent-warning)",
    background:
      "color-mix(in srgb, var(--accent-warning) 6%, var(--bg-secondary))",
  },
  summary: {
    borderLeft: "4px solid var(--text-muted)",
    background: "var(--bg-tertiary)",
  },
};

// ─── Shared step renderer ─────────────────────────────────────────────────────

function StepList({
  steps,
  label,
}: {
  steps: ReturnType<typeof blockSteps>;
  label: string;
}) {
  if (!steps || steps.length === 0) return null;
  return (
    <div style={{ marginTop: "16px" }}>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          marginBottom: "12px",
        }}
      >
        {label}
      </p>
      {steps.map((step, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: "16px",
            marginBottom: "12px",
            paddingBottom: "12px",
            borderBottom:
              i < steps.length - 1 ? "1px dashed var(--border-subtle)" : "none",
          }}
        >
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "var(--accent-primary)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              fontWeight: "700",
              flexShrink: 0,
              marginTop: "2px",
            }}
          >
            {step.step ?? i + 1}
          </div>
          <div style={{ flex: 1 }}>
            <RichText content={step.action} />
            {step.result && (
              <div
                style={{
                  marginTop: "6px",
                  padding: "6px 12px",
                  background: "var(--bg-tertiary)",
                  borderRadius: "3px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  borderLeft: "3px solid var(--accent-math)",
                }}
              >
                <RichText content={step.result} inline />
              </div>
            )}
            {step.annotation && (
              <div
                style={{
                  marginTop: "4px",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  fontStyle: "italic",
                }}
              >
                <RichText content={step.annotation} inline />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContentBlockView({
  block,
  blockPath = "",
}: {
  block: ContentBlock;
  blockPath?: string;
}) {
  const title = resolveText(block.title);
  const icon = BLOCK_ICONS[block.type] || "▪";
  const extraStyle = BLOCK_STYLES[block.type] || {};
  const body = blockBody(block);
  const steps = blockSteps(block);

  // ─── chart ──────────────────────────────────────────────────────────────
  if (block.type === "chart") {
    const chart = extractChartBlock(block);
    if (chart) return <ChartView chart={chart} />;
    // Fallback: AI emitted a chart block but data is malformed.
    // Render the body text (often a description of what the chart shows)
    // so the learner gets something useful rather than a bare error.
    return (
      <div
        style={{
          padding: "14px 16px",
          border: "1px dashed var(--border-color)",
          borderRadius: "4px",
          marginBottom: "16px",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
            marginBottom: body ? "8px" : 0,
          }}
        >
          📈 {title || "Chart"}
        </p>
        {body && <RichText content={body} />}
      </div>
    );
  }

  // ─── worked_example ─────────────────────────────────────────────────────
  if (block.type === "worked_example") {
    return (
      <div
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: "4px",
          overflow: "hidden",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            background: "var(--bg-tertiary)",
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-color)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>✏️</span>
          <span>Worked Example</span>
          {title && <span style={{ opacity: 0.7 }}>— {title}</span>}
        </div>
        <div style={{ padding: "16px 20px" }}>
          {body && (
            <InlineEditor
              value={body}
              path={`${blockPath}/body`}
              label="Example body"
              multiline
              renderView={(v) => <RichText content={v} />}
            />
          )}
          <StepList steps={steps} label="Step-by-Step Solution" />
        </div>
      </div>
    );
  }

  // ─── algorithm ──────────────────────────────────────────────────────────
  if (block.type === "algorithm") {
    return (
      <div
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: "4px",
          overflow: "hidden",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            background: "var(--bg-tertiary)",
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-color)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>⚙️</span>
          <span>Algorithm</span>
          {title && <span style={{ opacity: 0.7 }}>— {title}</span>}
        </div>
        <div style={{ padding: "16px 20px" }}>
          {body && <RichText content={body} />}
          {block.latex && (
            <div
              style={{
                marginTop: "12px",
                textAlign: "center",
                overflowX: "auto",
              }}
            >
              <RichText content={{ format: "latex", content: block.latex }} />
            </div>
          )}
          <StepList steps={steps} label="Steps" />
        </div>
      </div>
    );
  }

  // ─── case_study ─────────────────────────────────────────────────────────
  if (block.type === "case_study") {
    return (
      <div
        style={{
          border: "1px solid var(--border-color)",
          borderLeft: "4px solid var(--accent-warning)",
          borderRadius: "4px",
          overflow: "hidden",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            background:
              "color-mix(in srgb, var(--accent-warning) 8%, var(--bg-secondary))",
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-color)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>🗂️</span>
          <span>Case Study</span>
          {title && <span style={{ opacity: 0.7 }}>— {title}</span>}
        </div>
        <div
          style={{
            padding: "16px 20px",
            background:
              "color-mix(in srgb, var(--accent-warning) 4%, var(--bg-secondary))",
          }}
        >
          {body && <RichText content={body} />}
          {block.latex && (
            <div
              style={{
                marginTop: "12px",
                textAlign: "center",
                overflowX: "auto",
              }}
            >
              <RichText content={{ format: "latex", content: block.latex }} />
            </div>
          )}
          <StepList steps={steps} label="Analysis Steps" />
        </div>
      </div>
    );
  }

  // ─── table ──────────────────────────────────────────────────────────────
  if (block.type === "table") {
    // Resolve table data from multiple possible locations the AI might use.
    // Priority: block.table_data → top-level block.headers/rows → body markdown.
    const raw = block as unknown as RawBlock;
    const tableData =
      block.table_data ??
      (Array.isArray(raw["headers"]) && Array.isArray(raw["rows"])
        ? {
            headers: raw["headers"] as string[],
            rows: raw["rows"] as string[][],
            caption: raw["caption"] as string | undefined,
          }
        : null);

    if (tableData && (tableData.headers?.length || tableData.rows?.length)) {
      const { headers, rows, caption } = tableData;
      return (
        <div style={{ marginBottom: "16px", overflowX: "auto" }}>
          {title && (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-secondary)",
                marginBottom: "8px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>📊</span>
              <span>{title}</span>
            </p>
          )}
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              fontSize: "0.875rem",
              border: "1px solid var(--border-color)",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            {headers && headers.length > 0 && (
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "9px 14px",
                        textAlign: "left",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--text-secondary)",
                        background: "var(--bg-tertiary)",
                        borderBottom: "1px solid var(--border-color)",
                        borderRight:
                          i < headers.length - 1
                            ? "1px solid var(--border-subtle)"
                            : undefined,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <RichText content={h} inline />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rows?.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    background: i % 2 === 1 ? "var(--bg-secondary)" : undefined,
                  }}
                >
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      style={{
                        padding: "8px 14px",
                        borderBottom:
                          i < (rows?.length ?? 0) - 1
                            ? "1px solid var(--border-subtle)"
                            : undefined,
                        borderRight:
                          j < row.length - 1
                            ? "1px solid var(--border-subtle)"
                            : undefined,
                        verticalAlign: "top",
                        lineHeight: 1.5,
                      }}
                    >
                      <RichText content={cell} inline />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {caption && (
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginTop: "6px",
                fontStyle: "italic",
              }}
            >
              {caption}
            </p>
          )}
        </div>
      );
    }

    // Fallback: AI put a markdown table in body — RichText handles pipe syntax
    if (body) {
      return (
        <div style={{ marginBottom: "16px", overflowX: "auto" }}>
          {title && (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-secondary)",
                marginBottom: "8px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>📊</span>
              <span>{title}</span>
            </p>
          )}
          <RichText content={body} />
        </div>
      );
    }
  }

  // ─── media_embed ─────────────────────────────────────────────────────────
  if (block.type === "media_embed" && block.media) {
    const { type: mediaType, src, alt, caption, width, height } = block.media;

    if (mediaType === "desmos") {
      const expressions = src
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      return (
        <div style={{ marginBottom: 16 }}>
          <GraphView
            expressions={expressions}
            title={title || alt || "Graph"}
            height={height ?? 340}
          />
          {caption && (
            <p
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}
            >
              <RichText content={caption} inline />
            </p>
          )}
        </div>
      );
    }

    if (mediaType === "geogebra") {
      const iframeSrc = src.startsWith("http")
        ? src
        : `https://www.geogebra.org/material/iframe/id/${src}/width/700/height/400/border/888888/sfsb/true/smb/false/stb/false/stbh/false/ai/false/asb/false/sri/false/rc/false/ld/false/sdz/false/ctl/false`;
      return (
        <div style={{ marginBottom: 16 }}>
          {title && (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-secondary)",
                marginBottom: 8,
              }}
            >
              {title}
            </p>
          )}
          <div
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <iframe
              src={iframeSrc}
              width={width ?? "100%"}
              height={height ?? 400}
              style={{ display: "block", border: "none" }}
              title={alt ?? title ?? "GeoGebra"}
              allowFullScreen
            />
          </div>
          {caption && (
            <p
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}
            >
              <RichText content={caption} inline />
            </p>
          )}
        </div>
      );
    }

    if (mediaType === "iframe") {
      return (
        <div style={{ marginBottom: 16 }}>
          {title && (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-secondary)",
                marginBottom: 8,
              }}
            >
              {title}
            </p>
          )}
          <div
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <iframe
              src={src}
              width={width ?? "100%"}
              height={height ?? 400}
              style={{ display: "block", border: "none" }}
              title={alt ?? title ?? "Embed"}
              allowFullScreen
            />
          </div>
          {caption && (
            <p
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}
            >
              <RichText content={caption} inline />
            </p>
          )}
        </div>
      );
    }

    if (mediaType === "image" || mediaType === "svg") {
      return (
        <div style={{ marginBottom: 16, textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt ?? ""}
            style={{ maxWidth: "100%", borderRadius: 4 }}
          />
          {caption && (
            <p
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}
            >
              <RichText content={caption} inline />
            </p>
          )}
        </div>
      );
    }
  }

  // ─── generic fallback ────────────────────────────────────────────────────
  return (
    <div
      style={{
        ...extraStyle,
        padding: "16px 20px",
        marginBottom: "16px",
        borderRadius: extraStyle.border ? "4px" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span style={{ fontSize: "16px", marginTop: "1px", flexShrink: 0 }}>
          {icon}
        </span>
        <div style={{ flex: 1 }}>
          {title && (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-secondary)",
                marginBottom: "8px",
              }}
            >
              {block.type.replace(/_/g, " ")} —{" "}
              <InlineEditor
                value={title}
                path={`${blockPath}/title`}
                label="Block title"
              />
            </p>
          )}
          {!title && block.type !== "explanation" && (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
                marginBottom: "8px",
              }}
            >
              {block.type.replace(/_/g, " ")}
            </p>
          )}
          {body && (
            <InlineEditor
              value={body}
              path={`${blockPath}/body`}
              label="Block body"
              multiline
              renderView={(v) => <RichText content={v} />}
            />
          )}
          {block.latex && (
            <div
              style={{
                marginTop: "12px",
                textAlign: "center",
                overflowX: "auto",
              }}
            >
              <RichText content={{ format: "latex", content: block.latex }} />
            </div>
          )}
          {[
            "formula",
            "example",
            "worked_example",
            "theorem",
            "definition",
          ].includes(block.type) &&
            (() => {
              const exprs = extractBlockExpressions(block);
              // Only render a graph if we have at least one plottable expression.
              // extractBlockExpressions already filters out free-parameter expressions
              // (e.g. x^n where n is undefined), so an empty array here means there
              // is genuinely nothing Desmos can plot from this block's content.
              if (exprs.length === 0) return null;
              return (
                <div style={{ marginTop: 12 }}>
                  <GraphView
                    expressions={exprs}
                    title={title || undefined}
                    height={280}
                  />
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
