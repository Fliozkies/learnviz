"use client";
import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import PreferencesPanel from "@/components/ui/PreferencesPanel";
import UploadZone from "@/components/course/UploadZone";
import CourseViewer from "@/components/course/CourseViewer";
import CurriculumForge from "@/components/course/CurriculumForge";
import LandingChat from "@/components/ai/LandingChat";
import { Curriculum, SavedCurriculum } from "@/types/curriculum";

const STORAGE_KEY = "lv-curricula";

// ── localStorage store for saved curricula (useSyncExternalStore pattern) ──────
// This is the React-blessed way to read external mutable stores without
// causing hydration mismatches or triggering the set-state-in-effect lint rule.

const savedListeners = new Set<() => void>();

function notifySaved() {
  savedListeners.forEach((fn) => fn());
}

function subscribeSaved(cb: () => void) {
  savedListeners.add(cb);
  return () => savedListeners.delete(cb);
}

// getSnapshot MUST return a stable reference when data hasn't changed.
// useSyncExternalStore calls it on every render and uses Object.is to compare;
// if it returns a new array each time React infinite-loops.
let cachedRaw: string | null = "__UNSET__";
let cachedParsed: SavedCurriculum[] = [];

function getSnapshot(): SavedCurriculum[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedParsed; // same string → same reference
    cachedRaw = raw;
    cachedParsed = raw ? JSON.parse(raw) : [];
    return cachedParsed;
  } catch {
    return cachedParsed;
  }
}

const emptySnapshot: SavedCurriculum[] = [];
function getServerSnapshot(): SavedCurriculum[] {
  return emptySnapshot;
}
function saveCurriculum(entry: SavedCurriculum): void {
  try {
    const existing = getSnapshot();
    const isDuplicate = (e: SavedCurriculum) =>
      e.filename === entry.filename && e.title === entry.title;
    const updated = [entry, ...existing.filter((e) => !isDuplicate(e))].slice(
      0,
      20,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    notifySaved();
  } catch {
    /* storage full */
  }
}

function deleteCurriculum(id: string): void {
  try {
    const existing = getSnapshot();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(existing.filter((e) => e.id !== id)),
    );
    notifySaved();
  } catch {
    /* ignore */
  }
}

export default function Home() {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [filename, setFilename] = useState("");
  const [forgeSchemaReport, setForgeSchemaReport] = useState<
    import("@/components/course/forge/validator").SchemaReport | null
  >(null);

  const handleLoaded = (
    c: Curriculum,
    f: string,
    report?: import("@/components/course/forge/validator").SchemaReport | null,
  ) => {
    setCurriculum(c);
    setFilename(f);
    setForgeSchemaReport(report ?? null);
    const entry: SavedCurriculum = {
      id: crypto.randomUUID(),
      filename: f,
      title:
        typeof c.course.title === "string"
          ? c.course.title
          : (c.course.title?.default ?? f),
      curriculum: c,
      timestamp: Date.now(),
    };
    saveCurriculum(entry);
  };

  return (
    <ThemeProvider>
      {curriculum ? (
        <CourseViewer
          curriculum={curriculum}
          filename={filename}
          schemaReport={forgeSchemaReport}
          onReset={() => {
            setCurriculum(null);
            setFilename("");
            setForgeSchemaReport(null);
          }}
        />
      ) : (
        <>
          <LandingPage onLoaded={handleLoaded} />
          <LandingChat />
        </>
      )}
    </ThemeProvider>
  );
}

// ── Sample rotator ─────────────────────────────────────────────────────────────

function SampleRotator() {
  const [samples, setSamples] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function discover() {
      const found: string[] = [];
      const exts = ["png", "jpg", "jpeg", "webp", "gif"];
      for (let i = 1; i <= 20; i++) {
        let hit = false;
        for (const ext of exts) {
          const path = `/assets/examples/sample_page${i}.${ext}`;
          try {
            const res = await fetch(path, { method: "HEAD" });
            if (res.ok) {
              found.push(path);
              hit = true;
              break;
            }
          } catch {
            /* ignore */
          }
        }
        if (!hit) break;
      }
      if (!cancelled) setSamples(found);
    }
    discover();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (samples.length < 2) return;
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % samples.length);
    }, 4000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [samples]);

  if (samples.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid var(--border-color)",
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={samples[current]}
          src={samples[current]}
          alt={`Sample page ${current + 1}`}
          style={{
            width: "100%",
            display: "block",
            objectFit: "cover",
            animation: "fadeInImg 0.4s ease",
          }}
        />
        {samples.length > 1 && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              gap: 5,
            }}
          >
            {samples.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                style={{
                  width: i === current ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  background:
                    i === current
                      ? "var(--accent-primary)"
                      : "rgba(255,255,255,0.55)",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  transition: "all 0.3s ease",
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          textAlign: "center" as const,
        }}
      >
        {current + 1} / {samples.length}
      </div>
    </div>
  );
}

