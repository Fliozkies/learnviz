// ─── CurriculumForge — schema validator ──────────────────────────────────────
import { Curriculum } from "@/types/curriculum";

export interface SchemaIssue {
  path: string;
  severity: "error" | "warning";
  message: string;
}

export interface SchemaStats {
  units: number;
  lessons: number;
  topics: number;
  contentBlocks: number;
  questions: number;
  objectives: number;
  unitTests: number;
  formativeQuizzes: number;
}

export interface SchemaReport {
  issues: SchemaIssue[];
  stats: SchemaStats;
  passed: boolean;
}

export function validateCurriculum(c: Curriculum): SchemaReport {
  const issues: SchemaIssue[] = [];
  const stats: SchemaStats = {
    units: 0, lessons: 0, topics: 0,
    contentBlocks: 0, questions: 0, objectives: 0,
    unitTests: 0, formativeQuizzes: 0,
  };

  const err  = (path: string, msg: string) =>
    issues.push({ path, severity: "error",   message: msg });
  const warn = (path: string, msg: string) =>
    issues.push({ path, severity: "warning", message: msg });

  // ── Root / course ──────────────────────────────────────────────────────────
  if (!c.schema_version) err("root.schema_version", "Missing schema_version");
  if (!c.course) {
    err("root.course", "Missing course metadata");
  } else {
    if (!c.course.id)      err("course.id",      "Missing course id");
    if (!c.course.title)   err("course.title",   "Missing course title");
    if (!c.course.subject) warn("course.subject", "Missing subject");
    if (!c.course.level)   warn("course.level",   "Missing level");
  }
  if (!Array.isArray(c.units) || c.units.length === 0) {
    err("root.units", "No units found");
    return { issues, stats, passed: false };
  }

  // ── Units ──────────────────────────────────────────────────────────────────
  stats.units = c.units.length;
  const unitIds   = new Set<string>();
  const lessonIds = new Set<string>();
  const topicIds  = new Set<string>();

  for (const unit of c.units) {
    const up = `units[${unit.id}]`;

    if (!unit.id) {
      err(up, "Unit missing id");
    } else if (unitIds.has(unit.id)) {
      err(up, `Duplicate unit id: ${unit.id}`);
    } else {
      unitIds.add(unit.id);
    }

    if (!unit.title) err(`${up}.title`, "Unit missing title");

    // Unit test
    if (!Array.isArray(unit.assessments) || unit.assessments.length === 0) {
      warn(`${up}.assessments`, "No unit test generated for this unit");
    } else {
      const test = unit.assessments.find((a) => a.type === "unit_test");
      if (!test) {
        warn(`${up}.assessments`, "No unit_test type assessment found");
      } else {
        stats.unitTests++;
        const qCount = test.questions?.length ?? 0;
        if (qCount === 0) {
          err(`${up}.assessments[unit_test].questions`, "Unit test has no questions");
        } else {
          stats.questions += qCount;
        }
      }
    }

    if (!Array.isArray(unit.lessons) || unit.lessons.length === 0) {
      err(`${up}.lessons`, "Unit has no lessons");
      continue;
    }
    if (unit.lessons.length < 2) {
      warn(`${up}.lessons`, `Unit has only ${unit.lessons.length} lesson(s)`);
    }
    stats.lessons += unit.lessons.length;

    // ── Lessons ──────────────────────────────────────────────────────────────
    for (const lesson of unit.lessons) {
      const lp = `${up}.lessons[${lesson.id}]`;

      if (!lesson.id) {
        err(lp, "Lesson missing id");
      } else if (lessonIds.has(lesson.id)) {
        err(lp, `Duplicate lesson id: ${lesson.id}`);
      } else {
        lessonIds.add(lesson.id);
      }

      if (!lesson.title) err(`${lp}.title`, "Lesson missing title");
      if (Array.isArray(lesson.objectives)) stats.objectives += lesson.objectives.length;

      // Formative quiz
      if (!Array.isArray(lesson.assessments) || lesson.assessments.length === 0) {
        warn(`${lp}.assessments`, "No formative quiz generated for this lesson");
      } else {
        const quiz = lesson.assessments.find((a) => a.type === "formative_quiz");
        if (!quiz) {
          warn(`${lp}.assessments`, "No formative_quiz type found");
        } else {
          stats.formativeQuizzes++;
          const qCount = quiz.questions?.length ?? 0;
          if (qCount === 0) {
            err(`${lp}.assessments[formative_quiz].questions`, "Formative quiz has no questions");
          } else {
            stats.questions += qCount;
          }
        }
      }

      if (!Array.isArray(lesson.topics) || lesson.topics.length === 0) {
        err(`${lp}.topics`, "Lesson has no topics");
        continue;
      }
      stats.topics += lesson.topics.length;

      // ── Topics ────────────────────────────────────────────────────────────
      for (const topic of lesson.topics) {
        const tp = `${lp}.topics[${topic.id}]`;

        if (!topic.id) {
          err(tp, "Topic missing id");
        } else if (topicIds.has(topic.id)) {
          err(tp, `Duplicate topic id: ${topic.id}`);
        } else {
          topicIds.add(topic.id);
        }

        if (!topic.title) err(`${tp}.title`, "Topic missing title");

        // Content blocks — zero blocks means the lesson was truncated; treat as error
        if (!Array.isArray(topic.content_blocks) || topic.content_blocks.length === 0) {
          err(`${tp}.content_blocks`, "Topic has no content blocks");
        } else {
          stats.contentBlocks += topic.content_blocks.length;
          for (const cb of topic.content_blocks) {
            if (!cb.id)   err(`${tp}.content_blocks[?]`,             "Content block missing id");
            if (!cb.type) err(`${tp}.content_blocks[${cb.id}].type`, "Content block missing type");
            // media_embed and chart blocks carry content in media/datasets — body is not required
            const bodyOptional = cb.type === "media_embed" || cb.type === "chart";
            if ((!cb.body || String(cb.body).trim() === "") && !bodyOptional) {
              err(`${tp}.content_blocks[${cb.id}].body`, "Content block has empty or missing body");
            }
          }
        }

        // Practice questions — hardened checks
        if (Array.isArray(topic.practice_questions)) {
          stats.questions += topic.practice_questions.length;
          for (const q of topic.practice_questions) {
            if (!q.id)     err(`${tp}.questions[?]`,              "Practice question missing id");
            if (!q.type)   err(`${tp}.questions[${q.id}].type`,   "Question missing type");
            if (!q.prompt) warn(`${tp}.questions[${q.id}].prompt`, "Question missing prompt");

            // correct_answer required on all question types
            if (q.correct_answer === undefined || q.correct_answer === null || q.correct_answer === "") {
              err(`${tp}.questions[${q.id}].correct_answer`, "Question missing correct_answer");
            }
            // solution.steps required
            if (!q.solution || !Array.isArray(q.solution.steps) || q.solution.steps.length === 0) {
              warn(`${tp}.questions[${q.id}].solution`, "Question missing solution.steps");
            }
            // hints required (at least 1)
            if (!Array.isArray(q.hints) || q.hints.length === 0) {
              warn(`${tp}.questions[${q.id}].hints`, "Question missing hints array");
            }

            // multiple_choice: options + exactly one is_correct=true
            if (q.type === "multiple_choice") {
              if (!q.options || q.options.length === 0) {
                err(`${tp}.questions[${q.id}]`, "Multiple-choice question has no options");
              } else {
                const correctCount = q.options.filter((o: { is_correct?: boolean }) => o.is_correct === true).length;
                if (correctCount === 0) {
                  err(`${tp}.questions[${q.id}].options`, "Multiple-choice has no option with is_correct=true");
                } else if (correctCount > 1) {
                  warn(`${tp}.questions[${q.id}].options`, `Multiple-choice has ${correctCount} options with is_correct=true (expected 1)`);
                }
              }
            }

            // fill_in_the_blank: prompt must contain "___"
            if (q.type === "fill_in_the_blank") {
              const promptStr: string = typeof q.prompt === "string"
                ? q.prompt
                : (q.prompt as { content: string } | undefined)?.content ?? "";
              if (!promptStr.includes("___")) {
                warn(`${tp}.questions[${q.id}].prompt`, "fill_in_the_blank prompt should contain ___ placeholder");
              }
            }

            // true_false: correct_answer must be boolean-like string
            if (q.type === "true_false") {
              const ca = String(q.correct_answer ?? "").toLowerCase().trim();
              if (ca !== "true" && ca !== "false") {
                err(`${tp}.questions[${q.id}].correct_answer`, `true_false correct_answer must be "true" or "false", got "${q.correct_answer}"`);
              }
            }

            // numeric: correct_answer must be a number or numeric string
            if (q.type === "numeric") {
              const ca = q.correct_answer;
              if (ca !== undefined && ca !== null && isNaN(Number(ca))) {
                warn(`${tp}.questions[${q.id}].correct_answer`, `numeric correct_answer "${ca}" is not a valid number`);
              }
            }
          }
        }

        if (Array.isArray(topic.objectives)) stats.objectives += topic.objectives.length;
      }
    }
  }

  return {
    issues,
    stats,
    passed: !issues.some((i) => i.severity === "error"),
  };
}

