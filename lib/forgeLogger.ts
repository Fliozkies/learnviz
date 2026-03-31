// ─── Forge Debug Logger ───────────────────────────────────────────────────────
// Accumulates structured log entries during a Forge run.
//
// Improvements over v1:
//   • debug level — verbose detail gated behind window.__FORGE_DEBUG = true
//   • phase timing — startPhase/endPhase record elapsed per phase
//   • model/key context — every entry can carry { model, provider, keyLabel }
//   • parseError() — includes snippet around the error position + diagnosis
//   • httpError()  — captures HTTP status, response body slice, retryable flag
//   • laneAssigned() — records which key×model was chosen per job
//   • callSuccess() — records chars, attempt, duration
//   • per-entry seq number — unambiguous ordering in async logs
//   • loadLastEntries() — for UI log viewer consumption
//   • log rotation — keeps one previous run in localStorage

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface ModelContext {
  provider?: string;
  model?: string;
  keyLabel?: string;
  keyId?: string;
}

export interface LogEntry {
  seq: number;        // monotonic within the run
  ts: number;         // ms since forge start
  wall: string;       // ISO wall clock
  level: LogLevel;
  phase: string;      // top-level phase: scaffold | speculate | wave | unit-tests | repair | forge
  stage: string;      // fine-grained stage, e.g. "lesson:U01-L02"
  msg: string;
  model?: ModelContext;
  data?: unknown;
}

export interface PhaseTimer {
  name: string;
  startMs: number;
}

const LS_KEY      = "lv-forge-latest-log";
const LS_PREV_KEY = "lv-forge-prev-log";

function isDebugEnabled(): boolean {
  try {
    return (
      process.env.NODE_ENV === "development" &&
      typeof window !== "undefined" &&
      (window as unknown as Record<string, unknown>).__FORGE_DEBUG === true
    );
  } catch {
    return false;
  }
}

class ForgeLogger {
  private entries: LogEntry[] = [];
  private startMs = 0;
  private seq = 0;
  private activePhaseTimer: PhaseTimer | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start() {
    this.entries = [];
    this.startMs = Date.now();
    this.seq = 0;
    this.activePhaseTimer = null;
    this._push("info", "logger", "logger", "Forge run started");
  }

  // ── Phase timing ─────────────────────────────────────────────────────────

  startPhase(phase: string) {
    if (this.activePhaseTimer) {
      const elapsed = Date.now() - this.activePhaseTimer.startMs;
      this._push("debug", this.activePhaseTimer.name, "timer",
        `Phase ended`, { elapsedMs: elapsed });
    }
    this.activePhaseTimer = { name: phase, startMs: Date.now() };
    this._push("info", phase, "timer", `Phase started: ${phase}`);
  }

  endPhase(phase: string, data?: unknown) {
    const elapsed = this.activePhaseTimer?.name === phase
      ? Date.now() - this.activePhaseTimer.startMs
      : null;
    this.activePhaseTimer = null;
    this._push("info", phase, "timer", `Phase complete: ${phase}`, {
      ...(elapsed !== null ? { elapsedMs: elapsed } : {}),
      ...(data != null ? (data as object) : {}),
    });
  }

  // ── Core log methods ─────────────────────────────────────────────────────

  info (phase: string, msg: string, data?: unknown, model?: ModelContext) {
    this._push("info",  phase, phase, msg, data, model);
  }
  warn (phase: string, msg: string, data?: unknown, model?: ModelContext) {
    this._push("warn",  phase, phase, msg, data, model);
  }
  error(phase: string, msg: string, data?: unknown, model?: ModelContext) {
    this._push("error", phase, phase, msg, data, model);
  }
  debug(phase: string, msg: string, data?: unknown, model?: ModelContext) {
    if (!isDebugEnabled()) return;
    this._push("debug", phase, phase, msg, data, model);
  }

  // ── Structured helpers ───────────────────────────────────────────────────

  /** Which key×model was selected for a job */
  laneAssigned(phase: string, jobId: string, model: ModelContext) {
    this._push("debug", phase, phase, `Lane assigned`, { jobId }, model);
  }

  /** HTTP-level error with status code and body */
  httpError(
    phase: string,
    msg: string,
    opts: { status?: number; body?: string; retryable?: boolean; attempt?: number },
    model?: ModelContext,
  ) {
    this._push("error", phase, phase, msg, {
      httpStatus:   opts.status,
      responseBody: opts.body?.slice(0, 400),
      retryable:    opts.retryable ?? false,
      attempt:      opts.attempt,
    }, model);
  }

  /** JSON parse failure with snippet around error position and diagnosis */
  parseError(
    phase: string,
    err: unknown,
    raw: string,
    attempt: number,
    model?: ModelContext,
  ) {
    const errMsg   = String(err);
    const posMatch = errMsg.match(/at position (\d+)/);
    const pos      = posMatch ? parseInt(posMatch[1], 10) : -1;
    const snippet  = pos >= 0
      ? raw.slice(Math.max(0, pos - 80), pos + 80)
      : raw.slice(0, 300);

    this._push("error", phase, phase, `JSON parse failed (attempt ${attempt})`, {
      error:    errMsg,
      chars:    raw.length,
      errorPos: pos >= 0 ? pos : undefined,
      snippet:  snippet || "(empty response)",
      hint:     _diagnoseParseError(errMsg, raw, pos),
    }, model);
  }

  /** Successful API call */
  callSuccess(
    phase: string,
    opts: { chars: number; attempt: number; durationMs?: number },
    model?: ModelContext,
  ) {
    this._push("info", phase, phase, `Response received`, {
      chars:      opts.chars,
      attempt:    opts.attempt,
      durationMs: opts.durationMs,
      empty:      opts.chars === 0,
    }, model);
  }

