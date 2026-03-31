"use client";
import { useState } from "react";
import { useEditor } from "./EditContext";
import AIPatchPanel from "./AIPatchPanel";
import { Curriculum } from "@/types/curriculum";

interface Props {
  filename: string;
  curriculum: Curriculum; // pass down for AI subtree extraction
}

export default function EditorToolbar({ filename, curriculum }: Props) {
  const {
    state,
    toggleEditMode,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    saveAsJson,
  } = useEditor();

  const [aiOpen, setAiOpen] = useState(false);

  const { editMode, isDirty, changeCount } = state;

  const btnBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid var(--border-color)",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    transition: "all var(--transition)",
    lineHeight: 1,
    background: "transparent",
    color: "var(--text-secondary)",
  };

  const iconBtn: React.CSSProperties = {
    ...btnBase,
    padding: "4px 8px",
    fontSize: 13,
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* Edit mode toggle */}
        <button
          onClick={toggleEditMode}
          title={
            editMode
              ? "Exit edit mode"
              : "Enter edit mode (click any text to edit)"
          }
          style={{
            ...btnBase,
            background: editMode ? "var(--accent-primary)" : "transparent",
            borderColor: editMode
              ? "var(--accent-primary)"
              : "var(--border-color)",
            color: editMode ? "#fff" : "var(--text-secondary)",
            boxShadow: editMode
              ? "0 0 0 3px var(--accent-primary-soft)"
              : "none",
          }}
          onMouseEnter={(e) => {
            if (!editMode) {
              e.currentTarget.style.background = "var(--bg-tertiary)";
              e.currentTarget.style.color = "var(--text-primary)";
            }
          }}
          onMouseLeave={(e) => {
            if (!editMode) {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }
          }}
        >
          ✏ {editMode ? "Editing" : "Edit"}
          {isDirty && changeCount > 0 && (
            <span
              style={{
                background: editMode
                  ? "rgba(255,255,255,0.25)"
                  : "var(--accent-primary)",
                color: editMode ? "#fff" : "#fff",
                borderRadius: 100,
                fontSize: 9,
                padding: "1px 5px",
                fontWeight: 700,
              }}
            >
              {changeCount}
            </span>
          )}
        </button>

        {/* Undo / redo — only when there's history */}
        {(canUndo || canRedo) && (
          <>
            <button
              onClick={undo}
              disabled={!canUndo}
              title={canUndo ? `Undo: ${undoLabel}` : "Nothing to undo"}
              style={{
                ...iconBtn,
                opacity: canUndo ? 1 : 0.35,
                cursor: canUndo ? "pointer" : "default",
              }}
            >
              ↩
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title={canRedo ? `Redo: ${redoLabel}` : "Nothing to redo"}
              style={{
                ...iconBtn,
                opacity: canRedo ? 1 : 0.35,
                cursor: canRedo ? "pointer" : "default",
              }}
            >
              ↪
            </button>
          </>
        )}

        {/* AI edit button */}
        <button
          onClick={() => setAiOpen(true)}
          title="Ask AI to edit this curriculum"
          style={{
            ...btnBase,
            borderColor: "var(--accent-secondary)",
            color: "var(--accent-secondary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background =
              "color-mix(in srgb, var(--accent-secondary) 10%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          ✦ AI Edit
        </button>

        {/* Download — always available */}
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(curriculum, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
          }}
          title="Download curriculum as JSON"
          style={btnBase}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-tertiary)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          ↓ JSON
        </button>

        {/* Save — only when dirty */}
        {isDirty && (
          <button
            onClick={() => saveAsJson(filename)}
            title="Download updated curriculum as JSON"
            style={{
              ...btnBase,
              background: "var(--accent-primary-soft)",
              borderColor: "var(--accent-primary)",
              color: "var(--accent-primary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent-primary)";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--accent-primary-soft)";
              e.currentTarget.style.color = "var(--accent-primary)";
            }}
          >
            ↓ Save JSON
          </button>
        )}
      </div>

      {aiOpen && (
        <AIPatchPanel
          curriculum={curriculum}
          onClose={() => setAiOpen(false)}
        />
      )}
    </>
  );
}
