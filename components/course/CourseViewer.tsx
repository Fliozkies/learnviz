"use client";
import React, { useState } from "react";
import { Curriculum, resolveLocale } from "@/types/curriculum";
import Sidebar, { NavSelection } from "./Sidebar";
import CourseOverview from "./CourseOverview";
import UnitView from "./UnitView";
import LessonView from "./LessonView";
import AssessmentView from "./AssessmentView";
import TestView from "./TestView";
import GlossaryView from "./GlossaryView";
import PreferencesPanel, {
  ToolsState,
  subjectNeedsEquationStudio,
} from "@/components/ui/PreferencesPanel";
import ChatPanel, { ChatContext } from "@/components/ai/ChatPanel";
import EquationStudio from "@/components/ai/EquationStudio";
import { EditProvider, useEditor } from "@/components/editor/EditContext";
import EditorToolbar from "@/components/editor/EditorToolbar";

import { SchemaReport } from "@/components/course/forge/validator";

interface Props {
  curriculum: Curriculum;
  filename: string;
  onReset: () => void;
  schemaReport?: SchemaReport | null;
}

// ─── Inner viewer — consumes EditContext ──────────────────────────────────────

function CourseViewerInner({
  filename,
  onReset,
  schemaReport,
}: {
  filename: string;
  onReset: () => void;
  schemaReport?: SchemaReport | null;
}) {
  const { state } = useEditor();
  const { curriculum, editMode } = state;
  const { units } = curriculum;

  const [selected, setSelected] = useState<NavSelection>({ type: "overview" });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatContext, setChatContext] = useState<ChatContext | undefined>();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [reportDismissed, setReportDismissed] = useState(false);

  // ── Tools state — derive defaults from subject ─────────────────────────────
  const subjectIsRelevant = subjectNeedsEquationStudio(
    curriculum.course.subject ?? "",
  );
  const [toolsState, setToolsState] = useState<ToolsState>({
    equationStudioEnabled: subjectIsRelevant,
  });
  const [equationStudioOpen, setEquationStudioOpen] = useState(false);

  function patchTools(patch: Partial<ToolsState>) {
    setToolsState((prev) => {
      const next = { ...prev, ...patch };
      // Close studio if it gets disabled
      if (patch.equationStudioEnabled === false) setEquationStudioOpen(false);
      return next;
    });
  }

  const handleSelect = (sel: NavSelection) => {
    setSelected(sel);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const renderContent = () => {
    if (selected.type === "overview") {
      return (
        <CourseOverview curriculum={curriculum} onNavigate={handleSelect} />
      );
    }

    if (selected.type === "glossary") {
      return <GlossaryView entries={curriculum.glossary ?? []} />;
    }

    if (selected.type === "unit") {
      const unit = units.find((u) => u.id === selected.unitId);
      if (!unit) return <NotFound label="Unit not found" />;
      return (
        <UnitView
          unit={unit}
          unitIndex={units.indexOf(unit)}
          onNavigate={handleSelect}
        />
      );
    }

    if (selected.type === "lesson") {
      const unit = units.find((u) => u.id === selected.unitId);
      const lesson = unit?.lessons.find((l) => l.id === selected.lessonId);
      if (!lesson) return <NotFound label="Lesson not found" />;
      const unitIndex = units.indexOf(unit!);
      const lessonIndex = unit!.lessons.indexOf(lesson);
      return (
        <div>
          <Breadcrumb
            items={[
              {
                label: resolveLocale(unit!.title),
                onClick: () => handleSelect({ type: "unit", unitId: unit!.id }),
              },
              { label: resolveLocale(lesson.title) },
            ]}
          />
          <LessonView
            lesson={lesson}
            onContextChange={setChatContext}
            lessonPath={`/units/${unitIndex}/lessons/${lessonIndex}`}
          />
        </div>
      );
    }

    if (selected.type === "assessment") {
      const unit = units.find((u) => u.id === selected.unitId);
      const assessment = unit?.assessments?.find(
        (a) => a.id === selected.assessmentId,
      );
      if (!assessment) return <NotFound label="Assessment not found" />;
      return (
        <div>
          <Breadcrumb
            items={[
              {
                label: resolveLocale(unit!.title),
                onClick: () => handleSelect({ type: "unit", unitId: unit!.id }),
              },
              { label: resolveLocale(assessment.title) },
            ]}
          />
          <AssessmentView assessment={assessment} />
        </div>
      );
    }

    if (selected.type === "test") {
      const unit = units.find((u) => u.id === selected.unitId);
      const assessment = unit?.assessments?.find(
        (a) => a.id === selected.assessmentId,
      );
      if (!assessment) return <NotFound label="Assessment not found" />;
      return (
        <div>
          <Breadcrumb
            items={[
              {
                label: resolveLocale(unit!.title),
                onClick: () => handleSelect({ type: "unit", unitId: unit!.id }),
              },
              {
                label: resolveLocale(assessment.title),
                onClick: () =>
                  handleSelect({
                    type: "assessment",
                    unitId: unit!.id,
                    assessmentId: assessment.id,
                  }),
              },
              { label: "Take Test" },
            ]}
          />
          <TestView
            assessment={assessment}
            curriculumId={curriculum.course.id}
            onBack={() =>
              handleSelect({
                type: "assessment",
                unitId: unit!.id,
                assessmentId: assessment.id,
              })
            }
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "flex-start",
        background: "var(--bg-primary)",
      }}
    >
      {sidebarOpen && (
        <Sidebar
          curriculum={curriculum}
          selected={selected}
          onSelect={handleSelect}
          filename={filename}
          onReset={onReset}
        />
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          minHeight: "100vh",
        }}
      >
        {/* Top bar */}
        <header
          style={{
            height: "52px",
            borderBottom: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: "8px",
            position: "sticky",
            top: 0,
            zIndex: 10,
            flexShrink: 0,
          }}
        >
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            style={topBarBtn}
            title="Toggle sidebar"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-tertiary)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            ☰
          </button>

          <div
            style={{
              width: 1,
              height: 20,
              background: "var(--border-color)",
              margin: "0 2px",
              flexShrink: 0,
            }}
          />

          <div
            style={{
              flex: 1,
              fontFamily: "var(--font-serif)",
              fontSize: 14,
              color: "var(--text-secondary)",
              letterSpacing: "-0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {resolveLocale(curriculum.course.title)}
            {editMode && (
              <span
                style={{
                  marginLeft: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--accent-primary)",
                  background: "var(--accent-primary-soft)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                Edit Mode
              </span>
            )}
          </div>

          <EditorToolbar filename={filename} curriculum={curriculum} />

          <div
            style={{
              width: 1,
              height: 20,
              background: "var(--border-color)",
              margin: "0 2px",
              flexShrink: 0,
            }}
          />

          {/* Equation Studio button — only shown if tool is enabled */}
          {toolsState.equationStudioEnabled && (
            <button
              onClick={() => setEquationStudioOpen((v) => !v)}
              title="Equation Studio"
              style={{
                ...topBarBtn,
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: 16,
                color: equationStudioOpen ? "var(--accent-math)" : undefined,
                background: equationStudioOpen
                  ? "color-mix(in srgb, var(--accent-math) 12%, var(--bg-tertiary))"
                  : undefined,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "color-mix(in srgb, var(--accent-math) 12%, var(--bg-tertiary))";
                e.currentTarget.style.color = "var(--accent-math)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = equationStudioOpen
                  ? "color-mix(in srgb, var(--accent-math) 12%, var(--bg-tertiary))"
                  : "none";
                e.currentTarget.style.color = equationStudioOpen
                  ? "var(--accent-math)"
                  : "var(--text-muted)";
              }}
            >
              ƒ
            </button>
          )}

          {/* Preferences */}
          <button
            onClick={() => setPrefsOpen(true)}
            title="Preferences"
            style={topBarBtn}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-tertiary)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            ⚙
          </button>
        </header>

        {/* Edit mode banner */}
        {editMode && (
          <div
            style={{
              padding: "7px 20px",
              background: "var(--accent-primary-soft)",
              borderBottom:
                "1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--accent-primary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 700 }}>✏ Edit Mode active</span>
            <span style={{ opacity: 0.7 }}>
              — Click any text to edit it inline. Cmd+Z to undo, Cmd+Shift+Z to
              redo.
            </span>
          </div>
        )}

        {/* Schema report banner */}
        {schemaReport && !reportDismissed && (
          <div
            style={{
              padding: "10px 20px",
              background: schemaReport.passed
                ? "color-mix(in srgb, var(--accent-success) 8%, var(--bg-secondary))"
                : "color-mix(in srgb, var(--accent-warning) 8%, var(--bg-secondary))",
              borderBottom: `1px solid ${schemaReport.passed ? "var(--accent-success)" : "var(--accent-warning)"}33`,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <span
              style={{
                fontWeight: 700,
                color: schemaReport.passed
                  ? "var(--accent-success)"
                  : "var(--accent-warning)",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {schemaReport.passed ? "✓ Schema valid" : "⚠ Schema issues"}
            </span>
            <div style={{ flex: 1 }}>
              <span style={{ color: "var(--text-secondary)" }}>
                {schemaReport.stats.units} units · {schemaReport.stats.lessons}{" "}
                lessons · {schemaReport.stats.topics} topics ·{" "}
                {schemaReport.stats.contentBlocks} blocks ·{" "}
                {schemaReport.stats.questions} questions
              </span>
              {schemaReport.issues.length > 0 && (
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    maxHeight: 120,
                    overflowY: "auto",
                  }}
                >
                  {schemaReport.issues.map((issue, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 8,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          flexShrink: 0,
                          color:
                            issue.severity === "error"
                              ? "var(--accent-danger)"
                              : "var(--accent-warning)",
                        }}
                      >
                        {issue.severity === "error" ? "ERR" : "WRN"}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {issue.path}
                      </span>
                      <span>{issue.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setReportDismissed(true)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: 16,
                lineHeight: 1,
                padding: "0 2px",
                flexShrink: 0,
              }}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content area */}
        <main
          className="grid-bg"
          style={{
            flex: 1,
            padding: "32px 40px",
            maxWidth: "900px",
            width: "100%",
            margin: "0 auto",
          }}
        >
          <div className="fade-in" key={JSON.stringify(selected)}>
            {renderContent()}
          </div>
        </main>
      </div>

      <ChatPanel context={chatContext} />

      {/* Equation Studio — controlled by tools state */}
      {toolsState.equationStudioEnabled && (
        <EquationStudio
          open={equationStudioOpen}
          onClose={() => setEquationStudioOpen(false)}
        />
      )}

      <PreferencesPanel
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        toolsState={toolsState}
        onToolsChange={patchTools}
        subjectIsRelevant={subjectIsRelevant}
      />
    </div>
  );
}

// ─── Outer wrapper — provides EditContext ─────────────────────────────────────

export default function CourseViewer({
  curriculum,
  filename,
  onReset,
  schemaReport,
}: Props) {
  return (
    <EditProvider initialCurriculum={curriculum}>
      <CourseViewerInner
        filename={filename}
        onReset={onReset}
        schemaReport={schemaReport}
      />
    </EditProvider>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

const topBarBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: "14px",
  fontWeight: 700,
  color: "var(--text-muted)",
  padding: "4px 7px",
  borderRadius: "4px",
  transition: "all var(--transition)",
  lineHeight: 1,
};

function Breadcrumb({
  items,
}: {
  items: Array<{ label: string; onClick?: () => void }>;
}) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 20,
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--text-muted)",
      }}
    >
      {items.map((item, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {i > 0 && <span>/</span>}
          {item.onClick ? (
            <button
              onClick={item.onClick}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--accent-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                padding: 0,
              }}
            >
              {item.label}
            </button>
          ) : (
            <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function NotFound({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: 48,
        textAlign: "center",
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
      }}
    >
      <p style={{ fontSize: 24, marginBottom: 8 }}>⚠</p>
      <p>{label}</p>
    </div>
  );
}
