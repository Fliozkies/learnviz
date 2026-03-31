"use client";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProviderType =
  | "gemini"
  | "groq"
  | "openrouter"
  | "huggingface"
  | "anthropic";

// Which jobs this key is allowed to handle
export type KeyRole =
  | "any"
  | "generation"
  | "editing"
  | "chat"
  | "scaffold"
  | "unit-test";

export interface ApiKey {
  id: string;
  provider: ProviderType;
  key: string;
  label?: string;
  model?: string;
  role: KeyRole; // NEW: routing role
  failedAt?: number;
  errorCount: number;
  lastError?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Model cost registry ──────────────────────────────────────────────────────
// Cost in USD per 1K tokens (input / output). Used for budget estimation.
// These are approximate public prices — exact prices vary by tier/region.

export interface ModelCost {
  inputPer1k: number; // USD
  outputPer1k: number; // USD
  contextWindow: number; // tokens
  tier: "free" | "cheap" | "mid" | "premium";
}

// ─── Free-tier quota registry ────────────────────────────────────────────────
// Each entry describes a Gemini model available on the free tier.
// quality: 1 = best, 5 = lowest  (used for tiered routing)
// tpmFree: tokens-per-minute limit (0 = unlimited for our purposes)
// rpdFree: requests-per-day limit  (0 = effectively unlimited)
// rpmFree: requests-per-minute limit

export interface FreeTierLimits {
  rpm: number;
  tpm: number; // 0 = effectively unlimited
  rpd: number; // 0 = effectively unlimited
  quality: number; // 1 (best) → 5 (fallback)
  taskSuit: (
    | "chat"
    | "generation"
    | "editing"
    | "any"
    | "scaffold"
    | "unit-test"
  )[]; // best roles
  contextWindow: number;
}

// Canonical model IDs exactly as Gemini API expects them
// Updated to match free-tier limits from Google AI Studio (as of 2025).
export const GEMINI_FREE_MODELS: Record<string, FreeTierLimits> = {
  // ── ONLY model for blank-model Gemini keys ────────────────────────────────
  // 10 RPM (capped from 15 for stability), 500 RPD, 250K TPM.
  // 250k TPM / 10 RPM = 25,000 tokens/call budget.
  // With N Gemini keys: N×10 RPM, N×500 RPD, N×250k TPM simultaneously.
  "gemini-3.1-flash-lite-preview": {
    rpm: 10,
    tpm: 250_000,
    rpd: 500,
    quality: 1,
    taskSuit: ["any"], // scaffold, generation, unit-test, editing, repair
    contextWindow: 1_000_000,
  },
};

// ─── Groq free-tier model registry ───────────────────────────────────────────
// Single model for blank-model Groq keys: groq/compound.
// Rate-capped at 4 RPM (70k TPM ÷ 16,666 tokens/call) to mirror
// gemini-3.1-flash-lite-preview's per-call token budget exactly.
// Groq and Gemini keys are interchangeable wave lanes — Groq is slower
// (4 RPM vs 15 RPM) but works standalone when no Gemini key is present.
export const GROQ_FREE_MODELS: Record<string, FreeTierLimits> = {
  // ── ONLY model for blank-model Groq keys ─────────────────────────────────
  // 30 RPM, 250 RPD, 70K TPM — but TPM is the binding constraint:
  //   70k TPM ÷ ~16,666 tokens/call = 4.2 safe calls/min → rpm capped at 4.
  // This matches the per-call token budget of gemini-3.1-flash-lite-preview,
  // so Groq and Gemini lanes are directly interchangeable in the wave.
  // With N Groq keys: N×4 RPM, N×250 RPD, N×70k TPM simultaneously.
  // groq/compound does internal routing with web_search + code_interpreter —
  // slower than Gemini but fully capable for all pipeline tasks.
  "groq/compound": {
    rpm: 4,
    tpm: 70_000,
    rpd: 250,
    quality: 1,
    taskSuit: ["any"], // scaffold, generation, unit-test, chat, repair
    contextWindow: 128_000,
  },
};

export const MODEL_COSTS: Record<string, ModelCost> = {
  // Gemini free (treat as $0 — using free tier)
  // gemini-2.5-flash intentionally removed — NOT on the free tier.
  "gemini-3-flash-preview": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 1_000_000,
    tier: "free",
  },
  "gemini-3.1-flash-lite-preview": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 1_000_000,
    tier: "free",
  },
  "gemini-2.5-flash-lite": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 1_000_000,
    tier: "free",
  },
  "gemini-2.5-flash-lite-preview-06-17": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 1_000_000,
    tier: "free",
  },
  // Gemini paid
  "gemini-2.5-pro": {
    inputPer1k: 0.00125,
    outputPer1k: 0.005,
    contextWindow: 1_000_000,
    tier: "mid",
  },
  "gemini-1.5-flash": {
    inputPer1k: 0.000075,
    outputPer1k: 0.0003,
    contextWindow: 1_000_000,
    tier: "cheap",
  },
  // Anthropic
  "claude-haiku-4-5-20251001": {
    inputPer1k: 0.0008,
    outputPer1k: 0.004,
    contextWindow: 200_000,
    tier: "cheap",
  },
  "claude-sonnet-4-5": {
    inputPer1k: 0.003,
    outputPer1k: 0.015,
    contextWindow: 200_000,
    tier: "mid",
  },
  "claude-opus-4-5": {
    inputPer1k: 0.015,
    outputPer1k: 0.075,
    contextWindow: 200_000,
    tier: "premium",
  },
  // OpenRouter free
  "google/gemini-2.5-flash-lite:free": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 1_000_000,
    tier: "free",
  },
  // HuggingFace
  "mistralai/Mistral-7B-Instruct-v0.3": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 32_000,
    tier: "free",
  },
  // Groq free-tier models (all $0 — rate-limited free tier)
  "openai/gpt-oss-120b": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 128_000,
    tier: "free",
  },
  "moonshotai/kimi-k2-instruct-0905": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 128_000,
    tier: "free",
  },
  "moonshotai/kimi-k2-instruct": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 128_000,
    tier: "free",
  },
  "meta-llama/llama-4-scout-17b-16e-instruct": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 128_000,
    tier: "free",
  },
  "qwen/qwen3-32b": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 128_000,
    tier: "free",
  },
  "llama-3.3-70b-versatile": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 128_000,
    tier: "free",
  },
  "llama-3.1-8b-instant": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 128_000,
    tier: "free",
  },
  "groq/compound": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 128_000,
    tier: "free",
  },
  "groq/compound-mini": {
    inputPer1k: 0,
    outputPer1k: 0,
    contextWindow: 128_000,
    tier: "free",
  },
};
function getModelCost(key: ApiKey): ModelCost {
  const model = key.model || PROVIDER_DEFAULTS[key.provider].defaultModel;
  return (
    MODEL_COSTS[model] ?? {
      inputPer1k: 0.001,
      outputPer1k: 0.004,
      contextWindow: 128_000,
      tier: "mid",
    }
  );
}

// Estimate cost of a call given rough token counts
export function estimateCost(
  key: ApiKey,
  inputTokens: number,
  outputTokens: number,
): number {
  const cost = getModelCost(key);
  return (
    (inputTokens / 1000) * cost.inputPer1k +
    (outputTokens / 1000) * cost.outputPer1k
  );
}

// Rough token estimator: ~4 chars per token
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface KeyExportBundle {
  version: 1;
  exportedAt: number;
  keys: ApiKey[];
  sessionTokenBudget: number;
  sessionBudget: number;
}

