// ─── CurriculumForge — shared types ──────────────────────────────────────────

export type Scope = "focused" | "standard" | "comprehensive";
export type Depth = "outline" | "standard" | "deep";

// ─── Prerequisite digest ──────────────────────────────────────────────────────
// A compact, token-efficient summary of a prior course injected into the
// scaffold prompt. Never the full JSON — just what the AI needs to build on.

export interface PrereqUnit {
  title: string;
  /** Top-level lesson titles only — not topics */
  lessons: string[];
  /** Sampled topic titles (up to ~5 per unit) for vocabulary/notation cues */
  sampleTopics: string[];
}

export interface PrerequisiteDigest {
  /** Title of the prerequisite course, e.g. "Calculus 1" */
  courseTitle: string;
  subject: string;
  level: string;
  /** High-level summary: what the student can do after completing the prior course */
  exitObjectives: string[];
  /** Key vocabulary / notation established in the prior course */
  keyTerms: string[];
  units: PrereqUnit[];
}

export interface ForgeConfig {
  subject: string;
  title: string;
  level: string;
  /** Breadth of the curriculum — controls unit/lesson count */
  scope: Scope;
  /** Content richness per topic — controls block/question count */
  depth: Depth;
  /** Free-text duration hint: "8 weeks", "30 hours", "" */
  duration: string;
  /** Optional instructor notes forwarded to the scaffold AI */
  notes: string;
  /** Output language for all generated content */
  language: string;
  /** Optional digest of a prerequisite course to build upon */
  prerequisite?: PrerequisiteDigest;
  /**
   * Custom content depth overrides — when set, these take precedence over the
   * depth preset for block and question counts. Undefined = use depth defaults.
   */
  customBlocks?: number;      // content_blocks per topic (1–20)
  customQuestions?: number;   // practice_questions per topic (1–10)
}

export type NodeStatus = "pending" | "running" | "retrying" | "repairing" | "done" | "error";

export interface TreeNode {
  id: string;
  label: string;
  type: "course" | "unit" | "lesson" | "topic" | "assembly";
  status: NodeStatus;
  chars: number;
  error?: string;
  modelId?: string;   // model that generated this node's content
  provider?: string;  // api provider (gemini | groq) — fallback when modelId is empty
  children?: string[];
}

export interface ForgeState {
  phase: "idle" | "scaffold" | "wave" | "repair" | "done" | "error";
  nodes: Record<string, TreeNode>;
  rootId: string | null;
  totalJobs: number;
  doneJobs: number;
  errorJobs: number;
  bytesGenerated: number;
  lanesUsed: number;
  elapsedMs: number;
  scaffoldSnapshot: import("@/types/curriculum").Curriculum | null;
  /** The model ID that successfully generated the scaffold (set once scaffold completes) */
  scaffoldUsedModel: string | null;
  /** Live tally: modelId → number of jobs successfully completed this run */
  modelActivity: Record<string, number>;
}