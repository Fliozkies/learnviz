"use client";
import { useAI, GEMINI_FREE_MODELS } from "../AIProvider";
import { estimateCost, ApiKey } from "../AIProvider";
import { sectionLabel, cardStyle, codeStyle } from "./keyManagerStyles";

const SCENARIOS = [
  { label: "Simple chat message", input: 50, output: 150, icon: "💬" },
  { label: "Edit a lesson title", input: 800, output: 100, icon: "✏️" },
  { label: "Add 1 full lesson", input: 1200, output: 3500, icon: "📄" },
  { label: "Add 2 lessons (parallel)", input: 1200, output: 3500, icon: "⚡" },
  { label: "Rewrite unit overview", input: 2000, output: 500, icon: "🔄" },
  { label: "Whole course AI edit", input: 8000, output: 2000, icon: "🌐" },
];

const EXAMPLE_GEMINI_KEY: ApiKey = {
  id: "ex",
  provider: "gemini",
  key: "",
  role: "any",
  model: "gemini-2.5-flash-lite-preview-06-17",
  errorCount: 0,
};
const EXAMPLE_ANTHROPIC_KEY: ApiKey = {
  ...EXAMPLE_GEMINI_KEY,
  provider: "anthropic",
  model: "claude-haiku-4-5-20251001",
};

const TOKEN_EXAMPLES = [
  { text: "Hello", tokens: 1 },
  { text: "mathematics", tokens: 2 },
  { text: "function definition", tokens: 3 },
  { text: "a full lesson object", tokens: "~3,500" },
] as const;

const QUALITY_LABEL: Record<number, string> = {
  1: "★★★ Best",
  2: "★★☆ Fast",
  3: "★☆☆ Bulk",
  4: "☆☆☆ Lite",
  5: "☆☆☆ Min",
};

const QUALITY_COLOR: Record<number, string> = {
  1: "var(--accent-primary)",
  2: "var(--accent-success)",
  3: "var(--accent-warning)",
  4: "var(--text-muted)",
  5: "var(--text-muted)",
};

