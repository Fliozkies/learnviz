// ─── prerequisiteDigest.ts — extract a token-efficient digest from a Curriculum
// Pure function, no AI, no async. Called once when the user picks a prior course.

import { Curriculum } from "@/types/curriculum";
import { PrerequisiteDigest, PrereqUnit } from "./types";

const MAX_UNITS        = 12;   // cap units sent to AI
const MAX_LESSONS_UNIT = 6;    // lesson titles per unit
const MAX_TOPICS_UNIT  = 5;    // sampled topic titles per unit
const MAX_OBJECTIVES   = 6;    // exit objectives from course + unit level
const MAX_TERMS        = 20;   // key vocabulary terms

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveStr(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  const v = val as Record<string, unknown>;
  if (typeof v["default"] === "string") return v["default"];
  if (typeof v["content"] === "string") return v["content"];
  return "";
}

// ─── Main extractor ───────────────────────────────────────────────────────────

export function buildPrerequisiteDigest(prior: Curriculum): PrerequisiteDigest {
  const courseTitle = resolveStr(prior.course.title);
  const subject     = prior.course.subject ?? "";
  const level       = resolveStr(prior.course.level as unknown) ?? "";

  // ── Exit objectives: pull from course-level objectives if present,
  //    otherwise harvest the first objective from each unit (capped).
  const exitObjectives: string[] = [];

  // Try course-level objectives first (not in schema yet, but future-proof)
  const courseAny = prior.course as unknown as Record<string, unknown>;
  const topObjs   = courseAny["objectives"] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(topObjs)) {
    for (const o of topObjs.slice(0, MAX_OBJECTIVES)) {
      const s = resolveStr(o["statement"] ?? o["description"] ?? o["text"]);
      if (s) exitObjectives.push(s);
    }
  }

  // Supplement from unit objectives until we have MAX_OBJECTIVES
  for (const unit of prior.units) {
    if (exitObjectives.length >= MAX_OBJECTIVES) break;
    const objs = unit.objectives ?? [];
    for (const o of objs.slice(0, 1)) {
      const s = resolveStr(o.statement);
      if (s && !exitObjectives.includes(s)) exitObjectives.push(s);
    }
  }

  // ── Key terms: harvest from glossary first, then vocab entries in units
  const termSet = new Set<string>();

  if (prior.glossary) {
    for (const entry of prior.glossary.slice(0, MAX_TERMS)) {
      if (entry.term) termSet.add(entry.term);
    }
  }

  if (termSet.size < MAX_TERMS) {
    for (const unit of prior.units) {
      if (termSet.size >= MAX_TERMS) break;
      for (const entry of unit.key_vocabulary ?? []) {
        if (entry.term) termSet.add(entry.term);
        if (termSet.size >= MAX_TERMS) break;
      }
    }
  }

  // ── Units: titles, sampled lessons, sampled topics
  const units: PrereqUnit[] = prior.units
    .slice(0, MAX_UNITS)
    .map((unit): PrereqUnit => {
      const lessons = unit.lessons
        .slice(0, MAX_LESSONS_UNIT)
        .map((l) => resolveStr(l.title))
        .filter(Boolean);

      // Sample topics: take first topic from each lesson until MAX_TOPICS_UNIT
      const sampleTopics: string[] = [];
      for (const lesson of unit.lessons) {
        if (sampleTopics.length >= MAX_TOPICS_UNIT) break;
        for (const topic of lesson.topics ?? []) {
          if (sampleTopics.length >= MAX_TOPICS_UNIT) break;
          const t = resolveStr(topic.title);
          if (t) sampleTopics.push(t);
        }
      }

      return {
        title: resolveStr(unit.title),
        lessons,
        sampleTopics,
      };
    })
    .filter((u) => u.title);

  return {
    courseTitle,
    subject,
    level,
    exitObjectives,
    keyTerms: [...termSet],
    units,
  };
}

// ─── Approximate token cost of a digest (rough: 1 token ≈ 4 chars) ───────────

export function estimateDigestTokens(digest: PrerequisiteDigest): number {
  return Math.ceil(JSON.stringify(digest).length / 4);
}
