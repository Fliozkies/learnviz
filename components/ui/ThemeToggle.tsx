"use client";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  // typeof window check: on SSR this is "undefined" so isDark=false (matches DEFAULTS).
  // On the client, ThemeProvider's useLayoutEffect has already applied localStorage prefs
  // before paint, so this reads the correct value without any extra state/effect.
  const isDark = typeof window !== "undefined" && theme === "dark";

  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to Light" : "Switch to Dark"}
      suppressHydrationWarning
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 10px",
        border: "1px solid var(--border-color)",
        borderRadius: "6px",
        background: "var(--bg-tertiary)",
        cursor: "pointer",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        color: "var(--text-secondary)",
        transition: "all var(--transition)",
        fontWeight: "700",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-elevated)";
        e.currentTarget.style.borderColor = "var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-tertiary)";
        e.currentTarget.style.borderColor = "var(--border-color)";
      }}
    >
      <span suppressHydrationWarning style={{ fontSize: "14px" }}>
        {isDark ? "☀️" : "🌙"}
      </span>
      <span suppressHydrationWarning>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
