// ─── CurriculumForge — AI prompt builders ────────────────────────────────────
import { Depth, ForgeConfig, PrerequisiteDigest, Scope } from "./types";
import { Unit } from "@/types/curriculum";

// ─── Null-safe title resolver ─────────────────────────────────────────────────
// Titles can be a plain string, a { default: string } object, or undefined
// (when a lesson failed to generate and only the scaffold skeleton remains).
function safeTitle(title: string | { default: string } | undefined, fallback = "Untitled"): string {
  if (!title) return fallback;
  if (typeof title === "string") return title || fallback;
  return title.default || fallback;
}

// ─── Scaffold system prompt ───────────────────────────────────────────────────

export const SCAFFOLD_SYSTEM = `You are a curriculum architect with deep expertise in instructional design.
You will receive a course specification and must design the optimal structure for it.

BEFORE outputting JSON, you must think through each unit's conceptual weight and assign lesson counts accordingly. This thinking appears in a <plan> block first, then the JSON follows.

OUTPUT FORMAT — two sections, in order:
1. A <plan> block containing your reasoning (not JSON)
2. The raw JSON scaffold (no fences, no prose after)

In the <plan> block, for each unit write one line:
  UNIT "title" → N lessons — reason (e.g. "narrow bridge", "technique-heavy", "broad applications domain")

This forces you to justify counts before committing. If every unit gets the same N, that is a planning error — rethink.

STRUCTURAL RULES:
- Lesson counts MUST reflect each unit's actual conceptual weight. Light units get fewer lessons. Heavy units get more. Counts will differ across units.
- Topic counts per lesson MUST reflect that lesson's complexity. A procedural lesson may need 2 topics. A synthesis lesson may need 6.
- Do NOT normalize. A course where every unit has the same lesson count, or every lesson has the same topic count, is wrong.
- Ensure progressive difficulty across units and within each unit.
- IDs: units → U01, U02... | lessons → U01-L01... | topics → U01-L01-T01...
- The scope's minimum lesson count per unit is a floor — not a target or average.

JSON shape (after the <plan> block):
{
  "schema_version": "1.0.0",
  "course": {
    "id": "COURSE-001",
    "title": "<title>",
    "subtitle": "<optional subtitle>",
    "subject": "<subject>",
    "level": "<level>",
    "description": "<2-3 sentence description>",
    "tags": ["tag1","tag2"]
  },
  "units": [
    {
      "id": "U01",
      "title": "<unit title>",
      "subtitle": "<optional>",
      "overview": "<2 sentence overview>",
      "order": 1,
      "color": "#4f46e5",
      "lessons": [
        {
          "id": "U01-L01",
          "title": "<lesson title>",
          "overview": "<1 sentence overview>",
          "order": 1,
          "topics": [
            { "id": "U01-L01-T01", "title": "<topic title>", "order": 1 }
          ]
        }
      ]
    }
  ]
}`;

// ─── Scope guidance ───────────────────────────────────────────────────────────

const SCOPE_GUIDANCE: Record<Scope, string> = {
  focused: `This is a FOCUSED course — essential concepts only, no padding.
Unit count: follow the subject's natural divisions. Fewer, denser units are better than many thin ones.
Lesson weight: classify each unit as LIGHT (narrow topic, few lessons), MEDIUM (standard topic), or HEAVY (broad/complex topic, more lessons). Let that classification drive the count — do not equalize.
Topic weight: classify each lesson similarly. A simple procedural lesson is LIGHT. A conceptually rich lesson is HEAVY.
Floor: every unit needs at least 2 lessons. Topics with only 1 natural lesson belong inside an adjacent unit.`,

  standard: `This is a STANDARD course — thorough coverage with practical application.
Unit count: follow the subject's natural divisions. Do not invent units to hit a number.
Lesson weight: classify each unit as LIGHT, MEDIUM, or HEAVY before assigning lessons. Bridge/review units are LIGHT. Core technique units are MEDIUM-HEAVY. Application units vary. Counts should differ visibly across units.
Topic weight: classify each lesson as LIGHT (1-2 topics), MEDIUM (3-4 topics), or HEAVY (5+ topics) based on its actual conceptual load.
Floor: every unit needs at least 3 lessons. Thin topics belong merged into adjacent units.`,

  comprehensive: `This is a COMPREHENSIVE course — full depth, edge cases, synthesis.
Unit count: follow the subject's natural divisions at full depth. Do not cap or pad.
Lesson weight: classify each unit as LIGHT, MEDIUM, HEAVY, or VERY HEAVY. A bridge unit is LIGHT (few lessons). A major technique domain is HEAVY or VERY HEAVY (many lessons). The spread across units should be wide — a LIGHT unit and a VERY HEAVY unit coexisting in the same course is correct and expected.
Topic weight: classify each lesson by conceptual load. Simple drill lessons are LIGHT. Synthesis or derivation lessons are HEAVY. Do not equalize.
Floor: every unit needs at least 4 lessons. Thin topics belong merged into adjacent units.`,
};

// ─── Scaffold prompt ──────────────────────────────────────────────────────────

