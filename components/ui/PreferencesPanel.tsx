"use client";
import { useEffect, useRef, useState } from "react";
import {
  usePrefs,
  SANS_PRESETS,
  SERIF_PRESETS,
  MONO_PRESETS,
  COLOR_PALETTES,
  FontPreset,
  ColorPalette,
} from "./ThemeProvider";
import { KeyList } from "@/components/ai/key-manager/KeyList";
import { AddKeyForm } from "@/components/ai/key-manager/AddKeyForm";
import { ExportImportPanel } from "@/components/ai/key-manager/ExportImportPanel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the subject string suggests math or a STEM discipline
 *  where the Equation Studio is genuinely useful. */
export function subjectNeedsEquationStudio(subject: string): boolean {
  const s = subject.toLowerCase();
  return /math|algebra|calculus|geometry|trigonometry|statistics|physics|chemistry|engineering|economics|finance|computer science|data science|science/.test(
    s,
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--border-color)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  outline: "none",
  boxSizing: "border-box",
};

const stepBtn: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  padding: "4px 8px",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-secondary)",
  flexShrink: 0,
  transition: "all var(--transition)",
};

// ─── Layout pieces ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.1em",
        color: "var(--text-muted)",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function Section({
  title,
  children,
  noBorder,
}: {
  title: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div
      style={{
        paddingBottom: 20,
        marginBottom: 20,
        borderBottom: noBorder ? "none" : "1px solid var(--border-subtle)",
      }}
    >
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 22,
        borderRadius: 11,
        border: "none",
        cursor: "pointer",
        background: checked ? "var(--accent-math)" : "var(--bg-tertiary)",
        position: "relative",
        transition: "background 200ms",
        flexShrink: 0,
        outline: "1px solid var(--border-color)",
      }}
      aria-checked={checked}
      role="switch"
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 19 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 200ms cubic-bezier(0.4,0,0.2,1)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

// ─── ToolRow ──────────────────────────────────────────────────────────────────

function ToolRow({
  icon,
  name,
  description,
  enabled,
  onToggle,
  badge,
}: {
  icon: string;
  name: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  badge?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 10,
        border: "1px solid var(--border-color)",
        background: enabled
          ? "color-mix(in srgb, var(--accent-math) 5%, var(--bg-elevated))"
          : "var(--bg-elevated)",
        transition: "all 200ms",
        marginBottom: 10,
      }}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {name}
          </span>
          {badge && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "1px 6px",
                borderRadius: 20,
                background:
                  "color-mix(in srgb, var(--accent-math) 15%, var(--bg-tertiary))",
                color: "var(--accent-math)",
                border:
                  "1px solid color-mix(in srgb, var(--accent-math) 30%, transparent)",
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            lineHeight: 1.4,
          }}
        >
          {description}
        </span>
      </div>
      <Toggle checked={enabled} onChange={onToggle} />
    </div>
  );
}

// ─── Font picker ──────────────────────────────────────────────────────────────

function FontPicker({
  presets,
  value,
  customUrl,
  onChange,
  onCustomUrl,
  previewText,
}: {
  presets: FontPreset[];
  value: string;
  customUrl?: string;
  onChange: (v: string) => void;
  onCustomUrl?: (url: string) => void;
  previewText: string;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [urlDraft, setUrlDraft] = useState(customUrl ?? "");
  const [familyDraft, setFamilyDraft] = useState("");
  const isCustom = !presets.some((p) => p.value === value);

  return (
    <div>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}
      >
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            style={{
              padding: "3px 9px",
              borderRadius: 20,
              border: "1px solid",
              borderColor:
                value === p.value
                  ? "var(--accent-primary)"
                  : "var(--border-color)",
              background:
                value === p.value
                  ? "var(--accent-primary-soft)"
                  : "var(--bg-elevated)",
              color:
                value === p.value
                  ? "var(--accent-primary)"
                  : "var(--text-secondary)",
              fontFamily: p.value,
              fontSize: 12,
              cursor: "pointer",
              transition: "all var(--transition)",
              fontWeight: value === p.value ? 600 : 400,
            }}
          >
            {p.label}
          </button>
        ))}
        {onCustomUrl && (
          <button
            onClick={() => setShowCustom((v) => !v)}
            style={{
              padding: "3px 9px",
              borderRadius: 20,
              border: "1px dashed",
              borderColor: isCustom
                ? "var(--accent-primary)"
                : "var(--border-color)",
              background: isCustom
                ? "var(--accent-primary-soft)"
                : "transparent",
              color: isCustom ? "var(--accent-primary)" : "var(--text-muted)",
              fontSize: 11,
              cursor: "pointer",
              transition: "all var(--transition)",
            }}
          >
            + Custom
          </button>
        )}
      </div>

      {showCustom && onCustomUrl && (
        <div
          style={{
            padding: 12,
            background: "var(--bg-tertiary)",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            marginBottom: 8,
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
              marginBottom: 8,
            }}
          >
            Paste a Google Fonts CSS URL, then type the exact font-family name.
          </p>
          <input
            placeholder="https://fonts.googleapis.com/css2?family=…"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Family name, e.g. Roboto"
            value={familyDraft}
            onChange={(e) => setFamilyDraft(e.target.value)}
            style={{ ...inputStyle, marginTop: 5 }}
          />
          <button
            onClick={() => {
              if (!familyDraft.trim()) return;
              onCustomUrl(urlDraft.trim());
              onChange(`'${familyDraft.trim()}', sans-serif`);
              setShowCustom(false);
            }}
            style={{
              marginTop: 8,
              padding: "5px 14px",
              borderRadius: 6,
              border: "none",
              background: "var(--accent-primary)",
              color: "#fff",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Apply
          </button>
        </div>
      )}

      <div
        style={{
          padding: "9px 12px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 7,
          fontFamily: value,
          fontSize: 13,
          color: "var(--text-primary)",
          lineHeight: 1.6,
        }}
      >
        {previewText}
      </div>
    </div>
  );
}

