"use client";
// ─── ForgeConfigPanel — config form + capacity bar ────────────────────────────
import React, { useState, useEffect } from "react";
import { Depth, ForgeConfig, ForgeState, Scope } from "./types";
import { buildPrerequisiteDigest } from "./prerequisiteDigest";
import { Curriculum, SavedCurriculum } from "@/types/curriculum";
import {
  useAI,
  GEMINI_FREE_MODELS,
  GROQ_FREE_MODELS,
  getRemainingRpd,
  getRemainingRpm,
  getNextRpmSlotMs,
} from "@/components/ai/AIProvider";

// ─── Static data ──────────────────────────────────────────────────────────────

export const SUBJECTS = [
  "Mathematics",
  "Science",
  "English / Language Arts",
  "History",
  "Computer Science",
  "Physics",
  "Chemistry",
  "Biology",
  "Economics",
  "Philosophy",
  "Statistics",
  "Engineering",
  "Psychology",
  "Music Theory",
];

export const LEVELS = [
  "Elementary (K-5)",
  "Middle School (6-8)",
  "High School (9-12)",
  "Undergraduate (Introductory)",
  "Undergraduate (Advanced)",
  "Graduate",
  "Professional / Certification",
];

export const LANGUAGES: { value: string; group: string }[] = [
  // Philippine languages
  { value: "English", group: "Philippine Languages" },
  { value: "Filipino (Tagalog)", group: "Philippine Languages" },
  { value: "Bisaya / Cebuano", group: "Philippine Languages" },
  { value: "Ilocano", group: "Philippine Languages" },
  { value: "Hiligaynon (Ilonggo)", group: "Philippine Languages" },
  { value: "Kapampangan", group: "Philippine Languages" },
  { value: "Bicolano", group: "Philippine Languages" },
  { value: "Waray", group: "Philippine Languages" },
  // European
  { value: "Spanish", group: "European" },
  { value: "French", group: "European" },
  { value: "Portuguese", group: "European" },
  { value: "German", group: "European" },
  { value: "Italian", group: "European" },
  { value: "Dutch", group: "European" },
  { value: "Russian", group: "European" },
  // Asian
  { value: "Mandarin Chinese", group: "Asian" },
  { value: "Japanese", group: "Asian" },
  { value: "Korean", group: "Asian" },
  { value: "Hindi", group: "Asian" },
  { value: "Bahasa Indonesia", group: "Asian" },
  { value: "Malay", group: "Asian" },
  { value: "Vietnamese", group: "Asian" },
  { value: "Thai", group: "Asian" },
  // Middle East & Africa
  { value: "Arabic", group: "Middle East & Africa" },
  { value: "Swahili", group: "Middle East & Africa" },
];

export const SCOPE_LABELS: Record<
  Scope,
  { label: string; desc: string; hint: string }
> = {
  focused: {
    label: "Focused",
    desc: "Core essentials only",
    hint: "~3–5 units",
  },
  standard: {
    label: "Standard",
    desc: "Well-rounded coverage",
    hint: "~5–8 units",
  },
  comprehensive: {
    label: "Comprehensive",
    desc: "In-depth with advanced topics",
    hint: "~8–14 units",
  },
};

export const DEPTH_LABELS: Record<Depth, { label: string; desc: string }> = {
  outline: { label: "Outline", desc: "3 blocks, 2 questions/topic" },
  standard: { label: "Standard", desc: "5 blocks, 3 questions/topic" },
  deep: { label: "Deep", desc: "8 blocks, 5 questions/topic" },
};

// Depth defaults — used to pre-fill custom sliders when switching to custom mode
export const DEPTH_DEFAULTS: Record<
  Depth,
  { blocks: number; questions: number }
> = {
  outline: { blocks: 3, questions: 2 },
  standard: { blocks: 5, questions: 3 },
  deep: { blocks: 8, questions: 5 },
};

const SCOPE_ESTIMATE: Record<Scope, { units: string; lessons: string }> = {
  focused: { units: "3–5", lessons: "~9–20" },
  standard: { units: "5–8", lessons: "~20–40" },
  comprehensive: { units: "8–14", lessons: "~40–84" },
};

const DEPTH_OUTPUT: Record<Depth, string> = {
  outline: "~150KB–500KB",
  standard: "~300KB–1.2MB",
  deep: "~600KB–2MB",
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--bg-primary)",
  border: "1px solid var(--border-color)",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  marginBottom: 5,
  display: "block",
};