export function buildScaffoldPrompt(config: ForgeConfig): string {
  const minLessons: Record<Scope, number> = { focused: 2, standard: 3, comprehensive: 4 };
  const min = minLessons[config.scope];

  const parts = [
    `Design the optimal curriculum structure for the following course:`,
    `Title: "${config.title}"`,
    `Subject: ${config.subject}`,
    `Level: ${config.level}`,
    `Output language: ${config.language} — ALL text in the JSON (titles, overviews, descriptions, tags) must be written entirely in ${config.language}.`,
  ];
  if (config.duration.trim()) parts.push(`Target duration: ${config.duration}`);
  if (config.notes.trim())    parts.push(`Instructor notes: ${config.notes}`);
  if (config.prerequisite)    parts.push(buildPrereqScaffoldSection(config.prerequisite));
  parts.push(`\n${SCOPE_GUIDANCE[config.scope]}`);
  parts.push(`
Before writing the JSON, write your <plan> block. For each unit, write one line:
  UNIT "title" → N lessons — weight: LIGHT|MEDIUM|HEAVY|VERY HEAVY — reason

If your plan shows every unit with the same N, stop and revise — that means you are not reflecting the subject's actual structure. The plan is what gets checked for uniformity. The JSON must match the plan exactly.

Floor rule: every unit needs at least ${min} lesson(s). Units below this floor must be merged into adjacent units, not kept thin.`);
  return parts.join("\n");
}

// ─── Question stub builder — fully type-specific ──────────────────────────────
// Each question type gets an exact JSON stub showing the AI precisely which
// fields are required and what format they must take.  Generic placeholders
// ("correct_answer": "<correct answer>") caused the AI to emit literal angle-
// bracket strings instead of real values.

function buildQuestionStub(
  qId: string,
  qType: string,
  topicTitle: string,
  bloom: string,
  difficulty: string,
  points: number,
): string {
  switch (qType) {
    case "multiple_choice":
      return `{
          "id": "${qId}",
          "type": "multiple_choice",
          "prompt": "<${bloom}-level multiple-choice question about ${topicTitle}>",
          "options": [
            {"id": "a", "text": "<correct answer>",      "is_correct": true,  "distractor_reason": null},
            {"id": "b", "text": "<plausible distractor>", "is_correct": false, "distractor_reason": "<common misconception this exploits>"},
            {"id": "c", "text": "<plausible distractor>", "is_correct": false, "distractor_reason": "<common misconception this exploits>"},
            {"id": "d", "text": "<plausible distractor>", "is_correct": false, "distractor_reason": "<common misconception this exploits>"}
          ],
          "correct_answer": "a",
          "difficulty": "${difficulty}", "bloom_level": "${bloom}", "points": ${points},
          "hints": [
            {"level": 1, "text": "<gentle nudge — do not reveal the answer>", "penalty": 0.1},
            {"level": 2, "text": "<stronger hint pointing toward reasoning>",  "penalty": 0.2}
          ],
          "solution": {
            "steps": [
              {"step": 1, "action": "<eliminate distractors reasoning>", "result": "<narrowed choices>"},
              {"step": 2, "action": "<confirm correct option>",          "result": "<option a — final answer>"}
            ],
            "final_answer": "a",
            "explanation": "<why a is correct and the distractors are wrong, referencing ${topicTitle}>"
          }
        }`;

    case "true_false":
      return `{
          "id": "${qId}",
          "type": "true_false",
          "prompt": "<${bloom}-level true/false statement about ${topicTitle} — must be unambiguously true or false>",
          "correct_answer": "true",
          "difficulty": "${difficulty}", "bloom_level": "${bloom}", "points": ${points},
          "hints": [
            {"level": 1, "text": "<hint that narrows reasoning without giving answer>", "penalty": 0.1}
          ],
          "solution": {
            "steps": [
              {"step": 1, "action": "<analyse the statement against ${topicTitle} theory>", "result": "<verdict>"}
            ],
            "final_answer": "true",
            "explanation": "<why this statement is true/false, citing the relevant concept in ${topicTitle}>"
          }
        }`;

    case "fill_in_the_blank":
      return `{
          "id": "${qId}",
          "type": "fill_in_the_blank",
          "prompt": "<sentence with a single blank marked ___ — e.g. 'The derivative of $x^n$ is $nx^{___}$.' Use $LaTeX$ for the math expression around the blank>",
          "correct_answer": "<exact text that fills the blank — plain number or short expression, e.g. '-2/3' or 'n-1'>",
          "difficulty": "${difficulty}", "bloom_level": "${bloom}", "points": ${points},
          "hints": [
            {"level": 1, "text": "<hint about how to derive the missing value>", "penalty": 0.1},
            {"level": 2, "text": "<stronger hint — give the method or formula>",  "penalty": 0.2}
          ],
          "solution": {
            "steps": [
              {"step": 1, "action": "<derive or recall the missing value>", "result": "<intermediate expression>"},
              {"step": 2, "action": "<state the filled blank>",             "result": "<exact answer>"}
            ],
            "final_answer": "<same as correct_answer above>",
            "explanation": "<how to arrive at this value from ${topicTitle} concepts>"
          }
        }`;

    case "numeric":
      return `{
          "id": "${qId}",
          "type": "numeric",
          "prompt": "<${bloom}-level numerical computation problem about ${topicTitle} — give all necessary values in the prompt>",
          "correct_answer": "<numeric answer as a number, e.g. 3.14 or -2>",
          "numeric_tolerance": 0.01,
          "difficulty": "${difficulty}", "bloom_level": "${bloom}", "points": ${points},
          "hints": [
            {"level": 1, "text": "<hint about which formula or approach to use>", "penalty": 0.1},
            {"level": 2, "text": "<hint showing the setup/substitution step>",    "penalty": 0.25}
          ],
          "solution": {
            "steps": [
              {"step": 1, "action": "<identify the formula and substitute values>", "result": "<expression before arithmetic>"},
              {"step": 2, "action": "<evaluate arithmetic>",                        "result": "<numeric result>"}
            ],
            "final_answer": "<same numeric value as correct_answer>",
            "explanation": "<show the full working and relate back to ${topicTitle}>"
          }
        }`;

    case "short_answer":
    default:
      return `{
          "id": "${qId}",
          "type": "short_answer",
          "prompt": "<${bloom}-level short-answer question about ${topicTitle} — answerable in 1-2 sentences>",
          "correct_answer": "<ideal concise answer — 1 sentence, key terms included>",
          "difficulty": "${difficulty}", "bloom_level": "${bloom}", "points": ${points},
          "hints": [
            {"level": 1, "text": "<hint pointing to the key concept>", "penalty": 0.1}
          ],
          "solution": {
            "steps": [
              {"step": 1, "action": "<recall or derive the concept>", "result": "<key term or relation>"},
              {"step": 2, "action": "<compose the answer>",           "result": "<complete sentence answer>"}
            ],
            "final_answer": "<same as correct_answer>",
            "explanation": "<expand on why this answer is correct for ${topicTitle}>"
          }
        }`;
  }
}

