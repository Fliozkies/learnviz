"use client";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useCallback,
  useState,
  ReactNode,
} from "react";

// ─── Font presets ─────────────────────────────────────────────────────────────

export interface FontPreset {
  label: string;
  value: string;
  url?: string;
}

export const SANS_PRESETS: FontPreset[] = [
  { label: "Geist", value: "'Geist', -apple-system, sans-serif" },
  {
    label: "Inter",
    value: "'Inter', sans-serif",
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
  },
  {
    label: "DM Sans",
    value: "'DM Sans', sans-serif",
    url: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap",
  },
  {
    label: "Nunito",
    value: "'Nunito', sans-serif",
    url: "https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;600;700&display=swap",
  },
  {
    label: "Atkinson",
    value: "'Atkinson Hyperlegible', sans-serif",
    url: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap",
  },
  {
    label: "System UI",
    value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
];

export const SERIF_PRESETS: FontPreset[] = [
  { label: "Instrument", value: "'Instrument Serif', Georgia, serif" },
  {
    label: "Lora",
    value: "'Lora', Georgia, serif",
    url: "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&display=swap",
  },
  {
    label: "Playfair",
    value: "'Playfair Display', Georgia, serif",
    url: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap",
  },
  {
    label: "Merriweather",
    value: "'Merriweather', Georgia, serif",
    url: "https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap",
  },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
];

export const MONO_PRESETS: FontPreset[] = [
  { label: "Space Mono", value: "'Space Mono', monospace" },
  {
    label: "JetBrains",
    value: "'JetBrains Mono', monospace",
    url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap",
  },
  {
    label: "Fira Code",
    value: "'Fira Code', monospace",
    url: "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap",
  },
  {
    label: "IBM Plex Mono",
    value: "'IBM Plex Mono', monospace",
    url: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap",
  },
  { label: "Courier", value: "'Courier New', Courier, monospace" },
];

// ─── Color palette presets ────────────────────────────────────────────────────

export interface ColorPalette {
  id: string;
  label: string;
  accentPrimary: string;
  accentSecondary: string;
  accentMath: string;
}

export const COLOR_PALETTES: ColorPalette[] = [
  {
    id: "default",
    label: "Ember",
    accentPrimary: "#c2410c",
    accentSecondary: "#1d4ed8",
    accentMath: "#0f766e",
  },
  {
    id: "ocean",
    label: "Ocean",
    accentPrimary: "#0369a1",
    accentSecondary: "#7c3aed",
    accentMath: "#0d9488",
  },
  {
    id: "forest",
    label: "Forest",
    accentPrimary: "#166534",
    accentSecondary: "#92400e",
    accentMath: "#1e40af",
  },
  {
    id: "rose",
    label: "Rose",
    accentPrimary: "#be185d",
    accentSecondary: "#7c3aed",
    accentMath: "#0f766e",
  },
  {
    id: "violet",
    label: "Violet",
    accentPrimary: "#6d28d9",
    accentSecondary: "#0369a1",
    accentMath: "#15803d",
  },
  {
    id: "slate",
    label: "Slate",
    accentPrimary: "#334155",
    accentSecondary: "#b45309",
    accentMath: "#0f766e",
  },
  {
    id: "custom",
    label: "Custom",
    accentPrimary: "#c2410c",
    accentSecondary: "#1d4ed8",
    accentMath: "#0f766e",
  },
];

// ─── Preferences type ─────────────────────────────────────────────────────────

export interface Preferences {
  theme: "light" | "dark";
  fontSize: number;
  fontSans: string;
  fontSerif: string;
  fontMono: string;
  customSansUrl?: string;
  customSerifUrl?: string;
  customMonoUrl?: string;
  paletteId: string;
  accentPrimary: string;
  accentSecondary: string;
  accentMath: string;
}

export const DEFAULTS: Preferences = {
  theme: "light",
  fontSize: 15,
  fontSans: SANS_PRESETS[0].value,
  fontSerif: SERIF_PRESETS[0].value,
  fontMono: MONO_PRESETS[0].value,
  paletteId: "default",
  accentPrimary: "#c2410c",
  accentSecondary: "#1d4ed8",
  accentMath: "#0f766e",
};

const STORAGE_KEY = "lv-prefs";

// ─── Context ──────────────────────────────────────────────────────────────────

interface PrefsCtx {
  prefs: Preferences;
  setPrefs: (p: Partial<Preferences>) => void;
  toggleTheme: () => void;
  resetPrefs: () => void;
}

const Ctx = createContext<PrefsCtx>({
  prefs: DEFAULTS,
  setPrefs: () => {},
  toggleTheme: () => {},
  resetPrefs: () => {},
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadPrefs(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    if (!stored.theme) {
      stored.theme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

function savePrefs(p: Preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {}
}

function injectFontLink(url: string) {
  if (!url) return;
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = Object.assign(document.createElement("link"), {
    rel: "stylesheet",
    href: url,
  });
  document.head.appendChild(link);
}

export function applyPrefs(p: Preferences) {
  const root = document.documentElement;

  root.setAttribute("data-theme", p.theme);
  root.style.setProperty("--font-size-base", `${p.fontSize}px`);
  root.style.setProperty("--font-sans", p.fontSans);
  root.style.setProperty("--font-serif", p.fontSerif);
  root.style.setProperty("--font-mono", p.fontMono);

  for (const preset of [...SANS_PRESETS, ...SERIF_PRESETS, ...MONO_PRESETS]) {
    if (
      preset.url &&
      (preset.value === p.fontSans ||
        preset.value === p.fontSerif ||
        preset.value === p.fontMono)
    )
      injectFontLink(preset.url);
  }

  if (p.customSansUrl) injectFontLink(p.customSansUrl);
  if (p.customSerifUrl) injectFontLink(p.customSerifUrl);
  if (p.customMonoUrl) injectFontLink(p.customMonoUrl);

  root.style.setProperty("--accent-primary", p.accentPrimary);
  root.style.setProperty(
    "--accent-primary-soft",
    `color-mix(in srgb, ${p.accentPrimary} 12%, ${
      p.theme === "dark" ? "#111010" : "#f5f3ef"
    })`,
  );
  root.style.setProperty("--accent-secondary", p.accentSecondary);
  root.style.setProperty("--accent-math", p.accentMath);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  // ✅ Lazy initialization — no effect needed
  const [prefs, setPrefsState] = useState<Preferences>(() => loadPrefs());

  // ✅ Effect now only syncs DOM (valid usage)
  useLayoutEffect(() => {
    applyPrefs(prefs);
  }, [prefs]);

  const setPrefs = useCallback((patch: Partial<Preferences>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setPrefsState((prev) => {
      const next: Preferences = {
        ...prev,
        theme: prev.theme === "light" ? "dark" : "light",
      };
      savePrefs(next);
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    setPrefsState((prev) => {
      const reset: Preferences = { ...DEFAULTS, theme: prev.theme };
      savePrefs(reset);
      return reset;
    });
  }, []);

  return (
    <Ctx.Provider value={{ prefs, setPrefs, toggleTheme, resetPrefs }}>
      {children}
    </Ctx.Provider>
  );
}

export const usePrefs = () => useContext(Ctx);

export const useTheme = () => {
  const { prefs, toggleTheme } = useContext(Ctx);
  return { theme: prefs.theme, toggle: toggleTheme };
};
