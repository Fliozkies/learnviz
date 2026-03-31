// ─── LearnViz Curriculum Types ───────────────────────────────────────────────

export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
export type Difficulty = 'introductory' | 'foundational' | 'intermediate' | 'advanced' | 'challenge';

export type ContentBlockType =
  | 'explanation' | 'definition' | 'theorem' | 'proof'
  | 'example' | 'worked_example' | 'counterexample'
  | 'note' | 'warning' | 'tip' | 'summary'
  | 'formula' | 'algorithm' | 'case_study'
  | 'activity' | 'discussion_prompt' | 'media_embed'
  | 'table' | 'callout' | 'chart';

export type QuestionType =
  | 'multiple_choice' | 'true_false' | 'short_answer'
  | 'long_answer' | 'fill_in_the_blank' | 'matching'
  | 'ordering' | 'numeric' | 'algebraic' | 'essay'
  | 'file_upload' | 'compound';

export interface LocaleString {
  default: string;
  [locale: string]: string;
}

export type RichText = string | { format: 'plain' | 'markdown' | 'html' | 'latex'; content: string };

export interface MediaAsset {
  type: 'image' | 'video' | 'audio' | 'pdf' | 'iframe' | 'svg' | 'geogebra' | 'desmos' | 'lottie';
  src: string;
  alt?: string;
  caption?: RichText;
  width?: number;
  height?: number;
}

export interface Duration {
  minutes?: number;
  hours?: number;
  weeks?: number;
  label?: string;
}

export interface StandardRef {
  body: string;
  code: string;
  description?: string;
  url?: string;
}

export interface LearningObjective {
  id: string;
  statement: LocaleString | string;
  bloom_level?: BloomLevel;
  standards?: StandardRef[];
}

export interface Hint {
  level: number;
  text: RichText;
  penalty?: number;
}

export interface AnswerOption {
  id: string;
  text: RichText;
  is_correct?: boolean;
  distractor_reason?: string;
}

export interface SolutionStep {
  step: number;
  action: RichText;
  result?: RichText;
  annotation?: RichText;
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: RichText;
  media?: MediaAsset;
  options?: AnswerOption[];
  correct_answer?: string | number | string[];
  numeric_tolerance?: number;
  points?: number;
  difficulty?: Difficulty;
  bloom_level?: BloomLevel;
  hints?: Hint[];
  solution?: {
    steps?: SolutionStep[];
    final_answer?: RichText;
    explanation?: RichText;
  };
  tags?: string[];
  latex_enabled?: boolean;
  calculator_allowed?: boolean;
}

// ─── Chart types ──────────────────────────────────────────────────────────────

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter';

export interface ChartDataset {
  key: string;
  label: string;
  data: (number | { x: number; y: number })[];
  color?: string;
}

export interface ChartBlock {
  chartType: ChartType;
  chartTitle?: string;
  labels?: string[];
  datasets: ChartDataset[];
  xKey?: string;
  yKey?: string;
}

// ─── ContentBlock ─────────────────────────────────────────────────────────────

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  title?: RichText;
  body: RichText;
  media?: MediaAsset;
  latex?: string;
  steps?: SolutionStep[];
  table_data?: {
    headers?: string[];
    rows?: string[][];
    caption?: string;
  };
  // Chart fields (used when type === 'chart')
  chartType?: ChartType;
  chartTitle?: string;
  datasets?: ChartDataset[];     
  labels?: string[]
  chartData?: {
    labels?: string[];
    datasets: ChartDataset[];
  };
  xKey?: string;
  yKey?: string;
  tags?: string[];
  order?: number;
}

export interface Assessment {
  id: string;
  title: string | LocaleString;
  type: 'formative_quiz' | 'summative_exam' | 'unit_test' | 'final_exam' | 'diagnostic' | 'performance_task' | 'exit_ticket';
  description?: RichText;
  questions?: Question[];
  duration?: Duration;
  passing_score?: number;
  weight?: number;
  bloom_distribution?: Partial<Record<BloomLevel, number>>;
}

export interface VocabEntry {
  term: string;
  definition: RichText;
  also_known_as?: string[];
  subject_context?: string;
}

export interface Topic {
  id: string;
  title: string | LocaleString;
  overview?: RichText;
  objectives?: LearningObjective[];
  content_blocks?: ContentBlock[];
  practice_questions?: Question[];
  assessments?: Assessment[];
  duration?: Duration;
  difficulty?: Difficulty;
  tags?: string[];
  is_optional?: boolean;
  order?: number;
}

export interface Lesson {
  id: string;
  title: string | LocaleString;
  overview?: RichText;
  objectives?: LearningObjective[];
  topics: Topic[];
  assessments?: Assessment[];
  duration?: Duration;
  tags?: string[];
  order?: number;
}

export interface Unit {
  id: string;
  title: string | LocaleString;
  subtitle?: string | LocaleString;
  overview?: RichText;
  objectives?: LearningObjective[];
  lessons: Lesson[];
  assessments?: Assessment[];
  key_vocabulary?: VocabEntry[];
  duration?: Duration;
  weight?: number;
  color?: string;
  icon?: string;
  order?: number;
  tags?: string[];
}

export interface CourseMetadata {
  id: string;
  title: string | LocaleString;
  subtitle?: string | LocaleString;
  description?: RichText;
  subject: string;
  level: string;
  grade_band?: string;
  language?: string;
  author?: string;
  institution?: string;
  cover_image?: MediaAsset;
  tags?: string[];
  version?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Curriculum {
  schema_version: string;
  course: CourseMetadata;
  units: Unit[];
  course_assessments?: Assessment[];
  glossary?: VocabEntry[];
  references?: Array<{ id: string; citation: string; url?: string }>;
}

// ─── Saved curriculum entry (for localStorage) ────────────────────────────────

export interface SavedCurriculum {
  id: string;
  filename: string;
  title: string;
  curriculum: Curriculum;
  timestamp: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function resolveText(val: RichText | undefined | null): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  // Handle proper RichText {format, content}
  if ('content' in val) return val.content ?? '';
  // Fallback: AI sometimes emits LocaleString {default: '...'} instead of RichText
  const asAny = val as unknown as Record<string, unknown>;
  if (typeof asAny['default'] === 'string') return asAny['default'];
  return '';
}

export function resolveLocale(val: string | LocaleString | undefined | null): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  return val.default ?? '';
}

// Some AI-generated curricula use "description" instead of "statement" on objectives.
// This helper reads whichever field is present.
export function resolveObjectiveText(obj: LearningObjective): string {
  const raw = obj as unknown as Record<string, unknown>;
  const s = obj.statement ?? raw['description'] ?? raw['text'] ?? '';
  if (!s) return '';
  if (typeof s === 'string') return s;
  const loc = s as LocaleString;
  return loc.default ?? '';
}

export function isLatex(val: RichText): boolean {
  if (typeof val === 'string') return false;
  return val.format === 'latex';
}

export function isMarkdown(val: RichText): boolean {
  if (typeof val === 'string') return true; // treat plain strings as markdown
  return val.format === 'markdown' || val.format === 'plain';
}