// ─── Topic template (one per topic, used inside lesson prompt) ────────────────

function buildTopicTemplate(
  lessonId: string,
  topicIdx: number,
  topicTitle: string,
  blocksPerTopic: number,
  questionsPerTopic: number,
): string {
  const tNum = String(topicIdx + 1).padStart(2, "0");
  const topicId = `${lessonId}-T${tNum}`;

  // Block type sequence.  theorem and formula are intentionally placed so that
  // they appear at predictable indices — the Desmos injection below checks the
  // type string and adds a media_embed sibling block only for those two.
  const BLOCK_TYPES = [
    "explanation", "definition", "worked_example", "summary",
    "note", "theorem", "formula", "tip",
  ];

  const Q_TYPES = [
    "multiple_choice", "short_answer", "true_false",
    "fill_in_the_blank", "numeric",
  ];

  const BLOOM_SEQ = ["remember", "understand", "apply", "analyze", "evaluate"];
  const DIFF_SEQ  = ["foundational", "foundational", "intermediate", "intermediate", "advanced"];

  // Build content blocks — exactly blocksPerTopic blocks, no auto-injected extras.
  // The AI may voluntarily add a media_embed Desmos block (see CRITICAL RULES)
  // when a graph genuinely illustrates the topic — but we never force one.
  const blockItems: string[] = [];
  let cbCounter = 1;

  for (let i = 0; i < blocksPerTopic; i++) {
    const blockType = BLOCK_TYPES[i % BLOCK_TYPES.length];
    const cbNum = String(cbCounter).padStart(2, "0");
    cbCounter++;

    blockItems.push(`{
          "id": "${topicId}-CB${cbNum}",
          "type": "${blockType}",
          "title": "<${blockType} title for ${topicTitle}>",
          "body": { "format": "markdown", "content": "<substantive ${blockType} content for '${topicTitle}' — use **bold**, $inline LaTeX$, $$display LaTeX$$ where appropriate; min 80 words>" }
        }`);
  }

  const questions = Array.from({ length: questionsPerTopic }, (_, i) => {
    const qNum   = String(i + 1).padStart(2, "0");
    const qType  = Q_TYPES[i % Q_TYPES.length];
    const bloom  = BLOOM_SEQ[Math.min(i, BLOOM_SEQ.length - 1)];
    const diff   = DIFF_SEQ[Math.min(i, DIFF_SEQ.length - 1)];
    const points = i < 2 ? 1 : 2;
    return buildQuestionStub(`${topicId}-Q${qNum}`, qType, topicTitle, bloom, diff, points);
  }).join(",\n        ");

  return `{
      "id": "${topicId}",
      "title": "${topicTitle}",
      "order": ${topicIdx + 1},
      "overview": "<1-2 sentence overview of ${topicTitle}>",
      "difficulty": "foundational",
      "duration": { "minutes": 20 },
      "tags": ["<tag>"],
      "objectives": [
        { "id": "${topicId}-o01", "statement": "<measurable objective for ${topicTitle}>", "bloom_level": "understand" }
      ],
      "content_blocks": [
        ${blockItems.join(",\n        ")}
      ],
      "practice_questions": [
        ${questions}
      ]
    }`;
}

// ─── Formative quiz template (per lesson) ─────────────────────────────────────

