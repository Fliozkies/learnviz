"use client";
import { useState } from "react";
import { KeyList } from "./KeyList";
import { AddKeyForm } from "./AddKeyForm";
import { BudgetPanel } from "./BudgetPanel";
import { TokenGuide } from "./TokenGuide";
import { ExportImportPanel } from "./ExportImportPanel";

type Tab = "keys" | "budget" | "guide";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "keys", label: "Keys", icon: "⚙" },
  { id: "budget", label: "Budget & Routing", icon: "⚡" },
  { id: "guide", label: "Token Guide", icon: "📖" },
];

export default function KeyManager({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("keys");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          width: "min(620px, 95vw)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg-tertiary)",
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
                marginBottom: 4,
              }}
            >
              AI Configuration
            </p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Keys · parallel routing · budget control
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--border-color)",
              borderRadius: 3,
              width: 28,
              height: 28,
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border-color)",
            background: "var(--bg-tertiary)",
            padding: "0 16px",
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                color:
                  tab === t.id ? "var(--accent-primary)" : "var(--text-muted)",
                borderBottom: `2px solid ${tab === t.id ? "var(--accent-primary)" : "transparent"}`,
                transition: "color 150ms, border-color 150ms",
                marginBottom: -1,
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {tab === "keys" && (
            <>
              <KeyList />
              <AddKeyForm />
              <ExportImportPanel />
            </>
          )}
          {tab === "budget" && <BudgetPanel />}
          {tab === "guide" && <TokenGuide />}
        </div>
      </div>
    </div>
  );
}
