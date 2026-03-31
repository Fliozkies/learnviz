"use client";
// ─── ForgeDonePanel — success state: export JSON + schema validation + diff report ───
import { useState } from "react";
import { Curriculum, resolveLocale } from "@/types/curriculum";
import { SchemaReport } from "./validator";
import { forgeLog } from "@/lib/forgeLogger";

interface Props {
  curriculum: Curriculum | null;
  scaffoldSnapshot: Curriculum | null;
  filename: string;
  bytesGenerated: number;
  elapsedSec: string;
  schemaReport: SchemaReport | null;
  onLoad: () => void;
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

type DiffSeverity = "added" | "removed" | "changed" | "ok";

interface DiffRow {
  id: string;
  label: string;
  severity: DiffSeverity;
  detail: string;
}

function diffCurricula(scaffold: Curriculum, final: Curriculum): DiffRow[] {
  const rows: DiffRow[] = [];

  const scaffoldUnits = new Map(scaffold.units.map((u) => [u.id, u]));
  const finalUnits = new Map(final.units.map((u) => [u.id, u]));

  // Units added in final but not in scaffold
  for (const [id, u] of finalUnits) {
    if (!scaffoldUnits.has(id)) {
      rows.push({
        id,
        label: id,
        severity: "added",
        detail: `Unit added: "${resolveLocale(u.title)}"`,
      });
    }
  }

  // Units in scaffold — check against final
  for (const [id, su] of scaffoldUnits) {
    const fu = finalUnits.get(id);
    const unitLabel = resolveLocale(su.title);

    if (!fu) {
      rows.push({
        id,
        label: id,
        severity: "removed",
        detail: `Unit removed: "${unitLabel}"`,
      });
      continue;
    }

    const scaffoldLessons = new Map(su.lessons.map((l) => [l.id, l]));
    const finalLessons = new Map(fu.lessons.map((l) => [l.id, l]));

    const scaffoldLessonCount = su.lessons.length;
    const finalLessonCount = fu.lessons.length;

    if (scaffoldLessonCount !== finalLessonCount) {
      const delta = finalLessonCount - scaffoldLessonCount;
      rows.push({
        id,
        label: `${id} · ${unitLabel}`,
        severity: "changed",
        detail: `Lessons: ${scaffoldLessonCount} → ${finalLessonCount} (${delta > 0 ? "+" : ""}${delta})`,
      });
    }

    // Lessons added
    for (const [lid, fl] of finalLessons) {
      if (!scaffoldLessons.has(lid)) {
        rows.push({
          id: lid,
          label: `  ${lid}`,
          severity: "added",
          detail: `Lesson added: "${resolveLocale(fl.title)}"`,
        });
      }
    }

    // Lessons removed or changed
    for (const [lid, sl] of scaffoldLessons) {
      const fl = finalLessons.get(lid);
      const lessonLabel = resolveLocale(sl.title);

      if (!fl) {
        rows.push({
          id: lid,
          label: `  ${lid}`,
          severity: "removed",
          detail: `Lesson removed: "${lessonLabel}"`,
        });
        continue;
      }

      const issues: string[] = [];

      // Title drift
      const finalTitle = resolveLocale(fl.title);
      if (lessonLabel && finalTitle && lessonLabel !== finalTitle) {
        issues.push(`title: "${lessonLabel}" → "${finalTitle}"`);
      }

      // Order drift
      if (fl.order !== sl.order) {
        issues.push(`order: ${sl.order} → ${fl.order}`);
      }

      // Topic count
      const sTopics = sl.topics?.length ?? 0;
      const fTopics = fl.topics?.length ?? 0;
      if (sTopics !== fTopics) {
        issues.push(`topics: ${sTopics} → ${fTopics}`);
      }

      // Topic IDs removed
      const scaffoldTopicIds = new Set((sl.topics ?? []).map((t) => t.id));
      const finalTopicIds = new Set((fl.topics ?? []).map((t) => t.id));
      const removedTopics = [...scaffoldTopicIds].filter(
        (tid) => !finalTopicIds.has(tid),
      );
      const addedTopics = [...finalTopicIds].filter(
        (tid) => !scaffoldTopicIds.has(tid),
      );
      if (removedTopics.length)
        issues.push(`topics removed: ${removedTopics.join(", ")}`);
      if (addedTopics.length)
        issues.push(`topics added: ${addedTopics.join(", ")}`);

      if (issues.length > 0) {
        rows.push({
          id: lid,
          label: `  ${lid} · ${finalTitle || lessonLabel}`,
          severity: "changed",
          detail: issues.join(" · "),
        });
      }
    }
  }

  return rows;
}

const SEVERITY_COLOR: Record<DiffSeverity, string> = {
  added: "var(--accent-success)",
  removed: "var(--accent-danger)",
  changed: "var(--accent-warning)",
  ok: "var(--text-muted)",
};

const SEVERITY_LABEL: Record<DiffSeverity, string> = {
  added: "+ADD",
  removed: "−REM",
  changed: "~CHG",
  ok: "  OK",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ForgeDonePanel({
  curriculum,
  scaffoldSnapshot,
  filename,
  bytesGenerated,
  elapsedSec,
  schemaReport,
  onLoad,
}: Props) {
  const [showDiff, setShowDiff] = useState(false);
  const sizeLabel =
    bytesGenerated >= 1_000_000
      ? `${(bytesGenerated / 1_000_000).toFixed(2)} MB`
      : `${Math.round(bytesGenerated / 1000)} KB`;

  const diffRows: DiffRow[] =
    scaffoldSnapshot && curriculum
      ? diffCurricula(scaffoldSnapshot, curriculum)
      : [];

  const diffCounts = {
    added: diffRows.filter((r) => r.severity === "added").length,
    removed: diffRows.filter((r) => r.severity === "removed").length,
    changed: diffRows.filter((r) => r.severity === "changed").length,
  };
  const hasDiff = diffRows.length > 0;

  function handleExport() {
    if (!curriculum) return;
    const blob = new Blob([JSON.stringify(curriculum, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Success banner */}
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 6,
          background:
            "color-mix(in srgb, var(--accent-success) 10%, var(--bg-secondary))",
          border: "1px solid var(--accent-success)55",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 20 }}>✓</span>
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--accent-success)",
              margin: "0 0 2px",
            }}
          >
            Curriculum forged — {sizeLabel} in {elapsedSec}s
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-secondary)",
              margin: 0,
            }}
          >
            {schemaReport
              ? `${schemaReport.stats.units} units · ${schemaReport.stats.lessons} lessons · ${schemaReport.stats.topics} topics · ${schemaReport.stats.contentBlocks} blocks · ${schemaReport.stats.questions} questions`
              : "Loading curriculum viewer…"}
          </p>
        </div>
      </div>

      {/* Load Course — primary CTA */}
      <button
        onClick={onLoad}
        disabled={!curriculum}
        style={{
          width: "100%",
          padding: "11px 16px",
          background: curriculum
            ? "var(--accent-success)"
            : "var(--bg-tertiary)",
          color: curriculum ? "#fff" : "var(--text-muted)",
          border: "none",
          borderRadius: 6,
          cursor: curriculum ? "pointer" : "not-allowed",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        → Load Course
      </button>

      {/* Export + log buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleExport}
          disabled={!curriculum}
          style={{
            flex: 1,
            padding: "9px 14px",
            background: curriculum
              ? "var(--accent-primary)"
              : "var(--bg-tertiary)",
            color: curriculum ? "#fff" : "var(--text-muted)",
            border: "none",
            borderRadius: 5,
            cursor: curriculum ? "pointer" : "not-allowed",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          ↓ Export JSON
        </button>
        <button
          onClick={() => forgeLog.download()}
          style={{
            padding: "9px 14px",
            background: "none",
            border: "1px solid var(--border-color)",
            borderRadius: 5,
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-secondary)",
          }}
        >
          ↓ Forge log
        </button>
      </div>

      {/* Schema validation report */}
      {schemaReport && (
        <div
          style={{
            borderRadius: 6,
            border: `1px solid ${schemaReport.passed ? "var(--accent-success)55" : "var(--accent-danger)55"}`,
            overflow: "hidden",
          }}
        >
          {/* Header row */}
          <div
            style={{
              padding: "8px 14px",
              background: schemaReport.passed
                ? "color-mix(in srgb, var(--accent-success) 8%, var(--bg-secondary))"
                : "color-mix(in srgb, var(--accent-danger) 8%, var(--bg-secondary))",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                color: schemaReport.passed
                  ? "var(--accent-success)"
                  : "var(--accent-danger)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {schemaReport.passed ? "✓ Schema valid" : "✕ Schema issues found"}
            </span>

            {/* Stats chips */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {(
                [
                  ["units", schemaReport.stats.units],
                  ["lessons", schemaReport.stats.lessons],
                  ["topics", schemaReport.stats.topics],
                  ["blocks", schemaReport.stats.contentBlocks],
                  ["questions", schemaReport.stats.questions],
                  ["objectives", schemaReport.stats.objectives],
                  ["unit tests", schemaReport.stats.unitTests],
                  ["quizzes", schemaReport.stats.formativeQuizzes],
                ] as [string, number][]
              ).map(([label, val]) => (
                <span
                  key={label}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                  }}
                >
                  <span
                    style={{ fontWeight: 700, color: "var(--text-primary)" }}
                  >
                    {val}
                  </span>{" "}
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Issue list */}
          {schemaReport.issues.length > 0 ? (
            <div
              style={{
                maxHeight: 220,
                overflowY: "auto",
                padding: "8px 0",
                background: "var(--bg-elevated)",
              }}
            >
              {schemaReport.issues.map((issue, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "4px 14px",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: 1,
                      textTransform: "uppercase",
                      color:
                        issue.severity === "error"
                          ? "var(--accent-danger)"
                          : "var(--accent-warning)",
                    }}
                  >
                    {issue.severity === "error" ? "ERR" : "WRN"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--text-muted)",
                      }}
                    >
                      {issue.path}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--text-secondary)",
                        marginLeft: 6,
                      }}
                    >
                      {issue.message}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: "8px 14px",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              No issues found — curriculum matches schema perfectly.
            </div>
          )}
        </div>
      )}
      {/* Scaffold vs actual diff report */}
      {scaffoldSnapshot && curriculum && (
        <div
          style={{
            borderRadius: 6,
            border: "1px solid var(--border-subtle)",
            overflow: "hidden",
          }}
        >
          {/* Header — always visible, click to expand */}
          <button
            onClick={() => setShowDiff((v) => !v)}
            style={{
              width: "100%",
              padding: "8px 14px",
              background: "var(--bg-secondary)",
              border: "none",
              borderBottom: showDiff
                ? "1px solid var(--border-subtle)"
                : "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                color: hasDiff
                  ? "var(--accent-warning)"
                  : "var(--accent-success)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {hasDiff
                ? "≠ Scaffold drift detected"
                : "✓ Output matches scaffold"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {hasDiff && (
                <div style={{ display: "flex", gap: 8 }}>
                  {diffCounts.added > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--accent-success)",
                      }}
                    >
                      +{diffCounts.added}
                    </span>
                  )}
                  {diffCounts.changed > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--accent-warning)",
                      }}
                    >
                      ~{diffCounts.changed}
                    </span>
                  )}
                  {diffCounts.removed > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--accent-danger)",
                      }}
                    >
                      −{diffCounts.removed}
                    </span>
                  )}
                </div>
              )}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                }}
              >
                {showDiff ? "▲" : "▼"}
              </span>
            </div>
          </button>

          {/* Diff rows */}
          {showDiff && (
            <div
              style={{
                maxHeight: 280,
                overflowY: "auto",
                background: "var(--bg-elevated)",
                padding: "6px 0",
              }}
            >
              {!hasDiff ? (
                <div
                  style={{
                    padding: "8px 14px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  Every unit and lesson ID from the scaffold is present in the
                  final output with matching structure.
                </div>
              ) : (
                diffRows.map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "3px 14px",
                      alignItems: "baseline",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 700,
                        flexShrink: 0,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: SEVERITY_COLOR[row.severity],
                        width: 36,
                      }}
                    >
                      {SEVERITY_LABEL[row.severity]}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--text-muted)",
                        flexShrink: 0,
                        minWidth: 80,
                      }}
                    >
                      {row.label}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--text-secondary)",
                        flex: 1,
                      }}
                    >
                      {row.detail}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
