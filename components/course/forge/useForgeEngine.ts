"use client";
// ─── useForgeEngine — three-phase curriculum generation pipeline ──────────────
//
//  Phase 1: Scaffold   — AI designs the full course skeleton (units/lessons/topics)
//  Phase 2: Lesson wave — parallel per-lesson generation with formative quizzes
//  Phase 3: Unit tests  — parallel per-unit assessment generation
//
import { useState, useRef, useCallback } from "react";
import { useAI, ParallelJob, ParallelResult } from "@/components/ai/AIProvider";
import { Curriculum, Lesson, Unit, resolveLocale } from "@/types/curriculum";
import { forgeLog, ModelContext } from "@/lib/forgeLogger";
import { ForgeConfig, ForgeState, NodeStatus, TreeNode } from "./types";
import { repairJSON } from "./jsonRepair";
import {
  SCAFFOLD_SYSTEM,
  buildScaffoldPrompt,
  buildLessonPrompt,
  buildUnitTestPrompt,
  buildFormativeQuizRepairPrompt,
  buildTopicContentRepairPrompt,
} from "./prompts";
import { validateCurriculum, validateScaffold, SchemaReport } from "./validator";

// ─── Return shape ─────────────────────────────────────────────────────────────

export interface ForgeEngineResult {
  forge: ForgeState;
  schemaReport: SchemaReport | null;
  forgedCurriculum: Curriculum | null;
  isRunning: boolean;
  isDone: boolean;
  elapsedSec: string;
  progressPct: number;
  handleForge: () => Promise<void>;
  resetForge: () => void;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_FORGE: ForgeState = {
  phase: "idle",
  nodes: {},
  rootId: null,
  totalJobs: 0,
  doneJobs: 0,
  errorJobs: 0,
  bytesGenerated: 0,
  lanesUsed: 0,
  elapsedMs: 0,
  scaffoldSnapshot: null,
  scaffoldUsedModel: null,
  modelActivity: {},
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useForgeEngine(
  config: ForgeConfig,
  totalLanes: number,
): ForgeEngineResult {
  const { sendParallel, geminiKeyCount } = useAI();

  // When Gemini key(s) are present, lock every forge job to this exact model.
  // This guarantees the model name is always visible in logs (no "(key default)")
  // and prevents the engine from accidentally using a different Gemini model.
  const GEMINI_FORGE_MODEL = "gemini-3.1-flash-lite-preview";
  const forgeModelOverride = geminiKeyCount > 0 ? GEMINI_FORGE_MODEL : undefined;

  const [forge, setForge] = useState<ForgeState>(INITIAL_FORGE);
  const [schemaReport, setSchemaReport] = useState<SchemaReport | null>(null);
  const [forgedCurriculum, setForgedCurriculum] = useState<Curriculum | null>(null);

  const abortRef      = useRef(false);
  const startTimeRef  = useRef(0);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks how many wave+unit-test jobs are currently in-flight so we know
  // when a slot is free to start an early unit test.
  const activeJobsRef = useRef(0);
  // Set of unit IDs whose unit test has already been dispatched (either early
  // during the wave or in the normal Phase 3 sweep) — prevents double-firing.
  const unitTestDispatchedRef = useRef<Set<string>>(new Set());

  // ── Helpers ────────────────────────────────────────────────────────────────

  const updateNode = useCallback((id: string, patch: Partial<TreeNode>) => {
    setForge((prev) => ({
      ...prev,
      nodes: { ...prev.nodes, [id]: { ...prev.nodes[id], ...patch } },
    }));
  }, []);

  /** Bump modelActivity count for the model that completed a job */
  const bumpModelActivity = useCallback((modelId: string | undefined) => {
    if (!modelId) return;
    setForge((prev) => ({
      ...prev,
      modelActivity: {
        ...prev.modelActivity,
        [modelId]: (prev.modelActivity[modelId] ?? 0) + 1,
      },
    }));
  }, []);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const isRunning  = forge.phase === "scaffold" || forge.phase === "wave" || forge.phase === "repair";






  // ── Main forge handler ─────────────────────────────────────────────────────

  const handleForge = useCallback(async () => {
    if (!config.title.trim()) return;

    abortRef.current   = false;
    startTimeRef.current = Date.now();
    activeJobsRef.current = 0;
    unitTestDispatchedRef.current = new Set();
    forgeLog.start();
    forgeLog.info("forge", "Starting Hydra forge run", { config, totalLanes });
    forgeLog.startPhase("scaffold");

    timerRef.current = setInterval(() => {
      setForge((prev) => ({ ...prev, elapsedMs: Date.now() - startTimeRef.current }));
    }, 500);

    setForge({
      phase: "scaffold",
      nodes: {
        scaffold: {
          id: "scaffold",
          label: "AI designing curriculum structure…",
          type: "course",
          status: "running",
          chars: 0,
        },
      },
      rootId: "scaffold",
      totalJobs: 1,
      doneJobs: 0,
      errorJobs: 0,
      bytesGenerated: 0,
      lanesUsed: 0,
      elapsedMs: 0,
      scaffoldSnapshot: null,
      scaffoldUsedModel: null,
      modelActivity: {},
    });
    setSchemaReport(null);
    setForgedCurriculum(null);

    let errorJobsCount = 0;
    let totalBytesGenerated = 0;

    try {
      // ────────────────────────────────────────────────────────────────────────
      // Phase 1: Scaffold — AI designs the full course skeleton
      // ────────────────────────────────────────────────────────────────────────
      const specMsg = buildScaffoldPrompt(config);

      const SCAFFOLD_MAX_ATTEMPTS = 5;
      let skeleton: Curriculum | null = null;
      let scaffoldRaw = "";

      // ── Scaffold retry loop ────────────────────────────────────────────────
      let scaffoldResult: ParallelResult | undefined;
      for (let attempt = 1; attempt <= SCAFFOLD_MAX_ATTEMPTS; attempt++) {
        if (abortRef.current) {
          stopTimer();
          setForge((prev) => ({ ...prev, phase: "error" }));
          return;
        }

        // Scope-aware scaffold budget: comprehensive courses produce much larger
        // skeletons (8-14 units × plan block + JSON) — 10k was the hostage-taker.
        const scaffoldMaxTokens =
          config.scope === "comprehensive" ? 22_000
          : config.scope === "standard"     ? 16_000
          :                                   12_000;

        forgeLog.info("scaffold", `Sending scaffold request (attempt ${attempt}/${SCAFFOLD_MAX_ATTEMPTS})`, {
          maxTokens: scaffoldMaxTokens,
          attempt,
        });

        const scaffoldCallStart = Date.now();
        scaffoldRaw = "";
        try {
          [scaffoldResult] = await sendParallel(
            [{
              id: "scaffold",
              messages: [{ role: "user", content: specMsg }],
              systemPrompt: SCAFFOLD_SYSTEM,
              maxTokens: scaffoldMaxTokens,
              modelOverride: forgeModelOverride,
              onChunk: (_jobId: string, chunk: string) => {
                scaffoldRaw += chunk;
                updateNode("scaffold", { chars: scaffoldRaw.length });
                // Update bytesGenerated live so the KB counter in the stats bar
                // ticks up during the potentially long scaffold wait instead of
                // staying at 0 until scaffold fully completes.
                setForge((prev) => ({ ...prev, bytesGenerated: scaffoldRaw.length }));
              },
            }],
            "scaffold",
          );
          if (scaffoldResult?.error) throw new Error(scaffoldResult.error);
        } catch (sendErr) {
          const scaffoldModel: ModelContext = {
            provider: scaffoldResult?.keyProvider,
            model:    scaffoldResult?.modelId,
            keyLabel: scaffoldResult?.keyLabel,
            keyId:    scaffoldResult?.keyId,
          };
          forgeLog.error("scaffold", `Send failed on attempt ${attempt}`, {
            error:   String(sendErr),
            attempt,
          }, scaffoldModel);
          if (attempt === SCAFFOLD_MAX_ATTEMPTS) throw sendErr;
          updateNode("scaffold", { status: "retrying" });
          await new Promise((r) => setTimeout(r, 3000 * attempt));
          continue;
        }

        if (abortRef.current) {
          stopTimer();
          setForge((prev) => ({ ...prev, phase: "error" }));
          return;
        }

        const scaffoldModel: ModelContext = {
          provider: scaffoldResult?.keyProvider,
          model:    scaffoldResult?.modelId,
          keyLabel: scaffoldResult?.keyLabel,
          keyId:    scaffoldResult?.keyId,
        };

        forgeLog.callSuccess("scaffold", {
          chars:      scaffoldRaw.length,
          attempt,
          durationMs: Date.now() - scaffoldCallStart,
        }, scaffoldModel);

        // Empty response — treat as a transient failure and retry with backoff
        if (scaffoldRaw.trim().length === 0) {
          forgeLog.error("scaffold", `Empty response on attempt ${attempt} — retrying`, {
            attempt,
            hint: "Likely rate-limit or quota exhaustion on the selected lane",
          }, scaffoldModel);
          if (attempt === SCAFFOLD_MAX_ATTEMPTS) {
            throw new Error(`Scaffold failed after ${SCAFFOLD_MAX_ATTEMPTS} attempts: empty response from model. Try again.`);
          }
          updateNode("scaffold", { status: "retrying" });
          await new Promise((r) => setTimeout(r, 3000 * attempt));
          continue;
        }

        const planMatch = scaffoldRaw.match(/<plan>[\s\S]*?<\/plan>/i);
        if (planMatch) {
          forgeLog.info("scaffold", "Plan block found and stripped", { planLength: planMatch[0].length }, scaffoldModel);
        }
        const jsonOnly = scaffoldRaw.replace(/<plan>[\s\S]*?<\/plan>/i, "").trim();

        try {
          skeleton = JSON.parse(repairJSON(jsonOnly)) as Curriculum;

          // Structural validation: every lesson must have topics, ids, titles.
          const scaffoldErrors = validateScaffold(skeleton);
          if (scaffoldErrors.length > 0) {
            forgeLog.error("scaffold", `Scaffold structure invalid on attempt ${attempt}`, {
              errors: scaffoldErrors,
              attempt,
              hint: "Model omitted required fields (topics/ids/titles). Retrying.",
            }, scaffoldModel);
            skeleton = null;
            if (attempt === SCAFFOLD_MAX_ATTEMPTS) {
              throw new Error(`Scaffold structure invalid after ${SCAFFOLD_MAX_ATTEMPTS} attempts: ${scaffoldErrors.join("; ")}`);
            }
            updateNode("scaffold", { status: "retrying" });
            await new Promise((r) => setTimeout(r, 3000 * attempt));
            continue;
          }

          forgeLog.info("scaffold", "Scaffold parsed OK", {
            units:   skeleton.units?.length,
            lessons: skeleton.units?.reduce((s, u) => s + u.lessons.length, 0),
            attempt,
          }, scaffoldModel);
          bumpModelActivity(scaffoldResult?.modelId);
          updateNode("scaffold", { status: "done", modelId: scaffoldResult?.modelId });
          setForge((prev) => ({ ...prev, scaffoldUsedModel: scaffoldResult?.modelId ?? null }));
          break;
        } catch (parseErr) {
          forgeLog.parseError("scaffold", parseErr, jsonOnly, attempt, scaffoldModel);
          if (attempt === SCAFFOLD_MAX_ATTEMPTS) {
            throw new Error(`Scaffold JSON parse failed after ${SCAFFOLD_MAX_ATTEMPTS} attempts: ${String(parseErr)}. Try again.`);
          }
          updateNode("scaffold", { status: "retrying" });
          await new Promise((r) => setTimeout(r, 3000 * attempt));
        }
      }

      if (!skeleton) {
        throw new Error("Scaffold failed: no valid response after retries.");
      }

      skeleton = { ...skeleton, course: { ...skeleton.course, language: config.language } };
      setForge((prev) => ({ ...prev, scaffoldSnapshot: skeleton, phase: "wave" }));

      const allLessonJobs: Array<{ unit: Unit; lesson: Lesson }> = [];
      for (const unit of skeleton.units) {
        for (const lesson of unit.lessons) {
          allLessonJobs.push({ unit, lesson });
        }
      }
      const totalLessons = allLessonJobs.length;
      const totalJobs    = 1 + totalLessons;

      forgeLog.endPhase("scaffold", { units: skeleton.units.length, lessons: totalLessons });
      forgeLog.startPhase("wave");

      const courseTitle = resolveLocale(skeleton.course.title);

      // Build initial node tree
      const courseId = "course-root";
      const nodes: Record<string, TreeNode> = {
        [courseId]: {
          id: courseId,
          label: `◈ ${courseTitle}`,
          type: "course",
          status: "done",
          chars: scaffoldRaw.length,
          children: skeleton.units.map((u) => u.id),
        },
      };

      for (const unit of skeleton.units) {
        nodes[unit.id] = {
          id: unit.id,
          label: `${unit.id} · ${resolveLocale(unit.title)}`,
          type: "unit",
          status: "pending",
          chars: 0,
          children: unit.lessons.map((l) => l.id),
        };
        for (const lesson of unit.lessons) {
          nodes[lesson.id] = {
            id: lesson.id,
            label: `${lesson.id} · ${resolveLocale(lesson.title)}`,
            type: "lesson",
            status: "pending",
            chars: 0,
            children: (lesson.topics ?? []).map((t) => t.id),
          };
          for (const topic of (lesson.topics ?? [])) {
            nodes[topic.id] = {
              id: topic.id,
              label: resolveLocale(topic.title),
              type: "topic",
              status: "pending",
              chars: 0,
            };
          }
        }
      }

      setForge((prev) => ({
        ...prev,
        phase: "wave",
        nodes,
        rootId: courseId,
        totalJobs,
        doneJobs: 1,
        bytesGenerated: scaffoldRaw.length,
      }));

      // ────────────────────────────────────────────────────────────────────────
      // Phase 2: Lesson wave — all lessons sent directly to wave in parallel
      // ────────────────────────────────────────────────────────────────────────
      const WAVE_SIZE = Math.max(1, totalLanes || 8);
      let builtCurriculum: Curriculum = { ...skeleton };
      totalBytesGenerated = scaffoldRaw.length;
      let doneCount = 1;
      let lanesUsed = 0;

      // Token budget: ~25,000 tokens/call for Gemini; ~17,500 for Groq.
      //   Gemini: 250k TPM / 10 RPM = 25,000 tokens/call
      //   Groq:    70k TPM /  4 RPM = 17,500 tokens/call
      // When custom depth is active, derive budget from the custom values rather
      // than the depth preset — otherwise a high customBlocks count gets starved.
      // Formula: assume ~4 topics/lesson avg; each block ≈ 500 tokens of output,
      // each question ≈ 400 tokens (prompt + hints + full solution).
      const lessonBaseTokens = config.customBlocks !== undefined
        ? Math.min(
            4 * (config.customBlocks * 500 + (config.customQuestions ?? 5) * 400) + 2_000,
            25_000,
          )
        : config.depth === "deep" ? 22_000 : config.depth === "standard" ? 18_000 : 8_000;
      function lessonTokensForAttempt(attempt: number) {
        // Small nudge on retry to squeeze more content; hard-cap at 25k.
        return Math.min(Math.round(lessonBaseTokens * (1 + 0.15 * (attempt - 1))), 25_000);
      }

      // Track last-known modelId per job from onLaneAssigned callbacks.
      // Used as fallback when result.modelId is undefined (e.g. key with no pinned model).
      const laneModelById: Record<string, string> = {};

      // All lessons go straight to wave — no speculative pre-gen, no diff step.
      const parseFailed = new Set<string>();

      const buildJobs = (items: typeof allLessonJobs, attempt: number): ParallelJob[] =>
        items.map(({ unit, lesson }) => {
          const lessonOrder = unit.lessons.findIndex((l) => l.id === lesson.id) + 1;
          const truncationHint = attempt > 1 && parseFailed.has(lesson.id)
            ? " IMPORTANT: Your previous response was truncated. Shorten content_blocks to 30-50 words each, keep hints to 1 per question. You MUST include the full 'assessments' array — it is required and must be the last key in the JSON object. Complete JSON is more important than length."
            : "";
          const unitTitle   = resolveLocale(unit.title);
          const lessonTitle = resolveLocale(lesson.title);
          return ({
            id: lesson.id,
            messages: [{
              role: "user" as const,
              content: buildLessonPrompt(
                courseTitle, config.subject, config.level,
                unitTitle, lessonTitle, lesson.id,
                (lesson.topics ?? []).map((t) => resolveLocale(t.title)),
                config.depth, lessonOrder, unit.lessons.length,
                config.language, config.prerequisite,
                config.customBlocks, config.customQuestions,
              ),
            }],
            systemPrompt: `You are a curriculum content generator. Return ONLY raw JSON — the lesson object. No prose, no markdown fences.${truncationHint}`,
            maxTokens: lessonTokensForAttempt(attempt),
            modelOverride: forgeModelOverride,
            onChunk: (jobId, delta) => {
              setForge((prev) => {
                const node = prev.nodes[jobId];
                if (!node) return prev;
                return { ...prev, nodes: { ...prev.nodes, [jobId]: { ...node, chars: node.chars + delta.length } } };
              });
            },
            onLaneAssigned: (jobId, provider, modelId, keyLabel, laneAttempt) => {
              // Track last-known model per job so we can fall back to it if
              // result.modelId arrives undefined (e.g. key with no pinned model).
              if (modelId) laneModelById[jobId] = modelId;
              forgeLog.info(`wave:${jobId}`, `Lane assigned (attempt ${laneAttempt + 1})`, {
                provider,
                model: modelId ?? "(key default)",
                keyLabel: keyLabel ?? "(unlabeled)",
                waveAttempt: attempt,
              });
            },
          });
        });

      // ── Worker-pool wave: WAVE_SIZE concurrent slots, next job starts the
      // moment any slot frees — no waiting for an entire batch to settle.
      // Each job carries its own retry state (attempt counter + continuation flag).
      // ────────────────────────────────────────────────────────────────────────
      forgeLog.info("wave", `Starting worker-pool wave — ${WAVE_SIZE} concurrent slots, ${allLessonJobs.length} lessons`);
      lanesUsed = WAVE_SIZE;

      // Queue of work items.  Each entry holds the original job info plus
      // per-item retry counters so retries re-enter the pool immediately.
      type WorkItem = {
        jobInfo: (typeof allLessonJobs)[number];
        attempt: number;
        partialRaw?: string; // set when truncated but parseable JSON was received
      };
      const queue: WorkItem[] = allLessonJobs.map((j) => ({ jobInfo: j, attempt: 1 }));
      const LESSON_MAX_ATTEMPTS = 3;

      // ────────────────────────────────────────────────────────────────────────
      // Unit-test helpers — declared before processOne so the wave can fire
      // unit tests early as soon as a unit's last lesson finishes.
      // ────────────────────────────────────────────────────────────────────────
      const unitTestBaseTokens =
        config.depth === "deep" ? 14_000 : config.depth === "standard" ? 12_000 : 6_000;
      const UNIT_TEST_MAX_ATTEMPTS = 3;

      const processUnitTest = async (job: ParallelJob, attempt: number): Promise<void> => {
        if (abortRef.current) return;
        const jobWithTokens = { ...job, maxTokens: Math.min(Math.round(unitTestBaseTokens * (1 + 0.15 * (attempt - 1))), 16_000) };
        activeJobsRef.current++;
        let results: Awaited<ReturnType<typeof sendParallel>>;
        try {
          results = await sendParallel([jobWithTokens], "unit-test");
        } catch (err) {
          activeJobsRef.current--;
          const msg = String(err);
          if (msg.includes("ALL_RATE_LIMITED") || msg.includes("NO_KEYS")) {
            forgeLog.info("unit-tests", `sendParallel threw ${msg} for ${job.id} — marking as errored`);
            updateNode(job.id, { status: "error", error: msg });
            errorJobsCount++;
            setForge((prev) => ({ ...prev, errorJobs: prev.errorJobs + 1 }));
            return;
          }
          throw err;
        }
        activeJobsRef.current--;
        const result = results[0];
        const unitId = result.jobId.replace(/-TEST$/, "");
        const utModel: ModelContext = { provider: result.keyProvider, model: result.modelId, keyLabel: result.keyLabel, keyId: result.keyId };

        if (result.error || !result.output) {
          if (attempt < UNIT_TEST_MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 2000 * attempt));
            return processUnitTest(job, attempt + 1);
          }
          forgeLog.error(`unit-test:${result.jobId}`, "Job error (all attempts exhausted)", { error: result.error ?? "No output" }, utModel);
          updateNode(result.jobId, { status: "error", error: result.error ?? "No output" });
          errorJobsCount++;
          setForge((prev) => ({ ...prev, errorJobs: prev.errorJobs + 1 }));
          return;
        }

        try {
          JSON.parse(repairJSON(result.output)); // validate
        } catch {
          if (attempt < UNIT_TEST_MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 2000 * attempt));
            return processUnitTest(job, attempt + 1);
          }
        }

        try {
          const assessment = JSON.parse(repairJSON(result.output));
          forgeLog.info(`unit-test:${result.jobId}`, "Parsed OK", { questions: assessment.questions?.length, chars: result.output.length }, utModel);
          builtCurriculum = {
            ...builtCurriculum,
            units: builtCurriculum.units.map((u) =>
              u.id === unitId ? { ...u, assessments: [assessment] } : u,
            ),
          };
          totalBytesGenerated += result.output.length;
          doneCount++;
          bumpModelActivity(result.modelId);
          updateNode(result.jobId, { status: "done", chars: result.output.length, modelId: result.modelId, provider: result.keyProvider });
          setForge((prev) => ({ ...prev, doneJobs: doneCount, bytesGenerated: totalBytesGenerated }));
        } catch (parseErr) {
          forgeLog.parseError(`unit-test:${result.jobId}`, parseErr, result.output ?? "", attempt, utModel);
          updateNode(result.jobId, { status: "error", error: "JSON parse failed" });
          errorJobsCount++;
          setForge((prev) => ({ ...prev, errorJobs: prev.errorJobs + 1 }));
        }
      };

      // Idempotent: register a unit test node and fire it immediately.
      // Guarded by unitTestDispatchedRef — safe to call from processOne and
      // the Phase 3 mop-up sweep without risk of double-firing.
      const maybeFireEarlyUnitTest = (unit: Unit): Promise<void> | null => {
        if (unitTestDispatchedRef.current.has(unit.id)) return null;
        unitTestDispatchedRef.current.add(unit.id);

        const testNodeId = `${unit.id}-TEST`;
        setForge((prev) => ({
          ...prev,
          totalJobs: prev.totalJobs + 1,
          nodes: {
            ...prev.nodes,
            [testNodeId]: {
              id: testNodeId, label: `📝 ${unit.id} Unit Test`,
              type: "assembly" as const, status: "pending" as NodeStatus, chars: 0,
            },
            [unit.id]: {
              ...prev.nodes[unit.id],
              children: [...(prev.nodes[unit.id]?.children ?? []), testNodeId],
            },
          },
        }));

        const testJob: ParallelJob = {
          id: testNodeId,
          messages: [{
            role: "user" as const,
            content: buildUnitTestPrompt(courseTitle, config.subject, config.level, unit, config.depth, config.language),
          }],
          systemPrompt: "You are a curriculum assessment generator. Return ONLY raw JSON — the Assessment object. No prose, no markdown fences.",
          maxTokens: unitTestBaseTokens,
          modelOverride: forgeModelOverride,
          onChunk: (jobId, delta) => {
            setForge((prev) => {
              const node = prev.nodes[jobId];
              if (!node) return prev;
              return {
                ...prev,
                nodes: {
                  ...prev.nodes,
                  [jobId]: { ...node, chars: node.chars + delta.length, status: "running" as NodeStatus },
                },
              };
            });
          },
        };

        forgeLog.info("unit-tests", `Early unit test fired for ${unit.id} (free slot available during wave)`);
        return processUnitTest(testJob, 1);
      };

      // processOne: run a single lesson job and immediately process the result.
      // Returns the next WorkItem to run if a retry is needed, or null if done.
      const processOne = async (item: WorkItem): Promise<void> => {
        if (abortRef.current) return;
        const { jobInfo, attempt } = item;
        const { unit, lesson } = jobInfo;

        // Mark as running in UI
        setForge((prev) => ({
          ...prev,
          nodes: {
            ...prev.nodes,
            [lesson.id]: { ...prev.nodes[lesson.id], status: "running" },
            [unit.id]:   { ...prev.nodes[unit.id],   status: "running" },
          },
        }));

        const [jobResult] = await (async () => {
          try {
            return await sendParallel(buildJobs([jobInfo], attempt), "generation");
          } catch (err) {
            const msg = String(err);
            // Convert any thrown error into a result so the retry logic below
            // handles it uniformly (including backoff + LESSON_MAX_ATTEMPTS cap).
            // Previously only ALL_RATE_LIMITED/NO_KEYS were caught here — any
            // other throw escaped processOne entirely with no retry.
            forgeLog.info("wave", `sendParallel threw for ${lesson.id} on attempt ${attempt}: ${msg}`);
            return [{ jobId: lesson.id, output: "", keyId: "", error: msg }] as ParallelResult[];
          }
        })();

        const result = jobResult;

        // ── Retry: error or empty output ──────────────────────────────────
        if (result.error || !result.output) {
          if (attempt < LESSON_MAX_ATTEMPTS) {
            updateNode(lesson.id, { status: "retrying" });
            await new Promise((r) => setTimeout(r, 500 * attempt));
            return processOne({ jobInfo, attempt: attempt + 1 });
          }
          // All attempts exhausted — record as error
          const waveModel: ModelContext = { provider: result.keyProvider, model: result.modelId, keyLabel: result.keyLabel, keyId: result.keyId };
          forgeLog.error(`lesson:${lesson.id}`, "Job error (all attempts exhausted)", { error: result.error ?? "No output", attempt }, waveModel);
          updateNode(lesson.id, { status: "error", error: result.error ?? "No output" });
          updateNode(unit.id, { status: "error" });
          errorJobsCount++;
          setForge((prev) => ({ ...prev, errorJobs: prev.errorJobs + 1 }));
          return;
        }

        // ── Parse result ──────────────────────────────────────────────────
        let parsed: ReturnType<typeof JSON.parse> | null = null;
        try {
          parsed = JSON.parse(repairJSON(result.output));
        } catch {
          if (attempt < LESSON_MAX_ATTEMPTS) {
            parseFailed.add(lesson.id);
            updateNode(lesson.id, { status: "retrying" });
            await new Promise((r) => setTimeout(r, 500 * attempt));
            return processOne({ jobInfo, attempt: attempt + 1 });
          }
          const waveModel: ModelContext = { provider: result.keyProvider, model: result.modelId, keyLabel: result.keyLabel, keyId: result.keyId };
          forgeLog.parseError(`lesson:${lesson.id}`, new Error("JSON parse failed"), result.output, attempt, waveModel);
          updateNode(lesson.id, { status: "error", error: "JSON parse failed" });
          errorJobsCount++;
          setForge((prev) => ({ ...prev, errorJobs: prev.errorJobs + 1 }));
          return;
        }

        // ── Truncation check: valid JSON but missing assessments ──────────
        const hasAssessments = Array.isArray(parsed.assessments) && parsed.assessments.length > 0;
        if (!hasAssessments && attempt < LESSON_MAX_ATTEMPTS) {
          updateNode(lesson.id, { status: "retrying" });
          await new Promise((r) => setTimeout(r, 500 * attempt));
          return processOne({ jobInfo, attempt: attempt + 1, partialRaw: result.output });
        }

        // ── Continuation: final attempt still truncated → ask model to complete ──
        if (!hasAssessments && item.partialRaw) {
          const continuationJob: ParallelJob = {
            id: lesson.id,
            messages: [{
              role: "user" as const,
              content: `The following lesson JSON was truncated and is missing its "assessments" array. ` +
                `Complete it by appending the assessments array and closing the object. ` +
                `Return ONLY the complete, valid JSON object — no prose, no fences.\n\n` +
                `Partial lesson:\n${item.partialRaw.slice(-800)}`,
            }],
            systemPrompt: "You are a curriculum content generator. Return ONLY raw JSON — the complete lesson object. No prose, no markdown fences.",
            maxTokens: 2_500,
            modelOverride: forgeModelOverride,
          };
          forgeLog.info("wave", `Running continuation for truncated lesson ${lesson.id}`);
          try {
            const [contResult] = await sendParallel([continuationJob], "generation");
            if (!contResult.error && contResult.output) {
              try { parsed = JSON.parse(repairJSON(contResult.output)); } catch { /* use original */ }
            }
          } catch { /* fall through — use whatever we have */ }
        }

        // ── Commit result ─────────────────────────────────────────────────
        const resolvedModelId = result.modelId || laneModelById[result.jobId];
        const lessonModel: ModelContext = { provider: result.keyProvider, model: resolvedModelId, keyLabel: result.keyLabel, keyId: result.keyId };
        const generatedLesson = parsed as Lesson;
        forgeLog.info(`lesson:${lesson.id}`, "Parsed OK", { topics: generatedLesson.topics?.length, chars: result.output.length }, lessonModel);

        builtCurriculum = {
          ...builtCurriculum,
          units: builtCurriculum.units.map((u) => {
            if (u.id !== unit.id) return u;
            return {
              ...u,
              lessons: u.lessons.map((l) => {
                if (l.id !== lesson.id) return l;
                const scaffoldTitle  = l.title;
                const scaffoldTopics = l.topics;
                const merged = { ...generatedLesson, id: l.id, order: l.order };
                if (!merged.title || (typeof merged.title === "string" && merged.title.trim() === "")) merged.title = scaffoldTitle;
                if (!Array.isArray(merged.topics) || merged.topics.length === 0) {
                  merged.topics = scaffoldTopics;
                } else if (Array.isArray(scaffoldTopics) && scaffoldTopics.length > 0) {
                  merged.topics = merged.topics.map((genTopic, idx) => {
                    const scaffoldTopic = scaffoldTopics[idx];
                    if (!scaffoldTopic) return genTopic;
                    return {
                      ...genTopic,
                      id:    scaffoldTopic.id,
                      order: scaffoldTopic.order ?? genTopic.order,
                      title: (!genTopic.title || (typeof genTopic.title === "string" && genTopic.title.trim() === ""))
                        ? scaffoldTopic.title : genTopic.title,
                    };
                  });
                }
                return merged;
              }),
            };
          }),
        };

        totalBytesGenerated += result.output.length;
        doneCount++;
        bumpModelActivity(resolvedModelId);
        updateNode(lesson.id, { status: "done", chars: result.output.length, modelId: resolvedModelId, provider: result.keyProvider });
        for (const topic of (lesson.topics ?? [])) updateNode(topic.id, { status: "done" });

        const unitLessonIds = unit.lessons.map((l) => l.id);
        setForge((prev) => {
          const allDone = unitLessonIds.every((lid) => prev.nodes[lid]?.status === "done" || lid === lesson.id);
          return {
            ...prev,
            doneJobs: doneCount,
            bytesGenerated: totalBytesGenerated,
            lanesUsed,
            nodes: {
              ...prev.nodes,
              [lesson.id]: { ...prev.nodes[lesson.id], status: "done", chars: result.output.length },
              ...(allDone ? { [unit.id]: { ...prev.nodes[unit.id], status: "done" } } : {}),
            },
          };
        });

        // ── Early unit-test trigger ───────────────────────────────────────────
        // If this was the last lesson in the unit AND there is a free API slot
        // (activeJobs < WAVE_SIZE), fire the unit test immediately instead of
        // waiting for Phase 3.  We don't await so the lesson worker can pick up
        // the next lesson immediately; the unit test runs concurrently.
        // activeJobsRef reflects the count before runWorker decrements it for
        // this returning processOne call, so "< WAVE_SIZE" means ≥1 free slot.
        const currentUnitInBuilt = builtCurriculum.units.find((u) => u.id === unit.id);
        const allUnitLessonsDone = currentUnitInBuilt?.lessons.every(
          (l) => l.id === lesson.id || (Array.isArray(l.topics) && l.topics.length > 0 && l.topics.some((t) => Array.isArray(t.content_blocks) && t.content_blocks.length > 0))
        ) ?? false;

        if (allUnitLessonsDone && activeJobsRef.current < WAVE_SIZE) {
          const unitForTest = currentUnitInBuilt ?? unit;
          const earlyPromise = maybeFireEarlyUnitTest(unitForTest);
          if (earlyPromise) {
            earlyPromise.catch((err) => {
              forgeLog.error("unit-tests", `Early unit test for ${unit.id} threw`, { error: String(err) });
            });
          }
        }
      };

      // ── Run the pool: WAVE_SIZE workers drain the queue concurrently ──────
      // Each worker pulls the next item and calls processOne (which handles its
      // own retries recursively), then immediately pulls the next item.
      {
        let queueIdx = 0;
        const runWorker = async (): Promise<void> => {
          while (!abortRef.current) {
            const idx = queueIdx++;
            if (idx >= queue.length) break;
            activeJobsRef.current++;
            await processOne(queue[idx]);
            activeJobsRef.current--;
          }
        };
        const workers = Array.from({ length: Math.min(WAVE_SIZE, queue.length) }, runWorker);
        await Promise.all(workers);
      }


      // ────────────────────────────────────────────────────────────────────────
      // Phase 3: Unit tests on Qwen3-32B (60 RPM — all fire at once)
      // Units whose tests were already fired early during the wave are skipped.
      // ────────────────────────────────────────────────────────────────────────
      forgeLog.endPhase("wave", { doneJobs: doneCount, errorJobs: errorJobsCount });
      forgeLog.startPhase("unit-tests");
      forgeLog.info("unit-tests", "Starting unit test generation (mop-up pass for units not yet tested)", { model: "groq/compound or gemini-3.1-flash-lite-preview" });

      // Register nodes for units that were NOT dispatched early, then run them.
      const remainingUnitTestJobs: ParallelJob[] = [];
      for (const unit of builtCurriculum.units) {
        if (unitTestDispatchedRef.current.has(unit.id)) {
          forgeLog.info("unit-tests", `${unit.id} already tested during wave — skipping`);
          continue;
        }
        unitTestDispatchedRef.current.add(unit.id);
        const testNodeId = `${unit.id}-TEST`;
        setForge((prev) => ({
          ...prev,
          totalJobs: prev.totalJobs + 1,
          nodes: {
            ...prev.nodes,
            [testNodeId]: {
              id: testNodeId, label: `📝 ${unit.id} Unit Test`,
              type: "assembly" as const, status: "pending" as NodeStatus, chars: 0,
            },
            [unit.id]: {
              ...prev.nodes[unit.id],
              children: [...(prev.nodes[unit.id]?.children ?? []), testNodeId],
            },
          },
        }));
        remainingUnitTestJobs.push({
          id: testNodeId,
          messages: [{
            role: "user" as const,
            content: buildUnitTestPrompt(courseTitle, config.subject, config.level, unit, config.depth, config.language),
          }],
          systemPrompt: "You are a curriculum assessment generator. Return ONLY raw JSON — the Assessment object. No prose, no markdown fences.",
          maxTokens: unitTestBaseTokens,
          modelOverride: forgeModelOverride,
          onChunk: (jobId, delta) => {
            setForge((prev) => {
              const node = prev.nodes[jobId];
              if (!node) return prev;
              return {
                ...prev,
                nodes: {
                  ...prev.nodes,
                  [jobId]: { ...node, chars: node.chars + delta.length, status: "running" as NodeStatus },
                },
              };
            });
          },
        });
      }

      // Worker pool for remaining unit tests.
      {
        let utIdx = 0;
        const runUTWorker = async (): Promise<void> => {
          while (!abortRef.current) {
            const idx = utIdx++;
            if (idx >= remainingUnitTestJobs.length) break;
            await processUnitTest(remainingUnitTestJobs[idx], 1);
          }
        };
        const utWorkers = Array.from({ length: Math.min(WAVE_SIZE, remainingUnitTestJobs.length || 1) }, runUTWorker);
        await Promise.all(utWorkers);
      }

      // ── Inline repair: regenerate missing formative quizzes via Groq Compound
      const lessonsNeedingQuiz: Array<{ unit: Unit; lesson: Lesson }> = [];
      for (const unit of builtCurriculum.units) {
        for (const lesson of unit.lessons) {
          const quiz = Array.isArray(lesson.assessments)
            ? lesson.assessments.find((a: { type: string }) => a.type === "formative_quiz")
            : undefined;
          // A lesson needs repair if the formative_quiz assessment is missing entirely,
          // OR if it exists but has no questions (the model generated the metadata shell
          // but truncated before filling the questions array — common with large lessons).
          const hasQuiz = quiz != null && Array.isArray((quiz as { questions?: unknown[] }).questions) && (quiz as { questions: unknown[] }).questions.length > 0;
          if (!hasQuiz) lessonsNeedingQuiz.push({ unit, lesson });
        }
      }

      if (lessonsNeedingQuiz.length > 0) {
        setForge((prev) => ({ ...prev, phase: "repair" }));
        forgeLog.endPhase("unit-tests");
        forgeLog.startPhase("repair");
        const repairRatePct = Math.round((lessonsNeedingQuiz.length / builtCurriculum.units.reduce((n, u) => n + u.lessons.length, 0)) * 100);
        forgeLog.warn("repair", `Repairing ${lessonsNeedingQuiz.length} lesson(s) missing formative quiz`, {
          count:         lessonsNeedingQuiz.length,
          total:         builtCurriculum.units.reduce((n, u) => n + u.lessons.length, 0),
          repairRatePct,
          lessons:       lessonsNeedingQuiz.map((j) => j.lesson.id),
          hint:          repairRatePct >= 20
            ? "High repair rate — quiz generation prompt or parser may be too strict; consider adjusting quiz output schema or increasing max_tokens"
            : "Some lessons were truncated before the assessments block — repair pass will fill the gaps",
        });

        // Same 16,666 token ceiling as wave — applies to both Gemini and Groq.
        const quizTokens =
          config.depth === "deep" ? 14_000 : config.depth === "standard" ? 10_000 : 5_000;
        const repairJobs: ParallelJob[] = lessonsNeedingQuiz.map(({ unit, lesson }) => {
          // Show the lesson as being repaired in the tree
          updateNode(lesson.id, { status: "repairing" });
          const unitTitle   = resolveLocale(unit.title);
          const lessonTitle = resolveLocale(lesson.title);
          const topicTitles = (lesson.topics ?? []).map((t) => resolveLocale(t.title));
          return {
            id: lesson.id,
            messages: [{
              role: "user" as const,
              content: buildFormativeQuizRepairPrompt(
                courseTitle, config.subject, config.level,
                unitTitle, lessonTitle, lesson.id, topicTitles,
                config.depth, config.language,
                config.customQuestions,
              ),
            }],
            systemPrompt: "You are a curriculum assessment generator. Return ONLY raw JSON — the Assessment object. No prose, no markdown fences.",
            maxTokens: quizTokens,
            modelOverride: forgeModelOverride,
          };
        });

        // Stagger repair jobs into small batches to avoid TPM burst against
        // rate-limited models (gpt-oss-120b has only 8K TPM).
        // With many keys fire all repairs in parallel; only batch if there are more jobs than total lanes
        const REPAIR_BATCH_SIZE = Math.max(totalLanes, repairJobs.length);
        const REPAIR_MAX_ATTEMPTS = 2;
        let pendingRepairs = repairJobs;

        for (let attempt = 1; attempt <= REPAIR_MAX_ATTEMPTS; attempt++) {
          if (abortRef.current || pendingRepairs.length === 0) break;
          const retryRepairs: ParallelJob[] = [];

          // Process in small batches to spread TPM load
          for (let bStart = 0; bStart < pendingRepairs.length; bStart += REPAIR_BATCH_SIZE) {
            if (abortRef.current) break;
            const batch = pendingRepairs.slice(bStart, bStart + REPAIR_BATCH_SIZE);
            forgeLog.info("repair", `Attempt ${attempt}/${REPAIR_MAX_ATTEMPTS}: dispatching ${batch.length} repair job(s) (batch ${Math.floor(bStart / REPAIR_BATCH_SIZE) + 1})`);
            let repairResults: Awaited<ReturnType<typeof sendParallel>>;
            try {
              repairResults = await sendParallel(batch, "generation");
            } catch (err) {
              const msg = String(err);
              if (msg.includes("ALL_RATE_LIMITED") || msg.includes("NO_KEYS")) {
                forgeLog.info(
                  "repair",
                  `Repair sendParallel threw ${msg} on attempt ${attempt} — skipping ${batch.length} repair job(s) (quota exhausted)`,
                );
                // Don't crash the run — skip this repair batch gracefully
                continue;
              }
              throw err;
            }

            for (const result of repairResults) {
              const repairModel: ModelContext = {
                provider: result.keyProvider,
                model:    result.modelId,
                keyLabel: result.keyLabel,
                keyId:    result.keyId,
              };
              if (result.error || !result.output) {
                const isRateLimit = result.error
                  ? (result.error.includes("rate limit") || result.error.includes("TPM") || result.error.includes("429") || result.error.includes("Empty response"))
                  : false;
                forgeLog.error(`repair:${result.jobId}`, "Job error", {
                  error:   result.error ?? "Empty response — no content returned",
                  attempt,
                  empty:   !result.output,
                  hint:    isRateLimit
                    ? "TPM/RPM rate limit — repair is firing too many concurrent jobs. Adding more Gemini keys will help."
                    : result.error?.includes("Empty response")
                      ? "Model returned empty body — compound/routing models excluded but all generation lanes may be saturated"
                      : "API error during repair — check key validity and model availability",
                }, repairModel);
                if (attempt < REPAIR_MAX_ATTEMPTS) {
                  const orig = pendingRepairs.find((j) => j.id === result.jobId);
                  if (orig) retryRepairs.push(orig);
                } else {
                  // Only count as a true error when all retry attempts are exhausted
                  errorJobsCount++;
                  setForge((prev) => ({ ...prev, errorJobs: prev.errorJobs + 1 }));
                }
                continue;
              }
              try {
                const assessment = JSON.parse(repairJSON(result.output));
                forgeLog.info(`repair:${result.jobId}`, `Quiz repaired OK`, {
                  attempt,
                  questions: assessment.questions?.length,
                  chars:     result.output.length,
                }, repairModel);
                builtCurriculum = {
                  ...builtCurriculum,
                  units: builtCurriculum.units.map((u) => ({
                    ...u,
                    lessons: u.lessons.map((l) =>
                      l.id === result.jobId
                        ? { ...l, assessments: [...(l.assessments ?? []), assessment] }
                        : l,
                    ),
                  })),
                };
                totalBytesGenerated += result.output.length;
                doneCount++;
                bumpModelActivity(result.modelId);
                updateNode(result.jobId, { status: "done", chars: result.output.length, modelId: result.modelId, provider: result.keyProvider });
                setForge((prev) => ({ ...prev, doneJobs: doneCount, bytesGenerated: totalBytesGenerated }));
              } catch (parseErr) {
                forgeLog.parseError(`repair:${result.jobId}`, parseErr, result.output ?? "", attempt, repairModel);
                if (attempt < REPAIR_MAX_ATTEMPTS) {
                  const orig = pendingRepairs.find((j) => j.id === result.jobId);
                  if (orig) retryRepairs.push(orig);
                } else {
                  errorJobsCount++;
                  setForge((prev) => ({ ...prev, errorJobs: prev.errorJobs + 1 }));
                }
              }
            }

            // Inter-batch pause (only fires when batch count > 1, i.e. more jobs than lanes)
            if (bStart + REPAIR_BATCH_SIZE < pendingRepairs.length) {
              await new Promise((r) => setTimeout(r, 1000));
            }
          }

          pendingRepairs = retryRepairs;
          if (retryRepairs.length > 0) await new Promise((r) => setTimeout(r, 3000));
        }
      }

      // ── Topic content repair: regenerate topics with 0 content_blocks ────────
      // Happens when a lesson was severely truncated (e.g. 1-2KB output). The
      // scaffold-drift fix restores the topic id/title/order but cannot restore
      // content_blocks or practice_questions — those must be regenerated here.
      type EmptyTopicInfo = { unit: Unit; lesson: Lesson; emptyTopics: Array<{ id: string; title: string; order: number }> };
      const lessonsWithEmptyTopics: EmptyTopicInfo[] = [];
      for (const unit of builtCurriculum.units) {
        for (const lesson of unit.lessons) {
          const empty = (lesson.topics ?? [])
            .filter((t) => !Array.isArray(t.content_blocks) || t.content_blocks.length === 0)
            .map((t) => ({ id: String(t.id), title: resolveLocale(t.title), order: Number(t.order ?? 1) }));
          if (empty.length > 0) lessonsWithEmptyTopics.push({ unit, lesson, emptyTopics: empty });
        }
      }

      if (lessonsWithEmptyTopics.length > 0) {
        forgeLog.warn("repair", `Repairing ${lessonsWithEmptyTopics.length} lesson(s) with empty topic content`, {
          count:   lessonsWithEmptyTopics.length,
          lessons: lessonsWithEmptyTopics.map((j) => j.lesson.id),
          hint:    "Topics had 0 content_blocks — lesson was severely truncated; regenerating topic content",
        });

        // Same 16,666 token ceiling as wave — applies to both Gemini and Groq.
        const topicRepairTokens =
          config.depth === "deep" ? 14_000 : config.depth === "standard" ? 10_000 : 5_000;

        const topicRepairJobs: ParallelJob[] = lessonsWithEmptyTopics.map(({ unit, lesson, emptyTopics }) => {
          updateNode(lesson.id, { status: "repairing" });
          return ({
          id: `topic-repair:${lesson.id}`,
          messages: [{
            role: "user" as const,
            content: buildTopicContentRepairPrompt(
              courseTitle, config.subject, config.level,
              resolveLocale(unit.title), resolveLocale(lesson.title), lesson.id,
              emptyTopics, config.depth, config.language,
              config.customBlocks, config.customQuestions,
            ),
          }],
          systemPrompt: "You are a curriculum content generator. Return ONLY a raw JSON array of topic objects. No prose, no markdown fences.",
          maxTokens: topicRepairTokens,
          modelOverride: forgeModelOverride,
        });
        });

        let pendingTopicRepairs = topicRepairJobs;
        const TOPIC_REPAIR_MAX_ATTEMPTS = 2;
        for (let attempt = 1; attempt <= TOPIC_REPAIR_MAX_ATTEMPTS; attempt++) {
          if (abortRef.current || pendingTopicRepairs.length === 0) break;
          const retryTopicRepairs: ParallelJob[] = [];
          let topicRepairResults: Awaited<ReturnType<typeof sendParallel>>;
          try {
            topicRepairResults = await sendParallel(pendingTopicRepairs, "generation");
          } catch (err) {
            const msg = String(err);
            if (msg.includes("ALL_RATE_LIMITED") || msg.includes("NO_KEYS")) {
              forgeLog.info("repair", `Topic repair sendParallel threw ${msg} — skipping`);
              break;
            }
            throw err;
          }
          for (const result of topicRepairResults) {
            const jobInfo = lessonsWithEmptyTopics.find((j) => `topic-repair:${j.lesson.id}` === result.jobId);
            if (!jobInfo) continue;
            const trModel: ModelContext = { provider: result.keyProvider, model: result.modelId, keyLabel: result.keyLabel, keyId: result.keyId };
            if (result.error || !result.output) {
              forgeLog.error(`repair:${result.jobId}`, "Topic repair job error", { error: result.error ?? "No output" }, trModel);
              if (attempt < TOPIC_REPAIR_MAX_ATTEMPTS) {
                const orig = pendingTopicRepairs.find((j) => j.id === result.jobId);
                if (orig) retryTopicRepairs.push(orig);
              }
              continue;
            }
            try {
              const repairedTopics = JSON.parse(repairJSON(result.output)) as Array<Record<string, unknown>>;
              // Merge repaired topics back — match by position against the empty topic list
              builtCurriculum = {
                ...builtCurriculum,
                units: builtCurriculum.units.map((u) => {
                  if (u.id !== jobInfo.unit.id) return u;
                  return {
                    ...u,
                    lessons: u.lessons.map((l) => {
                      if (l.id !== jobInfo.lesson.id) return l;
                      const updatedTopics = (l.topics ?? []).map((t) => {
                        const emptyIdx = jobInfo.emptyTopics.findIndex((et) => et.id === String(t.id));
                        if (emptyIdx === -1) return t; // not empty, keep as-is
                        const repaired = repairedTopics[emptyIdx];
                        if (!repaired) return t;
                        // Preserve scaffold id/title/order, take content from repaired
                        return { ...repaired, id: t.id, title: t.title, order: t.order };
                      });
                      return { ...l, topics: updatedTopics };
                    }),
                  };
                }),
              };
              forgeLog.info(`repair:${result.jobId}`, "Topic content repaired OK", {
                attempt,
                topics: repairedTopics.length,
                chars: result.output.length,
              }, trModel);
              updateNode(result.jobId, { status: "done", chars: result.output.length, modelId: result.modelId, provider: result.keyProvider });
            } catch (parseErr) {
              forgeLog.parseError(`repair:${result.jobId}`, parseErr, result.output ?? "", attempt, trModel);
              if (attempt < TOPIC_REPAIR_MAX_ATTEMPTS) {
                const orig = pendingTopicRepairs.find((j) => j.id === result.jobId);
                if (orig) retryTopicRepairs.push(orig);
              }
            }
          }
          pendingTopicRepairs = retryTopicRepairs;
          if (retryTopicRepairs.length > 0) await new Promise((r) => setTimeout(r, 3000));
        }
      }

      // ── Completion ──────────────────────────────────────────────────────────
      const report = validateCurriculum(builtCurriculum);
      setSchemaReport(report);
      setForgedCurriculum(builtCurriculum);

      const schemaErrors   = report.issues.filter((i) => i.severity === "error");
      const schemaWarnings = report.issues.filter((i) => i.severity === "warning");
      forgeLog.info("validate", "Schema validation", {
        passed:       report.passed,
        errors:       schemaErrors.length,
        warnings:     schemaWarnings.length,
        errorDetails: schemaErrors.map((i) => `${i.path}: ${i.message}`),
      });

      // Success = all generation jobs completed without hard errors.
      // Schema issues are surfaced via the schemaReport UI and are non-fatal.
      await forgeLog.flush({
        success: errorJobsCount === 0,
        totalJobs: totalLessons + builtCurriculum.units.length,
        errorJobs: errorJobsCount,
        bytesGenerated: totalBytesGenerated,
      });

      stopTimer();
      setForge((prev) => ({
        ...prev,
        phase: "done",
        elapsedMs: Date.now() - startTimeRef.current,
        bytesGenerated: totalBytesGenerated,
      }));

    } catch (err) {
      forgeLog.error("forge", "Outer catch", { error: String(err), stack: (err as Error)?.stack });
      await forgeLog.flush({ success: false, totalJobs: 0, errorJobs: errorJobsCount, bytesGenerated: totalBytesGenerated });
      stopTimer();
      setForge((prev) => ({
        ...prev,
        phase: "error",
        elapsedMs: Date.now() - startTimeRef.current,
        nodes: {
          ...prev.nodes,
          scaffold: prev.nodes["scaffold"]
            ? { ...prev.nodes["scaffold"], status: "error", error: (err as Error).message }
            : prev.nodes["scaffold"],
        },
      }));
    }
  }, [config, totalLanes, sendParallel, forgeModelOverride, updateNode, bumpModelActivity]);

  const resetForge = useCallback(() => {
    abortRef.current = true;
    stopTimer();
    setForge(INITIAL_FORGE);
    setSchemaReport(null);
    setForgedCurriculum(null);
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────

  const isDone     = forge.phase === "done";
  const elapsedSec = (forge.elapsedMs / 1000).toFixed(1);
  const progressPct = forge.totalJobs > 0
    ? Math.round((forge.doneJobs / forge.totalJobs) * 100)
    : 0;

  return { forge, schemaReport, forgedCurriculum, isRunning, isDone, elapsedSec, progressPct, handleForge, resetForge };
}