  // ── Private core ─────────────────────────────────────────────────────────

  private _push(
    level: LogLevel,
    phase: string,
    stage: string,
    msg: string,
    data?: unknown,
    model?: ModelContext,
  ) {
    const safeModel: ModelContext | undefined =
      model && Object.keys(model).length > 0
        ? { ...model, keyLabel: redactKeyLabel(model.keyLabel) }
        : undefined;

    const entry: LogEntry = {
      seq:   ++this.seq,
      ts:    Date.now() - this.startMs,
      wall:  new Date().toISOString(),
      level,
      phase,
      stage,
      msg,
      ...(safeModel ? { model: safeModel } : {}),
      ...(data !== undefined ? { data } : {}),
    };
    this.entries.push(entry);

    const tag   = `[Forge:${stage}]`;
    const mTag  = model?.model ? ` <${model.provider ?? "?"}/${model.model}>` : "";
    const label = `${tag}${mTag} ${msg}`;

    if      (level === "error") console.error(label, data ?? "");
    else if (level === "warn")  console.warn(label,  data ?? "");
    else if (level === "debug") console.debug(label, data ?? "");
    else                        console.log(label,   data ?? "");
  }

  // ── Flush / persist ──────────────────────────────────────────────────────

  async flush(summary: {
    success: boolean;
    totalJobs: number;
    errorJobs: number;
    bytesGenerated: number;
  }) {
    this._push("info", "logger", "logger", "Forge run ended", summary);

    const counts = this.entries.reduce(
      (acc, e) => { acc[e.level] = (acc[e.level] ?? 0) + 1; return acc; },
      {} as Record<LogLevel, number>,
    );

    const log = {
      generated:  new Date().toISOString(),
      durationMs: Date.now() - this.startMs,
      summary: { ...summary, logCounts: counts },
      entries: this.entries,
    };

    const json = JSON.stringify(log, null, 2);

    // Rotate: save current → prev before overwriting
    try {
      const prev = localStorage.getItem(LS_KEY);
      if (prev) localStorage.setItem(LS_PREV_KEY, prev);
    } catch { /* ignore */ }

    try {
      localStorage.setItem(LS_KEY, json);
      console.log("[ForgeLogger] Saved to localStorage:", LS_KEY);
    } catch {
      console.warn("[ForgeLogger] localStorage write failed");
    }

    try {
      const res = await fetch("/api/forge-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
      });
      if (res.ok) {
        const { path } = await res.json();
        console.log("[ForgeLogger] Written to disk:", path);
      } else if (res.status === 404) {
        console.warn("[ForgeLogger] API route not found (404) — log in localStorage only.");
      } else {
        console.warn("[ForgeLogger] API route error:", res.status);
      }
    } catch (err) {
      console.warn("[ForgeLogger] Could not reach API route:", err);
    }

    return log;
  }

  // ── Download ─────────────────────────────────────────────────────────────

  download(which: "latest" | "prev" = "latest") {
    try {
      const key = which === "prev" ? LS_PREV_KEY : LS_KEY;
      const raw = localStorage.getItem(key);
      if (!raw) { console.warn("[ForgeLogger] No log found for:", key); return; }
      const blob = new Blob([raw], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = which === "prev" ? "prev_log.json" : "latest_log.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.warn("[ForgeLogger] Download failed:", err);
    }
  }

  // ── Static accessors ─────────────────────────────────────────────────────

  static loadLast(): unknown | null {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  static loadLastEntries(): LogEntry[] {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const log = JSON.parse(raw);
      return Array.isArray(log.entries) ? log.entries : [];
    } catch { return []; }
  }

  getEntries():   LogEntry[] { return [...this.entries]; }
  getErrors():    LogEntry[] { return this.entries.filter((e) => e.level === "error"); }
  getWarnings():  LogEntry[] { return this.entries.filter((e) => e.level === "warn" || e.level === "error"); }
}

// ── Key redaction ─────────────────────────────────────────────────────────────

/** Show only the last 4 chars of an API key label so keys never appear in logs. */
function redactKeyLabel(label: string | undefined): string | undefined {
  if (!label) return label;
  // If the label looks like it contains an actual key (long token after whitespace or
  // is itself a long alphanumeric string), redact all but the last 4 chars.
  const parts = label.trim().split(/\s+/);
  const redacted = parts.map((part) =>
    part.length > 8 ? `…${part.slice(-4)}` : part,
  );
  return redacted.join(" ");
}

// ── Parse error diagnosis ──────────────────────────────────────────────────────

function _diagnoseParseError(errMsg: string, raw: string, pos: number): string {
  if (raw.trim().length === 0)
    return "Empty response — model returned nothing (rate limit, quota exhausted, or network drop)";
  if (errMsg.includes("double-quoted property name"))
    return "Unquoted or single-quoted object key — model deviated from JSON spec (fixable by jsonRepair)";
  if (errMsg.includes("Unexpected end"))
    return "Truncated response — model hit max_tokens ceiling or stream was cut";
  if (errMsg.includes("Unexpected token")) {
    const around = pos >= 0 ? raw.slice(Math.max(0, pos - 5), pos + 5) : "";
    if (around.includes("'")) return "Single-quoted string value — model used single quotes instead of double quotes";
    return `Unexpected token near position ${pos}: "${around.trim()}"`;
  }
  if (errMsg.includes("trailing comma") || errMsg.includes("Unexpected ,"))
    return "Trailing comma before } or ] — common in GPT-style output (fixable by jsonRepair)";
  return "Unknown parse error — inspect snippet field for context";
}

export const forgeLog = new ForgeLogger();