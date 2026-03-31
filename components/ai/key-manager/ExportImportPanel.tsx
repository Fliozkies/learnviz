"use client";
import { useRef, useState } from "react";
import { useAI } from "../AIProvider";
import type { KeyExportBundle } from "../AIProvider";
import { sectionLabel } from "./keyManagerStyles";

export function ExportImportPanel() {
  const { keys, exportKeys, importKeys } = useAI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [status, setStatus] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bundle = JSON.parse(reader.result as string) as KeyExportBundle;
        if (bundle.version !== 1 || !Array.isArray(bundle.keys)) {
          throw new Error("Invalid export file format.");
        }
        importKeys(bundle, importMode);
        setStatus({
          type: "success",
          msg: `Imported ${bundle.keys.length} key(s) (${importMode} mode).`,
        });
      } catch (err) {
        setStatus({
          type: "error",
          msg:
            err instanceof Error ? err.message : "Failed to parse export file.",
        });
      }
      // reset so the same file can be re-imported
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsText(file);
  }

  const btnBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    border: "1px solid var(--border-color)",
    borderRadius: 6,
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    transition: "all 150ms",
    background: "var(--bg-primary)",
    color: "var(--text-secondary)",
  };

  return (
    <div
      style={{
        padding: "16px 20px",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <p style={{ ...sectionLabel, marginBottom: 12 }}>
        Export / Import Keys
      </p>

      <p
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          marginBottom: 14,
          lineHeight: 1.5,
          fontFamily: "var(--font-sans)",
        }}
      >
        Export your API keys to a <code>.json</code> file so you can restore
        them on another computer or browser session. The file includes your key
        values, labels, roles, and budget settings.
      </p>

      {/* Export row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <button
          onClick={exportKeys}
          disabled={keys.length === 0}
          style={{
            ...btnBase,
            opacity: keys.length === 0 ? 0.4 : 1,
            cursor: keys.length === 0 ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => {
            if (keys.length > 0) {
              e.currentTarget.style.background = "var(--bg-tertiary)";
              e.currentTarget.style.color = "var(--text-primary)";
              e.currentTarget.style.borderColor = "var(--accent-primary)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-primary)";
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.borderColor = "var(--border-color)";
          }}
          title={keys.length === 0 ? "No keys to export" : "Download keys as JSON"}
        >
          ↓ Export {keys.length > 0 ? `${keys.length} key${keys.length > 1 ? "s" : ""}` : "Keys"}
        </button>
      </div>

      {/* Import row */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ ...sectionLabel, fontSize: 10 }}>Import mode</p>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {(["merge", "replace"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setImportMode(m)}
              style={{
                ...btnBase,
                background:
                  importMode === m ? "var(--accent-primary)18" : "var(--bg-primary)",
                borderColor:
                  importMode === m ? "var(--accent-primary)" : "var(--border-color)",
                color:
                  importMode === m ? "var(--accent-primary)" : "var(--text-muted)",
              }}
            >
              {m === "merge" ? "⊕ Merge" : "↺ Replace"}
            </button>
          ))}
        </div>
        <p
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            marginBottom: 8,
          }}
        >
          {importMode === "merge"
            ? "Adds new keys, skips duplicates (same key value)."
            : "Replaces ALL existing keys with the imported ones."}
        </p>

        <button
          onClick={() => fileRef.current?.click()}
          style={btnBase}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-tertiary)";
            e.currentTarget.style.color = "var(--text-primary)";
            e.currentTarget.style.borderColor = "var(--accent-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-primary)";
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.borderColor = "var(--border-color)";
          }}
        >
          ↑ Import from file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={handleImport}
        />
      </div>

      {/* Status */}
      {status && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            borderRadius: 6,
            background:
              status.type === "success"
                ? "var(--accent-success)18"
                : "var(--accent-danger)18",
            border: `1px solid ${status.type === "success" ? "var(--accent-success)" : "var(--accent-danger)"}`,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color:
              status.type === "success"
                ? "var(--accent-success)"
                : "var(--accent-danger)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>
            {status.type === "success" ? "✓" : "✗"} {status.msg}
          </span>
          <button
            onClick={() => setStatus(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