// ─── Hydra Architecture Panel ─────────────────────────────────────────────────

const HYDRA_STAGES: Array<{
  phase: string;
  label: string;
  color: string;
  provider: string;
  models: string[];
  role: string;
  description: string;
}> = [
  {
    phase: "scaffold",
    label: "① Scaffold",
    color: "#8B5CF6",
    provider: "groq + gemini",
    models: ["groq/compound", "gemini-3.1-flash-lite-preview"],
    role: "scaffold",
    description:
      "Designs the full course skeleton. Uses groq/compound (Groq key, blank model) or gemini-3.1-flash-lite-preview (Gemini key, blank model). Both can run simultaneously if both key types are present.",
  },
  {
    phase: "wave",
    label: "② Wave",
    color: "#3B82F6",
    provider: "groq + gemini",
    models: ["gemini-3.1-flash-lite-preview", "groq/compound"],
    role: "generation",
    description:
      "All lessons dispatched simultaneously. Gemini: N×10 RPM, N×250k TPM, ~25,000 tokens/call. Groq: N×4 RPM, N×250 RPD, ~17,500 tokens/call (TPM-capped). Both key types fill lanes together — more keys = faster generation.",
  },
  {
    phase: "unit-tests",
    label: "③ Unit Tests",
    color: "#EC4899",
    provider: "groq + gemini",
    models: ["gemini-3.1-flash-lite-preview", "groq/compound"],
    role: "unit-test",
    description:
      "All unit tests fire in parallel across all available lanes. Same key routing as wave — Gemini and Groq lanes work together.",
  },
  {
    phase: "repair",
    label: "④ Repair",
    color: "#EF4444",
    provider: "groq + gemini",
    models: ["gemini-3.1-flash-lite-preview", "groq/compound"],
    role: "generation",
    description:
      "Inline repair triggers per failed job while other jobs still run. Uses whichever lane is available — Gemini or Groq.",
  },
];