// ─── Scaffold validator ───────────────────────────────────────────────────────
// Runs immediately after scaffold JSON parses, before the wave phase starts.
// Checks structural integrity only — content validation happens at the end.
// Returns a list of error strings; empty array = pass.
export function validateScaffold(c: Curriculum): string[] {
  const errors: string[] = [];

  if (!c.course?.title) errors.push("Missing course title");
  if (!Array.isArray(c.units) || c.units.length === 0) {
    errors.push("No units in scaffold");
    return errors; // can't iterate further
  }

  for (const unit of c.units) {
    const up = unit.id ?? "(no id)";
    if (!unit.id)    errors.push(`Unit missing id`);
    if (!unit.title) errors.push(`Unit ${up}: missing title`);

    if (!Array.isArray(unit.lessons) || unit.lessons.length === 0) {
      errors.push(`Unit ${up}: no lessons`);
      continue;
    }

    for (const lesson of unit.lessons) {
      const lp = `${up}/${lesson.id ?? "(no id)"}`;
      if (!lesson.id)    errors.push(`Lesson ${lp}: missing id`);
      if (!lesson.title) errors.push(`Lesson ${lp}: missing title`);

      if (!Array.isArray(lesson.topics) || lesson.topics.length === 0) {
        errors.push(`Lesson ${lp}: missing topics array`);
        continue;
      }

      for (const topic of lesson.topics) {
        const tp = `${lp}/${topic.id ?? "(no id)"}`;
        if (!topic.id)    errors.push(`Topic ${tp}: missing id`);
        if (!topic.title) errors.push(`Topic ${tp}: missing title`);
      }
    }
  }

  return errors;
}