function buildFormativeQuizTemplate(
  lessonId: string,
  topicTitles: string[],
  depth: Depth,
  customQuestions?: number,
): string {
  // Custom override takes precedence over depth preset
  const qPerTopic = customQuestions ?? (depth === "outline" ? 2 : depth === "standard" ? 3 : 4);
  const BLOOM = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
  const Q_TYPES = [
    "multiple_choice", "short_answer", "true_false",
    "fill_in_the_blank", "numeric", "multiple_choice",
  ];

  const allQuestions: string[] = [];
  let qCounter = 1;

  for (let ti = 0; ti < topicTitles.length; ti++) {
    const topic = topicTitles[ti];
    for (let qi = 0; qi < qPerTopic; qi++) {
      const qNum       = String(qCounter).padStart(2, "0");
      const qId        = `${lessonId}-QUIZ-Q${qNum}`;
      const qType      = Q_TYPES[(ti * qPerTopic + qi) % Q_TYPES.length];
      const bloom      = BLOOM[Math.min(ti + qi, BLOOM.length - 1)];
      const difficulty = qi === 0 ? "foundational" : qi === 1 ? "intermediate" : "advanced";
      const points     = qi === 0 ? 1 : qi === 1 ? 2 : 3;

      allQuestions.push("      " + buildQuestionStub(qId, qType, topic, bloom, difficulty, points));
      qCounter++;
    }
  }

  const durationMin = Math.max(15, topicTitles.length * qPerTopic * 2);

  return `{
      "id": "${lessonId}-QUIZ",
      "title": "Formative Quiz — ${lessonId}",
      "type": "formative_quiz",
      "description": "<brief description of what this quiz assesses>",
      "duration": { "minutes": ${durationMin} },
      "passing_score": 70,
      "weight": 10,
      "bloom_distribution": { "remember": 20, "understand": 30, "apply": 30, "analyze": 20 },
      "questions": [
${allQuestions.join(",\n")}
      ]
    }`;
}

// ─── Subject-aware visual hints ──────────────────────────────────────────────
// Returns a paragraph of subject-specific guidance injected just before
// CRITICAL RULES in the lesson prompt.  The AI already knows *how* to emit
// table/chart/graph blocks from the schema rules — this tells it *when* to.

type SubjectCategory =
  | "database" | "programming" | "math" | "physics" | "chemistry"
  | "biology" | "economics" | "finance" | "history" | "geography"
  | "general";

function detectSubjectCategory(subject: string, title: string): SubjectCategory {
  const s = (subject + " " + title).toLowerCase();
  if (/sql|database|postgresql|supabase|relational|schema|nosql|mongodb/.test(s)) return "database";
  if (/program|comput|software|algorithm|code|javascript|python|typescript|backend|frontend|api|web/.test(s)) return "programming";
  if (/calculus|algebra|statistic|probabilit|linear|discrete|mathemat|geometry|trigon|number theory/.test(s)) return "math";
  if (/physics|mechanics|thermodynam|electr|optic|quantum|relativity|wave/.test(s)) return "physics";
  if (/chemistry|chemical|molecule|reaction|periodic|organic|inorganic/.test(s)) return "chemistry";
  if (/biology|cell|genetics|evolution|anatomy|ecology|microbio|neuroscience/.test(s)) return "biology";
  if (/economics|supply|demand|market|gdp|inflation|macro|micro|fiscal|monetary|trade/.test(s)) return "economics";
  if (/finance|accounting|investment|portfolio|stock|bond|balance sheet|income statement|cash flow/.test(s)) return "finance";
  if (/history|civilization|war|empire|revolution|century|era|dynasty|colonial/.test(s)) return "history";
  if (/geography|climate|region|country|population|migration|cartograph/.test(s)) return "geography";
  return "general";
}