// ── Landing page ───────────────────────────────────────────────────────────────

function LandingPage({
  onLoaded,
}: {
  onLoaded: (
    c: Curriculum,
    f: string,
    report?: import("@/components/course/forge/validator").SchemaReport | null,
  ) => void;
}) {
  const saved = useSyncExternalStore(
    subscribeSaved,
    getSnapshot,
    getServerSnapshot,
  );
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [mode, setMode] = useState<"open" | "forge">("open");

  const handleDelete = (id: string) => {
    deleteCurriculum(id);
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border-color)",
    borderRadius: 12,
    boxShadow: "var(--shadow-md)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  // Shared tab bar styles
  const tabBar: React.CSSProperties = {
    display: "flex",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
  };
  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "10px 0",
    background: "none",
    border: "none",
    borderBottom: active
      ? "2px solid var(--accent-primary)"
      : "2px solid transparent",
    cursor: active ? "default" : "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: active ? "var(--accent-primary)" : "var(--text-muted)",
    transition: "color 150ms",
  });

  return (
    <div
      className="grid-bg"
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      {/* Header */}
      <header
        style={{
          padding: "0 24px",
          height: 50,
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--bg-secondary)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-serif)",
            fontSize: 16,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          <span style={{ fontSize: 14 }}>◈</span>
          LearnViz
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setPrefsOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 11px",
            background: "transparent",
            border: "1px solid var(--border-color)",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--text-secondary)",
            transition: "all var(--transition)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-tertiary)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <span>⚙</span> Preferences
        </button>
      </header>

      {/* Body */}
      {mode === "forge" ? (
        /* ── Forge mode: full-width solo ── */
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "28px 24px",
          }}
        >
          <div style={{ ...cardStyle, width: "100%", maxWidth: 780 }}>
            <div style={tabBar}>
              <button
                style={tabBtn(false)}
                onClick={() => setMode("open")}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--accent-primary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--text-muted)")
                }
              >
                ← Open Curriculum
              </button>
              <button style={tabBtn(true)}>⚡ Curriculum Forge</button>
            </div>
            <CurriculumForge
              onComplete={(c, f, report) => onLoaded(c, f, report)}
              savedCurricula={saved}
            />
          </div>
        </div>
      ) : (
        /* ── Open mode: original two-column layout ── */
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "28px 24px",
            gap: 16,
          }}
        >
          {/* Left: Upload card with tab toggle */}
          <div style={{ ...cardStyle, flex: "0 0 480px", maxWidth: 480 }}>
            <div style={tabBar}>
              <button style={tabBtn(true)}>Open Curriculum</button>
              <button
                style={tabBtn(false)}
                onClick={() => setMode("forge")}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--accent-primary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--text-muted)")
                }
              >
                ⚡ Forge
              </button>
            </div>
            <div
              style={{
                padding: "20px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <UploadZone onLoaded={onLoaded} />
            </div>
          </div>

          {/* Right column: Recent + Sample Pages */}
          <div
            style={{
              flex: "0 0 260px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {/* Recent curricula */}
            {saved.length > 0 && (
              <div style={cardStyle} suppressHydrationWarning>
                <div
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.1em",
                      color: "var(--text-muted)",
                    }}
                  >
                    Recent
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--text-muted)",
                      background: "var(--bg-tertiary)",
                      borderRadius: 100,
                      padding: "1px 7px",
                    }}
                  >
                    {saved.length}
                  </span>
                </div>
                <div style={{ padding: "6px" }}>
                  {saved.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 10px",
                        borderRadius: 7,
                        transition: "background var(--transition)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "var(--bg-tertiary)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <button
                        onClick={() =>
                          onLoaded(entry.curriculum, entry.filename)
                        }
                        style={{
                          flex: 1,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                          padding: 0,
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            marginBottom: 2,
                            fontFamily: "var(--font-sans)",
                          }}
                        >
                          {entry.title}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            color: "var(--text-muted)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {entry.filename} · {formatDate(entry.timestamp)}
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(entry.id);
                        }}
                        title="Remove"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          fontSize: 14,
                          padding: "2px 4px",
                          borderRadius: 4,
                          flexShrink: 0,
                          transition: "color var(--transition)",
                          lineHeight: 1,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "var(--accent-danger)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = "var(--text-muted)")
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sample pages */}
            <div style={cardStyle}>
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.1em",
                  color: "var(--text-muted)",
                }}
              >
                Sample Pages
              </div>
              <div style={{ padding: "14px 16px" }}>
                <SampleRotator />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer
        style={{
          padding: "10px 24px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          flexShrink: 0,
          background: "var(--bg-secondary)",
        }}
      >
        <span>LearnViz · curriculum-schema v1.0.0</span>
        <span>AI Course Generation Toolkit</span>
      </footer>

      <PreferencesPanel open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
