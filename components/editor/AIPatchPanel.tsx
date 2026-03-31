"use client";
import { useState, useRef } from "react";
import { useAI, ParallelJob } from "@/components/ai/AIProvider";
import { useEditor } from "./EditContext";
import { Curriculum, Unit, Lesson } from "@/types/curriculum";
import {
  CurriculumPatch,
  extractSubtree,
  validatePatches,
  buildDiff,
  PatchDiff,
} from "@/lib/curriculumEditor";

// ─── Scope options ─────────────────────────────────────────────────────────────

interface ScopeOption {
  label: string;
  path: string;
  description: string;
}

function buildScopeOptions(curriculum: Curriculum): ScopeOption[] {
  const opts: ScopeOption[] = [
    {
      label: "Whole Course",
      path: "",
      description: "Course metadata, all units",
    },
    {
      label: "Course Info",
      path: "/course",
      description: "Title, description, metadata",
    },
  ];

  curriculum.units.forEach((unit: Unit, ui: number) => {
    opts.push({
      label: `Unit ${ui + 1}: ${typeof unit.title === "string" ? unit.title : unit.title.default}`,
      path: `/units/${ui}`,
      description: "Unit overview & objectives",
    });
    unit.lessons.forEach((lesson: Lesson, li: number) => {
      const lTitle =
        typeof lesson.title === "string" ? lesson.title : lesson.title.default;
      opts.push({
        label: `  └ ${lTitle}`,
        path: `/units/${ui}/lessons/${li}`,
        description: "Lesson content & topics",
      });
    });
  });

  return opts;
}

// ─── System prompt for AI patch mode ─────────────────────────────────────────
// Token-efficient: the AI only sees the subtree it's editing.
// Output is strictly JSON Patch array — no prose, no markdown.

function buildPatchSystemPrompt(): string {
  return `You are a curriculum editor AI. You will receive:
1. A JSON subtree of a LearnViz curriculum (topics are slimmed — content_blocks and practice_questions are omitted to save tokens)
2. An instruction from the user

You must respond with ONLY a JSON array of patch operations. No prose, no explanation, no markdown fences.
Each operation follows this shape:
[
  { "op": "replace", "path": "/relative/path", "value": "new value" },
  { "op": "add", "path": "/relative/path", "value": "new value" },
  { "op": "remove", "path": "/relative/path" }
]

Rules:
- "path" must be a valid JSON Pointer relative to the subtree you were given
- For replace: "value" is the new content
- Only output patches for fields that need to change
- Keep changes minimal and surgical — don't rewrite things that don't need changing
- For RichText fields, value should be a plain string (markdown is fine)
- For title fields that are strings, keep them as strings
- Do NOT change structural fields like "id", "type", "schema_version"
- To APPEND a new item to an array, use the special "-" segment as the last path component.
  Example — adding a lesson: { "op": "add", "path": "/lessons/-", "value": { ...full lesson object... } }
  NEVER use a numeric index to append a brand-new item — always use "-" so it is added at the end.
- If the instruction cannot be applied sensibly, return an empty array: []
- Your entire response must be valid JSON parseable by JSON.parse()

When adding a new LESSON, always generate a COMPLETE lesson object matching this schema exactly.
Every field is required. Do not leave arrays empty. Generate at least 2 topics per lesson,
at least 1 objective per topic, at least 4 content_blocks per topic (mix of types), and at least
2 practice_questions per topic. Make all content substantive and relevant to the course subject.

LESSON SCHEMA TEMPLATE:
{
  "id": "UXX-LYY",
  "title": "Descriptive Lesson Title",
  "overview": "2-3 sentence overview of what this lesson covers and its relevance.",
  "order": <integer, 1-based within the unit>,
  "duration": <integer, estimated minutes>,
  "tags": ["tag1", "tag2"],
  "topics": [
    {
      "id": "UXX-LYY-T01",
      "title": "Topic Title",
      "order": 1,
      "overview": "1-2 sentence topic overview.",
      "difficulty": "beginner|intermediate|advanced",
      "duration": <integer minutes>,
      "tags": ["tag1"],
      "objectives": [
        {
          "id": "UXX-LYY-T01-o01",
          "description": "Specific, measurable learning objective.",
          "bloom_level": "remember|understand|apply|analyze|evaluate|create"
        }
      ],
      "content_blocks": [
        {
          "id": "UXX-LYY-T01-CB01",
          "type": "explanation",
          "title": "Block Title",
          "content": { "format": "markdown", "content": "Full markdown content. Use **bold**, $LaTeX$, code blocks, tables as appropriate." }
        },
        {
          "id": "UXX-LYY-T01-CB02",
          "type": "definition",
          "title": "Key Term",
          "content": { "format": "markdown", "content": "Definition with context." },
          "formula_latex": "optional LaTeX formula string"
        },
        {
          "id": "UXX-LYY-T01-CB03",
          "type": "worked_example",
          "title": "Example N: Title",
          "content": { "format": "markdown", "content": "**Problem:** ...\\n\\n**Solution:** Step-by-step." }
        },
        {
          "id": "UXX-LYY-T01-CB04",
          "type": "case_study",
          "title": "IT Connection: Title",
          "content": { "format": "markdown", "content": "Real-world IT application connecting the math concept to practice." }
        },
        {
          "id": "UXX-LYY-T01-CB05",
          "type": "summary",
          "title": "Topic Summary",
          "content": { "format": "markdown", "content": "- Bullet 1\\n- Bullet 2\\n- Bullet 3" }
        }
      ],
      "practice_questions": [
        {
          "id": "UXX-LYY-T01-Q01",
          "type": "multiple_choice",
          "prompt": "Question text with any necessary $LaTeX$.",
          "options": [
            { "id": "a", "text": "Option A" },
            { "id": "b", "text": "Option B" },
            { "id": "c", "text": "Option C" },
            { "id": "d", "text": "Option D" }
          ],
          "correct_answer": "a",
          "explanation": "Why this answer is correct.",
          "bloom_level": "understand",
          "difficulty": "medium"
        },
        {
          "id": "UXX-LYY-T01-Q02",
          "type": "short_answer",
          "prompt": "Open-ended question requiring a written response.",
          "sample_answer": "A model answer for grading reference.",
          "bloom_level": "apply",
          "difficulty": "medium"
        }
      ]
    }
  ]
}`;
}

