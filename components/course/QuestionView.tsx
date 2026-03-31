"use client";
import { useState, useRef, useEffect } from "react";
import { Question } from "@/types/curriculum";
import RichText from "@/components/ui/RichText";

// ─── Schema normalizers ───────────────────────────────────────────────────────

type RawQ = Record<string, unknown>;

function optionText(opt: Record<string, unknown>): string {
  return String(opt.text ?? opt.content ?? opt.label ?? "");
}

function hintText(h: Record<string, unknown>): string {
  return String(h.text ?? h.content ?? "");
}

function hintPenalty(h: Record<string, unknown>): number {
  return Number(h.penalty ?? h.penalty_weight ?? 0);
}

function resolveTolerance(q: RawQ): number | undefined {
  const t = q.numeric_tolerance;
  if (t == null) return undefined;
  if (typeof t === "number") return t;
  if (typeof t === "object") {
    const obj = t as Record<string, unknown>;
    return Number(obj.absolute ?? obj.relative ?? Object.values(obj)[0] ?? 0);
  }
  return undefined;
}

function resolveSteps(solution: Record<string, unknown>): Array<{
  step?: number;
  action: string;
  result?: string;
  annotation?: string;
}> {
  const steps = solution.steps;
  if (!Array.isArray(steps)) return [];
  return steps.map((s, i) => {
    if (typeof s === "string") return { step: i + 1, action: s };
    const obj = s as Record<string, unknown>;
    return {
      step: Number(obj.step ?? i + 1),
      action: String(obj.action ?? obj.text ?? obj.content ?? ""),
      result: obj.result != null ? String(obj.result) : undefined,
      annotation: obj.annotation != null ? String(obj.annotation) : undefined,
    };
  });
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface QuestionViewProps {
  question: Question;
  index: number;
  showSolution?: boolean;
  /** Controlled answer value — when set, this component acts as controlled */
  externalAnswer?: string | null;
  /** Called whenever the user selects a new answer (test mode) */
  onAnswerChange?: (answer: string | null) => void;
  /** When false, the "Check Answer" button is hidden (test mode suppresses it) */
  showCheckButton?: boolean;
}

// ─── Fill-in-the-blank inline gap renderer ───────────────────────────────────
// The blank marker can appear:
//   (a) as plain text: "The answer is ___."
//   (b) inside a $...$ block: "$f'(x) = \frac{1}{3}x^{___}$"
//
// Strategy:
//   - Find the BLANK_RE match.
//   - If it's inside a $...$ block, replace the blank token with \square in
//     the full LaTeX and render the whole expression intact (splitting at the
//     blank position creates unbalanced braces, e.g. x^{ | input | }, which
//     KaTeX cannot render). The input field is placed below the expression.
//   - If the blank is in plain text, split at the blank and render the input
//     inline between the two text segments.

const BLANK_RE = /\\text\{_{2,}\}|_{3,}/;

// Replace the blank token in LaTeX with a visible \square placeholder so the
// whole expression renders as a single valid KaTeX string.
function replaceBlankWithSquare(latex: string): string {
  return latex.replace(BLANK_RE, "\\square");
}

function FillInBlankInput({
  prompt,
  value,
  onChange,
  disabled,
}: {
  prompt: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const inputEl = (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="?"
      style={{
        display: "inline-block",
        width: "80px",
        padding: "2px 6px",
        border: "2px solid var(--accent-primary)",
        borderRadius: "4px",
        background: disabled ? "var(--bg-tertiary)" : "var(--bg-secondary)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-mono)",
        fontSize: "14px",
        textAlign: "center",
        outline: "none",
        verticalAlign: "middle",
        margin: "0 4px",
      }}
    />
  );

  // Find the blank position in the prompt
  const blankMatch = BLANK_RE.exec(prompt);
  if (!blankMatch) {
    // No blank marker — show full prompt then an input below
    return (
      <div>
        <RichText content={prompt} />
        <div style={{ marginTop: "8px" }}>{inputEl}</div>
      </div>
    );
  }

  const blankStart = blankMatch.index;
  const blankEnd = blankStart + blankMatch[0].length;

  // Check if the blank is inside a $...$ group.
  // Use a balanced-brace-aware approach: scan for $ pairs in the prompt.
  const dollarRe = /\$([^$]+)\$/g;
  let enclosingMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = dollarRe.exec(prompt)) !== null) {
    if (m.index <= blankStart && m.index + m[0].length >= blankEnd) {
      enclosingMatch = m;
      break;
    }
  }

  if (enclosingMatch) {
    // The blank is INSIDE a LaTeX expression.
    // Splitting the LaTeX at the blank position produces unbalanced braces
    // (e.g. "x^{" before and "}" after), which KaTeX cannot render.
    // Instead: replace the blank with \square in the full expression so the
    // whole thing renders as one valid KaTeX string, and put the input field
    // below the math with a clear label.
    const dollarStart = enclosingMatch.index;
    const dollarEnd = dollarStart + enclosingMatch[0].length;
    const originalLatex = enclosingMatch[1];
    const displayLatex = replaceBlankWithSquare(originalLatex);

    const beforePrompt = prompt.slice(0, dollarStart);
    const afterPrompt = prompt.slice(dollarEnd);

    return (
      <div style={{ fontSize: "15px" }}>
        <div style={{ lineHeight: "2.4" }}>
          {beforePrompt && <RichText content={beforePrompt} inline />}
          <KatexInlineFragment latex={displayLatex} />
          {afterPrompt && <RichText content={afterPrompt} inline />}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginTop: "10px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              color: "var(--text-muted)",
            }}
          >
            Fill in{" "}
          </span>
          <KatexInlineFragment latex={"\\ \\square\\ ="} />
          {inputEl}
        </div>
      </div>
    );
  }

  // Plain-text blank — split and render the input inline between segments.
  const before = prompt.slice(0, blankStart);
  const after = prompt.slice(blankEnd);
  return (
    <div style={{ lineHeight: "2.4", fontSize: "15px" }}>
      {before && <RichText content={before} inline />}
      {inputEl}
      {after && <RichText content={after} inline />}
    </div>
  );
}

