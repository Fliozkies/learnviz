"use client";
import { useState } from "react";
import { useAI, PROVIDER_DEFAULTS, ProviderType, KeyRole } from "../AIProvider";
import {
  PROVIDER_COLORS,
  PROVIDER_ICONS,
  ROLE_LABELS,
  AddFormState,
} from "./keyManagerTypes";
import { sectionLabel, inputStyle } from "./keyManagerStyles";

export function AddKeyForm() {
  const { addKey } = useAI();
  const [form, setForm] = useState<AddFormState>({
    provider: "gemini",
    key: "",
    label: "",
    model: "",
    role: "any",
  });

  const defaults = PROVIDER_DEFAULTS[form.provider];

  function handleAdd() {
    if (!form.key.trim()) return;
    addKey({
      provider: form.provider,
      key: form.key.trim(),
      label: form.label.trim() || undefined,
      model: form.model.trim() || undefined, // undefined = auto-route across all models
      role: form.role,
    });
    setForm((f: AddFormState) => ({ ...f, key: "", label: "", model: "" }));
  }

  return (
    <div style={{ padding: "16px 20px" }}>
      <p style={{ ...sectionLabel, marginBottom: 12 }}>+ Add New Key</p>

      {/* Provider selector */}
      <div
        style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}
      >
        {(Object.keys(PROVIDER_DEFAULTS) as ProviderType[]).map((p) => (
          <button
            key={p}
            onClick={() =>
              setForm((f: AddFormState) => ({ ...f, provider: p, model: "" }))
            }
            style={{
              padding: "5px 12px",
              border: `1px solid ${form.provider === p ? PROVIDER_COLORS[p] : "var(--border-color)"}`,
              borderRadius: 3,
              background:
                form.provider === p ? `${PROVIDER_COLORS[p]}18` : "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              color:
                form.provider === p ? PROVIDER_COLORS[p] : "var(--text-muted)",
              transition: "all 150ms",
            }}
          >
            {PROVIDER_ICONS[p]} {PROVIDER_DEFAULTS[p].label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="text"
          placeholder="Label (e.g. My Free Gemini Key)"
          value={form.label}
          onChange={(e) =>
            setForm((f: AddFormState) => ({ ...f, label: e.target.value }))
          }
          style={inputStyle}
        />
        <input
          type="password"
          placeholder={defaults.placeholder}
          value={form.key}
          onChange={(e) =>
            setForm((f: AddFormState) => ({ ...f, key: e.target.value }))
          }
          style={inputStyle}
        />
        <input
          type="text"
          placeholder={`${defaults.modelLabel}: ${defaults.modelPlaceholder} (leave blank for default)`}
          value={form.model}
          onChange={(e) =>
            setForm((f: AddFormState) => ({ ...f, model: e.target.value }))
          }
          style={inputStyle}
        />

        {/* Role selector */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
              marginBottom: 6,
            }}
          >
            Role
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(Object.keys(ROLE_LABELS) as KeyRole[]).map((role) => {
              const info = ROLE_LABELS[role];
              return (
                <button
                  key={role}
                  onClick={() => setForm((f: AddFormState) => ({ ...f, role }))}
                  style={{
                    padding: "4px 10px",
                    border: `1px solid ${form.role === role ? info.color : "var(--border-color)"}`,
                    borderRadius: 3,
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    color:
                      form.role === role ? info.color : "var(--text-muted)",
                    background: form.role === role ? `${info.color}18` : "none",
                    transition: "all 150ms",
                  }}
                >
                  {info.label}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
            {ROLE_LABELS[form.role].description}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleAdd}
            disabled={!form.key.trim()}
            style={{
              padding: "8px 20px",
              background: form.key.trim()
                ? "var(--accent-primary)"
                : "var(--bg-tertiary)",
              color: form.key.trim() ? "#fff" : "var(--text-muted)",
              border: "none",
              borderRadius: 3,
              cursor: form.key.trim() ? "pointer" : "not-allowed",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 700,
              transition: "background 150ms",
            }}
          >
            Add Key
          </button>
          <a
            href={defaults.docs}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--accent-primary)",
              textDecoration: "none",
            }}
          >
            Get {defaults.label} key ↗
          </a>
        </div>
      </div>
    </div>
  );
}
