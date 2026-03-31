"use client";
import { useState } from "react";
import { Assessment, resolveLocale } from "@/types/curriculum";
import QuestionView from "./QuestionView";
import RichText from "@/components/ui/RichText";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  formative_quiz: { label: "Formative Quiz", color: "#0056b3" },
  summative_exam: { label: "Summative Exam", color: "#7c3aed" },
  unit_test: { label: "Unit Test", color: "#d97706" },
  final_exam: { label: "Final Exam", color: "#d73a49" },
  diagnostic: { label: "Diagnostic", color: "#22863a" },
  performance_task: { label: "Performance Task", color: "#0891b2" },
  exit_ticket: { label: "Exit Ticket", color: "#6b7280" },
};

export default function AssessmentView({
  assessment,
}: {
  assessment: Assessment;
}) {
  const [showAll, setShowAll] = useState(false);
  const info = TYPE_LABELS[assessment.type] || {
    label: assessment.type,
    color: "#6b7280",
  };
  const questions = assessment.questions ?? [];
  const totalPoints = questions.reduce((s, q) => s + (q.points ?? 1), 0);

  return (
    <div>
      {/* Header */}
      <div
        style={{
          padding: "20px 24px",
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border-color)",
          borderRadius: "4px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "8px",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  background: `color-mix(in srgb, ${info.color} 15%, transparent)`,
                  color: info.color,
                  border: `1px solid color-mix(in srgb, ${info.color} 40%, transparent)`,
                  padding: "3px 10px",
                  borderRadius: "2px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {info.label}
              </span>
              {assessment.weight !== undefined && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                  }}
                >
                  Weight: {assessment.weight}%
                </span>
              )}
            </div>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "8px" }}>
              {resolveLocale(assessment.title)}
            </h2>
            {assessment.description && (
              <div style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                <RichText content={assessment.description} />
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              textAlign: "right",
            }}
          >
            {questions.length > 0 && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                }}
              >
                {questions.length} question{questions.length !== 1 ? "s" : ""}
              </div>
            )}
            {totalPoints > 0 && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  color: "var(--accent-primary)",
                }}
              >
                {totalPoints} pts total
              </div>
            )}
            {assessment.passing_score !== undefined && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  color: "var(--accent-success)",
                }}
              >
                Pass: {assessment.passing_score}%
              </div>
            )}
            {assessment.duration && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                ⏱{" "}
                {assessment.duration.label ||
                  `${assessment.duration.minutes ?? assessment.duration.hours! * 60} min`}
              </div>
            )}
          </div>
        </div>

        {/* Bloom distribution */}
        {assessment.bloom_distribution &&
          Object.keys(assessment.bloom_distribution).length > 0 && (
            <div style={{ marginTop: "16px" }}>
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
                Bloom Distribution
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {Object.entries(assessment.bloom_distribution).map(
                  ([level, pct]) =>
                    pct != null && (
                      <div
                        key={level}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <span className={`bloom-badge bloom-${level}`}>
                          {level}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {pct}%
                        </span>
                      </div>
                    ),
                )}
              </div>
            </div>
          )}
      </div>

      {/* Questions */}
      {questions.length > 0 ? (
        <>
          {questions.slice(0, showAll ? undefined : 5).map((q, i) => (
            <QuestionView key={q.id} question={q} index={i} />
          ))}
          {questions.length > 5 && !showAll && (
            <button
              className="btn btn-ghost"
              onClick={() => setShowAll(true)}
              style={{
                width: "100%",
                justifyContent: "center",
                marginTop: "8px",
              }}
            >
              Show {questions.length - 5} more questions ▾
            </button>
          )}
        </>
      ) : (
        <div
          style={{
            padding: "32px",
            textAlign: "center",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: "13px",
            border: "1px dashed var(--border-color)",
            borderRadius: "4px",
          }}
        >
          No questions defined in this assessment.
        </div>
      )}
    </div>
  );
}
