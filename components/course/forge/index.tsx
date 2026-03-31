"use client";
// ─── CurriculumForge — main orchestrator ─────────────────────────────────────
// This file is intentionally thin. All logic lives in sibling modules:
//
//   types.ts            — ForgeConfig, ForgeState, TreeNode, NodeStatus
//   jsonRepair.ts       — repairJSON, fixBadEscapes
//   prompts.ts          — SCAFFOLD_SYSTEM, buildScaffoldPrompt, buildLessonPrompt, buildUnitTestPrompt
//   validator.ts        — validateCurriculum, SchemaReport
//   useForgeEngine.ts   — three-phase forge pipeline (hook)
//   ForgeTree.tsx       — live generation progress tree
//   ForgeConfigPanel.tsx — config form + capacity bar
//   ForgeDonePanel.tsx  — success state, export, schema report

import { useState } from "react";
import {
  useAI,
  GEMINI_FREE_MODELS,
  GROQ_FREE_MODELS,
} from "@/components/ai/AIProvider";
import { Curriculum, SavedCurriculum } from "@/types/curriculum";
import { forgeLog } from "@/lib/forgeLogger";
import { ForgeConfig } from "./types";
import { useForgeEngine } from "./useForgeEngine";
import ForgeTree from "./ForgeTree";
import ForgeConfigPanel, {
  SCOPE_LABELS,
  HydraArchitecturePanel,
} from "./ForgeConfigPanel";
import ForgeDonePanel from "./ForgeDonePanel";

import { SchemaReport } from "./validator";

// ─── Capacity calculator ──────────────────────────────────────────────────────
// Counts distinct (key × model) quota buckets that are actually usable —
// matching the scoring logic in pickBestLane.  Each bucket is an independent
// parallel lane; more keys → more lanes → more simultaneous jobs.

// ── Capacity calculator ───────────────────────────────────────────────────────
// Counts actual parallel request capacity: each key contributes its model's RPM.
//
//   Gemini (blank) → gemini-3.1-flash-lite-preview → 10 RPM per key (capped for stability)
//   Groq   (blank) → groq/compound                 →  4 RPM per key
//
// Mixed: 1 Gemini + 1 Groq = 10 + 4 = 14 total lanes.
// WAVE_SIZE in the engine is set to totalLanes so all jobs dispatch at once.

function calcCapacity(keys: { provider: string; model?: string }[]) {
  let lanes = 0;
  for (const key of keys) {
    if (key.provider === "gemini") {
      if (key.model) {
        // Pinned model: capacity is its RPM (or 15 as a safe default for unknown models)
        const limits = GEMINI_FREE_MODELS[key.model];
        lanes += limits ? limits.rpm : 15;
      } else {
        // Blank = auto-routed: primary model is gemini-3.1-flash-lite-preview at 10 RPM
        lanes += GEMINI_FREE_MODELS["gemini-3.1-flash-lite-preview"].rpm;
      }
    } else if (key.provider === "groq") {
      // Groq: capacity is RPM of the resolved model (same logic as Gemini).
      // Blank key = groq/compound at 4 RPM (70k TPM ÷ 16,666 tokens/call).
      if (key.model) {
        const limits = GROQ_FREE_MODELS[key.model];
        lanes += limits ? limits.rpm : 4;
      } else {
        lanes += GROQ_FREE_MODELS["groq/compound"].rpm; // 4
      }
    } else {
      lanes += 1;
    }
  }
  const totalLanes = Math.max(1, lanes);
  return { totalLanes, lessonsPerWave: totalLanes };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onComplete: (
    curriculum: Curriculum,
    filename: string,
    report: SchemaReport | null,
  ) => void;
  savedCurricula?: SavedCurriculum[];
}