const SUBJECT_VISUAL_HINTS: Record<SubjectCategory, string> = {
  database: `
VISUAL CONTENT — DATABASE / SQL COURSE (HIGH PRIORITY):
Tables and structured comparisons are the primary learning tool for this subject. You MUST include them liberally:
- Use type="table" blocks (with table_data.headers + table_data.rows) for: SQL command comparisons, data type reference tables, normalization form comparisons (1NF vs 2NF vs 3NF), index type trade-offs, JOIN type summaries, RLS policy examples side-by-side, performance metric comparisons.
- Use type="chart" blocks for: query execution time comparisons (bar), index size vs row count (line/scatter), connection pool usage over time (line).
- In body markdown, use pipe-table syntax for small inline comparisons (e.g. INNER JOIN vs LEFT JOIN behavior on a 3-row example).
- Every topic involving a comparison, reference list, or performance trade-off SHOULD have at least one table or chart block.`,

  programming: `
VISUAL CONTENT — PROGRAMMING / CS COURSE:
Code structure and comparisons benefit greatly from tables and charts:
- Use type="table" blocks for: API endpoint reference tables, time/space complexity comparisons (Big-O), language feature comparisons, configuration option tables, error code reference tables, method/property reference.
- Use type="chart" blocks for: algorithmic complexity growth curves (use line chart: O(1), O(log n), O(n), O(n²) against input size labels), benchmark comparisons (bar).
- In body markdown, use pipe-table syntax for small before/after code comparisons, options tables, and flag reference.`,

  math: `
VISUAL CONTENT — MATHEMATICS COURSE:
Graphs and structured formula tables are essential:
- Use media_embed (Desmos) for all function visualizations — do NOT skip this for calculus, algebra, or trigonometry topics.
- Use type="table" blocks for: derivative/integral rule reference tables, truth tables, sequence term tables, statistical distribution properties.
- Use type="chart" blocks for: data distributions (bar/histogram as bar), scatter plots for correlation, probability comparisons.`,

  physics: `
VISUAL CONTENT — PHYSICS COURSE:
Graphs, equations, and data tables are the language of physics:
- Use media_embed (Desmos) for: motion graphs (position, velocity, acceleration vs time), force vs distance, wave functions, decay curves.
- Use type="chart" blocks for: experimental data comparisons (line/scatter), energy level diagrams (bar), spectrum comparisons.
- Use type="table" blocks for: constant/unit reference tables, formula summary tables, experimental result tables.`,

  chemistry: `
VISUAL CONTENT — CHEMISTRY COURSE:
Data tables and structured comparisons are essential:
- Use type="table" blocks for: element property comparisons, reaction condition tables, solubility rules, acid/base strength rankings, spectroscopic data tables.
- Use type="chart" blocks for: reaction rate vs temperature/concentration (line), titration curve data (line), energy diagram comparisons (bar).`,

  biology: `
VISUAL CONTENT — BIOLOGY COURSE:
Classification tables and data charts are key:
- Use type="table" blocks for: taxonomy classification tables, cell organelle function tables, genetic cross outcome tables (Punnett-style as a table), enzyme comparison tables, organ system summary tables.
- Use type="chart" blocks for: population growth curves (line), species distribution (bar/pie), experimental data (scatter/bar).`,

  economics: `
VISUAL CONTENT — ECONOMICS COURSE (HIGH PRIORITY):
Economics is fundamentally a visual subject. Graphs and tables are NOT optional — they ARE the content:
- Use type="chart" blocks for: supply & demand curves (line — show price on Y, quantity on X with supply and demand as two lines), GDP growth over time (line), inflation rate trends (line), price elasticity comparisons (bar), market structure comparisons (bar).
- Use type="table" blocks for: market structure comparison tables (perfect competition / monopolistic / oligopoly / monopoly), policy effect tables, indicator comparison tables (GDP, unemployment, inflation across countries/years), cost structure tables (fixed vs variable vs total).
- Every core economics concept (supply/demand, elasticity, market structures, fiscal/monetary policy) MUST be accompanied by either a chart or table block — text-only treatment of these concepts is insufficient.`,

  finance: `
VISUAL CONTENT — FINANCE / ACCOUNTING COURSE (HIGH PRIORITY):
Numbers live in tables; trends live in charts. Both are mandatory:
- Use type="table" blocks for: balance sheet examples (assets/liabilities/equity rows), income statement line items, ratio comparison tables (liquidity, profitability, leverage), cash flow categorization tables, amortization schedule excerpts, portfolio allocation tables.
- Use type="chart" blocks for: return comparisons (bar), portfolio allocation (pie), compound growth curves (line), risk vs return scatter, price trends (line).
- Every lesson involving financial statements, ratios, or portfolio analysis MUST include at least one table block and one chart block.`,

  history: `
VISUAL CONTENT — HISTORY COURSE:
Timeline data, statistics, and comparative tables make history concrete and memorable:
- Use type="chart" blocks for: population changes over centuries (line/bar), territorial expansion timelines presented as bar charts, economic output comparisons between empires/nations (bar), war casualty statistics (bar), trade volume trends (line).
- Use type="table" blocks for: chronological event tables (date | event | significance), cause-and-effect comparison tables, treaty/agreement comparison tables, leader/reign/achievement tables, before-vs-after comparison tables for major events.
- At least one table and one chart per lesson strongly preferred — history without data visualization reduces to unanchored narrative.`,

  geography: `
VISUAL CONTENT — GEOGRAPHY COURSE:
Geographic data and spatial comparisons demand charts and tables:
- Use type="chart" blocks for: population distribution (bar/pie), climate data by region (line/bar), economic indicator comparisons across countries (bar), migration flow trends (line).
- Use type="table" blocks for: country/region comparison tables (area, population, density, GDP), climate zone characteristic tables, trade partner tables, resource distribution tables.`,

  general: `
VISUAL CONTENT:
Use visual blocks wherever they genuinely aid comprehension:
- Use type="table" blocks when comparing multiple items across multiple attributes, or presenting reference data (comparisons, specifications, properties, timelines, schedules).
- Use type="chart" blocks for data that has trends, distributions, or proportions worth visualizing (line for trends, bar for comparisons, pie for proportions, scatter for correlations).
- Prefer a table or chart over a paragraph whenever the content is fundamentally structured/quantitative data.`,
};

// Table block shape injected into CRITICAL RULES so the AI knows the exact format
const TABLE_BLOCK_RULE = `
- Table blocks: when you include type="table", the block MUST have a table_data field with this exact shape:
  {"id":"<id>","type":"table","title":"<table title>","body":{"format":"markdown","content":"<one-line summary or empty string>"},"table_data":{"headers":["Col A","Col B","Col C"],"rows":[["r1c1","r1c2","r1c3"],["r2c1","r2c2","r2c3"]],"caption":"<optional caption>"}}
  headers is an array of column header strings. rows is a 2D array of cell strings. All cells support inline markdown (**bold**, \`code\`, $LaTeX$).
- Chart blocks: when you include type="chart", the block MUST have chartType ("bar"|"line"|"pie"|"scatter"), labels (array of x-axis or slice labels), and datasets (array of {key, label, data:[numbers]}). Shape:
  {"id":"<id>","type":"chart","title":"<chart title>","body":{"format":"markdown","content":"<caption>"},"chartType":"line","chartTitle":"<title>","labels":["A","B","C"],"datasets":[{"key":"series1","label":"Series 1","data":[10,20,15]}]}`;

export function buildSubjectVisualHints(subject: string, courseTitle: string): string {
  const category = detectSubjectCategory(subject, courseTitle);
  return SUBJECT_VISUAL_HINTS[category] + TABLE_BLOCK_RULE;
}

// ─── Lesson prompt ────────────────────────────────────────────────────────────

