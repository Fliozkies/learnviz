"use client";
import { useState } from "react";
import { useAI, PROVIDER_DEFAULTS, KeyRole } from "../AIProvider";
import { PROVIDER_COLORS, PROVIDER_ICONS, ROLE_LABELS } from "./keyManagerTypes";
import { sectionLabel } from "./keyManagerStyles";
import { StatusDot } from "./StatusDot";

export function KeyList() {
  const { keys, removeKey, reorderKeys, updateKey } = useAI();
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function handleDragEnd() {
    if (dragId && dragOverId && dragId !== dragOverId) {
      const ids = keys.map((k) => k.id);
      const fromIdx = ids.indexOf(dragId);
      const toIdx = ids.indexOf(dragOverId);
      const next = [...ids];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, dragId);
      reorderKeys(next);
    }
    setDragId(null);
    setDragOverId(null);
  }

  if (keys.length === 0) return null;

  return (
    <div
      style={{
        padding: "16px 20px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <p style={{ ...sectionLabel, marginBottom: 10 }}>
        Saved Keys — priority order (drag to reorder)
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {keys.map((k, idx) => {
          const def = PROVIDER_DEFAULTS[k.provider];
          const isDragging = dragId === k.id;
          const isOver = dragOverId === k.id;
          const roleInfo = ROLE_LABELS[k.role ?? "any"];
          return (
            <div
              key={k.id}
              draggable
              onDragStart={() => setDragId(k.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverId(k.id);
              }}
              onDragEnd={handleDragEnd}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: isDragging
                  ? "var(--bg-tertiary)"
                  : isOver
                    ? "var(--highlight-bg)"
                    : "var(--bg-primary)",
                border: `1px solid ${isOver ? "var(--accent-primary)" : "var(--border-color)"}`,
                borderRadius: 6,
                opacity: isDragging ? 0.5 : 1,
                cursor: "grab",
                transition: "border-color 100ms",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  width: 14,
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: PROVIDER_COLORS[k.provider],
                  background: `${PROVIDER_COLORS[k.provider]}18`,
                  border: `1px solid ${PROVIDER_COLORS[k.provider]}44`,
                  borderRadius: 2,
                  padding: "1px 6px",
                  flexShrink: 0,
                }}
              >
                {PROVIDER_ICONS[k.provider]} {def.label}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                  }}
                >
                  {k.label || `Key ${idx + 1}`}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <span>
                    {showKey[k.id]
                      ? k.key
                      : k.key.slice(0, 6) + "••••••" + k.key.slice(-4)}
                  </span>
                  {k.model && (
                    <span style={{ color: "var(--accent-primary)" }}>
                      · {k.model}
                    </span>
                  )}
                </div>
              </div>

              {/* Role badge — click to cycle */}
              <button
                title="Click to change role"
                onClick={() => {
                  const roles: KeyRole[] = ["any", "generation", "editing", "chat"];
                  const next =
                    roles[(roles.indexOf(k.role ?? "any") + 1) % roles.length];
                  updateKey(k.id, { role: next });
                }}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: "pointer",
                  color: roleInfo.color,
                  background: `${roleInfo.color}18`,
                  border: `1px solid ${roleInfo.color}44`,
                  borderRadius: 3,
                  padding: "2px 7px",
                  flexShrink: 0,
                  transition: "all 150ms",
                }}
              >
                {roleInfo.label}
              </button>

              <StatusDot keyEntry={k} />

              <button
                onClick={() =>
                  setShowKey((s) => ({ ...s, [k.id]: !s[k.id] }))
                }
                title={showKey[k.id] ? "Hide key" : "Show key"}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  fontSize: 13,
                  padding: "2px 4px",
                }}
              >
                {showKey[k.id] ? "🙈" : "👁"}
              </button>

              <button
                onClick={() => removeKey(k.id)}
                title="Remove key"
                style={{
                  background: "none",
                  border: "1px solid transparent",
                  borderRadius: 2,
                  cursor: "pointer",
                  color: "var(--accent-danger)",
                  fontSize: 13,
                  padding: "2px 6px",
                  transition: "border-color 100ms",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.borderColor =
                    "var(--accent-danger)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.borderColor =
                    "transparent")
                }
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
