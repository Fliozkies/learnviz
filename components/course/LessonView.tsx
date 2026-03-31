"use client";
import { useState, useEffect } from "react";
import {
  Lesson,
  Topic,
  resolveLocale,
  resolveText,
  resolveObjectiveText,
} from "@/types/curriculum";
import TopicView from "./TopicView";
import AssessmentView from "./AssessmentView";
import RichText from "@/components/ui/RichText";
import { ChatContext } from "@/components/ai/ChatPanel";
import InlineEditor from "@/components/editor/InlineEditor";

// Extract plain-text summary of a topic's content blocks for AI context
function extractTopicSummary(topic: Topic): string {
  if (!topic.content_blocks) return "";
  return topic.content_blocks
    .map((block) => {
      const raw = block as unknown as Record<string, unknown>;
      const title = block.title ? resolveText(block.title) : "";
      const body = block.body
        ? resolveText(block.body)
        : typeof raw["content"] === "string"
          ? (raw["content"] as string)
          : typeof raw["content"] === "object" && raw["content"] !== null
            ? resolveText(raw["content"] as Parameters<typeof resolveText>[0])
            : "";
      return [title && `[${block.type.toUpperCase()}: ${title}]`, body]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

interface Props {
  lesson: Lesson;
  onContextChange?: (ctx: ChatContext) => void;
  lessonPath?: string; // e.g. "/units/0/lessons/1"
}

export default function LessonView({
  lesson,
  onContextChange,
  lessonPath = "",
}: Props) {
  const [activeTopicId, setActiveTopicId] = useState<string>(
    lesson.topics[0]?.id ?? "",
  );
  const activeTopic =
    lesson.topics.find((t) => t.id === activeTopicId) ?? lesson.topics[0];

  // Whenever the active topic changes, push context up to ChatPanel
  useEffect(() => {
    if (!onContextChange) return;
    const ctx: ChatContext = {
      lessonTitle: resolveLocale(lesson.title),
      topicTitle: activeTopic ? resolveLocale(activeTopic.title) : undefined,
      contentSummary: activeTopic
        ? extractTopicSummary(activeTopic)
        : undefined,
    };
    onContextChange(ctx);
  }, [activeTopicId, lesson, activeTopic, onContextChange]);

  return (
    <div>
      {/* Lesson header */}
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "1.6rem", marginBottom: "8px" }}>
          <InlineEditor
            value={resolveLocale(lesson.title)}
            path={`${lessonPath}/title`}
            label="Lesson title"
          />
        </h2>
        {lesson.overview && (
          <div
            style={{
              color: "var(--text-secondary)",
              lineHeight: "1.75",
              fontSize: "15px",
            }}
          >
            <RichText content={lesson.overview} />
          </div>
        )}

        {/* Duration + tags */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "12px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {lesson.duration && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              ⏱{" "}
              {lesson.duration.label ||
                `${lesson.duration.hours ?? 0}h ${lesson.duration.minutes ?? 0}m`}
            </span>
          )}
          {lesson.tags?.map((tag) => (
            <span
              key={tag}
              style={{
                padding: "2px 8px",
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                borderRadius: "2px",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--text-muted)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Objectives */}
      {lesson.objectives && lesson.objectives.length > 0 && (
        <div
          style={{
            marginBottom: "24px",
            padding: "16px",
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
            Lesson Objectives
          </p>
          <ul style={{ paddingLeft: "20px" }}>
            {lesson.objectives.map((obj, i) => (
              <li
                key={obj.id || i}
                style={{ marginBottom: "6px", fontSize: "14px" }}
              >
                <InlineEditor
                  value={resolveObjectiveText(obj)}
                  path={`${lessonPath}/objectives/${i}/statement`}
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

      {/* Topic tabs */}
      {lesson.topics.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: "4px",
            marginBottom: "24px",
            borderBottom: "1px solid var(--border-color)",
            overflowX: "auto",
            paddingBottom: "0",
          }}
        >
          {lesson.topics.map((topic) => {
            const active = topic.id === activeTopicId;
            return (
              <button
                key={topic.id}
                onClick={() => setActiveTopicId(topic.id)}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderBottom: `2px solid ${active ? "var(--accent-primary)" : "transparent"}`,
                  background: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  fontSize: "14px",
                  fontWeight: active ? "600" : "400",
                  color: active
                    ? "var(--accent-primary)"
                    : "var(--text-secondary)",
                  whiteSpace: "nowrap",
                  transition: "all 150ms",
                  marginBottom: "-1px",
                }}
              >
                {resolveLocale(topic.title)}
                {topic.is_optional && (
                  <span
                    style={{
                      marginLeft: "4px",
                      fontSize: "10px",
                      opacity: 0.6,
                    }}
                  >
                    opt
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Single topic label */}
      {lesson.topics.length === 1 && <div style={{ marginBottom: "8px" }} />}

      {/* Active topic */}
      {activeTopic && (
        <div className="fade-in" key={activeTopicId}>
          <TopicView
            topic={activeTopic}
            topicPath={`${lessonPath}/topics/${lesson.topics.indexOf(activeTopic)}`}
          />
        </div>
      )}

      {/* Lesson assessments */}
      {lesson.assessments && lesson.assessments.length > 0 && (
        <div style={{ marginTop: "32px" }}>
          <div
            style={{
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                flex: 1,
                height: "1px",
                background: "var(--border-color)",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
              }}
            >
              Lesson Assessment
            </span>
            <div
              style={{
                flex: 1,
                height: "1px",
                background: "var(--border-color)",
              }}
            />
          </div>
          {lesson.assessments.map((a) => (
            <AssessmentView key={a.id} assessment={a} />
          ))}
        </div>
      )}
    </div>
  );
}