export function buildLessonPrompt(
  courseTitle: string,
  subject: string,
  level: string,
  unitTitle: string,
  lessonTitle: string,
  lessonId: string,
  topicTitles: string[],
  depth: Depth,
  lessonOrder: number,
  totalLessonsInUnit: number,
  language: string,
  prereq?: PrerequisiteDigest,
  customBlocks?: number,
  customQuestions?: number,
): string {
  // Custom overrides take precedence; otherwise fall back to depth presets.
  const blocksPerTopic    = customBlocks    ?? (depth === "outline" ? 3 : depth === "standard" ? 5 : 8);
  const questionsPerTopic = customQuestions ?? (depth === "outline" ? 2 : depth === "standard" ? 3 : 5);

  const topicsTemplate = topicTitles
    .map((title, i) => buildTopicTemplate(lessonId, i, title, blocksPerTopic, questionsPerTopic))
    .join(",\n  ");

  const quizTemplate = buildFormativeQuizTemplate(lessonId, topicTitles, depth, customQuestions);

  const prereqHint = prereq ? buildPrereqLessonHint(prereq) : "";
  const visualHints = buildSubjectVisualHints(subject, courseTitle);

  return `You are generating a single lesson for a curriculum. Return ONLY a valid JSON object — the complete lesson.
No prose, no markdown fences, no explanation. Raw JSON only.
${prereqHint}
Course: "${courseTitle}" | Subject: ${subject} | Level: ${level}
Output language: ${language} — ALL content (titles, overviews, objectives, content blocks, questions, hints, solutions) MUST be written entirely in ${language}.
Unit: "${unitTitle}" (this lesson is ${lessonOrder} of ${totalLessonsInUnit} in this unit)
Lesson ID: ${lessonId} | Lesson Title: "${lessonTitle}"
You must generate ALL ${topicTitles.length} topic(s) AND a fully-populated formative quiz. Do NOT omit any.
Topics: ${topicTitles.map((t, i) => `T${String(i + 1).padStart(2, "0")}="${t}"`).join(", ")}

Return this exact shape — fill every <placeholder> with real, substantive ${subject} content:
{
  "id": "${lessonId}",
  "title": "${lessonTitle}",
  "overview": "<2-3 sentence overview of this lesson>",
  "order": ${lessonOrder},
  "duration": { "minutes": ${45 + topicTitles.length * 15} },
  "tags": ["<tag1>", "<tag2>"],
  "objectives": [
    { "id": "${lessonId}-o01", "statement": "<measurable lesson-level objective using action verb>", "bloom_level": "understand" },
    { "id": "${lessonId}-o02", "statement": "<second measurable objective>", "bloom_level": "apply" }
  ],
  "topics": [
  ${topicsTemplate}
  ],
  "assessments": [
  ${quizTemplate}
  ]
}

${visualHints}

CRITICAL RULES — CONTENT & QUESTIONS:
- Output ALL ${topicTitles.length} topics — one per topic listed above. Do not collapse or skip any.
- The "assessments" array must contain the formative quiz with ALL questions populated with real content.
- Every question MUST have: a real prompt, correct_answer, hints, and a complete solution with steps.
- Multiple-choice: options must have is_correct (true/false) and distractor_reason on each wrong option.
- fill_in_the_blank: the prompt MUST contain exactly one blank marked as ___ (three underscores), embedded naturally inside a sentence or $LaTeX expression$. The correct_answer field must be the exact string that fills the blank (e.g. "n-1" or "-2/3"), NOT a sentence.
- numeric: correct_answer must be a plain number (e.g. 3.14), NOT a sentence. Include numeric_tolerance (e.g. 0.01).
- true_false: correct_answer must be exactly "true" or "false" (lowercase string).
- short_answer: correct_answer must be a concise 1-sentence answer, NOT a placeholder.
- Desmos graphs (optional): you MAY insert an extra media_embed block anywhere in a topic's content_blocks when a graph would genuinely aid understanding of that specific concept — e.g. Big-O growth curves for algorithm complexity, query cost vs row count, exponential backoff intervals, sine wave for signal processing. Do NOT add a graph just because the block type is theorem/formula. If the concept cannot be expressed as a concrete plottable function, skip the graph entirely. When you do add one, use this shape: {"id":"<topicId>-CB<nn>","type":"media_embed","title":"<descriptive title>","media":{"type":"desmos","src":"<pipe-separated concrete LaTeX — e.g. f(x)=x^{2}|g(x)=2x — NO free parameters>","alt":"<what the graph shows>","caption":"<1-sentence explanation>","height":320}}. The "src" field must contain ONLY fully-defined expressions with no free parameters — "f(x)=x^{n}" is invalid (n undefined); "f(x)=x^{2}" is valid.
- Fill ALL <placeholder> values with real ${subject} content at ${level} level.
- Use LaTeX notation ($x^2$, $$\\frac{a}{b}$$) for all mathematical expressions.
- RETURN RAW JSON ONLY. No markdown fences, no prose before or after.`;
}

// ─── Unit-test prompt ─────────────────────────────────────────────────────────