export interface AIContext {
  keys: ApiKey[];
  addKey: (key: Omit<ApiKey, "id" | "errorCount">) => void;
  removeKey: (id: string) => void;
  reorderKeys: (ids: string[]) => void;
  updateKey: (id: string, patch: Partial<ApiKey>) => void;
  exportKeys: () => void;
  importKeys: (bundle: KeyExportBundle, mode: "merge" | "replace") => void;
  // Sequential chat send — tries keys in order, fallback chain intact
  send: (
    messages: ChatMessage[],
    systemPrompt: string,
    onChunk: (delta: string) => void,
    maxTokens?: number,
    role?: KeyRole,
    modelOverride?: string,
    abortSignal?: AbortSignal,
  ) => Promise<void>;
  // Parallel patch jobs — runs N jobs concurrently, one per available key
  sendParallel: (
    jobs: ParallelJob[],
    jobRole: KeyRole,
  ) => Promise<ParallelResult[]>;
  activeKeyId: string | null;
  // Quota info for UI display
  getFreeTierLanes: () => Array<{
    keyId: string;
    keyLabel: string;
    modelId: string;
    rpdRemaining: number;
    rpmRemaining: number;
    quality: number;
  }>;
  // Token budget (works for free and paid keys alike)
  sessionTokenBudget: number; // 0 = unlimited
  setSessionTokenBudget: (v: number) => void;
  sessionTokensUsed: number;
  addTokens: (n: number) => void;
  resetTokens: () => void;
  // USD budget (optional — only meaningful for paid keys)
  sessionBudget: number; // USD — 0 means unlimited
  setSessionBudget: (v: number) => void;
  sessionSpend: number; // USD accumulated this session
  addSpend: (usd: number) => void;
  resetSpend: () => void;
  // Key counts — used by forge engine to scale speculative batches
  groqKeyCount: number;
  geminiKeyCount: number;
}

export interface ParallelJob {
  id: string;
  messages: ChatMessage[];
  systemPrompt: string;
  maxTokens?: number;
  /**
   * When set, every lane assignment for this job will be pinned to this model.
   * The model name is propagated to onLaneAssigned and to the API call, so it
   * always appears in logs and is never shown as "(key default)".
   * Use this to guarantee a specific model regardless of key configuration.
   */
  modelOverride?: string;
  onChunk?: (jobId: string, delta: string) => void;
  /** Called once per attempt with the key×model chosen for this job */
  onLaneAssigned?: (
    jobId: string,
    provider: string,
    modelId: string | undefined,
    keyLabel: string | undefined,
    attempt: number,
  ) => void;
}

export interface ParallelResult {
  jobId: string;
  output: string;
  keyId: string;
  keyLabel?: string; // human label for the key (for error messages)
  keyProvider?: string; // provider name (for error messages)
  modelId?: string; // resolved model that handled this job
  error?: string;
}

// ─── Provider defaults ────────────────────────────────────────────────────────

export const PROVIDER_DEFAULTS: Record<
  ProviderType,
  {
    label: string;
    placeholder: string;
    defaultModel: string;
    modelLabel: string;
    modelPlaceholder: string;
    docs: string;
  }
> = {
  gemini: {
    label: "Google Gemini",
    placeholder: "AIza...",
    defaultModel: "gemini-3.1-flash-lite-preview",
    modelLabel: "Model (leave blank = auto-routed)",
    modelPlaceholder: "auto (smart routing enabled)",
    docs: "https://aistudio.google.com/apikey",
  },
  groq: {
    label: "Groq",
    placeholder: "gsk_...",
    defaultModel: "groq/compound",
    modelLabel: "Model",
    modelPlaceholder: "groq/compound",
    docs: "https://console.groq.com/keys",
  },
  openrouter: {
    label: "OpenRouter",
    placeholder: "sk-or-...",
    defaultModel: "google/gemini-2.5-flash-lite:free",
    modelLabel: "Model ID",
    modelPlaceholder: "google/gemini-2.5-flash-lite:free",
    docs: "https://openrouter.ai/keys",
  },
  huggingface: {
    label: "Hugging Face",
    placeholder: "hf_...",
    defaultModel: "mistralai/Mistral-7B-Instruct-v0.3",
    modelLabel: "Model ID",
    modelPlaceholder: "mistralai/Mistral-7B-Instruct-v0.3",
    docs: "https://huggingface.co/settings/tokens",
  },
  anthropic: {
    label: "Anthropic Claude",
    placeholder: "sk-ant-...",
    defaultModel: "claude-haiku-4-5-20251001",
    modelLabel: "Model",
    modelPlaceholder: "claude-haiku-4-5-20251001",
    docs: "https://console.anthropic.com/keys",
  },
};

// ─── API call implementations ─────────────────────────────────────────────────

// ─── Per-model quota tracker (client-side, localStorage-backed) ───────────────
// Tracks (key_id × model) pairs independently. Each Gemini key can call
// any model, so a single key yields N independent lanes — one per model.

const QUOTA_STORE_KEY = "learnviz_model_quota";

interface QuotaEntry {
  // Rolling per-minute window
  minuteRequests: number[]; // timestamps of requests in last 60s
  // Rolling per-day window (UTC day boundary)
  dayRequests: number[]; // timestamps of requests today
}

type QuotaStore = Record<string, QuotaEntry>; // key: `${keyId}::${modelId}`

