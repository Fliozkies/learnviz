import { Question } from "@/types/curriculum";

type RawQ = Record<string, unknown>;

/** numeric_tolerance: schema says number, generator may use {absolute: n} */
export function resolveTolerance(q: RawQ): number | undefined {
  const t = q.numeric_tolerance;
  if (t == null) return undefined;
  if (typeof t === "number") return t;
  if (typeof t === "object") {
    const obj = t as Record<string, unknown>;
    return Number(obj.absolute ?? obj.relative ?? Object.values(obj)[0] ?? 0);
  }
  return undefined;
}

/**
 * Pure function: given a question and a user's answer string, returns true if correct.
 * Handles multiple_choice, true_false, short_answer, numeric, fill_in_the_blank.
 * For unsupported/essay types, always returns false (can't auto-grade).
 */
export function checkAnswer(question: Question, answer: string | null): boolean {
  if (answer == null || answer === "") return false;

  const raw = question as unknown as RawQ;
  const type = question.type;

  // Multiple choice: match by option id, check is_correct
  if (type === "multiple_choice") {
    const rawOptions = Array.isArray(raw.options)
      ? (raw.options as Record<string, unknown>[])
      : [];
    const opt = rawOptions.find((o) => String(o.id) === answer);
    return opt?.is_correct === true;
  }

  // True/false: case-insensitive comparison
  if (type === "true_false") {
    const correct = String(question.correct_answer ?? "").toLowerCase();
    return answer.toLowerCase() === correct;
  }

  // Numeric: compare with tolerance
  if (type === "numeric") {
    const userNum = parseFloat(answer);
    const correctNum = parseFloat(String(question.correct_answer ?? ""));
    if (isNaN(userNum) || isNaN(correctNum)) return false;
    const tol = resolveTolerance(raw) ?? 0;
    return Math.abs(userNum - correctNum) <= tol;
  }

  // Short answer / fill in the blank: case-insensitive trim comparison
  if (type === "short_answer" || type === "fill_in_the_blank") {
    const correct = String(question.correct_answer ?? "").trim().toLowerCase();
    // Also support array of acceptable answers
    if (Array.isArray(question.correct_answer)) {
      return (question.correct_answer as string[]).some(
        (a) => a.trim().toLowerCase() === answer.trim().toLowerCase()
      );
    }
    return answer.trim().toLowerCase() === correct;
  }

  return false;
}

/** Compute a total score from a map of questionId → answer string */
export function computeScore(
  questions: Question[],
  answers: Record<string, string | null>
): { earned: number; total: number; perQuestion: Record<string, boolean> } {
  let earned = 0;
  let total = 0;
  const perQuestion: Record<string, boolean> = {};

  for (const q of questions) {
    const pts = q.points ?? 1;
    total += pts;
    const correct = checkAnswer(q, answers[q.id] ?? null);
    perQuestion[q.id] = correct;
    if (correct) earned += pts;
  }

  return { earned, total, perQuestion };
}
