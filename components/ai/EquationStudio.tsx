"use client";
import { useState } from "react";
import GraphView from "./GraphView";
import { TemplateSidebar } from "./equation-studio/TemplateSidebar";
import { ExpressionInput } from "./equation-studio/ExpressionInput";
import { useDragResize } from "./equation-studio/useDragResize";
import { hdrBtn, resizeHandleStyle } from "./equation-studio/constants";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function EquationStudio({ open, onClose }: Props) {
  const [expressions, setExpressions] = useState<string[]>(["y = x"]);
  const [draft, setDraft] = useState("");
  const [fontSize, setFontSize] = useState(13);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { pos, size, onDragMouseDown, onResizeMouseDown } = useDragResize(
    { x: 60, y: 20 },
    { w: 780, h: 580 },
  );

  function addExpression() {
    const t = draft.trim();
    if (!t || expressions.includes(t)) return;
    setExpressions((prev) => [...prev, t]);
    setDraft("");
  }

  if (!open) return null;

  return (
    <div style={{ position: "fixed", left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 899, display: "flex", flexDirection: "column", background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 12, boxShadow: "var(--shadow-float)", overflow: "hidden", minWidth: 420, minHeight: 360 }}>

      {/* Header */}
      <div onMouseDown={onDragMouseDown} style={{ height: 40, padding: "0 12px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-tertiary)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, cursor: "grab", userSelect: "none" }}>
        <button onClick={(e) => { e.stopPropagation(); setSidebarOpen((v) => !v); }} onMouseDown={(e) => e.stopPropagation()} style={{ ...hdrBtn, fontSize: 14, padding: "2px 7px" }} title={sidebarOpen ? "Collapse panel" : "Expand panel"}>☰</button>
        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 17, color: "var(--accent-math)", lineHeight: 1 }}>ƒ</span>
        <div style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)" }}>Equation Studio</div>
        <button onClick={() => setFontSize((f) => Math.max(10, f - 1))} style={hdrBtn} title="Smaller">A−</button>
        <button onClick={() => setFontSize((f) => Math.min(20, f + 1))} style={hdrBtn} title="Larger">A+</button>
        <div style={{ width: 1, height: 16, background: "var(--border-color)", margin: "0 2px" }} />
        <button onClick={onClose} style={{ ...hdrBtn, fontSize: 17, padding: "0 5px" }} title="Close">×</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {sidebarOpen && (
          <TemplateSidebar
            expressions={expressions}
            fontSize={fontSize}
            onLoadTemplate={setExpressions}
          />
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <ExpressionInput
            expressions={expressions}
            draft={draft}
            fontSize={fontSize}
            onDraftChange={setDraft}
            onAdd={addExpression}
            onRemove={(i) => setExpressions((prev) => prev.filter((_, j) => j !== i))}
            onClear={() => setExpressions([])}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExpression(); } }}
          />

          <div style={{ flex: 1, padding: "8px 12px 10px", minHeight: 0, display: "flex", flexDirection: "column" }}>
            {expressions.length > 0 ? (
              <GraphView expressions={expressions} height={-1} />
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed var(--border-color)", borderRadius: 10, flexDirection: "column", gap: 8, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize }}>
                <span style={{ fontSize: 28, opacity: 0.5 }}>∿</span>
                <span>Graph appears here</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resize handles */}
      {(["e", "w", "s", "n", "se", "sw", "ne", "nw"] as const).map((h) => (
        <div key={h} onMouseDown={(e) => onResizeMouseDown(e, h)} style={resizeHandleStyle(h)} />
      ))}
    </div>
  );
}