// ─── Diff row component ───────────────────────────────────────────────────────

function DiffRow({ diff }: { diff: PatchDiff }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        padding: "8px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          cursor: "pointer",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            background: "var(--accent-primary-soft)",
            color: "var(--accent-primary)",
            borderRadius: 3,
            padding: "1px 5px",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {diff.path.split("/").pop()}
        </span>
        <span
          style={{
            flex: 1,
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            color: "var(--text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: expanded ? "normal" : "nowrap",
          }}
        >
          {expanded ? (
            <span>
              <span
                style={{
                  color: "var(--accent-danger)",
                  textDecoration: "line-through",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                {diff.prev}
              </span>
              <span style={{ color: "var(--accent-primary)" }}>
                {diff.next}
              </span>
            </span>
          ) : (
            diff.next
          )}
        </span>
        <span
          style={{ color: "var(--text-muted)", fontSize: 11, flexShrink: 0 }}
        >
          {expanded ? "▲" : "▼"}
        </span>
      </div>
    </div>
  );
}

// ─── Slim subtree for AI context ─────────────────────────────────────────────
// Strips heavy fields (content_blocks, practice_questions) from topics so the
// AI sees lesson/topic structure without thousands of tokens of content.
// The AI doesn't need to read existing content to add new lessons or edit
// lightweight fields; it just needs shape + metadata.

function slimSubtree(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(slimSubtree);
  if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      // Drop the heavy per-topic arrays entirely
      if (k === "content_blocks" || k === "practice_questions") continue;
      out[k] = slimSubtree(v);
    }
    return out;
  }
  return node;
}

// ─── Detect "add N lessons" intent ───────────────────────────────────────────
// Returns the number of lessons to add if the instruction matches,
// otherwise returns null (use normal single-shot generation).

function detectLessonCount(instruction: string): number | null {
  const m = instruction.match(
    /add\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:more\s+)?lessons?/i,
  );
  if (!m) return null;
  const word: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const n = parseInt(m[1], 10) || word[m[1].toLowerCase()] || null;
  return n && n > 1 ? n : null;
}

// Build per-lesson system prompt asking for a single lesson patch
function buildSingleLessonPrompt(lessonIndex: number): string {
  return (
    buildPatchSystemPrompt() +
    `\n\nYou are generating lesson #${lessonIndex + 1} in a batch. Generate ONLY this one lesson. Return a single patch operation:\n[{ "op": "add", "path": "/lessons/-", "value": { ...complete lesson object... } }]`
  );
}