function loadQuotaStore(): QuotaStore {
  try {
    return JSON.parse(localStorage.getItem(QUOTA_STORE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveQuotaStore(store: QuotaStore) {
  try {
    localStorage.setItem(QUOTA_STORE_KEY, JSON.stringify(store));
  } catch {}
}

function quotaKey(keyId: string, modelId: string) {
  return `${keyId}::${modelId}`;
}

function pruneEntry(entry: QuotaEntry): QuotaEntry {
  const now = Date.now();
  const minuteAgo = now - 60_000;
  // Day boundary: midnight UTC
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const dayStart = todayStart.getTime();
  return {
    minuteRequests: entry.minuteRequests.filter((t) => t > minuteAgo),
    dayRequests: entry.dayRequests.filter((t) => t >= dayStart),
  };
}

// Returns true if this (keyId, modelId) lane can accept a request right now
function laneAvailable(
  store: QuotaStore,
  keyId: string,
  modelId: string,
): boolean {
  const limits = GEMINI_FREE_MODELS[modelId] ?? GROQ_FREE_MODELS[modelId];
  if (!limits) return true; // non-free model, no tracking
  const entry = pruneEntry(
    store[quotaKey(keyId, modelId)] ?? { minuteRequests: [], dayRequests: [] },
  );
  if (limits.rpm > 0 && entry.minuteRequests.length >= limits.rpm) return false;
  if (limits.rpd > 0 && entry.dayRequests.length >= limits.rpd) return false;
  return true;
}

// Record a request against a lane
function recordRequest(
  store: QuotaStore,
  keyId: string,
  modelId: string,
): QuotaStore {
  const k = quotaKey(keyId, modelId);
  const entry = pruneEntry(store[k] ?? { minuteRequests: [], dayRequests: [] });
  const now = Date.now();
  const updated: QuotaEntry = {
    minuteRequests: [...entry.minuteRequests, now],
    dayRequests: [...entry.dayRequests, now],
  };
  return { ...store, [k]: updated };
}

// ─── Per-lane cooldown store ──────────────────────────────────────────────────
// Tracks `cooldownUntil` timestamps keyed by `${keyId}::${modelId}`.
// Separate from the quota store so it lives only in memory (cooldowns reset
// on page reload — fine, since Groq limits are minute-scale).
const laneCooldowns: Record<string, number> = {};

export function setLaneCooldown(
  keyId: string,
  modelId: string,
  untilMs: number,
) {
  laneCooldowns[`${keyId}::${modelId}`] = untilMs;
}

function laneIsWarmedUp(keyId: string, modelId: string): boolean {
  const until = laneCooldowns[`${keyId}::${modelId}`] ?? 0;
  return Date.now() >= until;
}

// ─── Smart lane picker ────────────────────────────────────────────────────────
// Scores every (key × model) candidate and picks the highest-scoring available
// lane.  Score = quality_weight × quality_term
//              + tpm_weight    × tpm_headroom_fraction
//              + rpd_weight    × rpd_headroom_fraction
// This naturally rotates across keys as each saturates, and promotes
// higher-quality models when all else is equal.

export interface Lane {
  key: ApiKey;
  modelId: string;
  limits: FreeTierLimits;
}

const SCORE_W = { quality: 0.5, tpm: 0.3, rpd: 0.2 } as const;

export function pickBestLane(
  keys: ApiKey[],
  role: KeyRole,
  store: QuotaStore,
  estimatedOutputTokens: number,
  estimatedInputTokens = 0,
): Lane | null {
  type Candidate = Lane & { score: number };
  const candidates: Candidate[] = [];
  const now = Date.now();

  for (const key of keys) {
    const isGemini = key.provider === "gemini";
    const isGroq = key.provider === "groq";
    if (!isGemini && !isGroq) continue;

    const freeModels = isGemini ? GEMINI_FREE_MODELS : GROQ_FREE_MODELS;

    // Pinned model not in the free registry → treat as unlimited fixed lane
    const pinnedModel = key.model;
    if (pinnedModel && !freeModels[pinnedModel]) {
      candidates.push({
        key,
        modelId: pinnedModel,
        limits: {
          rpm: 999,
          tpm: 999_999,
          rpd: 999_999,
          quality: 2,
          taskSuit: ["any"],
          contextWindow: 1_000_000,
        },
        score: 0.6, // mid-tier default
      });
      continue;
    }

    // Blank Gemini key → ONLY gemini-3.1-flash-lite-preview, never iterate all
    // registry keys (that caused other models to be picked and badged as "gemini"
    // with no model name in the UI). Blank Groq key → ONLY groq/compound.
    const defaultModel = isGemini
      ? "gemini-3.1-flash-lite-preview"
      : "groq/compound";
    const modelsToTry = pinnedModel ? [pinnedModel] : [defaultModel];

    for (const modelId of modelsToTry) {
      const limits = freeModels[modelId];
      if (!limits) continue;

      // Context window check — output must fit
      if (estimatedOutputTokens > limits.contextWindow * 0.8) continue;

      // Hard TPM cap: for Groq, TPM is total tokens (input + output) per minute.
      // If a single request would exceed the TPM limit, this lane can't serve it
      // regardless of headroom — skip it rather than letting it fail at the API.
      const isGroqModel = !GEMINI_FREE_MODELS[modelId];
      const estimatedTotalTokens =
        estimatedOutputTokens + (isGroqModel ? estimatedInputTokens : 0);
      if (limits.tpm > 0 && estimatedTotalTokens > limits.tpm) continue;

      // Cooldown check (precise per-error cooldown from Groq headers)
      if (!laneIsWarmedUp(key.id, modelId)) continue;

      // Quota check (rpm / rpd)
      if (!laneAvailable(store, key.id, modelId)) continue;

      // Role suitability — model's taskSuit is the hard gate.
      // A key with role="any" does NOT override a model restricted to "chat";
      // that was the bug that let groq/compound get picked for generation jobs
      // and return empty every time. keySuitsRole is still checked so that
      // keys explicitly pinned to a role (e.g. role="scaffold") are not
      // assigned to unrelated jobs even if the model would normally allow it.
      const modelSuitsRole =
        limits.taskSuit.includes("any") ||
        limits.taskSuit.includes(role as KeyRole);
      const keySuitsRole = key.role === "any" || key.role === role;
      if (!modelSuitsRole) continue; // model restriction wins
      if (!keySuitsRole && !modelSuitsRole) continue; // key restriction (redundant but explicit)

      // Key failure cooldown (global key-level, e.g. auth errors)
      if (key.failedAt && now - key.failedAt < 60_000) continue;

      const qk = quotaKey(key.id, modelId);
      const entry = pruneEntry(
        store[qk] ?? { minuteRequests: [], dayRequests: [] },
      );

      // Headroom fractions (0 = exhausted, 1 = fresh)
      const tpmHeadroom =
        limits.tpm > 0 ? Math.max(0, 1 - estimatedTotalTokens / limits.tpm) : 1;
      const rpmHeadroom =
        limits.rpm > 0
          ? Math.max(0, (limits.rpm - entry.minuteRequests.length) / limits.rpm)
          : 1;
      const rpdHeadroom =
        limits.rpd > 0
          ? Math.max(0, (limits.rpd - entry.dayRequests.length) / limits.rpd)
          : 1;

      // Quality term: best quality (1) → score contribution 1.0; worst (5) → 0.2
      const qualityTerm = 1 / limits.quality;

      const score =
        SCORE_W.quality * qualityTerm +
        SCORE_W.tpm * Math.min(tpmHeadroom, rpmHeadroom) +
        SCORE_W.rpd * rpdHeadroom;

      candidates.push({ key, modelId, limits, score });
    }
  }

  if (candidates.length === 0) return null;

  // Pick highest score; tie-break on rpdHeadroom for even spreading
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// Exported for UI components to read quota state
export function getQuotaStore(): QuotaStore {
  return loadQuotaStore();
}
export function getRemainingRpd(keyId: string, modelId: string): number {
  const limits = GEMINI_FREE_MODELS[modelId] ?? GROQ_FREE_MODELS[modelId];
  if (!limits) return 9999;
  const store = loadQuotaStore();
  const entry = pruneEntry(
    store[quotaKey(keyId, modelId)] ?? { minuteRequests: [], dayRequests: [] },
  );
  return Math.max(0, limits.rpd - entry.dayRequests.length);
}
export function getRemainingRpm(keyId: string, modelId: string): number {
  const limits = GEMINI_FREE_MODELS[modelId] ?? GROQ_FREE_MODELS[modelId];
  if (!limits) return 9999;
  const store = loadQuotaStore();
  const entry = pruneEntry(
    store[quotaKey(keyId, modelId)] ?? { minuteRequests: [], dayRequests: [] },
  );
  return Math.max(0, limits.rpm - entry.minuteRequests.length);
}

// Returns ms until the next RPM slot opens for this lane.
// 0 means a slot is available right now.
export function getNextRpmSlotMs(keyId: string, modelId: string): number {
  const limits = GEMINI_FREE_MODELS[modelId] ?? GROQ_FREE_MODELS[modelId];
  if (!limits) return 0;
  const store = loadQuotaStore();
  const entry = pruneEntry(
    store[quotaKey(keyId, modelId)] ?? { minuteRequests: [], dayRequests: [] },
  );
  const rpmLeft = limits.rpm - entry.minuteRequests.length;
  if (rpmLeft > 0) return 0;
  // Oldest timestamp in the current window — expires in 60s from when it was recorded
  if (entry.minuteRequests.length === 0) return 0;
  return Math.max(0, entry.minuteRequests[0] + 60_000 - Date.now());
}

async function callGemini(
  apiKey: ApiKey,
  messages: ChatMessage[],
  systemPrompt: string,
  onChunk: (delta: string) => void,
  maxTokens = 2048,
  modelOverride?: string,
): Promise<void> {
  const model =
    modelOverride || apiKey.model || "gemini-3.1-flash-lite-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey.key}`;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody?.error?.message || `HTTP ${res.status}`;
    const retryMatch = message.match(/retry in ([\d.]+)s/i);
    const retrySeconds = retryMatch
      ? Math.ceil(parseFloat(retryMatch[1]))
      : undefined;
    throw Object.assign(new Error(message), {
      status: res.status,
      retrySeconds,
    });
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const parsed = JSON.parse(json);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) onChunk(text);
        if (parsed?.error) {
          const msg = parsed.error.message || "Gemini stream error";
          throw Object.assign(new Error(msg), {
            status: parsed.error.code ?? 500,
          });
        }
      } catch (e) {
        if ((e as Error).message?.includes("Gemini")) throw e;
      }
    }
  }
}

async function callOpenRouter(
  apiKey: ApiKey,
  messages: ChatMessage[],
  systemPrompt: string,
  onChunk: (delta: string) => void,
  maxTokens = 2048,
): Promise<void> {
  const model = apiKey.model || "google/gemini-2.5-flash-lite:free";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.key}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "LearnViz Study Assistant",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error(err?.error?.message || `HTTP ${res.status}`),
      { status: res.status },
    );
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const delta = JSON.parse(json)?.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {}
    }
  }
}

