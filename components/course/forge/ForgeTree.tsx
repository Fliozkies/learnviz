"use client";
// ─── ForgeTree — live generation progress tree ────────────────────────────────
import { NodeStatus, TreeNode } from "./types";

interface Props {
  nodes: Record<string, TreeNode>;
  rootId: string | null;
}

const STATUS_ICON: Record<NodeStatus, string> = {
  done: "✓",
  running: "◌",
  retrying: "↺",
  repairing: "⚙",
  error: "✕",
  pending: "○",
};

const STATUS_COLOR: Record<NodeStatus, string> = {
  done: "var(--accent-success)",
  running: "var(--accent-primary)",
  retrying: "var(--accent-warning, #f59e0b)",
  repairing: "var(--accent-warning, #f59e0b)",
  error: "var(--accent-danger)",
  pending: "var(--text-muted)",
};

export default function ForgeTree({ nodes, rootId }: Props) {
  if (!rootId || !nodes[rootId]) return null;

  function renderNode(id: string, depth: number): React.ReactNode {
    const node = nodes[id];
    if (!node) return null;
    const indent = depth * 14;
    const isCourse = node.type === "course";
    const isUnit = node.type === "unit";

    return (
      <div key={id}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingLeft: indent,
            paddingTop: 3,
            paddingBottom: 3,
          }}
        >
          <span
            style={{
              fontSize: isCourse ? 13 : isUnit ? 12 : 11,
              color: STATUS_COLOR[node.status],
              fontFamily: "var(--font-mono)",
              animation:
                node.status === "running" ||
                node.status === "retrying" ||
                node.status === "repairing"
                  ? "spin 1.2s linear infinite"
                  : undefined,
              flexShrink: 0,
            }}
          >
            {STATUS_ICON[node.status]}
          </span>

          <span
            style={{
              fontSize: isCourse ? 12 : isUnit ? 11 : 10,
              fontWeight: isCourse ? 700 : isUnit ? 600 : 400,
              color:
                node.status === "error"
                  ? "var(--accent-danger)"
                  : node.status === "retrying" || node.status === "repairing"
                    ? "var(--accent-warning, #f59e0b)"
                    : node.status === "done"
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
              fontFamily:
                node.type === "topic" ? "var(--font-mono)" : undefined,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {node.label}
          </span>

          {node.chars > 0 && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                flexShrink: 0,
              }}
            >
              {node.chars >= 1024
                ? `${(node.chars / 1024).toFixed(1)}KB`
                : `${node.chars}B`}
            </span>
          )}

          {node.status === "done" && (node.modelId || node.provider) && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: node.modelId
                  ? "var(--accent-primary)"
                  : "var(--text-muted)",
                background: node.modelId
                  ? "color-mix(in srgb, var(--accent-primary) 10%, transparent)"
                  : "color-mix(in srgb, var(--text-muted) 10%, transparent)",
                border: node.modelId
                  ? "1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent)"
                  : "1px solid color-mix(in srgb, var(--text-muted) 25%, transparent)",
                borderRadius: 3,
                padding: "1px 4px",
                flexShrink: 0,
                maxWidth: 90,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={node.modelId ?? node.provider ?? "unknown model"}
            >
              {node.modelId
                ? node.modelId
                    .replace(/^gemini-/, "")
                    .replace(/-preview$/, "")
                    .replace(/-\d{2}-\d{2}$/, "")
                : (node.provider ?? "?")}
            </span>
          )}
        </div>

        {node.children?.map((childId) => renderNode(childId, depth + 1))}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        borderRadius: 6,
        border: "1px solid var(--border-subtle)",
        padding: "10px 12px",
        maxHeight: 340,
        overflowY: "auto",
        fontFamily: "var(--font-mono)",
      }}
    >
      {renderNode(rootId, 0)}
    </div>
  );
}
