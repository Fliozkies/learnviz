"use client";
import { useState } from "react";
import { TEMPLATES, GROUPS, pillBtn } from "./constants";
import { InfoTab, RootsTab, IntersectionsTab } from "./AnalysisTabs";

type SidebarTab = "templates" | "info" | "roots" | "intersections";

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "templates", label: "Tpl" },
  { id: "info", label: "Info" },
  { id: "roots", label: "Roots" },
  { id: "intersections", label: "∩" },
];

interface Props {
  expressions: string[];
  fontSize: number;
  onLoadTemplate: (exprs: string[]) => void;
}

export function TemplateSidebar({ expressions, fontSize, onLoadTemplate }: Props) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("templates");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const filtered = activeGroup ? TEMPLATES.filter((t) => t.group === activeGroup) : TEMPLATES;

  return (
    <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid var(--border-color)", display: "flex", flexDirection: "column", background: "var(--bg-primary)", overflow: "hidden" }}>
      {/* Tab strip */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", background: "var(--bg-tertiary)", flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} title={tab.id}
            style={{ flex: 1, padding: "7px 2px", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", background: "transparent", border: "none", borderBottom: activeTab === tab.id ? "2px solid var(--accent-math)" : "2px solid transparent", color: activeTab === tab.id ? "var(--accent-math)" : "var(--text-muted)", cursor: "pointer", transition: "all 120ms" }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
        {activeTab === "templates" && (
          <div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 8 }}>
              <button onClick={() => setActiveGroup(null)} style={{ ...pillBtn(fontSize), background: !activeGroup ? "var(--accent-math)" : "var(--bg-tertiary)", color: !activeGroup ? "#fff" : "var(--text-muted)", borderColor: !activeGroup ? "var(--accent-math)" : "var(--border-color)" }}>All</button>
              {GROUPS.map((g) => (
                <button key={g} onClick={() => setActiveGroup(g === activeGroup ? null : g)}
                  style={{ ...pillBtn(fontSize), background: activeGroup === g ? "var(--accent-math)" : "var(--bg-tertiary)", color: activeGroup === g ? "#fff" : "var(--text-muted)", borderColor: activeGroup === g ? "var(--accent-math)" : "var(--border-color)" }}>
                  {g}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {filtered.map((t, ti) => (
                <button key={`${t.group}-${ti}`} onClick={() => onLoadTemplate(t.exprs)}
                  style={{ padding: "5px 8px", borderRadius: 5, textAlign: "left", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", fontFamily: "var(--font-mono)", fontSize: fontSize - 2, color: "var(--text-secondary)", cursor: "pointer", transition: "all 120ms" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-math)"; e.currentTarget.style.color = "var(--accent-math)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.color = "var(--text-secondary)"; }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {activeTab === "info" && <InfoTab expressions={expressions} fontSize={fontSize} />}
        {activeTab === "roots" && <RootsTab expressions={expressions} fontSize={fontSize} />}
        {activeTab === "intersections" && <IntersectionsTab expressions={expressions} fontSize={fontSize} />}
      </div>
    </div>
  );
}