// ─── Job progress indicator ───────────────────────────────────────────────────

interface JobStatus {
  id: string;
  label: string;
  done: boolean;
  chars: number;
  error?: string;
}

function JobProgress({ jobs }: { jobs: JobStatus[] }) {
  if (jobs.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
        }}
      >
        ⚡ Parallel generation — {jobs.filter((j) => j.done).length}/
        {jobs.length} complete
      </div>
      {jobs.map((j) => (
        <div
          key={j.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            borderRadius: 6,
            background: j.error
              ? "color-mix(in srgb, var(--accent-danger) 8%, var(--bg-secondary))"
              : "var(--bg-elevated)",
            border: `1px solid ${j.error ? "var(--accent-danger)44" : j.done ? "var(--accent-success)44" : "var(--border-subtle)"}`,
          }}
        >
          <span style={{ fontSize: 13, flexShrink: 0 }}>
            {j.error ? (
              "✕"
            ) : j.done ? (
              "✓"
            ) : (
              <span
                style={{
                  display: "inline-block",
                  animation: "spin 1s linear infinite",
                }}
              >
                ◌
              </span>
            )}
          </span>
          <span
            style={{
              flex: 1,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: j.error ? "var(--accent-danger)" : "var(--text-secondary)",
            }}
          >
            {j.label}
          </span>
          {!j.done && !j.error && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
              }}
            >
              {j.chars} chars
            </span>
          )}
          {j.done && !j.error && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--accent-success)",
              }}
            >
              done
            </span>
          )}
          {j.error && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--accent-danger)",
                maxWidth: 140,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {j.error}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  curriculum: Curriculum;
  onClose: () => void;
}

