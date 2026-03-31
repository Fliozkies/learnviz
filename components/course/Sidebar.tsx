"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Curriculum, resolveLocale } from "@/types/curriculum";

export type NavSelection =
  | { type: "overview" }
  | { type: "unit"; unitId: string }
  | { type: "lesson"; unitId: string; lessonId: string }
  | { type: "topic"; unitId: string; lessonId: string; topicId: string }
  | { type: "assessment"; unitId: string; assessmentId: string }
  | { type: "test"; unitId: string; assessmentId: string }
  | { type: "glossary" };

interface Props {
  curriculum: Curriculum;
  selected: NavSelection;
  onSelect: (sel: NavSelection) => void;
  filename: string;
  onReset: () => void;
}

const UNIT_COLORS = [
  "#0056b3",
  "#22863a",
  "#b08800",
  "#7c3aed",
  "#d73a49",
  "#0891b2",
  "#ea580c",
];

export default function Sidebar({
  curriculum,
  selected,
  onSelect,
  filename,
  onReset,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [width, setWidth] = useState(280);
  const resizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);
  const { course, units } = curriculum;

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      resizing.current = true;
      resizeStartX.current = e.clientX;
      resizeStartW.current = width;
      e.preventDefault();
    },
    [width],
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizing.current) return;
      const dx = e.clientX - resizeStartX.current;
      setWidth(Math.max(200, Math.min(520, resizeStartW.current + dx)));
    }
    function onMouseUp() {
      resizing.current = false;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const toggleUnit = (uid: string) => {
    setExpanded((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  const isActive = (sel: NavSelection) =>
    JSON.stringify(sel) === JSON.stringify(selected);

  return (
    <nav
      style={{
        width: `${width}px`,
        minWidth: `${width}px`,
        height: "100vh",
        overflowY: "auto",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        position: "sticky" as React.CSSProperties["position"],
        top: 0,
        alignSelf: "flex-start",
        flexShrink: 0,
        boxSizing: "border-box" as React.CSSProperties["boxSizing"],
      }}
    >
      {/* Resize handle on right edge */}
      <div
        onMouseDown={onResizeMouseDown}
        title="Drag to resize sidebar"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 5,
          cursor: "col-resize",
          zIndex: 10,
          background: "transparent",
          transition: "background 150ms",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background =
            "color-mix(in srgb, var(--accent-primary) 30%, transparent)")
        }
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      />
      {/* Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--bg-tertiary)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: "700",
              color: "var(--accent-primary)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            LearnViz
          </span>
          <button
            onClick={onReset}
            title="Back to home"
            style={{
              background: "none",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              padding: "3px 9px",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--text-muted)",
              transition: "all var(--transition)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-primary)";
              e.currentTarget.style.color = "var(--accent-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-color)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            ← Home
          </button>
        </div>
        <h2
          style={{
            fontSize: "15px",
            fontWeight: "700",
            lineHeight: "1.3",
            marginBottom: "4px",
          }}
        >
          {resolveLocale(course.title)}
        </h2>
        {course.subtitle && (
          <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            {resolveLocale(course.subtitle)}
          </p>
        )}
        <div
          style={{
            marginTop: "8px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-muted)",
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          {course.level && <span>{course.level}</span>}
          {course.grade_band && <span>· {course.grade_band}</span>}
          {course.language && <span>· {course.language.toUpperCase()}</span>}
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: "8px" }}>
        {/* Overview */}
        <button
          className={`sidebar-item${isActive({ type: "overview" }) ? " active" : ""}`}
          onClick={() => onSelect({ type: "overview" })}
          style={{ marginBottom: "4px" }}
        >
          <span>📋</span>
          <span>Course Overview</span>
        </button>

        {/* Divider */}
        <div
          style={{
            padding: "8px 12px 4px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--text-muted)",
          }}
        >
          Units ({units.length})
        </div>

        {units.map((unit, ui) => {
          const color = unit.color || UNIT_COLORS[ui % UNIT_COLORS.length];
          const isExpanded = expanded[unit.id] ?? false;
          const unitActive = isActive({ type: "unit", unitId: unit.id });

          return (
            <div key={unit.id} style={{ marginBottom: "2px" }}>
              {/* Unit row */}
              <div
                style={{ display: "flex", alignItems: "center", gap: "2px" }}
              >
                <button
                  className={`sidebar-item${unitActive ? " active" : ""}`}
                  onClick={() => onSelect({ type: "unit", unitId: unit.id })}
                  style={{ flex: 1, paddingLeft: "8px" }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                      marginTop: "2px",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      lineHeight: "1.4",
                    }}
                  >
                    {resolveLocale(unit.title)}
                  </span>
                </button>
                <button
                  onClick={() => toggleUnit(unit.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px 6px",
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    flexShrink: 0,
                  }}
                >
                  {isExpanded ? "▾" : "▸"}
                </button>
              </div>

              {/* Lessons + assessments */}
              {isExpanded && (
                <div
                  style={{ paddingLeft: "16px", marginTop: "2px" }}
                  className="slide-in"
                >
                  {unit.lessons.map((lesson) => {
                    const lessonActive = isActive({
                      type: "lesson",
                      unitId: unit.id,
                      lessonId: lesson.id,
                    });
                    return (
                      <button
                        key={lesson.id}
                        className={`sidebar-item${lessonActive ? " active" : ""}`}
                        onClick={() =>
                          onSelect({
                            type: "lesson",
                            unitId: unit.id,
                            lessonId: lesson.id,
                          })
                        }
                        style={{ fontSize: "13px", marginBottom: "1px" }}
                      >
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                          }}
                        >
                          L
                        </span>
                        <span>{resolveLocale(lesson.title)}</span>
                      </button>
                    );
                  })}
                  {unit.assessments &&
                    unit.assessments.length > 0 &&
                    unit.assessments.map((a) => (
                      <div key={a.id} style={{ marginBottom: "1px" }}>
                        {/* View assessment */}
                        <button
                          className={`sidebar-item${isActive({ type: "assessment", unitId: unit.id, assessmentId: a.id }) ? " active" : ""}`}
                          onClick={() =>
                            onSelect({
                              type: "assessment",
                              unitId: unit.id,
                              assessmentId: a.id,
                            })
                          }
                          style={{
                            fontSize: "12px",
                            color: "var(--accent-danger)",
                          }}
                        >
                          <span>📝</span>
                          <span style={{ flex: 1, textAlign: "left" }}>
                            {resolveLocale(a.title)}
                          </span>
                        </button>
                        {/* Take test — only show if assessment has questions */}
                        {(a.questions?.length ?? 0) > 0 && (
                          <button
                            className={`sidebar-item${isActive({ type: "test", unitId: unit.id, assessmentId: a.id }) ? " active" : ""}`}
                            onClick={() =>
                              onSelect({
                                type: "test",
                                unitId: unit.id,
                                assessmentId: a.id,
                              })
                            }
                            style={{
                              fontSize: "11px",
                              paddingLeft: "28px",
                              color: "var(--accent-primary)",
                            }}
                          >
                            <span>🎯</span>
                            <span>Take Test</span>
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Course assessments */}
        {curriculum.course_assessments &&
          curriculum.course_assessments.length > 0 && (
            <>
              <div
                style={{
                  padding: "12px 12px 4px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-muted)",
                }}
              >
                Exams
              </div>
              {curriculum.course_assessments.map((a) => (
                <button
                  key={a.id}
                  className="sidebar-item"
                  style={{ fontSize: "13px" }}
                >
                  <span>🎯</span>
                  <span>{resolveLocale(a.title)}</span>
                </button>
              ))}
            </>
          )}

        {/* Glossary */}
        {curriculum.glossary && curriculum.glossary.length > 0 && (
          <button
            className={`sidebar-item${isActive({ type: "glossary" }) ? " active" : ""}`}
            onClick={() => onSelect({ type: "glossary" })}
            style={{ marginTop: "8px" }}
          >
            <span>📖</span>
            <span>Glossary ({curriculum.glossary.length})</span>
          </button>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border-color)",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "var(--text-muted)",
          background: "var(--bg-tertiary)",
        }}
      >
        <div
          title={filename}
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          📄 {filename}
        </div>
        <div style={{ marginTop: "4px" }}>
          schema v{curriculum.schema_version} · {units.length} units
        </div>
      </div>
    </nav>
  );
}
