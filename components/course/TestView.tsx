"use client";
import { useState, useEffect } from "react";
import { Assessment, resolveLocale, resolveText } from "@/types/curriculum";
import { computeScore } from "@/lib/scoring";
import QuestionView from "./QuestionView";

interface Props {
  assessment: Assessment;
  curriculumId: string;
  onBack: () => void;
}

type TestPhase = "taking" | "submitted";

const STORAGE_KEY = (cid: string, aid: string) => `lv_test_${cid}_${aid}`;

export default function TestView({ assessment, curriculumId, onBack }: Props) {
  const questions = assessment.questions ?? [];
  const storageKey = STORAGE_KEY(curriculumId, assessment.id);

  // ── Load / persist answers ────────────────────────────────────────────────
  const [answers, setAnswers] = useState<Record<string, string | null>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [phase, setPhase] = useState<TestPhase>("taking");
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    if (phase === "taking") {
      try {
        localStorage.setItem(storageKey, JSON.stringify(answers));
      } catch {
        // storage full — silently ignore
      }
    }
  }, [answers, phase, storageKey]);

  const setAnswer = (qId: string, val: string | null) => {
    setAnswers((prev) => ({ ...prev, [qId]: val }));
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    setPhase("submitted");
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  };

  const answeredCount = questions.filter(
    (q) => answers[q.id] != null && answers[q.id] !== "",
  ).length;
  const allAnswered = answeredCount === questions.length;

  // ── Results ───────────────────────────────────────────────────────────────
  if (phase === "submitted") {
    const { earned, total, perQuestion } = computeScore(questions, answers);
    const pct = total > 0 ? Math.round((earned / total) * 100) : 0;
    const passing = assessment.passing_score ?? 60;
    const passed = pct >= passing;

    return (
      <div>
        {/* Results header */}
        <div
          style={{
            padding: "24px",
            background: passed
              ? "color-mix(in srgb, var(--accent-success) 8%, var(--bg-secondary))"
              : "color-mix(in srgb, var(--accent-danger) 8%, var(--bg-secondary))",
            border: `1px solid ${passed ? "var(--accent-success)" : "var(--accent-danger)"}`,
            borderRadius: "6px",
            marginBottom: "24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "8px" }}>
            {passed ? "🎉" : "📖"}
          </div>
          <h2
            style={{
              fontSize: "1.6rem",
              fontWeight: 700,
              color: passed ? "var(--accent-success)" : "var(--accent-danger)",
              marginBottom: "8px",
            }}
          >
            {passed ? "Passed!" : "Keep Studying"}
          </h2>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "2rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "4px",
            }}
          >
            {pct}%
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "13px",
              color: "var(--text-secondary)",
            }}
          >
            {earned} / {total} points · passing score: {passing}%
          </div>
        </div>

        {/* Review list */}
        <h3
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--text-muted)",
            marginBottom: "16px",
          }}
        >
          Review
        </h3>

        {questions.map((q, i) => {
          const correct = perQuestion[q.id];
          const userAnswer = answers[q.id] ?? null;

          return (
            <div
              key={q.id}
              style={{
                border: `1px solid ${correct ? "var(--accent-success)" : "var(--accent-danger)"}`,
                borderRadius: "4px",
                marginBottom: "12px",
                overflow: "hidden",
              }}
            >
              {/* Row header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  background: correct
                    ? "color-mix(in srgb, var(--accent-success) 8%, var(--bg-tertiary))"
                    : "color-mix(in srgb, var(--accent-danger) 8%, var(--bg-tertiary))",
                  borderBottom: "1px solid var(--border-color)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: correct
                      ? "var(--accent-success)"
                      : "var(--accent-danger)",
                    minWidth: "24px",
                  }}
                >
                  {correct ? "✓" : "✗"}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--text-muted)",
                  }}
                >
                  Q{i + 1}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: "13px",
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {typeof q.prompt === "string"
                    ? q.prompt
                    : resolveText(q.prompt)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    flexShrink: 0,
                  }}
                >
                  {q.points ?? 1} pt{(q.points ?? 1) !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Your answer + correct answer */}
              <div style={{ padding: "10px 14px", fontSize: "13px" }}>
                <div style={{ marginBottom: "4px" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Your answer:{" "}
                  </span>
                  <span
                    style={{
                      color: correct
                        ? "var(--accent-success)"
                        : "var(--accent-danger)",
                      fontWeight: 600,
                    }}
                  >
                    {userAnswer != null && userAnswer !== ""
                      ? resolveAnswerLabel(q, userAnswer)
                      : "—not answered—"}
                  </span>
                </div>
                {!correct && (
                  <div>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      Correct answer:{" "}
                    </span>
                    <span
                      style={{
                        color: "var(--accent-success)",
                        fontWeight: 600,
                      }}
                    >
                      {resolveCorrectLabel(q)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <button className="btn btn-ghost" onClick={onBack}>
            ← Back to Assessment
          </button>
        </div>
      </div>
    );
  }

  // ── Taking phase ──────────────────────────────────────────────────────────
  const currentQ = questions[currentIdx];

  return (
    <div>
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border-color)",
          borderRadius: "4px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h2
            style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "4px" }}
          >
            ✏️ {resolveLocale(assessment.title)}
          </h2>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "var(--text-muted)",
            }}
          >
            {answeredCount} / {questions.length} answered
          </div>
        </div>
        <button
          className="btn btn-ghost"
          onClick={onBack}
          style={{ fontSize: "12px" }}
        >
          ← Exit Test
        </button>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: "4px",
          background: "var(--border-subtle)",
          borderRadius: "2px",
          marginBottom: "24px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%`,
            background: "var(--accent-primary)",
            borderRadius: "2px",
            transition: "width 300ms ease",
          }}
        />
      </div>

      {/* Jump list */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          marginBottom: "20px",
        }}
      >
        {questions.map((q, i) => {
          const answered = answers[q.id] != null && answers[q.id] !== "";
          const isCurrent = i === currentIdx;
          return (
            <button
              key={q.id}
              onClick={() => setCurrentIdx(i)}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "4px",
                border: `2px solid ${isCurrent ? "var(--accent-primary)" : answered ? "var(--accent-success)" : "var(--border-color)"}`,
                background: isCurrent
                  ? "var(--accent-primary)"
                  : answered
                    ? "color-mix(in srgb, var(--accent-success) 12%, var(--bg-secondary))"
                    : "var(--bg-secondary)",
                color: isCurrent
                  ? "#fff"
                  : answered
                    ? "var(--accent-success)"
                    : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 150ms",
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Current question */}
      {currentQ && (
        <QuestionView
          question={currentQ}
          index={currentIdx}
          externalAnswer={answers[currentQ.id] ?? null}
          onAnswerChange={(val) => setAnswer(currentQ.id, val)}
          showCheckButton={false}
        />
      )}

      {/* Navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "16px",
          gap: "12px",
        }}
      >
        <button
          className="btn btn-ghost"
          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          disabled={currentIdx === 0}
          style={{ opacity: currentIdx === 0 ? 0.4 : 1 }}
        >
          ← Prev
        </button>

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: "var(--text-muted)",
          }}
        >
          {currentIdx + 1} / {questions.length}
        </span>

        {currentIdx < questions.length - 1 ? (
          <button
            className="btn btn-ghost"
            onClick={() =>
              setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))
            }
          >
            Next →
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            style={{
              opacity: allAnswered ? 1 : 0.7,
            }}
            title={
              !allAnswered
                ? `${questions.length - answeredCount} question(s) unanswered`
                : ""
            }
          >
            Submit Test
          </button>
        )}
      </div>

      {!allAnswered && currentIdx === questions.length - 1 && (
        <p
          style={{
            textAlign: "right",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--accent-warning)",
            marginTop: "8px",
          }}
        >
          {questions.length - answeredCount} question
          {questions.length - answeredCount !== 1 ? "s" : ""} unanswered — you
          can still submit.
        </p>
      )}
    </div>
  );
}

// ─── Helpers to show human-readable answer labels in review ──────────────────

function resolveAnswerLabel(
  q: { options?: unknown[]; type: string },
  answer: string,
): string {
  if (q.type === "multiple_choice" && Array.isArray(q.options)) {
    const raw = q.options as Record<string, unknown>[];
    const opt = raw.find((o) => String(o.id) === answer);
    if (opt) return String(opt.text ?? opt.content ?? opt.label ?? answer);
  }
  return answer;
}

function resolveCorrectLabel(q: {
  options?: unknown[];
  type: string;
  correct_answer?: unknown;
}): string {
  if (q.type === "multiple_choice" && Array.isArray(q.options)) {
    const raw = q.options as Record<string, unknown>[];
    const correct = raw.filter((o) => o.is_correct === true);
    if (correct.length > 0) {
      return correct
        .map((o) => String(o.text ?? o.content ?? o.label ?? o.id ?? ""))
        .join(", ");
    }
  }
  if (q.correct_answer != null) return String(q.correct_answer);
  return "—";
}
