// ─── Curriculum patch engine ─────────────────────────────────────────────────
// Uses a minimal JSON Patch-inspired format (RFC 6902 subset).
// Every edit — human or AI — goes through applyPatches() so undo/redo is free.

import { Curriculum } from "@/types/curriculum";

export interface CurriculumPatch {
  op: "replace" | "add" | "remove";
  path: string;       // e.g. "/units/0/lessons/1/title"
  value?: unknown;    // required for replace/add
  _prev?: unknown;    // filled in automatically for undo
}

export interface HistoryEntry {
  patches: CurriculumPatch[];
  inversePatches: CurriculumPatch[];
  label: string;      // e.g. "Edit lesson title", "AI: Rewrite intro"
  timestamp: number;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function parsePath(path: string): (string | number)[] {
  return path
    .split("/")
    .filter(Boolean)
    .map((seg) => (/^\d+$/.test(seg) ? parseInt(seg, 10) : seg));
}

function getAt(obj: unknown, segs: (string | number)[]): unknown {
  let cur = obj;
  for (const seg of segs) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}

function setAt(obj: unknown, segs: (string | number)[], value: unknown): unknown {
  if (segs.length === 0) return value;
  const [head, ...tail] = segs;
  if (Array.isArray(obj)) {
    const copy = [...obj];
    copy[head as number] = setAt(copy[head as number], tail, value);
    return copy;
  }
  const rec = obj as Record<string, unknown>;
  return { ...rec, [head]: setAt(rec[head as string], tail, value) };
}

function removeAt(obj: unknown, segs: (string | number)[]): unknown {
  if (segs.length === 0) return undefined;
  const [head, ...tail] = segs;
  if (Array.isArray(obj)) {
    if (tail.length === 0) {
      const copy = [...obj];
      copy.splice(head as number, 1);
      return copy;
    }
    const copy = [...obj];
    copy[head as number] = removeAt(copy[head as number], tail);
    return copy;
  }
  const rec = { ...(obj as Record<string, unknown>) };
  if (tail.length === 0) {
    delete rec[head as string];
  } else {
    rec[head as string] = removeAt(rec[head as string], tail);
  }
  return rec;
}

// ─── Apply a list of patches immutably ───────────────────────────────────────

export function applyPatches(
  curriculum: Curriculum,
  patches: CurriculumPatch[],
): { next: Curriculum; inversePatches: CurriculumPatch[] } {
  const inversePatches: CurriculumPatch[] = [];
  let cur: unknown = curriculum;

  for (const patch of patches) {
    const segs = parsePath(patch.path);
    const prev = getAt(cur, segs);

    if (patch.op === "replace") {
      inversePatches.push({ op: "replace", path: patch.path, value: prev, _prev: patch.value });
      cur = setAt(cur, segs, patch.value);
    } else if (patch.op === "add") {
      // For array targets, splice in at the given index (JSON Patch RFC 6902).
      // The special segment "-" means append to end.
      const parentSegs = segs.slice(0, -1);
      const lastSeg = segs[segs.length - 1];
      const parent = getAt(cur, parentSegs);
      if (Array.isArray(parent)) {
        const insertIdx = lastSeg === "-" ? parent.length : (lastSeg as number);
        inversePatches.push({ op: "remove", path: patch.path, _prev: patch.value });
        const newArr = [...parent];
        newArr.splice(insertIdx, 0, patch.value);
        cur = setAt(cur, parentSegs, newArr);
      } else {
        // Non-array: plain property assignment
        inversePatches.push({ op: "remove", path: patch.path, _prev: patch.value });
        cur = setAt(cur, segs, patch.value);
      }
    } else if (patch.op === "remove") {
      inversePatches.push({ op: "add", path: patch.path, value: prev });
      cur = removeAt(cur, segs);
    }
  }

  return { next: cur as Curriculum, inversePatches };
}

// ─── Undo/redo stack (max 100 entries) ───────────────────────────────────────

export class UndoStack {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private readonly maxSize = 100;

  push(entry: HistoryEntry) {
    this.past.push(entry);
    if (this.past.length > this.maxSize) this.past.shift();
    this.future = []; // clear redo on new action
  }

  undo(curriculum: Curriculum): { next: Curriculum; label: string } | null {
    const entry = this.past.pop();
    if (!entry) return null;
    const { next } = applyPatches(curriculum, entry.inversePatches);
    this.future.push(entry);
    return { next, label: entry.label };
  }

  redo(curriculum: Curriculum): { next: Curriculum; label: string } | null {
    const entry = this.future.pop();
    if (!entry) return null;
    const { next } = applyPatches(curriculum, entry.patches);
    this.past.push(entry);
    return { next, label: entry.label };
  }

  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }
  undoLabel() { return this.past[this.past.length - 1]?.label ?? ""; }
  redoLabel() { return this.future[this.future.length - 1]?.label ?? ""; }
  clear() { this.past = []; this.future = []; }
}

// ─── Extract a subtree for AI context (token-efficient) ───────────────────────
// Given a path like "/units/0/lessons/1", returns just that subtree.
// If path is empty, returns the whole curriculum (only for ghost authoring etc.)

export function extractSubtree(curriculum: Curriculum, path: string): unknown {
  if (!path) return curriculum;
  const segs = parsePath(path);
  return getAt(curriculum, segs);
}

// ─── Validate that AI patches look sane before applying ──────────────────────

export function validatePatches(patches: unknown): CurriculumPatch[] {
  if (!Array.isArray(patches)) throw new Error("Patches must be an array");
  return patches.map((p, i) => {
    if (typeof p !== "object" || p === null) throw new Error(`Patch ${i} is not an object`);
    const patch = p as Record<string, unknown>;
    if (!["replace", "add", "remove"].includes(patch.op as string))
      throw new Error(`Patch ${i}: invalid op "${patch.op}"`);
    if (typeof patch.path !== "string" || !patch.path.startsWith("/"))
      throw new Error(`Patch ${i}: path must start with /`);
    if (patch.op !== "remove" && patch.value === undefined)
      throw new Error(`Patch ${i}: replace/add require value`);
    return patch as unknown as CurriculumPatch;
  });
}

// ─── Build diff summary for display ──────────────────────────────────────────

export interface PatchDiff {
  path: string;
  label: string;
  prev: string;
  next: string;
}

export function buildDiff(curriculum: Curriculum, patches: CurriculumPatch[]): PatchDiff[] {
  return patches.map((p) => {
    const segs = parsePath(p.path);
    const prev = getAt(curriculum, segs);
    return {
      path: p.path,
      label: segs[segs.length - 1]?.toString() ?? p.path,
      prev: stringify(prev),
      next: stringify(p.value),
    };
  });
}

function stringify(v: unknown): string {
  if (v === undefined || v === null) return "(empty)";
  if (typeof v === "string") return v.slice(0, 200);
  return JSON.stringify(v).slice(0, 200);
}

// ─── Download curriculum as JSON ─────────────────────────────────────────────

export function downloadCurriculum(curriculum: Curriculum, filename: string) {
  const blob = new Blob([JSON.stringify(curriculum, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}