// ─── Color swatch ─────────────────────────────────────────────────────────────

function Swatch({
  color,
  label,
  onChange,
}: {
  color: string;
  label: string;
  onChange: (c: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div style={{ position: "relative", width: 36, height: 36 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: color,
            border: "2px solid var(--border-color)",
            overflow: "hidden",
            cursor: "pointer",
          }}
        />
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0,
            width: "100%",
            height: "100%",
            cursor: "pointer",
            padding: 0,
            border: "none",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--text-muted)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function KeysTab() {
  return (
    <div style={{ paddingBottom: 8 }}>
      <KeyList />
      <AddKeyForm />
      <ExportImportPanel />
    </div>
  );
}

// ─── Tools tab ────────────────────────────────────────────────────────────────

function ToolsTab({
  equationStudioEnabled,
  onEquationStudioChange,
  subjectIsRelevant,
}: {
  equationStudioEnabled: boolean;
  onEquationStudioChange: (v: boolean) => void;
  subjectIsRelevant: boolean;
}) {
  return (
    <div style={{ padding: "18px 18px 0" }}>
      <div
        style={{
          padding: "10px 14px",
          marginBottom: 16,
          borderRadius: 8,
          background:
            "color-mix(in srgb, var(--accent-primary) 6%, var(--bg-elevated))",
          border:
            "1px solid color-mix(in srgb, var(--accent-primary) 20%, var(--border-color))",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-secondary)",
          lineHeight: 1.6,
        }}
      >
        Tools extend your learning experience. They are automatically enabled or
        disabled based on the subject of your curriculum, but you can always
        override them here.
      </div>

      <ToolRow
        icon="ƒ"
        name="Equation Studio"
        description="Interactive graph plotter and equation analyzer. Great for math and science curricula."
        enabled={equationStudioEnabled}
        onToggle={onEquationStudioChange}
        badge={subjectIsRelevant ? "auto-enabled" : undefined}
      />

      {/* Placeholder rows for future tools — shown as disabled/coming soon */}
      <div style={{ opacity: 0.45, pointerEvents: "none" }}>
        <ToolRow
          icon="📊"
          name="Data Table"
          description="Paste or build tables of values and visualize them as charts."
          enabled={false}
          onToggle={() => {}}
          badge="coming soon"
        />
        <ToolRow
          icon="🗺️"
          name="Timeline & Map"
          description="Plot historical events on a timeline or geographic map."
          enabled={false}
          onToggle={() => {}}
          badge="coming soon"
        />
        <ToolRow
          icon="🔬"
          name="Periodic Table"
          description="Interactive periodic table with element details. Auto-enabled for chemistry."
          enabled={false}
          onToggle={() => {}}
          badge="coming soon"
        />
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export type PrefTab = "appearance" | "tools" | "keys";

const PREF_TABS: { id: PrefTab; label: string; icon: string }[] = [
  { id: "appearance", label: "Appearance", icon: "🎨" },
  { id: "tools", label: "Tools", icon: "🛠️" },
  { id: "keys", label: "API Keys", icon: "🔑" },
];

export interface ToolsState {
  equationStudioEnabled: boolean;
}

const DEFAULT_TOOLS_STATE: ToolsState = { equationStudioEnabled: false };

export default function PreferencesPanel({
  open,
  onClose,
  initialTab,
  toolsState = DEFAULT_TOOLS_STATE,
  onToolsChange = () => {},
  subjectIsRelevant = false,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: PrefTab;
  toolsState?: ToolsState;
  onToolsChange?: (patch: Partial<ToolsState>) => void;
  subjectIsRelevant?: boolean;
}) {
  const { prefs, setPrefs, toggleTheme, resetPrefs } = usePrefs();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<PrefTab>(initialTab ?? "appearance");

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const applyPalette = (palette: ColorPalette) => {
    setPrefs({
      paletteId: palette.id,
      accentPrimary: palette.accentPrimary,
      accentSecondary: palette.accentSecondary,
      accentMath: palette.accentMath,
    });
  };

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          height: "100dvh",
          background: "var(--bg-secondary)",
          borderLeft: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
          animation: "slideRight 220ms cubic-bezier(0.4,0,0.2,1)",
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
            flexShrink: 0,
            background: "var(--bg-tertiary)",
          }}
        >
          <span style={{ fontSize: 15 }}>⚙</span>
          <span
            style={{
              flex: 1,
              fontFamily: "var(--font-serif)",
              fontSize: 15,
              color: "var(--text-primary)",
            }}
          >
            Preferences
          </span>
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
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--text-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-muted)")
            }
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border-color)",
            background: "var(--bg-tertiary)",
            flexShrink: 0,
          }}
        >
          {PREF_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "10px 8px",
                background: "none",
                border: "none",
                borderBottom: `2px solid ${tab === t.id ? "var(--accent-primary)" : "transparent"}`,
                cursor: tab === t.id ? "default" : "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.05em",
                color:
                  tab === t.id ? "var(--accent-primary)" : "var(--text-muted)",
                transition: "color 150ms, border-color 150ms",
                marginBottom: -1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: tab === "keys" || tab === "tools" ? 0 : "18px 18px 0",
          }}
        >
          {tab === "keys" && <KeysTab />}

          {tab === "tools" && (
            <ToolsTab
              equationStudioEnabled={toolsState.equationStudioEnabled}
              onEquationStudioChange={(v) =>
                onToolsChange({ equationStudioEnabled: v })
              }
              subjectIsRelevant={subjectIsRelevant}
            />
          )}

          {tab === "appearance" && (
            <>
              <Section title="Theme">
                <div style={{ display: "flex", gap: 8 }}>
                  {(["light", "dark"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        if (prefs.theme !== t) toggleTheme();
                      }}
                      style={{
                        flex: 1,
                        padding: "10px 8px",
                        borderRadius: 8,
                        border: "2px solid",
                        borderColor:
                          prefs.theme === t
                            ? "var(--accent-primary)"
                            : "var(--border-color)",
                        background: t === "light" ? "#faf9f7" : "#181716",
                        color: t === "light" ? "#1a1714" : "#f0ece5",
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        fontWeight: 700,
                        transition: "all var(--transition)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>
                        {t === "light" ? "☀️" : "🌙"}
                      </span>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Color Palette">
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 14,
                  }}
                >
                  {COLOR_PALETTES.filter((p) => p.id !== "custom").map(
                    (palette) => (
                      <button
                        key={palette.id}
                        onClick={() => applyPalette(palette)}
                        title={palette.label}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 10px",
                          borderRadius: 20,
                          border: "1px solid",
                          borderColor:
                            prefs.paletteId === palette.id
                              ? "var(--accent-primary)"
                              : "var(--border-color)",
                          background:
                            prefs.paletteId === palette.id
                              ? "var(--accent-primary-soft)"
                              : "var(--bg-elevated)",
                          color:
                            prefs.paletteId === palette.id
                              ? "var(--accent-primary)"
                              : "var(--text-secondary)",
                          cursor: "pointer",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          fontWeight:
                            prefs.paletteId === palette.id ? 700 : 400,
                          transition: "all var(--transition)",
                        }}
                      >
                        <span style={{ display: "flex", gap: 2 }}>
                          {[
                            palette.accentPrimary,
                            palette.accentSecondary,
                            palette.accentMath,
                          ].map((c, i) => (
                            <span
                              key={i}
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: c,
                              }}
                            />
                          ))}
                        </span>
                        {palette.label}
                      </button>
                    ),
                  )}
                </div>

                <div
                  style={{
                    padding: 12,
                    background: "var(--bg-tertiary)",
                    borderRadius: 8,
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--text-muted)",
                      marginBottom: 12,
                    }}
                  >
                    Click any swatch to customize
                  </p>
                  <div style={{ display: "flex", gap: 16 }}>
                    <Swatch
                      color={prefs.accentPrimary}
                      label="Primary"
                      onChange={(c) =>
                        setPrefs({ paletteId: "custom", accentPrimary: c })
                      }
                    />
                    <Swatch
                      color={prefs.accentSecondary}
                      label="Secondary"
                      onChange={(c) =>
                        setPrefs({ paletteId: "custom", accentSecondary: c })
                      }
                    />
                    <Swatch
                      color={prefs.accentMath}
                      label="Math"
                      onChange={(c) =>
                        setPrefs({ paletteId: "custom", accentMath: c })
                      }
                    />
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          background: prefs.accentPrimary,
                        }}
                      />
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          background: prefs.accentSecondary,
                        }}
                      />
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          background: prefs.accentMath,
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                    {(
                      [
                        "accentPrimary",
                        "accentSecondary",
                        "accentMath",
                      ] as const
                    ).map((key, i) => (
                      <input
                        key={key}
                        value={prefs[key]}
                        onChange={(e) =>
                          setPrefs({
                            paletteId: "custom",
                            [key]: e.target.value,
                          })
                        }
                        style={{
                          ...inputStyle,
                          fontSize: 10,
                          padding: "4px 6px",
                          flex: 1,
                        }}
                        placeholder={["#c2410c", "#1d4ed8", "#0f766e"][i]}
                      />
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="Font Size">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() =>
                      setPrefs({ fontSize: Math.max(12, prefs.fontSize - 1) })
                    }
                    style={stepBtn}
                  >
                    A−
                  </button>
                  <div style={{ flex: 1 }}>
                    <input
                      type="range"
                      min={12}
                      max={22}
                      step={1}
                      value={prefs.fontSize}
                      onChange={(e) =>
                        setPrefs({ fontSize: Number(e.target.value) })
                      }
                      style={{
                        width: "100%",
                        accentColor: "var(--accent-primary)",
                        cursor: "pointer",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      <span>12</span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: "var(--accent-primary)",
                          fontSize: 11,
                        }}
                      >
                        {prefs.fontSize}px
                      </span>
                      <span>22</span>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setPrefs({ fontSize: Math.min(22, prefs.fontSize + 1) })
                    }
                    style={stepBtn}
                  >
                    A+
                  </button>
                </div>
                <div
                  style={{
                    marginTop: 10,
                    padding: "9px 12px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 7,
                    fontSize: prefs.fontSize,
                    color: "var(--text-primary)",
                    lineHeight: 1.6,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  The quick brown fox jumps over the lazy dog.
                </div>
              </Section>

              <Section title="Body Font (Sans-serif)">
                <FontPicker
                  presets={SANS_PRESETS}
                  value={prefs.fontSans}
                  customUrl={prefs.customSansUrl}
                  onChange={(v) => setPrefs({ fontSans: v })}
                  onCustomUrl={(url) => setPrefs({ customSansUrl: url })}
                  previewText="The quick brown fox. 0123 456789"
                />
              </Section>

              <Section title="Heading Font (Serif)">
                <FontPicker
                  presets={SERIF_PRESETS}
                  value={prefs.fontSerif}
                  customUrl={prefs.customSerifUrl}
                  onChange={(v) => setPrefs({ fontSerif: v })}
                  onCustomUrl={(url) => setPrefs({ customSerifUrl: url })}
                  previewText="The quick brown fox jumps over the lazy dog."
                />
              </Section>

              <Section title="Code Font (Monospace)" noBorder>
                <FontPicker
                  presets={MONO_PRESETS}
                  value={prefs.fontMono}
                  customUrl={prefs.customMonoUrl}
                  onChange={(v) => setPrefs({ fontMono: v })}
                  onCustomUrl={(url) => setPrefs({ customMonoUrl: url })}
                  previewText="fn main() { println!(42); } // ok"
                />
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        {tab === "appearance" && (
          <div
            style={{
              padding: "12px 18px",
              borderTop: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
              background: "var(--bg-tertiary)",
            }}
          >
            <button
              onClick={resetPrefs}
              style={{
                background: "none",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                padding: "5px 12px",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-muted)",
                transition: "all var(--transition)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-danger)";
                e.currentTarget.style.color = "var(--accent-danger)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-color)";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              Reset defaults
            </button>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
              }}
            >
              Saved automatically
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
