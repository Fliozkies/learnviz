"use client";
import { useState, useRef, KeyboardEvent } from "react";
import { useEditor } from "./EditContext";
import { CurriculumPatch } from "@/lib/curriculumEditor";

interface Props {
  value: string;
  path: string; // JSON path e.g. "/units/0/lessons/1/title"
  label?: string; // for undo label
  multiline?: boolean;
  style?: React.CSSProperties;
  className?: string;
  renderView?: (value: string) => React.ReactNode; // custom render when not editing
}

export default function InlineEditor({
  value,
  path,
  label = "Edit field",
  multiline = false,
  style,
  className,
  renderView,
}: Props) {
  const { state, applyEdit } = useEditor();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  const commit = () => {
    if (draft !== value) {
      const patch: CurriculumPatch = { op: "replace", path, value: draft };
      applyEdit([patch], `${label}`);
    }
    setEditing(false);
  };

  const cancel = () => {
    setEditing(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      cancel();
      return;
    }
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      commit();
      return;
    }
    if (multiline && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      commit();
      return;
    }
  };

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  if (!state.editMode) {
    return renderView ? (
      <>{renderView(value)}</>
    ) : (
      <span style={style} className={className}>
        {value}
      </span>
    );
  }

  if (editing) {
    const sharedStyle: React.CSSProperties = {
      width: "100%",
      padding: "4px 6px",
      border: "2px solid var(--accent-primary)",
      borderRadius: 5,
      background: "var(--bg-elevated)",
      color: "var(--text-primary)",
      fontFamily: "inherit",
      fontSize: "inherit",
      fontWeight: "inherit",
      lineHeight: "inherit",
      outline: "none",
      resize: multiline ? "vertical" : "none",
      boxShadow: "0 0 0 3px var(--accent-primary-soft)",
      ...style,
    };

    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          autoFocus
          rows={Math.max(3, draft.split("\n").length + 1)}
          style={sharedStyle}
        />
      );
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        autoFocus
        style={sharedStyle}
      />
    );
  }

  // View mode with edit affordance
  return (
    <span
      onClick={startEdit}
      title="Click to edit"
      style={{
        ...style,
        cursor: "text",
        display: "inline-block",
        borderRadius: 4,
        outline: "2px dashed transparent",
        transition: "outline 150ms, background 150ms",
        position: "relative",
      }}
      className={`editable-field ${className ?? ""}`}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.outline =
          "2px dashed var(--accent-primary)";
        (e.currentTarget as HTMLElement).style.background =
          "var(--accent-primary-soft)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.outline =
          "2px dashed transparent";
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {renderView ? renderView(value) : value}
      <span
        style={{
          position: "absolute",
          top: -6,
          right: -6,
          fontSize: 9,
          background: "var(--accent-primary)",
          color: "#fff",
          borderRadius: 3,
          padding: "1px 4px",
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          opacity: 0,
          pointerEvents: "none",
          transition: "opacity 150ms",
        }}
        className="edit-hint"
      >
        edit
      </span>
    </span>
  );
}