export function HydraArchitecturePanel({
  forge,
  isRunning,
}: {
  forge?: ForgeState;
  isRunning?: boolean;
}) {
  const { keys } = useAI();
  const [expanded, setExpanded] = React.useState(false);

  // RPM window refresh: Gemini's 1-minute sliding window resets periodically.
  // Show a live countdown (0–60s) so the user knows when slots refill.
  const [rpmRefreshSec, setRpmRefreshSec] = useState<number>(0);
  useEffect(() => {
    // Tick every second — count up from 0 to 59, representing seconds elapsed
    // in the current 60-second RPM window. At 60 the window rolls and slots refill.
    const tick = () => {
      setRpmRefreshSec(Math.floor((Date.now() / 1000) % 60));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-expand during an active run
  React.useEffect(() => {
    if (isRunning) setExpanded(true);
  }, [isRunning]);

  const phase = forge?.phase ?? "idle";
  const modelActivity = forge?.modelActivity ?? {};

  // Build live quota snapshot per model
  const quotaByModel: Record<
    string,
    { rpdLeft: number; rpmLeft: number; keyCount: number; nextSlotMs: number }
  > = {};
  for (const key of keys) {
    const registry =
      key.provider === "gemini"
        ? GEMINI_FREE_MODELS
        : key.provider === "groq"
          ? GROQ_FREE_MODELS
          : null;
    if (!registry) continue;
    // Mirror pickBestLane: blank model → only the canonical default, never all registry keys.
    const defaultModelId =
      key.provider === "gemini"
        ? "gemini-3.1-flash-lite-preview"
        : "groq/compound";
    const modelsForKey =
      key.model && registry[key.model] ? [key.model] : [defaultModelId];
    for (const modelId of modelsForKey) {
      const limits = registry[modelId];
      if (!limits) continue;
      const prev = quotaByModel[modelId] ?? {
        rpdLeft: 0,
        rpmLeft: 0,
        keyCount: 0,
        nextSlotMs: 0,
      };
      const rpmLeft = getRemainingRpm(key.id, modelId);
      const nextSlotMs = rpmLeft === 0 ? getNextRpmSlotMs(key.id, modelId) : 0;
      quotaByModel[modelId] = {
        rpdLeft: prev.rpdLeft + getRemainingRpd(key.id, modelId),
        rpmLeft: prev.rpmLeft + rpmLeft,
        keyCount: prev.keyCount + 1,
        nextSlotMs: Math.max(prev.nextSlotMs, nextSlotMs),
      };
    }
  }

  const groqKeys = keys.filter((k) => k.provider === "groq");
  const geminiKeys = keys.filter((k) => k.provider === "gemini");

  // forge.phase sequence: "idle" → "scaffold" → "wave" → "repair" → "done"
  const FORGE_PHASE_RANK: Record<string, number> = {
    idle: 0,
    scaffold: 1,
    wave: 2,
    repair: 3,
    done: 4,
  };
  // Which forge.phase values mean this UI stage is currently active
  const STAGE_ACTIVE_WHEN: Record<string, string[]> = {
    scaffold: ["scaffold"],
    wave: ["wave"],
    "unit-tests": ["repair"], // unit tests fire at the start of repair
    repair: ["repair"],
  };
  // Which forge.phase rank makes this UI stage "done" (strictly passed)
  const STAGE_DONE_FROM_RANK: Record<string, number> = {
    scaffold: FORGE_PHASE_RANK["wave"], // done once wave starts
    wave: FORGE_PHASE_RANK["repair"],
    "unit-tests": FORGE_PHASE_RANK["done"],
    repair: FORGE_PHASE_RANK["done"],
  };
  const phaseStatus = (stagePhase: string): "active" | "done" | "idle" => {
    if (phase === "done") return "done";
    if (phase === "idle") return "idle";
    if ((STAGE_ACTIVE_WHEN[stagePhase] ?? []).includes(phase)) return "active";
    const currentRank = FORGE_PHASE_RANK[phase] ?? 0;
    const doneFromRank = STAGE_DONE_FROM_RANK[stagePhase] ?? 999;
    if (currentRank >= doneFromRank) return "done";
    return "idle";
  };

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Toggle button */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          padding: "7px 12px",
          background: "none",
          border: "1px solid var(--border-color)",
          borderRadius: expanded ? "6px 6px 0 0" : 6,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            ⚡ Hydra Architecture
          </span>
          {isRunning && phase !== "idle" ? (
            <span
              style={{
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                padding: "1px 7px",
                borderRadius: 100,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background:
                  "color-mix(in srgb, var(--accent-primary) 15%, var(--bg-tertiary))",
                color: "var(--accent-primary)",
                border:
                  "1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              ●{" "}
              {(
                {
                  scaffold: "SCAFFOLDING",
                  wave: "WAVE",
                  repair: "REPAIRING",
                  assembly: "ASSEMBLING",
                  done: "DONE",
                  error: "ERROR",
                } as Record<string, string>
              )[phase] ?? phase.toUpperCase()}
            </span>
          ) : (
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--text-muted)",
              }}
            >
              {groqKeys.length} Groq · {geminiKeys.length} Gemini
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {expanded ? "▲ hide" : "▼ show"}
        </span>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          style={{
            border: "1px solid var(--border-color)",
            borderTop: "none",
            borderRadius: "0 0 6px 6px",
            background: "var(--bg-secondary)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* RPM window refresh indicator */}
          {(geminiKeys.length > 0 || groqKeys.length > 0) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 8px",
                background: "var(--bg-primary)",
                borderRadius: 4,
                border: "1px solid var(--border-color)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                }}
              >
                RPM window
              </span>
              {/* Progress bar: fills over 60s then resets */}
              <div
                style={{
                  flex: 1,
                  height: 3,
                  background: "var(--bg-tertiary)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(rpmRefreshSec / 60) * 100}%`,
                    background:
                      rpmRefreshSec > 50
                        ? "var(--accent-warning)"
                        : "var(--accent-primary)",
                    borderRadius: 2,
                    transition: "width 900ms linear",
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {60 - rpmRefreshSec}s to refill
              </span>
            </div>
          )}

          {HYDRA_STAGES.map((stage) => {
            const activeModels = stage.models.filter(
              (m) => quotaByModel[m]?.keyCount > 0,
            );
            // hasCapacity is true if quota is tracked OR if a key exists for the
            // stage's provider (blank-model keys won't appear in quotaByModel until
            // their first request fires, but the forge can still route to them).
            const stageIsGroq = stage.models.some((m) => GROQ_FREE_MODELS[m]);
            const stageIsGemini = stage.models.some(
              (m) => GEMINI_FREE_MODELS[m],
            );
            const providerKeyAvailable =
              (stageIsGroq && groqKeys.length > 0) ||
              (stageIsGemini && geminiKeys.length > 0);
            const hasCapacity = activeModels.length > 0 || providerKeyAvailable;
            const status = phaseStatus(stage.phase);
            const stageColor = !hasCapacity ? "var(--text-muted)" : stage.color;
            const jobsDone = stage.models.reduce(
              (sum, m) => sum + (modelActivity[m] ?? 0),
              0,
            );

            // Pulse ring on active phase
            const isActive = status === "active" && isRunning;

            return (
              <div
                key={stage.phase}
                style={{ display: "flex", flexDirection: "column", gap: 5 }}
              >
                {/* Stage header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Status dot */}
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background:
                        status === "done"
                          ? "var(--accent-success)"
                          : status === "active"
                            ? stage.color
                            : "var(--bg-tertiary)",
                      border: `1px solid ${status === "idle" ? "var(--border-color)" : "transparent"}`,
                      boxShadow: isActive
                        ? `0 0 0 3px color-mix(in srgb, ${stage.color} 25%, transparent)`
                        : "none",
                    }}
                  />

                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: stageColor,
                      minWidth: 90,
                    }}
                  >
                    {stage.label}
                  </span>

                  {/* Status badge */}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      padding: "1px 6px",
                      borderRadius: 3,
                      background:
                        status === "done"
                          ? "color-mix(in srgb, var(--accent-success) 12%, var(--bg-tertiary))"
                          : status === "active"
                            ? `color-mix(in srgb, ${stage.color} 15%, var(--bg-tertiary))`
                            : !hasCapacity
                              ? "var(--bg-tertiary)"
                              : "var(--bg-tertiary)",
                      color:
                        status === "done"
                          ? "var(--accent-success)"
                          : status === "active"
                            ? stage.color
                            : !hasCapacity
                              ? "var(--text-muted)"
                              : "var(--text-muted)",
                      border: `1px solid ${
                        status === "done"
                          ? "var(--accent-success)44"
                          : status === "active"
                            ? stage.color + "44"
                            : "var(--border-color)"
                      }`,
                    }}
                  >
                    {status === "done"
                      ? "✓ done"
                      : status === "active"
                        ? "● running"
                        : !hasCapacity
                          ? "✕ no key"
                          : "· waiting"}
                  </span>

                  {/* Scaffold: show the actual model used */}
                  {stage.phase === "scaffold" && forge?.scaffoldUsedModel && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        padding: "1px 6px",
                        borderRadius: 3,
                        background:
                          "color-mix(in srgb, #8B5CF6 12%, var(--bg-tertiary))",
                        color: "#8B5CF6",
                        border: "1px solid #8B5CF644",
                        maxWidth: 120,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={`Scaffold served by: ${forge.scaffoldUsedModel}`}
                    >
                      {forge.scaffoldUsedModel
                        .replace(/^gemini-/, "")
                        .replace(/-preview$/, "")
                        .replace(/^moonshotai\//, "")
                        .replace(/^openai\//, "")
                        .replace(/^meta-llama\//, "")
                        .replace(/^qwen\//, "")}
                    </span>
                  )}

                  {/* Live job count */}
                  {jobsDone > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--accent-success)",
                      }}
                    >
                      {jobsDone} job{jobsDone !== 1 ? "s" : ""}
                    </span>
                  )}

                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--text-muted)",
                      marginLeft: "auto",
                    }}
                  >
                    role: {stage.role}
                  </span>
                </div>

                {/* Description */}
                <p
                  style={{
                    margin: 0,
                    fontSize: 10,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    paddingLeft: 15,
                  }}
                >
                  {stage.description}
                </p>

                {/* Per-model rows */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    paddingLeft: 15,
                  }}
                >
                  {stage.models.map((modelId) => {
                    const q = quotaByModel[modelId];
                    const registry = GEMINI_FREE_MODELS[modelId]
                      ? GEMINI_FREE_MODELS
                      : GROQ_FREE_MODELS;
                    const limits = registry[modelId];
                    if (!limits) return null;
                    const jobCount = modelActivity[modelId] ?? 0;
                    const rpdTotal = limits.rpd * (q?.keyCount || 1);
                    const rpdPct =
                      limits.rpd > 0
                        ? Math.min(100, ((q?.rpdLeft ?? 0) / rpdTotal) * 100)
                        : 100;
                    const shortName = modelId
                      .replace("moonshotai/", "")
                      .replace("meta-llama/", "")
                      .replace("qwen/", "")
                      .replace("groq/", "")
                      .replace("openai/", "")
                      .replace("gemini-", "");

                    const isModelActive = isActive && jobCount > 0;

                    return (
                      <div
                        key={modelId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {/* Active flash dot */}
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            flexShrink: 0,
                            background: isModelActive
                              ? stage.color
                              : jobCount > 0
                                ? "var(--accent-success)"
                                : "var(--bg-tertiary)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 9,
                            color: "var(--text-muted)",
                            minWidth: 170,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {shortName}
                        </span>
                        {q ? (
                          <>
                            {/* RPD bar */}
                            <div
                              style={{
                                flex: 1,
                                height: 3,
                                background: "var(--bg-tertiary)",
                                borderRadius: 2,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${rpdPct}%`,
                                  background:
                                    jobCount > 0
                                      ? stage.color
                                      : "var(--border-color)",
                                  borderRadius: 2,
                                  opacity: 0.8,
                                  transition: "width 800ms ease",
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 9,
                                color:
                                  q.rpmLeft === 0 && q.nextSlotMs > 0
                                    ? "var(--accent-warning)"
                                    : "var(--text-muted)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {q.rpdLeft} rpd · {q.rpmLeft} rpm
                              {q.rpmLeft === 0 && q.nextSlotMs > 0 && (
                                <span
                                  style={{ color: "var(--accent-warning)" }}
                                >
                                  {" "}
                                  · refills in {Math.ceil(q.nextSlotMs / 1000)}s
                                </span>
                              )}
                            </span>
                            {jobCount > 0 && (
                              <span
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: "var(--accent-success)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {jobCount}✓
                              </span>
                            )}
                          </>
                        ) : (
                          (() => {
                            // Determine whether a provider key exists for this model
                            // even if quota hasn't been tracked yet (blank-model keys).
                            const modelIsGroq = !!GROQ_FREE_MODELS[modelId];
                            const modelIsGemini = !!GEMINI_FREE_MODELS[modelId];
                            const providerReady =
                              (modelIsGroq && groqKeys.length > 0) ||
                              (modelIsGemini && geminiKeys.length > 0);
                            return (
                              <span
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 9,
                                  color: providerReady
                                    ? "var(--text-secondary)"
                                    : "var(--text-muted)",
                                  fontStyle: "italic",
                                }}
                              >
                                {providerReady
                                  ? "— ready (auto)"
                                  : "— no key configured"}
                              </span>
                            );
                          })()
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Footer summary */}
          <div
            style={{
              marginTop: 4,
              paddingTop: 8,
              borderTop: "1px solid var(--border-color)",
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {[
              { label: "Groq keys", val: groqKeys.length },
              { label: "Gemini keys", val: geminiKeys.length },
              {
                label: "Models tracked",
                val: Object.keys(quotaByModel).length,
              },
              ...(Object.keys(modelActivity).length > 0
                ? [
                    {
                      label: "Total jobs done",
                      val: Object.values(modelActivity).reduce(
                        (a, b) => a + b,
                        0,
                      ),
                    },
                  ]
                : []),
            ].map(({ label, val }) => (
              <span
                key={label}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                }}
              >
                {label}:{" "}
                <strong style={{ color: "var(--text-secondary)" }}>
                  {val}
                </strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  config: ForgeConfig;
  setConfig: React.Dispatch<React.SetStateAction<ForgeConfig>>;
  totalLanes: number;
  lessonsPerWave: number;
  onForge: () => void;
  savedCurricula?: SavedCurriculum[];
  /** Live forge state — passed during generation to power the Hydra live view */
  forge?: ForgeState;
  isRunning?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ForgeConfigPanel({
  config,
  setConfig,
  totalLanes,
  lessonsPerWave,
  onForge,
  savedCurricula = [],
  forge,
  isRunning = false,
}: Props) {
  const hasKeys = totalLanes > 0;
  const estimate = SCOPE_ESTIMATE[config.scope];
  const [prereqTab, setPrereqTab] = React.useState<"saved" | "file">(() =>
    savedCurricula.length > 0 ? "saved" : "file",
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "16px 20px",
      }}
    >
      {/* Header */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 16 }}>⚡</span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            Curriculum Forge
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              background: "var(--accent-primary-soft)",
              color: "var(--accent-primary)",
              border:
                "1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)",
              borderRadius: 100,
              padding: "1px 7px",
            }}
          >
            PARALLEL
          </span>
        </div>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          The AI designs the optimal structure for your subject — unit count,
          lessons per unit, and topics per lesson are determined by the content,
          not forced by sliders.
        </p>
      </div>

      {/* Capacity bar */}
      <div
        style={{
          padding: "10px 14px",
          borderRadius: 6,
          background: hasKeys
            ? "color-mix(in srgb, var(--accent-success) 8%, var(--bg-secondary))"
            : "color-mix(in srgb, var(--accent-danger) 8%, var(--bg-secondary))",
          border: `1px solid ${hasKeys ? "var(--accent-success)44" : "var(--accent-danger)44"}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
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
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              {hasKeys
                ? `${totalLanes} parallel lanes available`
                : "No keys — add API keys to forge"}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
              }}
            >
              {estimate.units} units · {estimate.lessons} lessons estimated
            </span>
          </div>
          <div
            style={{
              height: 5,
              background: "var(--bg-tertiary)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${hasKeys ? Math.max(5, Math.min(100, Math.round((totalLanes / 60) * 100))) : 0}%`,
                background: hasKeys
                  ? "var(--accent-success)"
                  : "var(--accent-danger)",
                borderRadius: 3,
                transition: "width 400ms",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
              }}
            >
              Estimated output: {DEPTH_OUTPUT[config.depth]}
            </span>
            {hasKeys && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                }}
              >
                {lessonsPerWave} lessons/wave
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Hydra Architecture toggler */}
      <HydraArchitecturePanel forge={forge} isRunning={isRunning} />

      {/* Form */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Course title */}
        <div>
          <label style={labelStyle}>Course title *</label>
          <input
            style={inputStyle}
            placeholder='e.g. "Pre-Calculus for Information Technology"'
            value={config.title}
            onChange={(e) =>
              setConfig((c) => ({ ...c, title: e.target.value }))
            }
          />
        </div>

        {/* Subject + Level */}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Subject</label>
            <select
              style={{ ...inputStyle, cursor: "pointer" }}
              value={config.subject}
              onChange={(e) =>
                setConfig((c) => ({ ...c, subject: e.target.value }))
              }
            >
              {SUBJECTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Level</label>
            <select
              style={{ ...inputStyle, cursor: "pointer" }}
              value={config.level}
              onChange={(e) =>
                setConfig((c) => ({ ...c, level: e.target.value }))
              }
            >
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Language */}
        <div>
          <label style={labelStyle}>Output language</label>
          <select
            style={{ ...inputStyle, cursor: "pointer" }}
            value={config.language}
            onChange={(e) =>
              setConfig((c) => ({ ...c, language: e.target.value }))
            }
          >
            {Array.from(new Set(LANGUAGES.map((l) => l.group))).map((group) => (
              <optgroup key={group} label={group}>
                {LANGUAGES.filter((l) => l.group === group).map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.value}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Duration hint */}
        <div>
          <label style={labelStyle}>
            Target duration{" "}
            <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            style={inputStyle}
            placeholder='e.g. "8 weeks", "30 hours", "1 semester"'
            value={config.duration}
            onChange={(e) =>
              setConfig((c) => ({ ...c, duration: e.target.value }))
            }
          />
        </div>

        {/* Instructor notes */}
        <div>
          <label style={labelStyle}>
            Instructor notes{" "}
            <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            style={{
              ...inputStyle,
              resize: "vertical",
              minHeight: 56,
              lineHeight: 1.5,
            }}
            placeholder='e.g. "Focus on practical IT applications. Include Python examples."'
            value={config.notes}
            onChange={(e) =>
              setConfig((c) => ({ ...c, notes: e.target.value }))
            }
          />
        </div>

        {/* Prerequisite course */}
        <div>
          <label style={labelStyle}>
            Prerequisite course{" "}
            <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span>
          </label>
          {config.prerequisite ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: 6,
                background:
                  "color-mix(in srgb, var(--accent-primary) 8%, var(--bg-secondary))",
                border:
                  "1px solid color-mix(in srgb, var(--accent-primary) 40%, transparent)",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  ⛓ {config.prerequisite.courseTitle}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                  }}
                >
                  {config.prerequisite.units.length} units ·{" "}
                  {config.prerequisite.keyTerms.length} key terms indexed
                </span>
              </div>
              <button
                onClick={() =>
                  setConfig((c) => ({ ...c, prerequisite: undefined }))
                }
                style={{
                  padding: "3px 8px",
                  background: "none",
                  border: "1px solid var(--border-color)",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                ✕ Remove
              </button>
            </div>
          ) : (
            <div
              style={{
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                overflow: "hidden",
              }}
            >
              {/* Tab bar — only show "Saved" tab if there are saved curricula */}
              <div
                style={{
                  display: "flex",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                {savedCurricula.length > 0 && (
                  <button
                    onClick={() => setPrereqTab("saved")}
                    style={{
                      flex: 1,
                      padding: "7px 0",
                      background:
                        prereqTab === "saved" ? "var(--bg-tertiary)" : "none",
                      border: "none",
                      borderBottom:
                        prereqTab === "saved"
                          ? "2px solid var(--accent-primary)"
                          : "2px solid transparent",
                      cursor: "pointer",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase" as const,
                      color:
                        prereqTab === "saved"
                          ? "var(--accent-primary)"
                          : "var(--text-muted)",
                    }}
                  >
                    Loaded ({savedCurricula.length})
                  </button>
                )}
                <button
                  onClick={() => setPrereqTab("file")}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    background:
                      prereqTab === "file" ? "var(--bg-tertiary)" : "none",
                    border: "none",
                    borderBottom:
                      prereqTab === "file"
                        ? "2px solid var(--accent-primary)"
                        : "2px solid transparent",
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase" as const,
                    color:
                      prereqTab === "file"
                        ? "var(--accent-primary)"
                        : "var(--text-muted)",
                  }}
                >
                  Upload JSON
                </button>
              </div>

              {/* Saved curricula list */}
              {prereqTab === "saved" && savedCurricula.length > 0 && (
                <div style={{ maxHeight: 160, overflowY: "auto" }}>
                  {savedCurricula.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => {
                        const digest = buildPrerequisiteDigest(
                          entry.curriculum,
                        );
                        setConfig((c) => ({ ...c, prerequisite: digest }));
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        width: "100%",
                        padding: "8px 12px",
                        background: "none",
                        border: "none",
                        borderBottom: "1px solid var(--border-subtle)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "var(--bg-tertiary)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "none")
                      }
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                        }}
                      >
                        {entry.title}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--text-muted)",
                        }}
                      >
                        {entry.curriculum.units?.length ?? 0} units ·{" "}
                        {entry.filename}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* File upload */}
              {prereqTab === "file" && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px",
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-tertiary)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "none")
                  }
                >
                  <input
                    type="file"
                    accept=".json"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        try {
                          const parsed = JSON.parse(
                            ev.target?.result as string,
                          ) as Curriculum;
                          const digest = buildPrerequisiteDigest(parsed);
                          setConfig((c) => ({ ...c, prerequisite: digest }));
                        } catch {
                          // silently ignore malformed JSON
                        }
                      };
                      reader.readAsText(file);
                      e.target.value = "";
                    }}
                  />
                  ↑ Load prior curriculum JSON to build upon it
                </label>
              )}
            </div>
          )}
        </div>

        {/* Scope selector */}
        <div>
          <label style={labelStyle}>Course scope</label>
          <div style={{ display: "flex", gap: 6 }}>
            {(
              Object.entries(SCOPE_LABELS) as [
                Scope,
                (typeof SCOPE_LABELS)[Scope],
              ][]
            ).map(([key, val]) => (
              <button
                key={key}
                onClick={() => setConfig((c) => ({ ...c, scope: key }))}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  cursor: "pointer",
                  borderRadius: 5,
                  textAlign: "left",
                  border: `1px solid ${config.scope === key ? "var(--accent-primary)" : "var(--border-color)"}`,
                  background:
                    config.scope === key
                      ? "var(--accent-primary-soft)"
                      : "none",
                  transition: "all 150ms",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    marginBottom: 2,
                    color:
                      config.scope === key
                        ? "var(--accent-primary)"
                        : "var(--text-primary)",
                  }}
                >
                  {val.label}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-muted)",
                    lineHeight: 1.4,
                  }}
                >
                  {val.desc}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--accent-primary)",
                    opacity: 0.7,
                    marginTop: 2,
                  }}
                >
                  {val.hint}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Depth selector */}
        <div>
          <label style={labelStyle}>Content depth</label>
          <div style={{ display: "flex", gap: 6 }}>
            {(
              Object.entries(DEPTH_LABELS) as [
                Depth,
                (typeof DEPTH_LABELS)[Depth],
              ][]
            ).map(([key, val]) => {
              const isCustomActive = config.customBlocks !== undefined;
              const isSelected = config.depth === key;
              return (
                <button
                  key={key}
                  onClick={() =>
                    !isCustomActive && setConfig((c) => ({ ...c, depth: key }))
                  }
                  disabled={isCustomActive}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    cursor: isCustomActive ? "not-allowed" : "pointer",
                    borderRadius: 5,
                    textAlign: "left",
                    border: `1px solid ${isSelected && !isCustomActive ? "var(--accent-primary)" : "var(--border-color)"}`,
                    background:
                      isSelected && !isCustomActive
                        ? "var(--accent-primary-soft)"
                        : "none",
                    opacity: isCustomActive ? 0.4 : 1,
                    transition: "all 150ms",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 700,
                      marginBottom: 3,
                      color:
                        isSelected && !isCustomActive
                          ? "var(--accent-primary)"
                          : "var(--text-primary)",
                    }}
                  >
                    {val.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--text-muted)",
                      lineHeight: 1.4,
                    }}
                  >
                    {val.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom depth controls */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              Custom content depth
            </label>
            <button
              onClick={() => {
                const isCustom = config.customBlocks !== undefined;
                if (isCustom) {
                  // Turn off custom — clear overrides
                  setConfig((c) => ({
                    ...c,
                    customBlocks: undefined,
                    customQuestions: undefined,
                  }));
                } else {
                  // Turn on — seed from current depth preset
                  const defaults = DEPTH_DEFAULTS[config.depth];
                  setConfig((c) => ({
                    ...c,
                    customBlocks: defaults.blocks,
                    customQuestions: defaults.questions,
                  }));
                }
              }}
              style={{
                padding: "2px 8px",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                borderRadius: 4,
                border: `1px solid ${config.customBlocks !== undefined ? "var(--accent-primary)" : "var(--border-color)"}`,
                background:
                  config.customBlocks !== undefined
                    ? "var(--accent-primary-soft)"
                    : "none",
                color:
                  config.customBlocks !== undefined
                    ? "var(--accent-primary)"
                    : "var(--text-muted)",
                cursor: "pointer",
                transition: "all 150ms",
              }}
            >
              {config.customBlocks !== undefined ? "✓ On" : "Off"}
            </button>
          </div>

          {config.customBlocks !== undefined && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: "10px 12px",
                background: "var(--bg-secondary)",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
              }}
            >
              {/* Blocks per topic */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--text-muted)",
                    }}
                  >
                    Content blocks per topic
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--accent-primary)",
                    }}
                  >
                    {config.customBlocks}
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={20}
                  step={1}
                  value={config.customBlocks}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      customBlocks: Number(e.target.value),
                    }))
                  }
                  style={{
                    width: "100%",
                    accentColor: "var(--accent-primary)",
                  }}
                />
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--text-muted)",
                    }}
                  >
                    2 (minimal)
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--text-muted)",
                    }}
                  >
                    20 (max)
                  </span>
                </div>
              </div>

              {/* Questions per topic */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--text-muted)",
                    }}
                  >
                    Practice questions per topic
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--accent-primary)",
                    }}
                  >
                    {config.customQuestions}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={config.customQuestions}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      customQuestions: Number(e.target.value),
                    }))
                  }
                  style={{
                    width: "100%",
                    accentColor: "var(--accent-primary)",
                  }}
                />
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--text-muted)",
                    }}
                  >
                    1 (lean)
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--text-muted)",
                    }}
                  >
                    10 (max)
                  </span>
                </div>
              </div>

              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                  borderTop: "1px solid var(--border-color)",
                  paddingTop: 8,
                }}
              >
                Fully overrides the depth preset above — blocks, questions, and
                formative quiz counts all use these values. The depth preset is
                locked while custom is on.
              </div>
            </div>
          )}
        </div>

        {/* Forge button */}
        <button
          onClick={onForge}
          disabled={!hasKeys || !config.title.trim()}
          style={{
            padding: "11px 20px",
            background:
              hasKeys && config.title.trim()
                ? "var(--accent-primary)"
                : "var(--bg-tertiary)",
            color:
              hasKeys && config.title.trim() ? "#fff" : "var(--text-muted)",
            border: "none",
            borderRadius: 5,
            cursor: hasKeys && config.title.trim() ? "pointer" : "not-allowed",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 700,
            transition: "background 150ms",
            letterSpacing: "0.04em",
          }}
        >
          {!hasKeys
            ? "⚠ Add API keys first"
            : !config.title.trim()
              ? "Enter a course title"
              : `⚡ Forge curriculum — ${totalLanes} lane${totalLanes !== 1 ? "s" : ""} · ${SCOPE_LABELS[config.scope].hint}`}
        </button>

        {!hasKeys && (
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--accent-warning)",
              margin: 0,
              textAlign: "center",
            }}
          >
            Open the course viewer → AI Config → add a Gemini key to unlock
            Forge.
          </p>
        )}
      </div>
    </div>
  );
}