export default function AIPatchPanel({ curriculum, onClose }: Props) {
  const { send, sendParallel, keys, sessionSpend, sessionBudget } = useAI();
  const { applyEdit } = useEditor();

  const [scopePath, setScopePath] = useState("");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPatches, setPendingPatches] = useState<
    CurriculumPatch[] | null
  >(null);
  const [diffs, setDiffs] = useState<PatchDiff[]>([]);
  const [jobStatuses, setJobStatuses] = useState<JobStatus[]>([]);
  const abortRef = useRef<(() => void) | null>(null);

  const scopeOptions = buildScopeOptions(curriculum);
  const hasKeys = keys.length > 0;
  const eligibleParallelKeys = keys.filter(
    (k) => k.role === "any" || k.role === "generation",
  ).length;
  const lessonCountHint = detectLessonCount(instruction);
  const willUseParallel =
    lessonCountHint !== null &&
    lessonCountHint > 1 &&
    eligibleParallelKeys >= 2;

  // ─── Single-shot generation (existing behaviour, surgical edits etc.) ────────

  const runSingleShot = async (
    instruction: string,
  ): Promise<CurriculumPatch[]> => {
    const subtree = extractSubtree(curriculum, scopePath);
    const slimmedSubtree = slimSubtree(subtree);
    const userMsg = `Curriculum subtree (path: "${scopePath || "/"}"):
${JSON.stringify(slimmedSubtree, null, 2)}

Instruction: ${instruction}`;

    let raw = "";
    await send(
      [{ role: "user", content: userMsg }],
      buildPatchSystemPrompt(),
      (chunk) => {
        raw += chunk;
      },
      6000,
    );

    const cleaned = raw
      .trim()
      .replace(/^```[a-z]*\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    const patches = validatePatches(parsed);
    return patches.map((p) => ({ ...p, path: scopePath + p.path }));
  };

  // ─── Parallel lesson generation ──────────────────────────────────────────────

  const runParallelLessons = async (
    count: number,
  ): Promise<CurriculumPatch[]> => {
    const subtree = extractSubtree(curriculum, scopePath);
    const slimmedSubtree = slimSubtree(subtree);
    const contextMsg = `Curriculum subtree (path: "${scopePath || "/"}"):
${JSON.stringify(slimmedSubtree, null, 2)}`;

    // Set up job status tracking
    const initialStatuses: JobStatus[] = Array.from(
      { length: count },
      (_, i) => ({
        id: `lesson-${i}`,
        label: `Lesson ${i + 1}`,
        done: false,
        chars: 0,
      }),
    );
    setJobStatuses(initialStatuses);

    const jobs: ParallelJob[] = Array.from({ length: count }, (_, i) => ({
      id: `lesson-${i}`,
      messages: [
        {
          role: "user" as const,
          content:
            contextMsg +
            `\n\nInstruction: Add lesson ${i + 1} of ${count}. Generate only this one lesson.`,
        },
      ],
      systemPrompt: buildSingleLessonPrompt(i),
      maxTokens: 6000,
      onChunk: (jobId, delta) => {
        setJobStatuses((prev) =>
          prev.map((s) =>
            s.id === jobId ? { ...s, chars: s.chars + delta.length } : s,
          ),
        );
      },
    }));

    const results = await sendParallel(jobs, "generation");

    // Mark jobs done / errored
    setJobStatuses((prev) =>
      prev.map((s) => {
        const r = results.find((r) => r.jobId === s.id);
        return r ? { ...s, done: !r.error, error: r.error } : s;
      }),
    );

    // Parse each result into patches
    const allPatches: CurriculumPatch[] = [];
    for (const result of results) {
      if (result.error) continue;
      try {
        const cleaned = result.output
          .trim()
          .replace(/^```[a-z]*\n?/i, "")
          .replace(/\n?```$/i, "")
          .trim();
        const parsed = JSON.parse(cleaned);
        const patches = validatePatches(parsed);
        patches.forEach((p) =>
          allPatches.push({ ...p, path: scopePath + p.path }),
        );
      } catch (e) {
        // One job's bad JSON doesn't kill the whole batch — skip it
        console.warn(`Job ${result.jobId} parse error:`, e);
      }
    }
    return allPatches;
  };

  // ─── Main generate handler ────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!instruction.trim()) return;
    setLoading(true);
    setError(null);
    setPendingPatches(null);
    setDiffs([]);
    setJobStatuses([]);

    let cancelled = false;
    abortRef.current = () => {
      cancelled = true;
    };

    try {
      let rootedPatches: CurriculumPatch[];

      if (willUseParallel && lessonCountHint) {
        rootedPatches = await runParallelLessons(lessonCountHint);
      } else {
        rootedPatches = await runSingleShot(instruction);
      }

      if (cancelled) return;
      if (rootedPatches.length === 0) {
        setError(
          "The AI returned no changes. Try rephrasing your instruction.",
        );
        return;
      }

      const diffList = buildDiff(curriculum, rootedPatches);
      setPendingPatches(rootedPatches);
      setDiffs(diffList);
    } catch (err) {
      if (cancelled) return;
      const msg = (err as Error).message ?? "Unknown error";
      if (msg === "NO_KEYS")
        setError("No AI keys configured. Add one in the chat panel.");
      else if (msg.startsWith("ALL_RATE_LIMITED"))
        setError("All API keys are rate-limited. Please wait a moment.");
      else if (msg.startsWith("BUDGET_EXCEEDED"))
        setError(
          `Session budget reached ($${sessionBudget.toFixed(2)}). Reset or increase your budget in AI Config.`,
        );
      else if (msg.includes("JSON"))
        setError(`AI returned invalid JSON. Try again.`);
      else setError(msg);
    } finally {
      if (!cancelled) setLoading(false);
      abortRef.current = null;
    }
  };

  const handleApply = () => {
    if (!pendingPatches) return;
    applyEdit(pendingPatches, `AI: ${instruction.slice(0, 60)}`);
    onClose();
  };

  const handleReject = () => {
    setPendingPatches(null);
    setDiffs([]);
    setJobStatuses([]);
  };

  const generationKeys = keys.filter(
    (k) => k.role === "any" || k.role === "generation",
  );

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(600px, 94vw)",
          maxHeight: "90vh",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "fadeIn 180ms ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--bg-tertiary)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 16 }}>✦</span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 15,
                color: "var(--text-primary)",
              }}
            >
              AI Curriculum Editor
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
                marginTop: 2,
                display: "flex",
                gap: 10,
              }}
            >
              <span>
                {keys.length} key{keys.length !== 1 ? "s" : ""} available
              </span>
              {generationKeys.length >= 2 && (
                <span style={{ color: "var(--accent-success)" }}>
                  ⚡ {generationKeys.length} parallel slots
                </span>
              )}
              {sessionBudget > 0 && (
                <span
                  style={{
                    color:
                      sessionSpend / sessionBudget > 0.8
                        ? "var(--accent-danger)"
                        : "var(--text-muted)",
                  }}
                >
                  ${sessionSpend.toFixed(4)} / ${sessionBudget.toFixed(2)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 18,
              lineHeight: 1,
              padding: "2px 5px",
              borderRadius: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {!hasKeys && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background:
                  "color-mix(in srgb, var(--accent-danger) 10%, var(--bg-secondary))",
                border: "1px solid var(--accent-danger)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--accent-danger)",
              }}
            >
              ⚠ No AI keys configured. Open the chat panel and add a key first.
            </div>
          )}

          {/* Scope selector */}
          <div>
            <label style={labelStyle}>Scope — what should the AI edit?</label>
            <select
              value={scopePath}
              onChange={(e) => setScopePath(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {scopeOptions.map((opt) => (
                <option key={opt.path} value={opt.path}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div
              style={{
                marginTop: 4,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
              }}
            >
              Narrower scope = fewer tokens = faster + cheaper
            </div>
          </div>

          {/* Instruction input */}
          <div>
            <label style={labelStyle}>Instruction</label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={`e.g. "Add two more lessons" or "Make the overview more engaging"`}
              rows={3}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-primary)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border-color)";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                  handleGenerate();
              }}
            />
          </div>

          {/* Parallel hint badge */}
          {lessonCountHint !== null && lessonCountHint > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${willUseParallel ? "var(--accent-success)44" : "var(--border-subtle)"}`,
                background: willUseParallel
                  ? "color-mix(in srgb, var(--accent-success) 6%, var(--bg-secondary))"
                  : "var(--bg-elevated)",
              }}
            >
              <span style={{ fontSize: 14 }}>
                {willUseParallel ? "⚡" : "⚠"}
              </span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: willUseParallel
                      ? "var(--accent-success)"
                      : "var(--text-muted)",
                  }}
                >
                  {willUseParallel
                    ? `Parallel mode — ${lessonCountHint} lessons across ${Math.min(lessonCountHint, eligibleParallelKeys)} keys`
                    : `Parallel mode unavailable — only ${eligibleParallelKeys} generation key${eligibleParallelKeys !== 1 ? "s" : ""}`}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                    marginTop: 2,
                  }}
                >
                  {willUseParallel
                    ? "Each lesson generated simultaneously — faster and no truncation risk"
                    : "Add more keys with role 'Any job' or 'Generation' to enable parallel mode"}
                </div>
              </div>
            </div>
          )}

          {/* Job progress */}
          {jobStatuses.length > 0 && <JobProgress jobs={jobStatuses} />}

          {/* Error */}
          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 6,
                background:
                  "color-mix(in srgb, var(--accent-danger) 10%, var(--bg-secondary))",
                border: "1px solid var(--accent-danger)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--accent-danger)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              ⚠ {error}
            </div>
          )}

          {/* Diff preview */}
          {diffs.length > 0 && (
            <div
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  background: "var(--bg-tertiary)",
                  borderBottom: "1px solid var(--border-color)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "var(--text-muted)",
                    flex: 1,
                  }}
                >
                  Preview — {diffs.length} change{diffs.length !== 1 ? "s" : ""}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                  }}
                >
                  Click rows to expand
                </span>
              </div>
              <div
                style={{ padding: "0 12px", maxHeight: 240, overflowY: "auto" }}
              >
                {diffs.map((d, i) => (
                  <DiffRow key={i} diff={d} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            background: "var(--bg-tertiary)",
            flexShrink: 0,
          }}
        >
          {pendingPatches ? (
            <>
              <button
                onClick={handleReject}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                }}
              >
                ✕ Reject
              </button>
              <button
                onClick={handleApply}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "var(--accent-primary)",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                ✓ Apply {diffs.length} change{diffs.length !== 1 ? "s" : ""}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!hasKeys || !instruction.trim() || loading}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: loading
                    ? "var(--bg-tertiary)"
                    : willUseParallel
                      ? "var(--accent-success)"
                      : "var(--accent-secondary)",
                  cursor:
                    !hasKeys || !instruction.trim() || loading
                      ? "not-allowed"
                      : "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: loading ? "var(--text-muted)" : "#fff",
                  opacity: !hasKeys || !instruction.trim() ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "background 200ms",
                }}
              >
                {loading ? (
                  <>
                    <span
                      style={{
                        animation: "spin 1s linear infinite",
                        display: "inline-block",
                      }}
                    >
                      ◌
                    </span>
                    {willUseParallel
                      ? "Generating in parallel…"
                      : "Generating…"}
                  </>
                ) : willUseParallel ? (
                  "⚡ Generate (parallel)"
                ) : (
                  "✦ Generate"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 6,
};
