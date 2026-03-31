"use client";
import { useState } from "react";
import { Topic, resolveLocale, resolveObjectiveText } from "@/types/curriculum";
import ContentBlockView from "./ContentBlockView";
import QuestionView from "./QuestionView";
import RichText from "@/components/ui/RichText";
import InlineEditor from "@/components/editor/InlineEditor";

export default function TopicView({
  topic,
  topicPath = "",
}: {
  topic: Topic;
  topicPath?: string;
}) {
  const [practiceOpen, setPracticeOpen] = useState(false);

  return (
    <div style={{ marginBottom: "32px" }}>
      {/* Topic header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "16px",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--border-subtle)",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div>
          <h3 style={{ fontSize: "1.15rem", marginBottom: "4px" }}>
            <InlineEditor
              value={resolveLocale(topic.title)}
              path={`${topicPath}/title`}
              label="Topic title"
            />
          </h3>
          {topic.difficulty && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color:
                  topic.difficulty === "advanced" ||
                  topic.difficulty === "challenge"
                    ? "var(--accent-danger)"
                    : "var(--text-muted)",
              }}
            >
              {topic.difficulty}
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {topic.is_optional && (
            <span
              style={{
                padding: "2px 8px",
                border: "1px dashed var(--border-color)",
                borderRadius: "2px",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--text-muted)",
              }}
            >
              Optional
            </span>
          )}
          {topic.duration && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--text-muted)",
              }}
            >
              ⏱{" "}
              {topic.duration.label ||
                `${topic.duration.minutes ?? (topic.duration.hours ?? 0) * 60} min`}
            </span>
          )}
        </div>
      </div>

      {/* Overview */}
      {topic.overview && (
        <div
          style={{
            marginBottom: "20px",
            color: "var(--text-secondary)",
            lineHeight: "1.75",
          }}
        >
          <RichText content={topic.overview} />
        </div>
      )}

      {/* Objectives */}
      {topic.objectives && topic.objectives.length > 0 && (
        <div
          style={{
            marginBottom: "20px",
            padding: "14px 16px",
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
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
              marginBottom: "10px",
            }}
          >
            Learning Objectives
          </p>
          <ul style={{ paddingLeft: "20px" }}>
            {topic.objectives.map((obj, i) => (
              <li
                key={obj.id || i}
                style={{
                  marginBottom: "6px",
                  lineHeight: "1.5",
                  fontSize: "14px",
                }}
              >
                <InlineEditor
                  value={resolveObjectiveText(obj)}
                  path={`${topicPath}/objectives/${i}/statement`}
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

      {/* Content blocks */}
      {topic.content_blocks && topic.content_blocks.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          {[...topic.content_blocks]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((block, bi) => (
              <ContentBlockView
                key={block.id}
                block={block}
                blockPath={`${topicPath}/content_blocks/${bi}`}
              />
            ))}
        </div>
      )}

      {/* Practice questions */}
      {topic.practice_questions && topic.practice_questions.length > 0 && (
        <div>
          <button
            onClick={() => setPracticeOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              width: "100%",
              padding: "12px 16px",
              background: practiceOpen
                ? "color-mix(in srgb, var(--accent-primary) 8%, var(--bg-secondary))"
                : "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              borderRadius: "4px",
              cursor: "pointer",
              textAlign: "left",
              transition: "background 150ms",
              marginBottom: practiceOpen ? "12px" : 0,
            }}
          >
            <span style={{ fontSize: "16px" }}>📝</span>
            <span
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "14px",
                fontWeight: "700",
                flex: 1,
              }}
            >
              Practice Questions
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                color: "var(--accent-primary)",
                background:
                  "color-mix(in srgb, var(--accent-primary) 12%, transparent)",
                padding: "2px 8px",
                borderRadius: "2px",
              }}
            >
              {topic.practice_questions.length}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: "14px" }}>
              {practiceOpen ? "▾" : "▸"}
            </span>
          </button>

          {practiceOpen && (
            <div className="fade-in">
              {topic.practice_questions.map((q, i) => (
                <QuestionView key={q.id} question={q} index={i} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