export function buildUnitTestPrompt(
  courseTitle: string,
  subject: string,
  level: string,
  unit: Unit,
  depth: Depth,
  language: string,
): string {
  const unitTitle = safeTitle(unit.title, unit.id);
  const unitId    = unit.id;

  const lessonSummaries = unit.lessons
    .map((l, li) => {
      const lt     = safeTitle(l.title, `Lesson ${li + 1}`);
      const topics = (l.topics ?? [])
        .map((t) => safeTitle(t.title, "topic"))
        .join(", ");
      return `  L${li + 1}: "${lt}" → topics: [${topics}]`;
    })
    .join("\n");

  // questions per lesson: 2 outline / 3 standard / 4 deep
  const qPerLesson = depth === "outline" ? 2 : depth === "standard" ? 3 : 4;
  const totalQ     = unit.lessons.length * qPerLesson;
  const durationMin = Math.max(30, totalQ * 3);

  const BLOOM       = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
  const Q_TYPES     = [
    "multiple_choice", "short_answer", "multiple_choice",
    "numeric", "fill_in_the_blank", "multiple_choice",
  ];

  const questionTemplates: string[] = [];

  for (let li = 0; li < unit.lessons.length; li++) {
    const lesson      = unit.lessons[li];
    const lessonTitle = safeTitle(lesson.title, `Lesson ${li + 1}`);

    for (let qi = 0; qi < qPerLesson; qi++) {
      const idx        = li * qPerLesson + qi;
      const qNum       = String(idx + 1).padStart(2, "0");
      const qId        = `${unitId}-TEST-Q${qNum}`;
      const qType      = Q_TYPES[idx % Q_TYPES.length];
      const bloom      = BLOOM[Math.min(Math.floor(idx / 2), BLOOM.length - 1)];
      const difficulty = li < 2 ? "foundational" : li < unit.lessons.length - 1 ? "intermediate" : "advanced";
      const points     = bloom === "remember" || bloom === "understand" ? 2
                       : bloom === "apply"    || bloom === "analyze"    ? 3 : 4;

      questionTemplates.push("    " + buildQuestionStub(qId, qType, lessonTitle, bloom, difficulty, points));
    }
  }

  return `You are generating a unit test for a curriculum unit. Return ONLY a valid JSON object — the Assessment.
No prose, no markdown fences, no explanation. Raw JSON only.

Course: "${courseTitle}" | Subject: ${subject} | Level: ${level}
Output language: ${language} — ALL content (descriptions, questions, hints, solutions, explanations) MUST be written entirely in ${language}.
Unit: "${unitId}" — "${unitTitle}"
Lessons covered:
${lessonSummaries}

Return this exact Assessment shape with ALL ${totalQ} questions fully populated:
{
  "id": "${unitId}-TEST",
  "title": "Unit Test — ${unitTitle}",
  "type": "unit_test",
  "description": "<2-sentence description of what this test covers across all lessons>",
  "duration": { "minutes": ${durationMin} },
  "passing_score": 72,
  "weight": 20,
  "bloom_distribution": { "remember": 15, "understand": 25, "apply": 30, "analyze": 20, "evaluate": 10 },
  "questions": [
${questionTemplates.join(",\n")}
  ]
}

CRITICAL RULES:
- ALL ${totalQ} questions must be present with real ${subject} content — no placeholders left unfilled.
- Questions must span the full breadth of the unit, testing concepts from each lesson.
- Multiple-choice: options need is_correct (true/false) and distractor_reason for wrong answers.
- fill_in_the_blank: prompt must contain ___ (three underscores) as the blank; correct_answer is the exact fill string (e.g. "n-1"), NOT a sentence.
- numeric: correct_answer must be a plain number (e.g. 4.5). Include numeric_tolerance (e.g. 0.01).
- true_false: correct_answer must be "true" or "false" (lowercase).
- short_answer: correct_answer must be a concise 1-sentence answer.
- Every question needs a complete solution with steps, final_answer, and explanation.
- Ensure progressive difficulty: earlier questions easier, final questions synthesis-level.
- Use LaTeX ($x^2$, $$\\int_a^b f(x)\\,dx$$) for all math.
- RETURN RAW JSON ONLY.`;
}
// ─── Prerequisite helpers ─────────────────────────────────────────────────────
// Injected into scaffold (full digest) and lesson prompts (slim hint).
// Kept here alongside the other prompt builders for co-location.

export function buildPrereqScaffoldSection(prereq: PrerequisiteDigest): string {
  const lines: string[] = [
    `\n── PREREQUISITE COURSE ──────────────────────────────────────────────────`,
    `This course BUILDS ON: "${prereq.courseTitle}" (${prereq.subject}, ${prereq.level})`,
    ``,
    `What students already know (exit objectives from the prerequisite):`,
    ...prereq.exitObjectives.map((o) => `  • ${o}`),
  ];

  if (prereq.keyTerms.length) {
    lines.push(`\nEstablished vocabulary & notation (do NOT re-introduce from scratch):`);
    lines.push(`  ${prereq.keyTerms.join(", ")}`);
  }

  lines.push(`\nPrior course structure (units → sampled topics covered):`);
  for (const unit of prereq.units) {
    lines.push(`  [${unit.title}]`);
    if (unit.sampleTopics.length) {
      lines.push(`    Topics covered: ${unit.sampleTopics.join(", ")}`);
    }
  }

  lines.push(`
SEQUENCING RULES (CRITICAL — follow all of these):
1. Do NOT include content already covered in "${prereq.courseTitle}" unless it is
   a brief explicit bridge lesson (title prefix: "Bridge: …" or "Review: …").
2. Open the first unit with a concise bridging unit connecting from where
   "${prereq.courseTitle}" ended — no more than 2-3 lessons.
3. Build objectives that EXTEND prior Bloom levels — if Calc 1 reached "apply",
   Calc 2 should reach "analyze", "evaluate", or "create" on those topics.
4. Reference prior notation consistently (same variable names, same LaTeX forms).
5. Assume students passed "${prereq.courseTitle}" — no remedial units.
─────────────────────────────────────────────────────────────────────────────`);

  return lines.join("\n");
}

