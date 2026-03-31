"use client";
import { Unit, resolveLocale, resolveObjectiveText } from "@/types/curriculum";
import RichText from "@/components/ui/RichText";
import AssessmentView from "./AssessmentView";
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

export default function UnitView({
  unit,
  unitIndex,
  onNavigate,
}: {
  unit: Unit;
  unitIndex: number;
  onNavigate: (sel: NavSelection) => void;
}) {
  const color = unit.color || UNIT_COLORS[unitIndex % UNIT_COLORS.length];
  const unitPath = `/units/${unitIndex}`;

  return (
    <div>
      {/* Unit hero */}
      <div
        style={{
          padding: "28px 32px",
          background: `linear-gradient(135deg, color-mix(in srgb, ${color} 10%, var(--bg-secondary)), var(--bg-secondary))`,
          border: `1px solid color-mix(in srgb, ${color} 25%, var(--border-color))`,
          borderLeft: `6px solid ${color}`,
          borderRadius: "4px",
          marginBottom: "28px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color,
            marginBottom: "8px",
          }}
        >
          Unit {unit.order ?? unitIndex + 1}
        </div>
        <h1 style={{ fontSize: "2rem", marginBottom: "8px" }}>
          <InlineEditor
            value={resolveLocale(unit.title)}
            path={`${unitPath}/title`}
            label="Unit title"
          />
        </h1>
        {unit.subtitle && (
          <p
            style={{
              fontSize: "1rem",
              color: "var(--text-secondary)",
              marginBottom: "12px",
            }}
          >
            <InlineEditor
              value={resolveLocale(unit.subtitle)}
              path={`${unitPath}/subtitle`}
              label="Unit subtitle"
            />
          </p>
        )}
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              color: "var(--text-muted)",
            }}
          >
            {unit.lessons.length} lesson{unit.lessons.length !== 1 ? "s" : ""}
          </span>
          {unit.duration && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              ⏱ {unit.duration.label || `${unit.duration.weeks ?? "?"} wk`}
            </span>
          )}
          {unit.weight !== undefined && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              Weight: {unit.weight}%
            </span>
          )}
        </div>
      </div>

      {/* Overview */}
      {unit.overview && (
        <div
          style={{
            marginBottom: "24px",
            lineHeight: "1.75",
            color: "var(--text-secondary)",
            fontSize: "15px",
          }}
        >
          <RichText content={unit.overview} />
        </div>
      )}

      {/* Unit objectives */}
      {unit.objectives && unit.objectives.length > 0 && (
        <div
          style={{
            marginBottom: "28px",
            padding: "20px",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "4px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-muted)",
              marginBottom: "12px",
            }}
          >
            Unit Objectives
          </p>
          <ul style={{ paddingLeft: "20px" }}>
            {unit.objectives.map((obj, i) => (
              <li
                key={obj.id || i}
                style={{
                  marginBottom: "8px",
                  fontSize: "14px",
                  lineHeight: "1.6",
                }}
              >
                <InlineEditor
                  value={resolveObjectiveText(obj)}
                  path={`${unitPath}/objectives/${i}/statement`}
                  label="Objective"
                  renderView={(v) => <RichText content={v} inline />}
                />
                {obj.bloom_level && (
                  <span
                    className={`bloom-badge bloom-${obj.bloom_level}`}
                    style={{ marginLeft: "8px" }}
                  >
                    {obj.bloom_level}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lessons grid */}
      <div style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "16px" }}>Lessons</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "12px",
          }}
        >
          {unit.lessons.map((lesson, li) => {
            // const topicCount = lesson.topics.reduce(
            //   (n, t) => n + (t.content_blocks?.length ?? 0),
            //   0,
            // );
            const qCount = lesson.topics.reduce(
              (n, t) => n + (t.practice_questions?.length ?? 0),
              0,
            );
            return (
              <button
                key={lesson.id}
                className="card"
                onClick={() =>
                  onNavigate({
                    type: "lesson",
                    unitId: unit.id,
                    lessonId: lesson.id,
                  })
                }
                style={{
                  padding: "16px",
                  textAlign: "left",
                  cursor: "pointer",
                  border: "1px solid var(--card-border)",
                  background: "var(--card-bg)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    color,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: "6px",
                  }}
                >
                  Lesson {lesson.order ?? li + 1}
                </div>
                <h3
                  style={{
                    fontSize: "1rem",
                    marginBottom: "8px",
                    fontFamily: "var(--font-serif)",
                  }}
                >
                  <InlineEditor
                    value={resolveLocale(lesson.title)}
                    path={`${unitPath}/lessons/${li}/title`}
                    label="Lesson title"
                  />
                </h3>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      color: "var(--text-muted)",
                    }}
                  >
                    {lesson.topics.length} topic
                    {lesson.topics.length !== 1 ? "s" : ""}
                  </span>
                  {qCount > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {qCount} practice Q
                    </span>
                  )}
                  {lesson.duration && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                      }}
                    >
                      ⏱{" "}
                      {lesson.duration.label ||
                        `${lesson.duration.minutes ?? 0}m`}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Key vocabulary */}
      {unit.key_vocabulary && unit.key_vocabulary.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "16px" }}>
            Key Vocabulary
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "8px",
            }}
          >
            {unit.key_vocabulary.map((entry, i) => (
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
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    lineHeight: "1.5",
                  }}
                >
                  <RichText content={entry.definition} />
                </div>
                {entry.also_known_as && entry.also_known_as.length > 0 && (
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      color: "var(--text-muted)",
                      marginTop: "4px",
                    }}
                  >
                    aka: {entry.also_known_as.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unit assessments */}
      {unit.assessments && unit.assessments.length > 0 && (
        <div>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "16px" }}>
            Unit Assessments
          </h2>
          {unit.assessments.map((a) => (
            <AssessmentView key={a.id} assessment={a} />
          ))}
        </div>
      )}
    </div>
  );
}