async function callHuggingFace(
  apiKey: ApiKey,
  messages: ChatMessage[],
  systemPrompt: string,
  onChunk: (delta: string) => void,
  maxTokens = 2048,
): Promise<void> {
  const model = apiKey.model || "mistralai/Mistral-7B-Instruct-v0.3";
  const res = await fetch(
    `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
        max_tokens: maxTokens,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error(err?.error?.message || `HTTP ${res.status}`),
      { status: res.status },
    );
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const delta = JSON.parse(json)?.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {}
    }
  }
}

async function callAnthropic(
  apiKey: ApiKey,
  messages: ChatMessage[],
  systemPrompt: string,
  onChunk: (delta: string) => void,
  maxTokens = 2048,
): Promise<void> {
  const model = apiKey.model || "claude-haiku-4-5-20251001";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error(err?.error?.message || `HTTP ${res.status}`),
      { status: res.status },
    );
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json) continue;
      try {
        const parsed = JSON.parse(json);
        if (parsed.type === "content_block_delta")
          onChunk(parsed.delta?.text ?? "");
      } catch {}
    }
  }
}

// Hard output-token caps per Groq model (enforced by the API).
// Requests exceeding these limits are rejected outright.
const GROQ_MODEL_MAX_OUTPUT: Record<string, number> = {
  "groq/compound": 8_192, // API hard cap
  "groq/compound-mini": 8_192, // API hard cap
};
// For models where TPM = total tokens (input + output), we must reserve
// headroom for the input prompt. groq/compound has 70K TPM — with a
// ~8-13K input prompt the output budget is well within the 8,192 hard cap.
// This map stores per-model TPM ceilings for additional output clamping.
const GROQ_MODEL_TPM_CEILING: Record<string, number> = {
  // groq/compound: 70K TPM is large enough that no additional clamping needed
};
const GROQ_DEFAULT_MAX_OUTPUT = 8_192;

async function callGroq(
  apiKey: ApiKey,
  messages: ChatMessage[],
  systemPrompt: string,
  onChunk: (delta: string) => void,
  maxTokens = 2048,
  modelOverride?: string,
): Promise<void> {
  const model = modelOverride || apiKey.model || "groq/compound";

  // Clamp to the model's hard output cap.
  const modelCap = GROQ_MODEL_MAX_OUTPUT[model] ?? GROQ_DEFAULT_MAX_OUTPUT;
  let clampedMaxTokens = Math.min(maxTokens, modelCap);

  // For TPM-constrained models (e.g. gpt-oss-120b at 8K TPM), further clamp
  // so that estimated_input + max_output never exceeds the TPM ceiling.
  // estimateTokens counts ~4 chars/token — good enough for a safety margin.
  const tpmCeiling = GROQ_MODEL_TPM_CEILING[model];
  if (tpmCeiling) {
    const inputEst = Math.ceil(
      (systemPrompt.length +
        messages.reduce((s, m) => s + m.content.length, 0)) /
        4,
    );
    const outputBudget = Math.max(256, tpmCeiling - inputEst);
    clampedMaxTokens = Math.min(clampedMaxTokens, outputBudget);
  }

  // groq/compound and groq/compound-mini require the compound_custom field
  // to enable their built-in tools (web_search, code_interpreter, visit_website).
  const isCompound =
    model === "groq/compound" || model === "groq/compound-mini";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
      max_tokens: clampedMaxTokens,
      ...(isCompound && {
        compound_custom: {
          tools: {
            enabled_tools: ["web_search", "code_interpreter", "visit_website"],
          },
        },
      }),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error(err?.error?.message || `HTTP ${res.status}`),
      { status: res.status },
    );
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const delta = JSON.parse(json)?.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {}
    }
  }
}

// ─── Low-level dispatcher ─────────────────────────────────────────────────────

async function callKey(
  key: ApiKey,
  messages: ChatMessage[],
  systemPrompt: string,
  onChunk: (delta: string) => void,
  maxTokens: number,
  modelOverride?: string,
): Promise<void> {
  if (key.provider === "gemini")
    return callGemini(
      key,
      messages,
      systemPrompt,
      onChunk,
      maxTokens,
      modelOverride,
    );
  if (key.provider === "groq")
    return callGroq(
      key,
      messages,
      systemPrompt,
      onChunk,
      maxTokens,
      modelOverride,
    );
  if (key.provider === "openrouter")
    return callOpenRouter(key, messages, systemPrompt, onChunk, maxTokens);
  if (key.provider === "huggingface")
    return callHuggingFace(key, messages, systemPrompt, onChunk, maxTokens);
  if (key.provider === "anthropic")
    return callAnthropic(key, messages, systemPrompt, onChunk, maxTokens);
  throw new Error(`Unknown provider: ${key.provider}`);
}

// ─── Rate limit helpers ───────────────────────────────────────────────────────

function isRateLimitError(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  if (e.status === 429 || e.status === 503) return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("limit: 0") ||
    msg.includes("exceeded") ||
    // Groq "Request too large ... on tokens per minute (TPM)" — treat as a
    // rate-limit so the retry loop blacklists this lane and picks one with
    // more TPM headroom instead of hard-failing the job.
    msg.includes("request too large")
  );
}

// Model-not-found and similar errors mean this (key × model) lane is invalid.
// We should skip it and try the next lane rather than crashing the whole forge.
function isSkippableLaneError(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  if (e.status === 404 || e.status === 400) return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("is not found") ||
    msg.includes("not supported") ||
    msg.includes("does not exist") ||
    msg.includes("invalid model") ||
    msg.includes("listmodels")
  );
}

function retrySecondsFromError(err: unknown): number {
  const e = err as { retrySeconds?: number; message?: string };
  if (e.retrySeconds) return e.retrySeconds;
  // Groq surfaces exact cooldown: "Please try again in 29.88s" or "in 285ms"
  const secMatch = (e.message ?? "").match(/try again in ([\d.]+)s/i);
  if (secMatch) return Math.ceil(parseFloat(secMatch[1]));
  const msMatch = (e.message ?? "").match(/try again in ([\d.]+)ms/i);
  if (msMatch) return Math.max(1, Math.ceil(parseFloat(msMatch[1]) / 1000));
  const retryMatch = (e.message ?? "").match(/retry in ([\d.]+)s/i);
  if (retryMatch) return Math.ceil(parseFloat(retryMatch[1]));
  return 60;
}

// Parse the exact cooldown Groq embeds in its error messages so we can un-park
// the lane precisely instead of waiting a flat 60 s.
export function parseCooldownMs(errMsg: string): number {
  // Groq format: "Please try again in 29.88s"
  const secMatch = errMsg.match(/try again in ([\d.]+)s/i);
  if (secMatch) return Math.ceil(parseFloat(secMatch[1]) * 1000);
  const msMatch = errMsg.match(/try again in ([\d.]+)ms/i);
  if (msMatch) return Math.ceil(parseFloat(msMatch[1]));
  // Gemini format: "Please retry in 46.22s"
  const retrySecMatch = errMsg.match(/retry in ([\d.]+)s/i);
  if (retrySecMatch) return Math.ceil(parseFloat(retrySecMatch[1]) * 1000);
  return 60_000;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const Ctx = createContext<AIContext | null>(null);

const STORAGE_KEY = "learnviz_ai_keys";
const BUDGET_KEY = "learnviz_session_budget";
const TOKEN_BUDGET_KEY = "learnviz_token_budget";

function loadKeys(): ApiKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: ApiKey[] = raw ? JSON.parse(raw) : [];
    // Backfill role for keys saved before this field existed
    return parsed.map((k) => ({ ...k, role: k.role ?? "any" }));
  } catch {
    return [];
  }
}

function saveKeys(keys: ApiKey[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {}
}

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [keys, setKeys] = useState<ApiKey[]>(loadKeys);
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);
  const [sessionBudget, setSessionBudgetState] = useState<number>(() => {
    try {
      return parseFloat(localStorage.getItem(BUDGET_KEY) ?? "0") || 0;
    } catch {
      return 0;
    }
  });
  const [sessionSpend, setSessionSpend] = useState(0);
  const [sessionTokenBudget, setSessionTokenBudgetState] = useState<number>(
    () => {
      try {
        return parseInt(localStorage.getItem(TOKEN_BUDGET_KEY) ?? "0") || 0;
      } catch {
        return 0;
      }
    },
  );
  const [sessionTokensUsed, setSessionTokensUsed] = useState(0);
  const isFirstRender = useRef(true);
  // Quota store is read/written from localStorage directly to avoid
  // re-render churn — it's updated on every API call and read before each.
  const quotaStoreRef = useRef<QuotaStore>(loadQuotaStore());
  function syncQuota(updated: QuotaStore) {
    quotaStoreRef.current = updated;
    saveQuotaStore(updated);
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    saveKeys(keys);
  }, [keys]);

  const setSessionBudget = useCallback((v: number) => {
    setSessionBudgetState(v);
    try {
      localStorage.setItem(BUDGET_KEY, String(v));
    } catch {}
  }, []);

  const addSpend = useCallback((usd: number) => {
    setSessionSpend((s) => s + usd);
  }, []);

  const resetSpend = useCallback(() => setSessionSpend(0), []);

  const setSessionTokenBudget = useCallback((v: number) => {
    setSessionTokenBudgetState(v);
    try {
      localStorage.setItem(TOKEN_BUDGET_KEY, String(v));
    } catch {}
  }, []);

  const addTokens = useCallback((n: number) => {
    setSessionTokensUsed((t) => t + n);
  }, []);

  const resetTokens = useCallback(() => setSessionTokensUsed(0), []);

  const addKey = useCallback((k: Omit<ApiKey, "id" | "errorCount">) => {
    const newKey: ApiKey = {
      ...k,
      role: k.role ?? "any",
      id: crypto.randomUUID(),
      errorCount: 0,
    };
    setKeys((prev) => {
      const next = [...prev, newKey];
      saveKeys(next);
      return next;
    });
  }, []);

  const removeKey = useCallback((id: string) => {
    setKeys((prev) => {
      const next = prev.filter((k) => k.id !== id);
      saveKeys(next);
      return next;
    });
  }, []);

  const exportKeys = useCallback(() => {
    const bundle: KeyExportBundle = {
      version: 1,
      exportedAt: Date.now(),
      keys,
      sessionTokenBudget,
      sessionBudget,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `learnviz-keys-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [keys, sessionTokenBudget, sessionBudget]);

  const importKeys = useCallback(
    (bundle: KeyExportBundle, mode: "merge" | "replace") => {
      if (!bundle?.keys || !Array.isArray(bundle.keys)) return;
      const incoming: ApiKey[] = bundle.keys.map((k) => ({
        ...k,
        id: k.id ?? crypto.randomUUID(),
        errorCount: 0,
        failedAt: undefined,
        lastError: undefined,
      }));
      setKeys((prev) => {
        if (mode === "replace") return incoming;
        // merge: skip keys whose `key` value already exists
        const existingKeyValues = new Set(prev.map((k) => k.key));
        const fresh = incoming.filter((k) => !existingKeyValues.has(k.key));
        return [...prev, ...fresh];
      });
      if (bundle.sessionTokenBudget)
        setSessionTokenBudget(bundle.sessionTokenBudget);
      if (bundle.sessionBudget) setSessionBudget(bundle.sessionBudget);
    },
    [setSessionTokenBudget, setSessionBudget],
  );

  const reorderKeys = useCallback((ids: string[]) => {
    setKeys((prev) => {
      const map = Object.fromEntries(prev.map((k) => [k.id, k]));
      const next = ids.map((id) => map[id]).filter(Boolean);
      saveKeys(next);
      return next;
    });
  }, []);

  const updateKey = useCallback((id: string, patch: Partial<ApiKey>) => {
    setKeys((prev) => {
      const next = prev.map((k) => (k.id === id ? { ...k, ...patch } : k));
      saveKeys(next);
      return next;
    });
  }, []);

  // ─── Sequential send (chat fallback chain — unchanged behaviour) ────────────

  const send = useCallback(
    async (
      messages: ChatMessage[],
      systemPrompt: string,
      onChunk: (delta: string) => void,
      maxTokens = 2048,
      role: KeyRole = "chat",
      modelOverride?: string,
      abortSignal?: AbortSignal,
    ) => {
      const now = Date.now();
      // ── Budget pre-checks ──────────────────────────────────────────────────
      const inputEst = estimateTokens(
        systemPrompt + messages.map((m) => m.content).join(""),
      );
      const estimatedTotal = inputEst + maxTokens;

      if (
        sessionTokenBudget > 0 &&
        sessionTokensUsed + estimatedTotal > sessionTokenBudget
      )
        throw new Error(`TOKEN_BUDGET_EXCEEDED:${sessionTokenBudget}`);

      // ── Try Gemini lanes — exhaust ALL available (key × model) lanes before giving up ──
      // Key insight: with N keys × M models we have N×M independent quota buckets.
      // We must iterate through ALL of them, not just pick one and fall through.
      const geminiKeys = keys.filter(
        (k) =>
          k.provider === "gemini" && (!k.failedAt || now - k.failedAt > 60_000),
      );

      let lastGeminiErr: unknown;
      let workingStore = { ...quotaStoreRef.current };

      // ── When a specific model is requested, route directly to any available
      // Gemini key using that model — bypass pickBestLane entirely so that
      // taskSuit/role filtering cannot silently swap the model out from under us.
      if (
        modelOverride &&
        GEMINI_FREE_MODELS[modelOverride] &&
        geminiKeys.length > 0
      ) {
        const key = geminiKeys[0];
        setActiveKeyId(key.id);
        try {
          const cost = estimateCost(key, inputEst, maxTokens);
          if (sessionBudget > 0 && sessionSpend + cost > sessionBudget)
            throw new Error(`BUDGET_EXCEEDED:${sessionBudget.toFixed(4)}`);
          await callKey(
            key,
            messages,
            systemPrompt,
            onChunk,
            maxTokens,
            modelOverride,
          );
          const committed = recordRequest(
            quotaStoreRef.current,
            key.id,
            modelOverride,
          );
          syncQuota(committed);
          addTokens(estimatedTotal);
          addSpend(cost);
          updateKey(key.id, {
            failedAt: undefined,
            errorCount: 0,
            lastError: undefined,
          });
          setActiveKeyId(null);
          return;
        } catch (err) {
          setActiveKeyId(null);
          // Surface directly — don't silently fall through when user requested a specific model
          throw err;
        }
      }

      // ── When a specific Groq model is requested, route directly to any
      // available Groq key — same bypass logic as Gemini above.
      if (modelOverride && GROQ_FREE_MODELS[modelOverride]) {
        const groqKeys = keys.filter(
          (k) =>
            k.provider === "groq" && (!k.failedAt || now - k.failedAt > 60_000),
        );
        if (groqKeys.length > 0) {
          const key = groqKeys[0];
          setActiveKeyId(key.id);
          try {
            const cost = estimateCost(key, inputEst, maxTokens);
            if (sessionBudget > 0 && sessionSpend + cost > sessionBudget)
              throw new Error(`BUDGET_EXCEEDED:${sessionBudget.toFixed(4)}`);
            await callKey(
              key,
              messages,
              systemPrompt,
              onChunk,
              maxTokens,
              modelOverride,
            );
            const committed = recordRequest(
              quotaStoreRef.current,
              key.id,
              modelOverride,
            );
            syncQuota(committed);
            addTokens(estimatedTotal);
            addSpend(cost);
            updateKey(key.id, {
              failedAt: undefined,
              errorCount: 0,
              lastError: undefined,
            });
            setActiveKeyId(null);
            return;
          } catch (err) {
            setActiveKeyId(null);
            throw err;
          }
        }
      }

      while (geminiKeys.length > 0) {
        if (abortSignal?.aborted) throw new Error("ABORTED");

        const lane = pickBestLane(
          geminiKeys,
          role,
          workingStore,
          maxTokens,
          inputEst,
        );
        if (!lane) break; // No more viable lanes

        setActiveKeyId(lane.key.id);
        try {
          const cost = estimateCost(lane.key, inputEst, maxTokens);
          if (sessionBudget > 0 && sessionSpend + cost > sessionBudget)
            throw new Error(`BUDGET_EXCEEDED:${sessionBudget.toFixed(4)}`);

          await callKey(
            lane.key,
            messages,
            systemPrompt,
            onChunk,
            maxTokens,
            lane.modelId,
          );

          // Commit quota usage and clear failure state
          const committed = recordRequest(
            quotaStoreRef.current,
            lane.key.id,
            lane.modelId,
          );
          syncQuota(committed);
          addTokens(estimatedTotal);
          addSpend(cost);
          updateKey(lane.key.id, {
            failedAt: undefined,
            errorCount: 0,
            lastError: undefined,
          });
          setActiveKeyId(null);
          return; // ✓ success
        } catch (err) {
          setActiveKeyId(null);
          if (
            (err as Error).message?.startsWith("BUDGET_EXCEEDED") ||
            (err as Error).message?.startsWith("TOKEN_BUDGET_EXCEEDED")
          )
            throw err;

          lastGeminiErr = err;

          if (isRateLimitError(err)) {
            const retrySecs = retrySecondsFromError(err);
            updateKey(lane.key.id, {
              failedAt: Date.now(),
              errorCount: lane.key.errorCount + 1,
              lastError: `Rate limited — retry in ${retrySecs}s`,
            });
            // Mark this lane used so pickBestLane won't re-select it
            workingStore = recordRequest(
              workingStore,
              lane.key.id,
              lane.modelId,
            );
            syncQuota(workingStore);
            // Continue loop — try next best lane
          } else if (isSkippableLaneError(err)) {
            // Model not found / invalid — skip this lane silently and try next
            workingStore = recordRequest(
              workingStore,
              lane.key.id,
              lane.modelId,
            );
            syncQuota(workingStore);
            // Continue loop — try next best lane
          } else {
            throw err; // Non-rate-limit error: propagate immediately
          }
        }
      }

      // ── Fallback: non-Gemini keys in priority order ────────────────────────
      const fallbackKeys = keys.filter(
        (k) =>
          k.provider !== "gemini" &&
          (!k.failedAt || now - k.failedAt > 60_000) &&
          (k.role === "any" || k.role === role),
      );

      if (fallbackKeys.length === 0) {
        if (keys.length === 0) throw new Error("NO_KEYS");
        // Include useful context: which models were tried
        const retrySecs = lastGeminiErr
          ? retrySecondsFromError(lastGeminiErr)
          : 60;
        throw Object.assign(new Error(`ALL_RATE_LIMITED:${retrySecs}`), {
          retrySeconds: retrySecs,
        });
      }

      let lastErr: unknown;
      for (const key of fallbackKeys) {
        setActiveKeyId(key.id);
        try {
          const cost = estimateCost(key, inputEst, maxTokens);
          if (sessionBudget > 0 && sessionSpend + cost > sessionBudget)
            throw new Error(`BUDGET_EXCEEDED:${sessionBudget.toFixed(4)}`);

          await callKey(
            key,
            messages,
            systemPrompt,
            onChunk,
            maxTokens,
            modelOverride,
          );
          addTokens(estimatedTotal);
          addSpend(cost);
          updateKey(key.id, {
            failedAt: undefined,
            errorCount: 0,
            lastError: undefined,
          });
          setActiveKeyId(null);
          return;
        } catch (err) {
          lastErr = err;
          if (
            (err as Error).message?.startsWith("BUDGET_EXCEEDED") ||
            (err as Error).message?.startsWith("TOKEN_BUDGET_EXCEEDED")
          ) {
            setActiveKeyId(null);
            throw err;
          }
          if (isRateLimitError(err)) {
            const retrySecs = retrySecondsFromError(err);
            const cooldownMs = retrySecs * 1000;
            updateKey(key.id, {
              failedAt: Date.now(),
              errorCount: key.errorCount + 1,
              lastError: `Rate limited — retry in ${retrySecs}s`,
            });
            if (retrySecs < 60)
              updateKey(key.id, {
                failedAt: Date.now() - (60_000 - cooldownMs),
              });
            continue;
          }
          setActiveKeyId(null);
          throw err;
        }
      }

      setActiveKeyId(null);
      const retrySecs = retrySecondsFromError(lastErr);
      throw Object.assign(new Error(`ALL_RATE_LIMITED:${retrySecs}`), {
        retrySeconds: retrySecs,
      });
    },
    [
      keys,
      updateKey,
      sessionTokenBudget,
      sessionTokensUsed,
      addTokens,
      sessionBudget,
      sessionSpend,
      addSpend,
    ],
  );

  // ─── Parallel send — smart multi-lane dispatch ──────────────────────────────
  // Assigns each job to the best available (key × model) lane independently.
  // Multiple jobs can share the same key if they use different models
  // (different rate-limit buckets). Falls back to non-Gemini keys for overflow.
  //
  // Empty-output retry: if a lane returns an empty string (no error thrown,
  // but no content) we treat it as a transient lane failure, blacklist that
  // (key × model) pair for 60 s, and retry the job on the next best lane up
  // to PARALLEL_EMPTY_RETRIES times before giving up and surfacing an error.

  const PARALLEL_EMPTY_RETRIES = 3;

  const sendParallel = useCallback(
    async (
      jobs: ParallelJob[],
      jobRole: KeyRole,
    ): Promise<ParallelResult[]> => {
      const now = Date.now();

      // Shared across all jobs in this sendParallel call.
      // When any job finds a lane returning empty, that keyId::modelId pair is
      // added here so sibling jobs skip it immediately in assignLane, instead of
      // each job independently burning through the same exhausted lanes.
      const sharedEmptyBlacklist = new Set<string>();

      // ── Lane assignment helper ────────────────────────────────────────────
      // Uses a mutable copy of the quota store so sequential assignments pick
      // different lanes (optimistic depletion).
      function assignLane(
        job: ParallelJob,
        workingStore: QuotaStore,
        blacklist: Set<string>, // "${keyId}::${modelId}" entries to skip
      ): {
        key: ApiKey;
        modelId: string | undefined;
        updatedStore: QuotaStore;
      } | null {
        // Merge per-job blacklist with the shared cross-job empty-lane blacklist
        // so a lane that returned empty for any sibling job is also skipped here.
        const effectiveBlacklist =
          blacklist.size === 0 && sharedEmptyBlacklist.size === 0
            ? blacklist
            : new Set([...blacklist, ...sharedEmptyBlacklist]);
        const outputEst = job.maxTokens ?? 6000;
        const inputEst = estimateTokens(
          (job.systemPrompt ?? "") +
            job.messages.map((m) => m.content).join(""),
        );

        const managedKeys = keys.filter(
          (k) =>
            (k.provider === "gemini" || k.provider === "groq") &&
            (!k.failedAt || now - k.failedAt > 60_000),
        );

        // ── job.modelOverride fast-path ───────────────────────────────────────
        // When a job pins a specific model (e.g. "gemini-3.1-flash-lite-preview"),
        // skip pickBestLane and find the best key for that exact model directly.
        // This guarantees the model name is always propagated — no "(key default)".
        if (job.modelOverride) {
          const overrideModel = job.modelOverride;
          const isGeminiOverride = !!(
            GEMINI_FREE_MODELS[overrideModel] ||
            overrideModel.startsWith("gemini")
          );
          const provider = isGeminiOverride ? "gemini" : "groq";
          const targetKeys = managedKeys.filter((k) => k.provider === provider);

          // First: prefer a key with headroom on both RPM and RPD.
          for (const key of targetKeys) {
            const blKey = `${key.id}::${overrideModel}`;
            if (effectiveBlacklist.has(blKey)) continue;
            if (!laneIsWarmedUp(key.id, overrideModel)) continue;
            if (!laneAvailable(workingStore, key.id, overrideModel)) continue;
            const updated = recordRequest(workingStore, key.id, overrideModel);
            return { key, modelId: overrideModel, updatedStore: updated };
          }

          // Second: any non-blacklisted target key (quota may be exhausted but let
          // the API call surface the exact error so retry/cooldown logic can act).
          const anyTarget = targetKeys.find(
            (k) => !effectiveBlacklist.has(`${k.id}::${overrideModel}`),
          );
          if (anyTarget)
            return {
              key: anyTarget,
              modelId: overrideModel,
              updatedStore: workingStore,
            };

          // No target-provider keys at all — fall through to normal lane selection
          // so Groq can serve if Gemini keys are absent (and vice versa).
        }

        // Temporarily mark blacklisted lanes as saturated in the working store
        // by bumping their minuteRequests past the rpm limit.
        const storeWithBlacklist = { ...workingStore };
        for (const bl of effectiveBlacklist) {
          const [, bModelId] = bl.split("::");
          const limits =
            GEMINI_FREE_MODELS[bModelId] ?? GROQ_FREE_MODELS[bModelId];
          if (!limits) continue;
          const entry = storeWithBlacklist[bl] ?? {
            minuteRequests: [],
            dayRequests: [],
          };
          // Saturate the rpm bucket so pickBestLane skips this lane
          const saturated = Array.from({ length: limits.rpm + 1 }, () =>
            Date.now(),
          );
          storeWithBlacklist[bl] = { ...entry, minuteRequests: saturated };
        }

        const lane = pickBestLane(
          managedKeys,
          jobRole,
          storeWithBlacklist,
          outputEst,
          inputEst,
        );
        if (lane) {
          const updated = recordRequest(
            workingStore,
            lane.key.id,
            lane.modelId,
          );
          return {
            key: lane.key,
            modelId: lane.modelId,
            updatedStore: updated,
          };
        }

        // Fallback: round-robin over non-managed eligible keys.
        // Preserve job.modelOverride so the model name stays visible in logs.
        const fallback = keys.filter(
          (k) =>
            k.provider !== "gemini" &&
            k.provider !== "groq" &&
            (!k.failedAt || now - k.failedAt > 60_000) &&
            (k.role === "any" || k.role === jobRole),
        );
        if (fallback.length > 0) {
          const idx = Math.floor(Math.random() * fallback.length);
          return {
            key: fallback[idx],
            modelId: job.modelOverride,
            updatedStore: workingStore,
          };
        }

        // Last resort: any available key.
        // Preserve job.modelOverride so the model name stays visible in logs.
        const anyKey = keys.find(
          (k) => !k.failedAt || now - k.failedAt > 60_000,
        );
        if (anyKey)
          return {
            key: anyKey,
            modelId: job.modelOverride,
            updatedStore: workingStore,
          };

        return null;
      }

      // ── Initial assignments ───────────────────────────────────────────────
      let workingStore = { ...quotaStoreRef.current };
      const assignments: Array<{
        job: ParallelJob;
        key: ApiKey;
        modelId?: string;
      }> = [];

      // Two-pass assignment: first pass is optimistic; jobs that couldn't be
      // assigned (all lanes on cooldown due to workingStore saturation) get a
      // second attempt after a brief wait for RPM windows to roll over.
      const unassignedJobs: ParallelJob[] = [];
      for (const job of jobs) {
        const result = assignLane(job, workingStore, new Set());
        if (result) {
          workingStore = result.updatedStore;
          assignments.push({ job, key: result.key, modelId: result.modelId });
        } else {
          unassignedJobs.push(job);
        }
      }

      // Second pass: wait up to 62 s for the oldest RPM slot to expire, then retry
      if (unassignedJobs.length > 0) {
        // Find shortest remaining cooldown across all lane cooldowns
        const earliestCooldownExpiry = Math.min(
          ...Object.values(laneCooldowns).filter((t) => t > Date.now()),
          Date.now() + 62_000, // max wait
        );
        const waitMs = Math.max(1_000, earliestCooldownExpiry - Date.now());
        await new Promise((r) => setTimeout(r, waitMs));
        // Fresh working store after the wait (quota windows may have rolled)
        const freshStore = { ...quotaStoreRef.current };
        let secondWorkingStore = { ...freshStore };
        for (const job of unassignedJobs) {
          const result = assignLane(job, secondWorkingStore, new Set());
          if (result) {
            secondWorkingStore = result.updatedStore;
            assignments.push({ job, key: result.key, modelId: result.modelId });
          } else {
            // Absolute last resort: any non-failed key, no quota check
            const anyKey = keys.find(
              (k) => !k.failedAt || now - k.failedAt > 60_000,
            );
            if (anyKey) {
              // Lock to the canonical model for this provider — never Object.keys()[0]
              // which was causing arbitrary model selection and the "just gemini" badge.
              const fallbackModel =
                anyKey.model ||
                (anyKey.provider === "groq"
                  ? "groq/compound"
                  : "gemini-3.1-flash-lite-preview");
              assignments.push({ job, key: anyKey, modelId: fallbackModel });
            }
          }
        }
      }

      if (assignments.length === 0)
        throw new Error(keys.length === 0 ? "NO_KEYS" : "ALL_RATE_LIMITED");

      // ── Execute with per-job empty-output retry ───────────────────────────
      const finalResults: ParallelResult[] = [];

      await Promise.allSettled(
        assignments.map(
          async ({
            job,
            key: initialKey,
            modelId: initialModelId,
          }): Promise<void> => {
            // Per-job blacklist: lanes that returned empty for this job
            const emptyBlacklist = new Set<string>();
            let currentKey = initialKey;
            let currentModelId = initialModelId;

            for (
              let attempt = 0;
              attempt <= PARALLEL_EMPTY_RETRIES;
              attempt++
            ) {
              let output = "";
              let callError: Error | undefined;

              // Notify caller which lane is being tried (enables forge-level logging)
              job.onLaneAssigned?.(
                job.id,
                currentKey.provider,
                currentModelId,
                currentKey.label,
                attempt,
              );

              try {
                await callKey(
                  currentKey,
                  job.messages,
                  job.systemPrompt,
                  (delta) => {
                    output += delta;
                    job.onChunk?.(job.id, delta);
                  },
                  job.maxTokens ?? 6000,
                  currentModelId,
                );
              } catch (err) {
                callError = err as Error;
                // Parse precise Groq cooldown from error message and park the lane
                if (currentModelId && isRateLimitError(err)) {
                  const cooldownMs = parseCooldownMs(
                    (err as Error).message ?? "",
                  );
                  setLaneCooldown(
                    currentKey.id,
                    currentModelId,
                    Date.now() + cooldownMs,
                  );
                }
              }

              // Track quota for successful calls
              if (!callError) {
                const inputEst = estimateTokens(
                  job.systemPrompt +
                    job.messages.map((m) => m.content).join(""),
                );
                addTokens(inputEst + (job.maxTokens ?? 6000));
                addSpend(
                  estimateCost(currentKey, inputEst, job.maxTokens ?? 6000),
                );
                if (
                  currentModelId &&
                  (GEMINI_FREE_MODELS[currentModelId] ||
                    GROQ_FREE_MODELS[currentModelId])
                ) {
                  syncQuota(
                    recordRequest(
                      quotaStoreRef.current,
                      currentKey.id,
                      currentModelId,
                    ),
                  );
                }
              }

              // ── Success: non-empty output, no error ───────────────────────
              if (!callError && output.trim().length > 0) {
                finalResults.push({
                  jobId: job.id,
                  output,
                  keyId: currentKey.id,
                  keyLabel: currentKey.label,
                  keyProvider: currentKey.provider,
                  modelId: currentModelId,
                });
                return;
              }

              // ── Failure: error thrown ─────────────────────────────────────
              if (callError) {
                if (attempt >= PARALLEL_EMPTY_RETRIES) {
                  finalResults.push({
                    jobId: job.id,
                    output: "",
                    keyId: currentKey.id,
                    keyLabel: currentKey.label,
                    keyProvider: currentKey.provider,
                    modelId: currentModelId,
                    error: callError.message ?? "Unknown error",
                  });
                  return;
                }
                // Rate-limit: park this lane, immediately try a different one.
                // Only wait if no other lane is currently available — with many
                // keys there is almost always a free lane so waiting is wasteful.
                if (isRateLimitError(callError)) {
                  if (currentModelId) {
                    emptyBlacklist.add(`${currentKey.id}::${currentModelId}`);
                    sharedEmptyBlacklist.add(
                      `${currentKey.id}::${currentModelId}`,
                    );
                  }
                  // Try to find a fresh lane right now, before any wait
                  const immediateReassignment = assignLane(
                    job,
                    { ...quotaStoreRef.current },
                    emptyBlacklist,
                  );
                  if (immediateReassignment) {
                    // Another lane is free — switch to it with no delay
                    currentKey = immediateReassignment.key;
                    currentModelId = immediateReassignment.modelId;
                  } else {
                    // All lanes currently saturated — wait out the actual cooldown
                    // then try again. Cap raised to 70 s to cover Gemini's ~46 s
                    // windows without re-hitting 429 on the first retry.
                    const cooldownMs = parseCooldownMs(callError.message ?? "");
                    const waitMs = Math.min(cooldownMs + 500, 70_000);
                    await new Promise((r) => setTimeout(r, waitMs));
                    const rlReassignment = assignLane(
                      job,
                      { ...quotaStoreRef.current },
                      emptyBlacklist,
                    );
                    if (rlReassignment) {
                      currentKey = rlReassignment.key;
                      currentModelId = rlReassignment.modelId;
                    }
                  }
                  // else: no lane found even after wait — loop hits attempt limit
                } else if (isSkippableLaneError(callError)) {
                  // Model not found / deprecated / invalid — blacklist this lane
                  // and immediately reassign to a different one (no wait needed).
                  if (currentModelId) {
                    emptyBlacklist.add(`${currentKey.id}::${currentModelId}`);
                    sharedEmptyBlacklist.add(
                      `${currentKey.id}::${currentModelId}`,
                    );
                  }
                  const skipReassignment = assignLane(
                    job,
                    { ...quotaStoreRef.current },
                    emptyBlacklist,
                  );
                  if (skipReassignment) {
                    currentKey = skipReassignment.key;
                    currentModelId = skipReassignment.modelId;
                  } else {
                    finalResults.push({
                      jobId: job.id,
                      output: "",
                      keyId: currentKey.id,
                      keyLabel: currentKey.label,
                      keyProvider: currentKey.provider,
                      modelId: currentModelId,
                      error: callError.message ?? "Unknown error",
                    });
                    return;
                  }
                } else {
                  // Non-rate-limit, non-skippable hard error — surface immediately
                  finalResults.push({
                    jobId: job.id,
                    output: "",
                    keyId: currentKey.id,
                    keyLabel: currentKey.label,
                    keyProvider: currentKey.provider,
                    modelId: currentModelId,
                    error: callError.message ?? "Unknown error",
                  });
                  return;
                }
              }

              // ── Empty output (no error): blacklist this lane, reassign ─────
              if (!callError && output.trim().length === 0) {
                const laneKey = `${currentKey.id}::${currentModelId ?? "unknown"}`;
                emptyBlacklist.add(laneKey);
                // Also propagate to the shared blacklist so sibling jobs skip
                // this lane immediately without independently discovering it's empty.
                sharedEmptyBlacklist.add(laneKey);
                // Park the lane for 10 s so other jobs don't reuse it immediately.
                // Short cooldown — empty responses are usually transient quota blips,
                // and with a single key there are no alternative lanes to fall back to,
                // so a 60 s park would stall the entire wave.
                if (currentModelId)
                  setLaneCooldown(
                    currentKey.id,
                    currentModelId,
                    Date.now() + 10_000,
                  );

                if (attempt >= PARALLEL_EMPTY_RETRIES) {
                  finalResults.push({
                    jobId: job.id,
                    output: "",
                    keyId: currentKey.id,
                    keyLabel: currentKey.label,
                    keyProvider: currentKey.provider,
                    modelId: currentModelId,
                    error: `Empty response after ${attempt + 1} attempt(s) — model returned no content (lane: ${currentModelId ?? currentKey.provider})`,
                  });
                  return;
                }

                // Reassign to a different lane
                const reassignment = assignLane(
                  job,
                  { ...quotaStoreRef.current },
                  emptyBlacklist,
                );
                if (!reassignment) {
                  finalResults.push({
                    jobId: job.id,
                    output: "",
                    keyId: currentKey.id,
                    keyLabel: currentKey.label,
                    keyProvider: currentKey.provider,
                    modelId: currentModelId,
                    error: `Empty response and no alternative lanes available (tried ${emptyBlacklist.size} lane(s))`,
                  });
                  return;
                }

                currentKey = reassignment.key;
                currentModelId = reassignment.modelId;
                await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
              }
            }

            // Exhausted all retries
            finalResults.push({
              jobId: job.id,
              output: "",
              keyId: currentKey.id,
              keyLabel: currentKey.label,
              keyProvider: currentKey.provider,
              modelId: currentModelId,
              error: `All ${PARALLEL_EMPTY_RETRIES + 1} parallel attempts failed for job "${job.id}"`,
            });
          },
        ),
      );

      // Return results in the same order as input jobs
      return jobs.map((job) => {
        const found = finalResults.find((r) => r.jobId === job.id);
        return (
          found ?? {
            jobId: job.id,
            output: "",
            keyId: "",
            error: "Job result missing — internal dispatch error",
          }
        );
      });
    },
    [keys, addTokens, addSpend],
  );

  const getFreeTierLanes = useCallback(() => {
    const lanes: Array<{
      keyId: string;
      keyLabel: string;
      modelId: string;
      rpdRemaining: number;
      rpmRemaining: number;
      quality: number;
    }> = [];
    const store = loadQuotaStore();
    for (const key of keys) {
      const isGemini = key.provider === "gemini";
      const isGroq = key.provider === "groq";
      if (!isGemini && !isGroq) continue;

      const freeModels = isGemini ? GEMINI_FREE_MODELS : GROQ_FREE_MODELS;
      const modelsToCheck =
        key.model && freeModels[key.model]
          ? [key.model]
          : Object.keys(freeModels);

      for (const modelId of modelsToCheck) {
        const limits = freeModels[modelId];
        if (!limits) continue;
        const entry = pruneEntry(
          store[quotaKey(key.id, modelId)] ?? {
            minuteRequests: [],
            dayRequests: [],
          },
        );
        lanes.push({
          keyId: key.id,
          keyLabel: key.label || key.provider,
          modelId,
          rpdRemaining: Math.max(0, limits.rpd - entry.dayRequests.length),
          rpmRemaining: Math.max(0, limits.rpm - entry.minuteRequests.length),
          quality: limits.quality,
        });
      }
    }
    return lanes.sort(
      (a, b) => a.quality - b.quality || b.rpdRemaining - a.rpdRemaining,
    );
  }, [keys]);

  return (
    <Ctx.Provider
      value={{
        keys,
        addKey,
        removeKey,
        reorderKeys,
        updateKey,
        exportKeys,
        importKeys,
        send,
        sendParallel,
        activeKeyId,
        getFreeTierLanes,
        sessionTokenBudget,
        setSessionTokenBudget,
        sessionTokensUsed,
        addTokens,
        resetTokens,
        sessionBudget,
        setSessionBudget,
        sessionSpend,
        addSpend,
        resetSpend,
        groqKeyCount: keys.filter((k) => k.provider === "groq").length,
        geminiKeyCount: keys.filter((k) => k.provider === "gemini").length,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAI() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAI must be used inside AIProvider");
  return ctx;
}