// Renders a raw LaTeX fragment (no surrounding $) inline using KaTeX.
// Retries after a short delay to handle cases where KaTeX CDN script is still
// loading when the component first mounts.
function KatexInlineFragment({ latex }: { latex: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (cancelled || !ref.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const katex = (window as any).katex;
      if (!katex) return;
      try {
        katex.render(latex, ref.current, {
          displayMode: false,
          throwOnError: false,
          output: "html",
        });
      } catch {
        if (ref.current) ref.current.textContent = latex;
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).katex) {
      render();
    } else {
      // KaTeX not yet available — wait for script load event
      const script = document.querySelector(
        'script[src*="katex"]',
      ) as HTMLScriptElement | null;
      const onLoad = () => render();
      script?.addEventListener("load", onLoad);
      // Also retry after a timeout as a safety net
      const timer = setTimeout(render, 500);
      return () => {
        cancelled = true;
        script?.removeEventListener("load", onLoad);
        clearTimeout(timer);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [latex]);
  return <span ref={ref} style={{ verticalAlign: "middle" }} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuestionView({
  question,
  index,
  showSolution = false,
  externalAnswer,
  onAnswerChange,
  showCheckButton = true,
}: QuestionViewProps) {
  const isControlled = externalAnswer !== undefined;

  const [revealed, setRevealed] = useState<number[]>([]);
  const [solShown, setSolShown] = useState(showSolution);
  // Internal state used only when NOT controlled
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [checked, setChecked] = useState(false);

  const selected = isControlled ? (externalAnswer ?? null) : internalSelected;

  const setSelected = (val: string | null) => {
    if (isControlled) {
      onAnswerChange?.(val);
    } else {
      setInternalSelected(val);
    }
  };

  const raw = question as unknown as RawQ;
  const rawOptions = Array.isArray(raw.options)
    ? (raw.options as Record<string, unknown>[])
    : [];
  const rawHints = Array.isArray(raw.hints)
    ? (raw.hints as Record<string, unknown>[])
    : [];
  const rawSolution =
    raw.solution && typeof raw.solution === "object"
      ? (raw.solution as Record<string, unknown>)
      : null;
  const tolerance = resolveTolerance(raw);
  const steps = rawSolution ? resolveSteps(rawSolution) : [];
  const finalAnswer = rawSolution
    ? (rawSolution.final_answer ?? rawSolution.finalAnswer ?? null)
    : null;
  const solutionExplanation = rawSolution
    ? (rawSolution.explanation ?? null)
    : null;

  const revealHint = (idx: number) => {
    if (!revealed.includes(idx)) setRevealed((prev) => [...prev, idx]);
  };

  const checkAnswer = () => setChecked(true);

  // Determine correctness for all question types
  const correctAnswerStr = String(question.correct_answer ?? "").trim();

  const isCorrect = (() => {
    if (question.type === "multiple_choice" || question.type === "true_false") {
      if (selected == null) return false;
      if (question.type === "true_false") {
        return selected.toLowerCase() === correctAnswerStr.toLowerCase();
      }
      return (
        rawOptions.find((o) => String(o.id) === selected)?.is_correct === true
      );
    }
    if (question.type === "numeric") {
      const userNum = parseFloat(textInput.replace(/[^0-9.\-]/g, ""));
      const correctNum = parseFloat(correctAnswerStr.replace(/[^0-9.\-]/g, ""));
      if (isNaN(userNum) || isNaN(correctNum)) return false;
      const tol = tolerance ?? 0.01;
      return Math.abs(userNum - correctNum) <= tol;
    }
    if (
      question.type === "fill_in_the_blank" ||
      question.type === "short_answer"
    ) {
      // Strip LaTeX delimiters and whitespace for comparison
      const normalize = (s: string) =>
        s
          .replace(/^\$|\$$/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      return normalize(textInput) === normalize(correctAnswerStr);
    }
    return false;
  })();

  // In controlled (test) mode, never show inline correctness feedback
  const showResult = checked && !isControlled;

  return (
    <div
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: "4px",
        overflow: "hidden",
        marginBottom: "16px",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "var(--bg-tertiary)",
          padding: "10px 16px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: "700",
              color: "var(--text-muted)",
            }}
          >
            Q{index + 1}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              padding: "2px 8px",
              borderRadius: "2px",
              background: "var(--border-subtle)",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {question.type?.replace(/_/g, " ")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {question.bloom_level && (
            <span className={`bloom-badge bloom-${question.bloom_level}`}>
              {question.bloom_level}
            </span>
          )}
          {question.difficulty && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: `var(--accent-${question.difficulty === "advanced" || question.difficulty === "challenge" ? "danger" : "primary"})`,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {question.difficulty}
            </span>
          )}
          {question.points && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--text-muted)",
              }}
            >
              {question.points} pt{question.points !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "16px 20px" }}>
        {/* Prompt — skipped for fill_in_the_blank since FillInBlankInput renders it inline */}
        {question.type !== "fill_in_the_blank" && (
          <div style={{ marginBottom: "16px" }}>
            <RichText content={question.prompt} />
          </div>
        )}

        {/* Multiple choice options */}
        {rawOptions.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            {rawOptions.map((opt) => {
              const optId = String(opt.id ?? "");
              const isSelected = selected === optId;
              const isRight = opt.is_correct === true;
              const text = optionText(opt);
              const distractorReason = opt.distractor_reason
                ? String(opt.distractor_reason)
                : null;

              let bg = "var(--bg-secondary)";
              let border = "1px solid var(--border-color)";
              if (isSelected && !showResult) {
                bg =
                  "color-mix(in srgb, var(--accent-primary) 8%, var(--bg-secondary))";
                border = "1px solid var(--accent-primary)";
              }
              if (showResult && isSelected && isRight) {
                bg =
                  "color-mix(in srgb, var(--accent-success) 12%, var(--bg-secondary))";
                border = "1px solid var(--accent-success)";
              }
              if (showResult && isSelected && !isRight) {
                bg =
                  "color-mix(in srgb, var(--accent-danger) 10%, var(--bg-secondary))";
                border = "1px solid var(--accent-danger)";
              }

              return (
                <button
                  key={optId}
                  onClick={() => {
                    if (!showResult) setSelected(optId);
                  }}
                  disabled={showResult}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "12px 14px",
                    background: bg,
                    border,
                    borderRadius: "4px",
                    cursor: showResult ? "default" : "pointer",
                    textAlign: "left",
                    transition: "all 150ms",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      border: `2px solid ${isSelected ? "var(--accent-primary)" : "var(--border-color)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      background: isSelected
                        ? "var(--accent-primary)"
                        : "transparent",
                      marginTop: "1px",
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: "white",
                        }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <RichText content={text} inline />
                    {showResult &&
                      isSelected &&
                      !isRight &&
                      distractorReason && (
                        <p
                          style={{
                            marginTop: "6px",
                            fontSize: "12px",
                            color: "var(--accent-danger)",
                            fontStyle: "italic",
                          }}
                        >
                          ✗ {distractorReason}
                        </p>
                      )}
                    {showResult && isRight && (
                      <p
                        style={{
                          marginTop: "4px",
                          fontSize: "12px",
                          color: "var(--accent-success)",
                        }}
                      >
                        ✓ Correct
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
            {!showResult &&
              showCheckButton &&
              question.type === "multiple_choice" && (
                <button
                  className="btn btn-primary"
                  onClick={checkAnswer}
                  disabled={!selected}
                  style={{
                    alignSelf: "flex-start",
                    marginTop: "4px",
                    opacity: selected ? 1 : 0.5,
                  }}
                >
                  Check Answer
                </button>
              )}
            {showResult && (
              <div
                style={{
                  padding: "10px 14px",
                  background: isCorrect
                    ? "color-mix(in srgb, var(--accent-success) 10%, var(--bg-secondary))"
                    : "color-mix(in srgb, var(--accent-danger) 10%, var(--bg-secondary))",
                  border: `1px solid ${isCorrect ? "var(--accent-success)" : "var(--accent-danger)"}`,
                  borderRadius: "4px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  color: isCorrect
                    ? "var(--accent-success)"
                    : "var(--accent-danger)",
                }}
              >
                {isCorrect
                  ? "✓ Correct!"
                  : "✗ Not quite. Review the hints and solution below."}
              </div>
            )}
          </div>
        )}

        {/* True/False */}
        {question.type === "true_false" && (
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            {["True", "False"].map((val) => {
              const isSelected = selected === val;
              const correctVal = String(question.correct_answer);
              const isRight = val.toLowerCase() === correctVal?.toLowerCase();
              return (
                <button
                  key={val}
                  onClick={() => {
                    if (!showResult) setSelected(val);
                  }}
                  style={{
                    padding: "10px 24px",
                    border: `2px solid ${isSelected ? "var(--accent-primary)" : "var(--border-color)"}`,
                    borderRadius: "4px",
                    background:
                      showResult && isSelected && isRight
                        ? "color-mix(in srgb, var(--accent-success) 15%, var(--bg-secondary))"
                        : showResult && isSelected && !isRight
                          ? "color-mix(in srgb, var(--accent-danger) 10%, var(--bg-secondary))"
                          : isSelected
                            ? "color-mix(in srgb, var(--accent-primary) 10%, var(--bg-secondary))"
                            : "var(--bg-secondary)",
                    cursor: showResult ? "default" : "pointer",
                    fontFamily: "var(--font-serif)",
                    fontWeight: "700",
                    fontSize: "15px",
                    color: "var(--text-primary)",
                  }}
                >
                  {val}
                </button>
              );
            })}
            {!showResult && showCheckButton && (
              <button
                className="btn btn-primary"
                onClick={checkAnswer}
                disabled={!selected}
                style={{ opacity: selected ? 1 : 0.5 }}
              >
                Check
              </button>
            )}
          </div>
        )}

        {/* Fill-in-the-blank — inline gap input */}
        {question.type === "fill_in_the_blank" && (
          <div style={{ marginBottom: "16px" }}>
            <FillInBlankInput
              prompt={String(question.prompt ?? "")}
              value={textInput}
              onChange={setTextInput}
              disabled={showResult}
            />
            {!showResult && showCheckButton && (
              <button
                className="btn btn-primary"
                onClick={checkAnswer}
                disabled={!textInput.trim()}
                style={{
                  marginTop: "10px",
                  opacity: textInput.trim() ? 1 : 0.5,
                }}
              >
                Check Answer
              </button>
            )}
            {showResult && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "10px 14px",
                  background: isCorrect
                    ? "color-mix(in srgb, var(--accent-success) 10%, var(--bg-secondary))"
                    : "color-mix(in srgb, var(--accent-danger) 10%, var(--bg-secondary))",
                  border: `1px solid ${isCorrect ? "var(--accent-success)" : "var(--accent-danger)"}`,
                  borderRadius: "4px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  color: isCorrect
                    ? "var(--accent-success)"
                    : "var(--accent-danger)",
                }}
              >
                {isCorrect ? (
                  "✓ Correct!"
                ) : (
                  <span>
                    ✗ Not quite. Answer:{" "}
                    <RichText content={correctAnswerStr} inline />
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Short answer / numeric — text/number input */}
        {(question.type === "short_answer" || question.type === "numeric") && (
          <div style={{ marginBottom: "16px" }}>
            <input
              type={question.type === "numeric" ? "number" : "text"}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && textInput.trim() && !showResult)
                  checkAnswer();
              }}
              disabled={showResult}
              placeholder={
                question.type === "numeric"
                  ? "Enter a number…"
                  : "Type your answer…"
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                border: showResult
                  ? `2px solid ${isCorrect ? "var(--accent-success)" : "var(--accent-danger)"}`
                  : "2px solid var(--border-color)",
                borderRadius: "4px",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: "14px",
                outline: "none",
                transition: "border-color 150ms",
              }}
            />
            {tolerance !== undefined && !showResult && (
              <p
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: "4px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Tolerance: ±{tolerance}
              </p>
            )}
            {!showResult && showCheckButton && (
              <button
                className="btn btn-primary"
                onClick={checkAnswer}
                disabled={!textInput.trim()}
                style={{
                  marginTop: "10px",
                  opacity: textInput.trim() ? 1 : 0.5,
                }}
              >
                Check Answer
              </button>
            )}
            {showResult && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "10px 14px",
                  background: isCorrect
                    ? "color-mix(in srgb, var(--accent-success) 10%, var(--bg-secondary))"
                    : "color-mix(in srgb, var(--accent-danger) 10%, var(--bg-secondary))",
                  border: `1px solid ${isCorrect ? "var(--accent-success)" : "var(--accent-danger)"}`,
                  borderRadius: "4px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  color: isCorrect
                    ? "var(--accent-success)"
                    : "var(--accent-danger)",
                }}
              >
                {isCorrect ? (
                  "✓ Correct!"
                ) : (
                  <span>
                    ✗ Not quite. Expected:{" "}
                    <RichText content={correctAnswerStr} inline />
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Hints — hidden in controlled/test mode */}
        {!isControlled && rawHints.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
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
              Hints
            </p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {rawHints.map((hint, i) => {
                const text = hintText(hint);
                const penalty = hintPenalty(hint);
                const isRevealed = revealed.includes(i);
                return (
                  <div key={i}>
                    {isRevealed ? (
                      <div
                        style={{
                          padding: "10px 14px",
                          background:
                            "color-mix(in srgb, var(--accent-warning) 8%, var(--bg-secondary))",
                          border:
                            "1px solid color-mix(in srgb, var(--accent-warning) 30%, transparent)",
                          borderRadius: "4px",
                          fontSize: "14px",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            color: "var(--accent-warning)",
                            marginRight: "8px",
                          }}
                        >
                          HINT {i + 1}
                        </span>
                        {penalty > 0 && (
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "10px",
                              color: "var(--accent-danger)",
                            }}
                          >
                            −{Math.round(penalty * 100)}%
                          </span>
                        )}
                        <div style={{ marginTop: "6px" }}>
                          <RichText content={text} inline />
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn btn-ghost"
                        onClick={() => revealHint(i)}
                        style={{ fontSize: "12px" }}
                      >
                        💡 Reveal Hint {i + 1}
                        {penalty > 0 && (
                          <span
                            style={{
                              color: "var(--accent-danger)",
                              fontSize: "11px",
                              marginLeft: "4px",
                            }}
                          >
                            (−{Math.round(penalty * 100)}%)
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Solution — hidden in controlled/test mode */}
        {!isControlled && rawSolution && (
          <div>
            {!solShown ? (
              <button
                className="btn btn-ghost"
                onClick={() => setSolShown(true)}
                style={{ fontSize: "12px", color: "var(--accent-primary)" }}
              >
                🔑 Show Full Solution
              </button>
            ) : (
              <div
                style={{
                  marginTop: "8px",
                  padding: "16px",
                  border:
                    "1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)",
                  borderRadius: "4px",
                  background:
                    "color-mix(in srgb, var(--accent-primary) 4%, var(--bg-secondary))",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--accent-primary)",
                    marginBottom: "12px",
                  }}
                >
                  Solution
                </p>
                {steps.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: "12px",
                      marginBottom: "10px",
                      paddingBottom: "10px",
                      borderBottom:
                        i < steps.length - 1
                          ? "1px dashed var(--border-subtle)"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        background: "var(--accent-primary)",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        fontWeight: "700",
                        flexShrink: 0,
                      }}
                    >
                      {step.step ?? i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <RichText content={step.action} />
                      {step.result && (
                        <div
                          style={{
                            marginTop: "4px",
                            padding: "4px 10px",
                            background: "var(--bg-tertiary)",
                            borderLeft: "3px solid var(--accent-math)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "13px",
                          }}
                        >
                          <RichText content={step.result} inline />
                        </div>
                      )}
                      {step.annotation && (
                        <p
                          style={{
                            marginTop: "4px",
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            fontStyle: "italic",
                          }}
                        >
                          <RichText content={step.annotation} inline />
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {finalAnswer != null && (
                  <div
                    style={{
                      padding: "10px 14px",
                      background:
                        "color-mix(in srgb, var(--accent-success) 10%, var(--bg-secondary))",
                      border: "1px solid var(--accent-success)",
                      borderRadius: "4px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "13px",
                      marginTop: "8px",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--accent-success)",
                        fontWeight: "700",
                      }}
                    >
                      Final Answer:{" "}
                    </span>
                    <RichText content={String(finalAnswer)} inline />
                  </div>
                )}
                {solutionExplanation != null && (
                  <div
                    style={{
                      marginTop: "12px",
                      fontSize: "14px",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <RichText content={String(solutionExplanation)} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
