"use client";
import { COLORS, hdrBtn } from "./constants";

const HINTS = ["^ exp", "\\sin \\cos", "\\ln \\log", "\\sqrt{x}", "\\pi", "e"];

interface Props {
  expressions: string[];
  draft: string;
  fontSize: number;
  onDraftChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onClear: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function ExpressionInput({ expressions, draft, fontSize, onDraftChange, onAdd, onRemove, onClear, onKeyDown }: Props) {
  return (
    <div style={{ padding: "10px 12px 8px", flexShrink: 0, borderBottom: "1px solid var(--border-color)" }}>
      {expressions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 7 }}>
          {expressions.map((expr, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 6px 2px 8px", borderRadius: 20, background: `color-mix(in srgb, ${COLORS[i % COLORS.length]} 10%, var(--bg-tertiary))`, border: `1px solid color-mix(in srgb, ${COLORS[i % COLORS.length]} 30%, var(--border-color))` }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fontSize - 1, color: "var(--text-primary)" }}>{expr}</span>
              <button onClick={() => onRemove(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, lineHeight: 1, padding: "0 1px" }}>×</button>
            </div>
          ))}
          <button onClick={onClear} style={{ ...hdrBtn, borderRadius: 20, fontSize: fontSize - 3 }}>Clear</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={draft} onChange={(e) => onDraftChange(e.target.value)} onKeyDown={onKeyDown}
          placeholder="y = 2x + 1  ·  x^2 + y^2 = 25"
          style={{ flex: 1, padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize, background: "var(--bg-primary)", border: "1px solid var(--border-color)", borderRadius: 7, color: "var(--text-primary)", outline: "none", transition: "border-color 150ms" }}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent-math)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border-color)")}
        />
        <button onClick={onAdd} disabled={!draft.trim()}
          style={{ padding: "6px 14px", borderRadius: 7, border: "none", flexShrink: 0, background: draft.trim() ? "var(--accent-math)" : "var(--bg-tertiary)", color: draft.trim() ? "#fff" : "var(--text-muted)", cursor: draft.trim() ? "pointer" : "not-allowed", fontFamily: "var(--font-mono)", fontSize, fontWeight: 700, transition: "all 150ms" }}>
          Plot
        </button>
      </div>

      <div style={{ marginTop: 5, fontFamily: "var(--font-mono)", fontSize: fontSize - 3, color: "var(--text-muted)", display: "flex", gap: 5, flexWrap: "wrap" }}>
        {HINTS.map((hint) => (
          <span key={hint} style={{ background: "var(--code-bg)", padding: "1px 5px", borderRadius: 3, border: "1px solid var(--border-subtle)" }}>{hint}</span>
        ))}
      </div>
    </div>
  );
}
