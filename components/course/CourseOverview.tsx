"use client";
import { Curriculum, resolveLocale } from "@/types/curriculum";
import RichText from "@/components/ui/RichText";
import { NavSelection } from "./Sidebar";
import InlineEditor from "@/components/editor/InlineEditor";

const UNIT_COLORS = [
  "#0056b3",
  "#22863a",
  "#b08800",
  "#7c3aed",
  "#d73a49",
  "#0891b2",
  "#ea580c",
];

export default function CourseOverview({
  curriculum,
  onNavigate,
}: {
  curriculum: Curriculum;
  onNavigate: (sel: NavSelection) => void;
}) {
  const { course, units } = curriculum;

  // Stats
  const totalLessons = units.reduce((n, u) => n + u.lessons.length, 0);
  const totalTopics = units.reduce(
    (n, u) => u.lessons.reduce((m, l) => m + l.topics.length, n),
    0,
  );
  const totalQuestions = units.reduce(
    (n, u) =>
      u.lessons.reduce(
        (m, l) =>
          l.topics.reduce((k, t) => k + (t.practice_questions?.length ?? 0), m),
        n,
      ),
    0,
  );
  const totalAssessments = units.reduce(
    (n, u) =>
      n +
      (u.assessments?.length ?? 0) +
      u.lessons.reduce((m, l) => m + (l.assessments?.length ?? 0), 0),
    0,
  );

  return (
    <div>
      {/* Hero */}
      <div
        style={{
          padding: "32px",
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border-color)",
          borderRadius: "4px",
          marginBottom: "32px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative grid lines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "var(--bg-grid)",
            backgroundSize: "24px 24px",
            opacity: 0.4,
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "12px",
            }}
          >
            {course.subject && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: "700",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "var(--accent-primary)",
                  background:
                    "color-mix(in srgb, var(--accent-primary) 10%, transparent)",
                  border:
                    "1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)",
                  padding: "3px 12px",
                  borderRadius: "2px",
                }}
              >
                {course.subject}
              </span>
            )}
            {course.level && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: "700",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                  padding: "3px 12px",
                  borderRadius: "2px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                }}
              >
                {course.level}
              </span>
            )}
          </div>
          <h1 style={{ fontSize: "2.5rem", marginBottom: "8px" }}>
            <InlineEditor
              value={resolveLocale(course.title)}
              path="/course/title"
              label="Course title"
            />
          </h1>
          {course.subtitle && (
            <p
              style={{
                fontSize: "1.1rem",
                color: "var(--text-secondary)",
                marginBottom: "16px",
              }}
            >
              <InlineEditor
                value={resolveLocale(course.subtitle)}
                path="/course/subtitle"
                label="Course subtitle"
              />
            </p>
          )}
          {course.description && (
            <div
              style={{
                color: "var(--text-secondary)",
                lineHeight: "1.75",
                maxWidth: "680px",
                fontSize: "15px",
              }}
            >
              <RichText content={course.description} />
            </div>
          )}
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            {course.grade_band && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                📚 {course.grade_band}
              </span>
            )}
            {course.author && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                ✍ {course.author}
              </span>
            )}
            {course.institution && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                🏫 {course.institution}
              </span>
            )}
            {course.language && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                🌐 {course.language.toUpperCase()}
              </span>
            )}
            {course.version && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                v{course.version}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "12px",
          marginBottom: "32px",
        }}
      >
        {[
          { label: "Units", value: units.length, icon: "📦" },
          { label: "Lessons", value: totalLessons, icon: "📖" },
          { label: "Topics", value: totalTopics, icon: "📑" },
          { label: "Practice Qs", value: totalQuestions, icon: "✏️" },
          { label: "Assessments", value: totalAssessments, icon: "📝" },
          ...(curriculum.glossary
            ? [
                {
                  label: "Vocab Terms",
                  value: curriculum.glossary.length,
                  icon: "📖",
                },
              ]
            : []),
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: "16px",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "4px",
              textAlign: "center",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ fontSize: "20px", marginBottom: "4px" }}>
              {stat.icon}
            </div>
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "1.6rem",
                fontWeight: "700",
                color: "var(--accent-primary)",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Units overview */}
      <h2 style={{ fontSize: "1.3rem", marginBottom: "16px" }}>Course Units</h2>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginBottom: "32px",
        }}
      >
        {units.map((unit, ui) => {
          const color = unit.color || UNIT_COLORS[ui % UNIT_COLORS.length];
          const topicCount = unit.lessons.reduce(
            (n, l) => n + l.topics.length,
            0,
          );
          return (
            <button
              key={unit.id}
              className="card"
              onClick={() => onNavigate({ type: "unit", unitId: unit.id })}
              style={{
                padding: "20px 24px",
                textAlign: "left",
                cursor: "pointer",
                borderLeft: `5px solid ${color}`,
                display: "flex",
                alignItems: "flex-start",
                gap: "20px",
                background: "var(--card-bg)",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "4px",
                  background: `color-mix(in srgb, ${color} 15%, transparent)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  fontWeight: "700",
                  color,
                  flexShrink: 0,
                }}
              >
                {String(ui + 1).padStart(2, "0")}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: "1.1rem", marginBottom: "4px" }}>
                  <InlineEditor
                    value={resolveLocale(unit.title)}
                    path={`/units/${ui}/title`}
                    label="Unit title"
                  />
                </h3>
                {unit.subtitle && (
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                      marginBottom: "8px",
                    }}
                  >
                    <InlineEditor
                      value={resolveLocale(unit.subtitle)}
                      path={`/units/${ui}/subtitle`}
                      label="Unit subtitle"
                    />
                  </p>
                )}
                {unit.overview && (
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--text-muted)",
                      marginBottom: "8px",
                      lineHeight: "1.5",
                    }}
                  >
                    {(typeof unit.overview === "string"
                      ? unit.overview
                      : unit.overview.content
                    ).slice(0, 160)}
                    {(typeof unit.overview === "string"
                      ? unit.overview
                      : unit.overview.content
                    ).length > 160
                      ? "…"
                      : ""}
                  </p>
                )}
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      color: "var(--text-muted)",
                    }}
                  >
                    {unit.lessons.length} lessons
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      color: "var(--text-muted)",
                    }}
                  >
                    {topicCount} topics
                  </span>
                  {unit.duration && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                      }}
                    >
                      ⏱{" "}
                      {unit.duration.label || `${unit.duration.weeks ?? "?"}wk`}
                    </span>
                  )}
                </div>
              </div>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "18px",
                  flexShrink: 0,
                  alignSelf: "center",
                }}
              >
                →
              </div>
            </button>
          );
        })}
      </div>

      {/* Glossary preview */}
      {curriculum.glossary && curriculum.glossary.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <h2 style={{ fontSize: "1.3rem" }}>Glossary Preview</h2>
            <button
              className="btn btn-ghost"
              style={{ fontSize: "12px" }}
              onClick={() => onNavigate({ type: "glossary" })}
            >
              View all {curriculum.glossary.length} terms →
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: "8px",
            }}
          >
            {curriculum.glossary.slice(0, 6).map((entry, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 16px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "4px",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "13px",
                    fontWeight: "700",
                    color: "var(--accent-primary)",
                    marginBottom: "4px",
                  }}
                >
                  {entry.term}
                </p>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    lineHeight: "1.5",
                  }}
                >
                  <RichText content={entry.definition} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {course.tags && course.tags.length > 0 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {course.tags.map((tag) => (
            <span
              key={tag}
              style={{
                padding: "4px 10px",
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                borderRadius: "2px",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--text-muted)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