export function TokenGuide() {
  const { getFreeTierLanes, keys } = useAI();
  const lanes = getFreeTierLanes();
  const hasGeminiKeys = keys.some((k) => k.provider === "gemini");

  return (
    <div
      style={{
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* What is a token */}
      <div>
        <p style={sectionLabel}>📖 What is a token?</p>
        <div style={cardStyle}>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            AI models read and write in{" "}
            <strong style={{ color: "var(--text-primary)" }}>tokens</strong> —
            chunks of ~4 characters or ¾ of a word. The word{" "}
            <code style={codeStyle}>&quot;mathematics&quot;</code> is 2 tokens.
            A sentence is ~15–25 tokens. Every API call costs tokens for what
            you send (<em>input</em>) and what the AI generates (<em>output</em>
            ).
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 12,
              flexWrap: "wrap",
            }}
          >
            {TOKEN_EXAMPLES.map(({ text, tokens }) => (
              <div
                key={text}
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-primary)",
                  }}
                >
                  {text}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--accent-primary)",
                  }}
                >
                  ≈ {tokens} token
                  {typeof tokens === "number" && tokens !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live free-tier lanes */}
      <div>
        <p style={sectionLabel}>
          🛤 Free-tier model lanes
          {hasGeminiKeys ? "" : " — add a Gemini key to unlock"}
        </p>
        <div style={cardStyle}>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              margin: "0 0 10px",
              lineHeight: 1.5,
            }}
          >
            Each Gemini key × model combination is an independent rate-limit
            lane. LearnViz auto-routes every request to the best available lane
            — you get the combined quota of all lanes simultaneously. Resets
            daily at midnight UTC.
          </p>

          {/* Model reference table (always shown) */}
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
              }}
            >
              <thead>
                <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                  <th style={{ padding: "4px 8px", fontWeight: 700 }}>Model</th>
                  <th
                    style={{
                      padding: "4px 8px",
                      fontWeight: 700,
                      textAlign: "right",
                    }}
                  >
                    RPM
                  </th>
                  <th
                    style={{
                      padding: "4px 8px",
                      fontWeight: 700,
                      textAlign: "right",
                    }}
                  >
                    RPD
                  </th>
                  <th
                    style={{
                      padding: "4px 8px",
                      fontWeight: 700,
                      textAlign: "right",
                    }}
                  >
                    TPM
                  </th>
                  <th style={{ padding: "4px 8px", fontWeight: 700 }}>
                    Quality
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(GEMINI_FREE_MODELS).map(([modelId, limits]) => (
                  <tr
                    key={modelId}
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <td
                      style={{
                        padding: "5px 8px",
                        color: "var(--text-primary)",
                        maxWidth: 180,
                      }}
                    >
                      <span style={{ wordBreak: "break-all" }}>{modelId}</span>
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {limits.rpm}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        color:
                          limits.rpd >= 500
                            ? "var(--accent-success)"
                            : "var(--accent-warning)",
                      }}
                    >
                      {limits.rpd >= 14_000 ? "14.4K" : limits.rpd}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {limits.tpm >= 250_000
                        ? "250K"
                        : `${Math.round(limits.tpm / 1000)}K`}
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      <span
                        style={{
                          color: QUALITY_COLOR[limits.quality],
                          fontWeight: 700,
                        }}
                      >
                        {QUALITY_LABEL[limits.quality]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Live lanes (only shown when keys exist) */}
          {hasGeminiKeys && lanes.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "0 0 8px",
                }}
              >
                Live lane status · {lanes.length} lanes active
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {lanes.map((lane, i) => {
                  const limits = GEMINI_FREE_MODELS[lane.modelId];
                  const rpdPct = limits
                    ? Math.min((1 - lane.rpdRemaining / limits.rpd) * 100, 100)
                    : 0;
                  const exhausted = lane.rpdRemaining === 0;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 8px",
                        background: "var(--bg-elevated)",
                        borderRadius: 5,
                        border: `1px solid ${exhausted ? "var(--accent-danger)22" : "var(--border-subtle)"}`,
                        opacity: exhausted ? 0.55 : 1,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          fontWeight: 700,
                          color: QUALITY_COLOR[lane.quality],
                          background: `${QUALITY_COLOR[lane.quality]}18`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          flexShrink: 0,
                        }}
                      >
                        {QUALITY_LABEL[lane.quality]}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--text-secondary)",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {lane.modelId}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--text-muted)",
                          flexShrink: 0,
                        }}
                      >
                        {lane.rpdRemaining} left today
                      </span>
                      {/* RPD bar */}
                      <div
                        style={{
                          width: 48,
                          height: 4,
                          background: "var(--bg-tertiary)",
                          borderRadius: 2,
                          overflow: "hidden",
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${rpdPct}%`,
                            background: exhausted
                              ? "var(--accent-danger)"
                              : rpdPct > 80
                                ? "var(--accent-warning)"
                                : "var(--accent-success)",
                            borderRadius: 2,
                            transition: "width 400ms",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Routing strategy */}
      <div>
        <p style={sectionLabel}>🧠 How auto-routing works</p>
        <div style={cardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              {
                icon: "1",
                label: "Task role match",
                desc: "Chat → quality models. Generation/editing → high-RPD models. Gemma for bulk overflow.",
              },
              {
                icon: "2",
                label: "Quota check",
                desc: "Each (key × model) lane is checked independently. A lane with RPD remaining is always preferred over one that's exhausted.",
              },
              {
                icon: "3",
                label: "Quality tier",
                desc: "Within available lanes, the highest-quality model that can handle the output size wins.",
              },
              {
                icon: "4",
                label: "Most headroom",
                desc: "Ties broken by most RPD remaining — spread load evenly across keys automatically.",
              },
              {
                icon: "5",
                label: "Graceful fallback",
                desc: "If all Gemini lanes are exhausted, OpenRouter / HuggingFace / Anthropic keys take over.",
              },
            ].map(({ icon, label, desc }) => (
              <div
                key={icon}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "7px 0",
                  borderBottom:
                    parseInt(icon) < 5
                      ? "1px solid var(--border-subtle)"
                      : "none",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--accent-primary)",
                    fontWeight: 700,
                    marginTop: 1,
                    flexShrink: 0,
                    width: 14,
                  }}
                >
                  {icon}.
                </span>
                <div>
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      margin: "0 0 2px",
                    }}
                  >
                    {label}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cost per scenario */}
      <div>
        <p style={sectionLabel}>💰 Estimated cost by task</p>
        <div style={cardStyle}>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              margin: "0 0 12px",
            }}
          >
            Gemini Flash Lite (free tier) vs Claude Haiku — what each task
            costs.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {SCENARIOS.map((s) => {
              const geminiCost = estimateCost(
                EXAMPLE_GEMINI_KEY,
                s.input,
                s.output,
              );
              const claudeCost = estimateCost(
                EXAMPLE_ANTHROPIC_KEY,
                s.input,
                s.output,
              );
              const geminiStr =
                geminiCost === 0
                  ? "$0.00 ✓ free"
                  : geminiCost < 0.0001
                    ? "< $0.0001"
                    : `$${geminiCost.toFixed(4)}`;
              const claudeStr =
                claudeCost < 0.0001 ? "< $0.0001" : `$${claudeCost.toFixed(4)}`;
              return (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 10px",
                    background: "var(--bg-elevated)",
                    borderRadius: 6,
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{s.icon}</span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {s.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "#4285f4",
                      background: "#4285f418",
                      borderRadius: 3,
                      padding: "1px 6px",
                    }}
                  >
                    ◈ {geminiStr}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "#d97706",
                      background: "#d9770618",
                      borderRadius: 3,
                      padding: "1px 6px",
                    }}
                  >
                    ◆ {claudeStr}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Parallel tip */}
      <div>
        <p style={sectionLabel}>⚡ Maximize free throughput</p>
        <div style={cardStyle}>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              margin: "0 0 10px",
            }}
          >
            Adding more Gemini keys multiplies your total free quota. With 2
            keys you get 2× the RPD budget across all models — and parallel
            generation assigns each job to a different lane, so jobs truly run
            at the same time.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <div
              style={{
                flex: 1,
                padding: "10px 12px",
                background: "var(--bg-elevated)",
                borderRadius: 6,
                border: "1px solid var(--border-subtle)",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--accent-danger)",
                  fontWeight: 700,
                  margin: "0 0 4px",
                }}
              >
                1 key
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                8 lanes · 500 RPD best · sequential jobs share one quota
              </p>
            </div>
            <div
              style={{
                flex: 1,
                padding: "10px 12px",
                background: "var(--bg-elevated)",
                borderRadius: 6,
                border: "1px solid var(--accent-success)44",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--accent-success)",
                  fontWeight: 700,
                  margin: "0 0 4px",
                }}
              >
                3 keys
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                24 lanes · 1500 RPD best · 3 jobs run truly simultaneously
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
