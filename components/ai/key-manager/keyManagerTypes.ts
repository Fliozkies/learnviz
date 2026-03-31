import type { ProviderType, KeyRole } from "../AIProvider";

// Re-export for convenience
export type { ProviderType, KeyRole };

// ─── Provider display constants ───────────────────────────────────────────────

export const PROVIDER_COLORS: Record<ProviderType, string> = {
  gemini: "#4285F4",
  groq: "#F55036",
  openrouter: "#7C3AED",
  huggingface: "#FF9D00",
  anthropic: "#C96442",
};

export const PROVIDER_ICONS: Record<ProviderType, string> = {
  gemini: "✦",
  groq: "⚡",
  openrouter: "⬡",
  huggingface: "🤗",
  anthropic: "◆",
};

// ─── Role display constants ───────────────────────────────────────────────────

export interface RoleMeta {
  label: string;
  color: string;
  description: string;
}

export const ROLE_LABELS: Record<KeyRole, RoleMeta> = {
  any: {
    label: "Any job",
    color: "#6B7280",
    description:
      "This key can be used for any task — generation, editing, and chat.",
  },
  generation: {
    label: "Generation",
    color: "#10B981",
    description:
      "Only used for bulk content generation (e.g. lesson writing). Ideal for free-tier or high-quota keys.",
  },
  editing: {
    label: "Editing",
    color: "#F59E0B",
    description:
      "Only used for AI-assisted editing and patch operations on existing content.",
  },
  chat: {
    label: "Chat only",
    color: "#3B82F6",
    description:
      "Reserved exclusively for the chat assistant. Good for premium models where quality matters most.",
  },
  scaffold: {
    label: "Scaffold",
    color: "#8B5CF6",
    description:
      "Used for course scaffolding and structure generation. Ideal for fast, high-throughput keys.",
  },
  "unit-test": {
    label: "Unit Tests",
    color: "#EC4899",
    description:
      "Reserved for unit test generation. Qwen3-32B at 60 RPM means all unit tests fire simultaneously with zero queuing.",
  },
};

// ─── Form state type ──────────────────────────────────────────────────────────

export interface AddFormState {
  provider: ProviderType;
  key: string;
  label: string;
  model: string;
  role: KeyRole;
}