export default function CurriculumForge({
  onComplete,
  savedCurricula = [],
}: Props) {
  const { keys } = useAI();

  const [config, setConfig] = useState<ForgeConfig>({
    subject: "Mathematics",
    title: "",
    level: "High School (9-12)",
    scope: "standard",
    depth: "standard",
    duration: "",
    notes: "",
    language: "English",
  });

  const { totalLanes, lessonsPerWave } = calcCapacity(keys);

  const {
    forge,
    schemaReport,
    forgedCurriculum,
    isRunning,
    isDone,
    elapsedSec,
    progressPct,
    handleForge,
    resetForge,
  } = useForgeEngine(config, totalLanes);

  const filename = `${config.title.toLowerCase().replace(/\s+/g, "-")}-curriculum.json`;

  function handleLoad() {
    if (forgedCurriculum) onComplete(forgedCurriculum, filename, schemaReport);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Config form — shown only when idle */}
      {!isRunning && !isDone && forge.phase !== "error" && (
        <ForgeConfigPanel
          config={config}
          setConfig={setConfig}
          totalLanes={totalLanes}
          lessonsPerWave={lessonsPerWave}
          onForge={handleForge}
          savedCurricula={savedCurricula}
          forge={forge}
          isRunning={isRunning}
        />
      )}

      {/* Live generation view */}
      {(isRunning || isDone || forge.phase === "error") && forge.rootId && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "16px 20px",
          }}
        >
          {/* Stats bar */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              {
                label: "Phase",
                val:
                  (
                    {
                      scaffold: "SCAFFOLDING",
                      wave: "WAVE",
                      repair: "REPAIRING",
                      done: "DONE",
                      error: "ERROR",
                    } as Record<string, string>
                  )[forge.phase] ?? forge.phase.toUpperCase(),
              },
              { label: "Jobs", val: `${forge.doneJobs}/${forge.totalJobs}` },
              {
                label: "Generated",
                val:
                  forge.bytesGenerated >= 1_000_000
                    ? `${(forge.bytesGenerated / 1_000_000).toFixed(2)} MB`
                    : `${Math.round(forge.bytesGenerated / 1000)} KB`,
              },
              { label: "Elapsed", val: `${elapsedSec}s` },
              { label: "Lanes", val: String(forge.lanesUsed || totalLanes) },
              ...(forge.errorJobs > 0
                ? [{ label: "Errors", val: String(forge.errorJobs) }]
                : []),
            ].map(({ label, val }) => (
              <div
                key={label}
                style={{ display: "flex", flexDirection: "column", gap: 1 }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    color:
                      label === "Errors"
                        ? "var(--accent-danger)"
                        : "var(--text-primary)",
                  }}
                >
                  {val}
                </span>
              </div>
            ))}
          </div>

          {/* Progress bar — indeterminate during scaffold, determinate after */}
          {isRunning && (
            <div
              style={{
                height: 5,
                background: "var(--bg-tertiary)",
                borderRadius: 3,
                overflow: "hidden",
                position: "relative",
              }}
            >
              {forge.phase === "scaffold" ? (
                /* Indeterminate shimmer while waiting for scaffold */
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    height: "100%",
                    width: "40%",
                    background: "var(--accent-primary)",
                    borderRadius: 3,
                    animation: "scaffoldShimmer 1.6s ease-in-out infinite",
                  }}
                />
              ) : (
                <div
                  style={{
                    height: "100%",
                    width: `${progressPct}%`,
                    background: "var(--accent-primary)",
                    borderRadius: 3,
                    transition: "width 600ms ease",
                  }}
                />
              )}
            </div>
          )}

          {/* Scaffold phase indicator — visible during the potentially long scaffold wait */}
          {forge.phase === "scaffold" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 6,
                background:
                  "color-mix(in srgb, var(--accent-primary) 6%, var(--bg-secondary))",
                border:
                  "1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
            >
              <span
                style={{
                  animation: "pulse 1.2s ease-in-out infinite",
                  display: "inline-block",
                }}
              >
                ⬡
              </span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                Designing curriculum structure…
              </span>
              {(forge.nodes["scaffold"]?.chars ?? 0) > 0 && (
                <span
                  style={{ color: "var(--text-muted)", marginLeft: "auto" }}
                >
                  {Math.round((forge.nodes["scaffold"]?.chars ?? 0) / 1000)} KB
                  received
                </span>
              )}
            </div>
          )}

          {/* Tree */}
          <ForgeTree nodes={forge.nodes} rootId={forge.rootId} />

          {/* Live Hydra architecture — shows which model is firing per phase */}
          <HydraArchitecturePanel forge={forge} isRunning={isRunning} />

          {/* Done panel */}
          {isDone && (
            <ForgeDonePanel
              curriculum={forgedCurriculum}
              scaffoldSnapshot={forge.scaffoldSnapshot}
              filename={filename}
              bytesGenerated={forge.bytesGenerated}
              elapsedSec={elapsedSec}
              schemaReport={schemaReport}
              onLoad={handleLoad}
            />
          )}

          {/* Error panel */}
          {forge.phase === "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 6,
                  background:
                    "color-mix(in srgb, var(--accent-danger) 8%, var(--bg-secondary))",
                  border: "1px solid var(--accent-danger)55",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--accent-danger)",
                }}
              >
                ✕ Generation failed —{" "}
                {(() => {
                  // Find the first node with an error message; scaffold node holds the
                  // outer-catch error, individual lesson nodes hold wave/repair errors.
                  const errored = Object.values(forge.nodes).find(
                    (n) => n.status === "error" && n.error,
                  );
                  return (
                    errored?.error ??
                    "unknown error — check the forge log for details"
                  );
                })()}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={resetForge}
                  style={{
                    flex: 1,
                    padding: "8px",
                    background: "none",
                    border: "1px solid var(--border-color)",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-secondary)",
                  }}
                >
                  ← Back to config
                </button>
                <button
                  onClick={() => forgeLog.download()}
                  style={{
                    padding: "8px 12px",
                    background: "none",
                    border: "1px solid var(--border-color)",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-secondary)",
                  }}
                >
                  ↓ Download log
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scope hint shown during generation */}
      {isRunning && (
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            margin: "0 20px",
            textAlign: "center",
          }}
        >
          ⚡ Forging — {SCOPE_LABELS[config.scope].hint} · {config.depth} depth
        </p>
      )}
    </div>
  );
}
