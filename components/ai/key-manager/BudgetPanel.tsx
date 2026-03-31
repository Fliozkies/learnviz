"use client";
import { useState } from "react";
import { useAI, KeyRole } from "../AIProvider";
import { ROLE_LABELS } from "./keyManagerTypes";
import { sectionLabel, cardStyle, smallBtn } from "./keyManagerStyles";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

const TOKEN_PRESETS = [
  { label: "10k", value: 10_000 },
  { label: "50k", value: 50_000 },
  { label: "100k", value: 100_000 },
  { label: "500k", value: 500_000 },
  { label: "1M", value: 1_000_000 },
];

export function BudgetPanel() {
  const {
    sessionTokenBudget,
    setSessionTokenBudget,
    sessionTokensUsed,
    resetTokens,
    sessionBudget,
    setSessionBudget,
    sessionSpend,
    resetSpend,
    keys,
  } = useAI();

  const [tokenInput, setTokenInput] = useState(
    sessionTokenBudget === 0 ? "" : String(sessionTokenBudget),
  );
  const [usdInput, setUsdInput] = useState(
    sessionBudget === 0 ? "" : String(sessionBudget),
  );

  const tokenPct =
    sessionTokenBudget > 0
      ? Math.min((sessionTokensUsed / sessionTokenBudget) * 100, 100)
      : 0;
  const usdPct =
    sessionBudget > 0 ? Math.min((sessionSpend / sessionBudget) * 100, 100) : 0;

  function barColor(pct: number) {
    return pct > 85
      ? "var(--accent-danger)"
      : pct > 60
        ? "var(--accent-warning)"
        : "var(--accent-success)";
  }

  const eligibleForParallel = keys.filter(
    (k) => k.role === "any" || k.role === "generation",
  ).length;

  return (
    <div
      style={{
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Parallel status */}
      <div>
        <p style={sectionLabel}>⚡ Parallel generation status</p>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                flexShrink: 0,
                background:
                  eligibleForParallel >= 2
                    ? "var(--accent-success)18"
                    : "var(--bg-elevated)",
                border: `2px solid ${eligibleForParallel >= 2 ? "var(--accent-success)" : "var(--border-color)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 16,
                color:
                  eligibleForParallel >= 2
                    ? "var(--accent-success)"
                    : "var(--text-muted)",
              }}
            >
              {eligibleForParallel}
            </div>
            <div>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: "0 0 2px",
                }}
              >
                {eligibleForParallel >= 2
                  ? `${eligibleForParallel} keys can run in parallel`
                  : eligibleForParallel === 1
                    ? "1 key — generation runs sequentially"
                    : "No generation keys — add keys below"}
              </p>
              <p
                style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}
              >
                {eligibleForParallel >= 2
                  ? `Adding ${eligibleForParallel} lessons will take ~${Math.ceil(30 / eligibleForParallel)}s instead of ~30s`
                  : "Add more keys or set role to 'Any job' or 'Generation' to enable parallelism"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Token budget — primary control, works for free keys too */}
      <div>
        <p style={sectionLabel}>🔢 Token budget</p>
        <div style={cardStyle}>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              margin: "0 0 12px",
              lineHeight: 1.5,
            }}
          >
            Cap total tokens used this session. Works for all keys including
            free ones. Set to 0 for unlimited.
          </p>

          {/* Quick presets */}
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            {TOKEN_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => {
                  setSessionTokenBudget(p.value);
                  setTokenInput(String(p.value));
                }}
                style={{
                  ...smallBtn,
                  padding: "3px 10px",
                  fontSize: 10,
                  borderColor:
                    sessionTokenBudget === p.value
                      ? "var(--accent-primary)"
                      : undefined,
                  color:
                    sessionTokenBudget === p.value
                      ? "var(--accent-primary)"
                      : undefined,
                }}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => {
                setSessionTokenBudget(0);
                setTokenInput("");
              }}
              style={{
                ...smallBtn,
                padding: "3px 10px",
                fontSize: 10,
                borderColor:
                  sessionTokenBudget === 0
                    ? "var(--accent-primary)"
                    : undefined,
                color:
                  sessionTokenBudget === 0
                    ? "var(--accent-primary)"
                    : undefined,
              }}
            >
              ∞ unlimited
            </button>
          </div>

          {/* Custom input */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 14,
              alignItems: "center",
            }}
          >
            <input
              type="number"
              min="0"
              step="1000"
              placeholder="custom (e.g. 250000)"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              style={{
                flex: 1,
                padding: "7px 10px",
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: 3,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-primary)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={() => {
                const v = parseInt(tokenInput) || 0;
                setSessionTokenBudget(v);
              }}
              style={smallBtn}
            >
              Set
            </button>
          </div>

          {/* Usage bar */}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 5,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                Tokens used this session
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color:
                    sessionTokenBudget > 0
                      ? barColor(tokenPct)
                      : "var(--text-muted)",
                  fontWeight: 700,
                }}
              >
                {formatTokens(sessionTokensUsed)}
                {sessionTokenBudget > 0 &&
                  ` / ${formatTokens(sessionTokenBudget)}`}
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: "var(--bg-elevated)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${sessionTokenBudget > 0 ? tokenPct : 0}%`,
                  background:
                    sessionTokenBudget > 0
                      ? barColor(tokenPct)
                      : "var(--accent-primary)",
                  borderRadius: 3,
                  transition: "width 400ms ease, background 400ms ease",
                }}
              />
            </div>
          </div>

          <button onClick={resetTokens} style={{ ...smallBtn, marginTop: 4 }}>
            Reset token counter
          </button>
        </div>
      </div>

      {/* USD budget — optional, paid keys only */}
      <div>
        <p style={sectionLabel}>
          💳 USD spend budget{" "}
          <span
            style={{
              fontWeight: 400,
              textTransform: "none",
              letterSpacing: 0,
              color: "var(--text-muted)",
              fontSize: 10,
            }}
          >
            (paid keys only)
          </span>
        </p>
        <div style={cardStyle}>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              margin: "0 0 12px",
              lineHeight: 1.5,
            }}
          >
            Optional hard cap in USD. Free-tier keys always cost $0 so this only
            matters if you have paid API keys. Set to 0 to disable.
          </p>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 14,
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              $
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0 = disabled"
              value={usdInput}
              onChange={(e) => setUsdInput(e.target.value)}
              style={{
                width: 120,
                padding: "7px 10px",
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: 3,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-primary)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={() => {
                const v = parseFloat(usdInput) || 0;
                setSessionBudget(v);
              }}
              style={smallBtn}
            >
              Set
            </button>
            {sessionBudget > 0 && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                limit: ${sessionBudget.toFixed(2)}
              </span>
            )}
          </div>

          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 5,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                USD spent
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color:
                    sessionBudget > 0 ? barColor(usdPct) : "var(--text-muted)",
                  fontWeight: 700,
                }}
              >
                ${sessionSpend.toFixed(5)}
                {sessionBudget > 0 && ` / $${sessionBudget.toFixed(2)}`}
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: "var(--bg-elevated)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${sessionBudget > 0 ? usdPct : 0}%`,
                  background:
                    sessionBudget > 0 ? barColor(usdPct) : "transparent",
                  borderRadius: 3,
                  transition: "width 400ms ease, background 400ms ease",
                }}
              />
            </div>
          </div>

          <button onClick={resetSpend} style={{ ...smallBtn, marginTop: 4 }}>
            Reset spend counter
          </button>
        </div>
      </div>

      {/* Key role routing guide */}
      <div>
        <p style={sectionLabel}>🎯 Key role routing</p>
        <div style={cardStyle}>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              margin: "0 0 12px",
              lineHeight: 1.5,
            }}
          >
            Assign roles to keys so expensive models are only used when it
            matters. Roles are set per-key in the{" "}
            <strong style={{ color: "var(--text-primary)" }}>Keys</strong> tab.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(
              Object.entries(ROLE_LABELS) as [
                KeyRole,
                (typeof ROLE_LABELS)[KeyRole],
              ][]
            ).map(([role, info]) => (
              <div
                key={role}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "8px 10px",
                  background: "var(--bg-elevated)",
                  borderRadius: 6,
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    color: info.color,
                    background: `${info.color}18`,
                    borderRadius: 3,
                    padding: "2px 7px",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {info.label}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  {info.description}
                </span>
              </div>
            ))}
          </div>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              margin: "12px 0 0",
              fontStyle: "italic",
            }}
          >
            Tip: assign your free-tier Gemini and OpenRouter keys to
            &ldquo;Generation&rdquo; and reserve Claude Opus for &ldquo;Chat
            only&rdquo; where quality matters most.
          </p>
        </div>
      </div>
    </div>
  );
}