// ─── Formative quiz repair prompt ────────────────────────────────────────────
// Used by the post-generation repair pass to regenerate a missing formative quiz
// for a lesson that completed successfully but had its assessments dropped.

export function buildFormativeQuizRepairPrompt(
  courseTitle: string,
  subject: string,
  level: string,
  unitTitle: string,
  lessonTitle: string,
  lessonId: string,
  topicTitles: string[],
  depth: Depth,
  language: string,
  customQuestions?: number,
): string {
  const quizTemplate = buildFormativeQuizTemplate(lessonId, topicTitles, depth, customQuestions);
  const baseQPerTopic = customQuestions ?? (depth === "outline" ? 2 : depth === "standard" ? 3 : 4);
  const totalQ = baseQPerTopic * topicTitles.length;

  return `You are repairing a curriculum lesson that is missing its formative quiz. Return ONLY a valid JSON object — the Assessment. No prose, no markdown fences, no explanation. Raw JSON only.

Course: "${courseTitle}" | Subject: ${subject} | Level: ${level}
Output language: ${language} — ALL content (questions, hints, solutions, explanations) MUST be written entirely in ${language}.
Unit: "${unitTitle}"
Lesson: "${lessonId}" — "${lessonTitle}"
Topics covered: ${topicTitles.map((t, i) => `T${String(i + 1).padStart(2, "0")}="${t}"`).join(", ")}

Return this exact Assessment shape with ALL ${totalQ} questions fully populated with real ${subject} content:
${quizTemplate}

CRITICAL RULES:
- ALL ${totalQ} questions must be present with real content — no placeholders left unfilled.
- Questions must test concepts from ALL topics listed above.
- Every question needs: a real prompt, correct_answer, hints, and a complete solution with steps.
- Multiple-choice: options must have is_correct (true/false) and distractor_reason on wrong options.
- fill_in_the_blank: prompt must contain ___ as the blank; correct_answer is the exact fill string.
- numeric: correct_answer must be a plain number. Include numeric_tolerance.
- true_false: correct_answer must be "true" or "false" (lowercase).
- RETURN RAW JSON ONLY.`;
}

export function buildPrereqLessonHint(prereq: PrerequisiteDigest): string {
  const terms = prereq.keyTerms.slice(0, 12).join(", ");
  return (
    `Prior course context: students completed "${prereq.courseTitle}". ` +
    (terms ? `Established notation/vocabulary: ${terms}. ` : "") +
    `Build on this foundation — do not re-introduce these concepts from scratch. ` +
    `Use consistent notation from the prerequisite course.\n`
  );
}
// ─── Topic content repair prompt ─────────────────────────────────────────────
// Used when a lesson was severely truncated and one or more topics have zero
// content_blocks and zero practice_questions. Regenerates just the topics array
// for the affected lesson.

export function buildTopicContentRepairPrompt(
  courseTitle: string,
  subject: string,
  level: string,
  unitTitle: string,
  lessonTitle: string,
  lessonId: string,
  emptyTopics: Array<{ id: string; title: string; order: number }>,
  depth: Depth,
  language: string,
  customBlocks?: number,
  customQuestions?: number,
): string {
  const blocksPerTopic    = customBlocks    ?? (depth === "outline" ? 3 : depth === "standard" ? 5 : 8);
  const questionsPerTopic = customQuestions ?? (depth === "outline" ? 2 : depth === "standard" ? 3 : 5);

  const topicsTemplate = emptyTopics
    .map((t) => buildTopicTemplate(lessonId, t.order - 1, t.title, blocksPerTopic, questionsPerTopic))
    .join(",\n  ");

  const visualHints = buildSubjectVisualHints(subject, courseTitle);

  return `You are repairing a curriculum lesson where some topics have no content. Return ONLY a valid JSON object — an array of topic objects. No prose, no markdown fences, no explanation. Raw JSON only.

Course: "${courseTitle}" | Subject: ${subject} | Level: ${level}
Output language: ${language} — ALL content MUST be written entirely in ${language}.
Unit: "${unitTitle}"
Lesson: "${lessonId}" — "${lessonTitle}"
Topics to fill (${emptyTopics.length}): ${emptyTopics.map((t) => JSON.stringify(t.title)).join(', ')}

Return this exact shape — an array of fully populated topic objects:
[
  ${topicsTemplate}
]

${visualHints}

CRITICAL RULES — CONTENT & QUESTIONS:
- Return ONLY the JSON array — no wrapper object, no prose.
- ALL ${emptyTopics.length} topic(s) must be present with real ${subject} content at ${level} level.
- Every topic needs ${blocksPerTopic} content_blocks and ${questionsPerTopic} practice_questions — no placeholders.
- Every question MUST have: a real prompt, correct_answer, hints, and a complete solution with steps.
- Multiple-choice: options must have is_correct (true/false) and distractor_reason on wrong options.
- fill_in_the_blank: prompt must contain ___ as the blank; correct_answer is the exact fill string.
- numeric: correct_answer must be a plain number. Include numeric_tolerance.
- true_false: correct_answer must be "true" or "false" (lowercase).
- RETURN RAW JSON ARRAY ONLY.`;
}