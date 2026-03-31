"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  useAI,
  ChatMessage,
  PROVIDER_DEFAULTS,
  GEMINI_FREE_MODELS,
  GROQ_FREE_MODELS,
} from "./AIProvider";
import KeyManager from "./KeyManager";
import GraphView from "./GraphView";
import ChartView from "@/components/course/ChartView";
import { ChartBlock } from "@/types/curriculum";

// ─── Equation detection ───────────────────────────────────────────────────────

function extractPlottableExpressions(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (expr: string) => {
    const clean = expr.trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      found.push(clean);
    }
  };

  const inlineMath = [...text.matchAll(/\$([^$\n]+)\$/g)].map((m) => m[1]);
  for (const latex of inlineMath) {
    if (/^[yYfFgGhH]\s*(?:\(x\))?\s*=/.test(latex)) add(latex);
    if (/^[yY]\s*[<>≤≥]=/.test(latex)) add(latex);
  }

  const displayMath = [...text.matchAll(/\$\$([\s\S]+?)\$\$/g)].map(
    (m) => m[1],
  );
  for (const latex of displayMath) {
    if (/[yYfF]\s*(?:\(x\))?\s*=/.test(latex)) add(latex.trim());
  }

  const plainEq = [
    ...text.matchAll(/\b([yYfFgG](?:\(x\))?\s*=\s*[^\n,;.]{3,60})/g),
  ];
  for (const m of plainEq) {
    add(m[1].trim());
  }

  return found.slice(0, 6);
}

// ─── Chart fence detection ────────────────────────────────────────────────────

/**
 * Parse a ```chart ... ``` fenced block from AI message text.
 * Returns array of {chart, beforeIndex, afterIndex} for each found block.
 */
interface ChartFence {
  chart: ChartBlock;
  start: number;
  end: number;
}

function extractChartFences(text: string): ChartFence[] {
  const results: ChartFence[] = [];
  const re = /```chart\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim()) as Partial<ChartBlock>;
      if (parsed.chartType && Array.isArray(parsed.datasets)) {
        results.push({
          chart: parsed as ChartBlock,
          start: m.index,
          end: m.index + m[0].length,
        });
      }
    } catch {
      // Malformed JSON — skip silently
    }
  }
  return results;
}

// ─── KaTeX renderer ───────────────────────────────────────────────────────────

function renderKatex(el: HTMLElement, latex: string, displayMode: boolean) {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const katex = (window as any).katex;
  if (!katex) return;
  try {
    katex.render(latex, el, {
      displayMode,
      throwOnError: false,
      output: "html",
    });
  } catch {
    el.textContent = latex;
  }
}

function KatexBlock({ latex, display }: { latex: string; display: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) renderKatex(ref.current, latex, display);
  }, [latex, display]);
  return <span ref={ref} />;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatContext {
  topicTitle?: string;
  lessonTitle?: string;
  contentSummary?: string;
  quizMistakes?: string[];
}

interface Props {
  context?: ChatContext;
}

// ─── Build system prompt ──────────────────────────────────────────────────────

function buildSystemPrompt(ctx?: ChatContext): string {
  const lines = [
    "You are a focused, concise study assistant embedded in LearnViz, an interactive curriculum viewer.",
    "Help the student understand the material they are currently studying.",
    "Be direct and pedagogically clear. Use LaTeX math notation (single $ for inline, $$ for display) when helpful.",
    "IMPORTANT: For currency in prose, write it plainly like '$0.50' or 'USD 0.50'. Never escape dollar signs as \\$ — that breaks rendering.",
    "Do not go off-topic. If asked something unrelated to the curriculum, gently redirect.",
    "",
    "CHARTS: When you want to show a chart or graph of data (not a math function — use equations for those),",
    "output a fenced code block with the language identifier `chart` and a JSON body matching this shape:",
    "```chart",
    JSON.stringify(
      {
        chartType: "bar | line | pie | scatter",
        chartTitle: "optional title",
        labels: ["optional", "x-axis", "labels"],
        datasets: [{ key: "value", label: "Series name", data: [1, 2, 3] }],
      },
      null,
      2,
    ),
    "```",
    "Use 'bar' for comparisons, 'line' for trends, 'pie' for proportions, 'scatter' for correlations.",
    "For scatter, data items should be {x, y} objects.",
    "",
  ];

  if (ctx?.lessonTitle) lines.push(`Current lesson: "${ctx.lessonTitle}"`);
  if (ctx?.topicTitle) lines.push(`Current topic: "${ctx.topicTitle}"`);

  if (ctx?.contentSummary) {
    lines.push("", "--- Current topic content (for reference) ---");
    lines.push(ctx.contentSummary.slice(0, 3000));
    lines.push("--- End of topic content ---");
  }

  if (ctx?.quizMistakes && ctx.quizMistakes.length > 0) {
    lines.push(
      "",
      "The student recently answered these questions incorrectly:",
    );
    ctx.quizMistakes.forEach((m, i) => lines.push(`${i + 1}. ${m}`));
    lines.push("Consider addressing their misconceptions proactively.");
  }

  return lines.join("\n");
}

// ─── Graph toggle ─────────────────────────────────────────────────────────────

function GraphToggle({
  expressions,
  fontSize,
}: {
  expressions: string[];
  fontSize: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ paddingLeft: 38 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          fontSize: fontSize - 2,
          fontFamily: "var(--font-mono)",
          background: open
            ? "color-mix(in srgb, var(--accent-primary) 10%, var(--bg-tertiary))"
            : "var(--bg-tertiary)",
          border: `1px solid ${open ? "var(--accent-primary)" : "var(--border-color)"}`,
          borderRadius: 20,
          color: open ? "var(--accent-primary)" : "var(--text-muted)",
          cursor: "pointer",
          transition: "all 150ms",
        }}
      >
        <span>📈</span>
        {open
          ? "Hide graph"
          : `Visualize (${expressions.length} equation${expressions.length > 1 ? "s" : ""})`}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <GraphView expressions={expressions} />
        </div>
      )}
    </div>
  );
}

// ─── Markdown-lite renderer for chat ─────────────────────────────────────────

// Renders inline markdown: **bold**, `code`, $math$, $$math$$, [text](url)
function InlineContent({ text, fontSize }: { text: string; fontSize: number }) {
  const PLACEHOLDER = "<<DOLLARSIGN>>";
  const cleaned = text.replace(/\\\$/g, PLACEHOLDER);

  const parts = cleaned.split(
    /(\$\$[\s\S]+?\$\$|\$\S(?:[^$\n]*)?\S\$|\$\S\$|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g,
  );

  const restore = (s: string) => s.replaceAll(PLACEHOLDER, "$");

  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return (
            <strong key={i}>
              <InlineContent
                text={restore(p.slice(2, -2))}
                fontSize={fontSize}
              />
            </strong>
          );

        if (p.startsWith("`") && p.endsWith("`"))
          return (
            <code
              key={i}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.85em",
                background: "var(--code-bg)",
                padding: "1px 4px",
                borderRadius: 2,
              }}
            >
              {restore(p.slice(1, -1))}
            </code>
          );

        if (p.startsWith("$$") && p.endsWith("$$"))
          return (
            <span
              key={i}
              style={{
                display: "block",
                padding: "6px 0",
                textAlign: "center",
                overflowX: "auto",
              }}
            >
              <KatexBlock latex={p.slice(2, -2)} display={true} />
            </span>
          );

        if (p.startsWith("$") && p.endsWith("$"))
          return <KatexBlock key={i} latex={p.slice(1, -1)} display={false} />;

        // Markdown link [text](url)
        const linkMatch = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch)
          return (
            <a
              key={i}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--accent-primary)",
                textDecoration: "underline",
              }}
            >
              {linkMatch[1]}
            </a>
          );

        return (
          <span key={i}>
            {restore(p)
              .split("\n")
              .map((line, j, arr) => (
                <span key={j}>
                  {line}
                  {j < arr.length - 1 && <br />}
                </span>
              ))}
          </span>
        );
      })}
    </>
  );
}

function ChatBubbleContent({
  text,
  fontSize,
}: {
  text: string;
  fontSize: number;
}) {
  // Split into block-level lines, then render each
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — small spacer
    if (line.trim() === "") {
      nodes.push(<div key={i} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // Heading: ## or ###
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const sizes = [fontSize + 4, fontSize + 2, fontSize + 1];
      nodes.push(
        <div
          key={i}
          style={{
            fontWeight: 700,
            fontSize: sizes[level - 1] ?? fontSize,
            marginBottom: 4,
            marginTop: i > 0 ? 10 : 0,
          }}
        >
          <InlineContent
            text={headingMatch[2]}
            fontSize={sizes[level - 1] ?? fontSize}
          />
        </div>,
      );
      i++;
      continue;
    }

    // List item: - or * or number.
    if (/^(\s*[-*]|\s*\d+\.)\s/.test(line)) {
      // Collect consecutive list items
      const items: string[] = [];
      while (i < lines.length && /^(\s*[-*]|\s*\d+\.)\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*\d.]+\s/, ""));
        i++;
      }
      nodes.push(
        <ul
          key={`list-${i}`}
          style={{
            margin: "4px 0",
            paddingLeft: 18,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {items.map((item, j) => (
            <li key={j} style={{ fontSize }}>
              <InlineContent text={item} fontSize={fontSize} />
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      nodes.push(
        <hr
          key={i}
          style={{
            border: "none",
            borderTop: "1px solid var(--border-subtle)",
            margin: "8px 0",
          }}
        />,
      );
      i++;
      continue;
    }

    // Regular paragraph line
    nodes.push(
      <span key={i} style={{ display: "block", lineHeight: 1.7, fontSize }}>
        <InlineContent text={line} fontSize={fontSize} />
      </span>,
    );
    i++;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {nodes}
    </div>
  );
}

/**
 * Render an assistant message, splitting out any ```chart blocks into
 * inline ChartView components, with the surrounding text rendered normally.
 */
function AssistantMessageContent({
  text,
  fontSize,
}: {
  text: string;
  fontSize: number;
}) {
  const fences = extractChartFences(text);

  if (fences.length === 0) {
    return <ChatBubbleContent text={text} fontSize={fontSize} />;
  }

  const segments: React.ReactNode[] = [];
  let cursor = 0;

  for (const fence of fences) {
    // Text before this fence
    if (fence.start > cursor) {
      const before = text.slice(cursor, fence.start);
      if (before.trim()) {
        segments.push(
          <ChatBubbleContent
            key={`text-${cursor}`}
            text={before}
            fontSize={fontSize}
          />,
        );
      }
    }
    // The chart
    segments.push(
      <div
        key={`chart-${fence.start}`}
        style={{ marginTop: 8, marginBottom: 8 }}
      >
        <ChartView chart={fence.chart} height={260} />
      </div>,
    );
    cursor = fence.end;
  }

  // Remaining text after last fence
  if (cursor < text.length) {
    const after = text.slice(cursor);
    if (after.trim()) {
      segments.push(
        <ChatBubbleContent
          key={`text-${cursor}`}
          text={after}
          fontSize={fontSize}
        />,
      );
    }
  }

  return <>{segments}</>;
}

// ─── Suggested prompts ────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Explain this in simpler terms",
  "Give me a real-world example",
  "What should I know before this?",
  "Quiz me on this topic",
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChatPanel({ context }: Props) {
  const { keys, send, activeKeyId } = useAI();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeyManager, setShowKeyManager] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isSidebar, setIsSidebar] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const [chatModelOverride, setChatModelOverride] = useState<string | null>(
    null,
  );

  const [panelPos, setPanelPos] = useState({ x: 24, y: 24 });
  const [panelSize, setPanelSize] = useState({ w: 420, h: 580 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const resizing = useRef<string | null>(null); // handle id: "se" | "e" | "s" | "n" | "w" | "sw" | "ne" | "nw"
  const resizeStart = useRef({ mx: 0, my: 0, w: 0, h: 0, px: 0, py: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const onDragMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isSidebar) return;
      dragging.current = true;
      dragStart.current = {
        mx: e.clientX,
        my: e.clientY,
        px: panelPos.x,
        py: panelPos.y,
      };
      e.preventDefault();
    },
    [isSidebar, panelPos],
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragging.current) {
        const dx = e.clientX - dragStart.current.mx;
        const dy = e.clientY - dragStart.current.my;
        const w = resizeStart.current.w || 420;
        setPanelPos({
          x: Math.max(
            0,
            Math.min(window.innerWidth - w, dragStart.current.px + dx),
          ),
          y: Math.max(
            0,
            Math.min(window.innerHeight - 48, dragStart.current.py + dy),
          ),
        });
      }
      if (resizing.current) {
        const dx = e.clientX - resizeStart.current.mx;
        const dy = e.clientY - resizeStart.current.my;
        const { w: ow, h: oh, px: ox, py: oy } = resizeStart.current;
        const minW = 300,
          minH = 300;
        const handle = resizing.current;
        let nw = ow,
          nh = oh,
          nx = ox,
          ny = oy;
        if (handle.includes("e"))
          nw = Math.max(minW, Math.min(window.innerWidth - ox, ow + dx));
        if (handle.includes("w")) {
          nw = Math.max(minW, ow - dx);
          nx = ox + ow - nw;
        }
        if (handle.includes("s"))
          nh = Math.max(minH, Math.min(window.innerHeight - oy, oh + dy));
        if (handle.includes("n")) {
          nh = Math.max(minH, oh - dy);
          ny = oy + oh - nh;
        }
        setPanelSize({ w: nw, h: nh });
        setPanelPos({ x: Math.max(0, nx), y: Math.max(0, ny) });
      }
    }
    function onMouseUp() {
      dragging.current = false;
      resizing.current = null;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []); // stable — reads from refs only

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent, handle = "nw") => {
      resizing.current = handle;
      resizeStart.current = {
        mx: e.clientX,
        my: e.clientY,
        w: panelSize.w,
        h: panelSize.h,
        px: panelPos.x,
        py: panelPos.y,
      };
      e.preventDefault();
      e.stopPropagation();
    },
    [panelSize, panelPos],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const doSend = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;
      setError(null);
      setShowSuggestions(false);

      const userMsg: ChatMessage = { role: "user", content: text.trim() };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput("");
      setStreaming(true);

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let stopped = false;
      abortRef.current = () => {
        stopped = true;
      };

      try {
        const systemPrompt = buildSystemPrompt(context);
        await send(
          newMessages,
          systemPrompt,
          (delta) => {
            if (stopped) return;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role !== "assistant") return prev;
              return [
                ...prev.slice(0, -1),
                { role: "assistant", content: last.content + delta },
              ];
            });
          },
          undefined,
          undefined,
          chatModelOverride ?? undefined,
        );
      } catch (err) {
        const e = err as Error;
        if (e.message === "NO_KEYS") {
          setError("No API keys configured. Add a key to start chatting.");
          setShowKeyManager(true);
        } else if (e.message?.startsWith("ALL_RATE_LIMITED")) {
          const secs = e.message.split(":")[1];
          const hint =
            secs && parseInt(secs) > 0
              ? ` Retry in ~${secs}s, or add more keys.`
              : " Try again in ~60s, or add more keys.";
          setError(`All keys are rate-limited.${hint}`);
        } else {
          setError(`Error: ${e.message}`);
        }
        setMessages((prev) =>
          prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev,
        );
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming, send, context, chatModelOverride],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend(input);
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    setShowSuggestions(true);
  }

  const activeKey = activeKeyId ? keys.find((k) => k.id === activeKeyId) : null;

  const sidebarStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    width: Math.max(340, panelSize.w),
    height: "100vh",
    zIndex: 900,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-secondary)",
    borderLeft: "1px solid var(--border-color)",
    boxShadow: "var(--shadow-lg)",
    animation: "slideInRight 200ms cubic-bezier(0.4,0,0.2,1)",
  };

  const floatStyle: React.CSSProperties = {
    position: "fixed",
    left: panelPos.x,
    top: panelPos.y,
    width: panelSize.w,
    height: panelSize.h,
    zIndex: 900,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border-color)",
    borderRadius: 8,
    boxShadow: "var(--shadow-lg)",
    overflow: "hidden",
    animation: "slideUp 180ms cubic-bezier(0.4,0,0.2,1)",
    minWidth: 300,
    minHeight: 300,
  };

  const panelStyle = isSidebar ? sidebarStyle : floatStyle;

  return (
    <>
      {showKeyManager && (
        <KeyManager onClose={() => setShowKeyManager(false)} />
      )}

      {open && (
        <div ref={panelRef} style={panelStyle}>
          {/* Header */}
          <div
            onMouseDown={onDragMouseDown}
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border-color)",
              background: "var(--bg-tertiary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
              cursor: isSidebar ? "default" : "grab",
              userSelect: "none",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-primary)",
                }}
              >
                ◈ Study Assistant
              </div>
              {context?.topicTitle && (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {context.topicTitle}
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                onClick={() => setFontSize((f) => Math.max(10, f - 1))}
                title="Decrease font size"
                style={headerBtnStyle}
              >
                A-
              </button>
              <button
                onClick={() => setFontSize((f) => Math.min(20, f + 1))}
                title="Increase font size"
                style={headerBtnStyle}
              >
                A+
              </button>
            </div>

            <button
              onClick={() => setIsSidebar((v) => !v)}
              title={
                isSidebar ? "Switch to floating panel" : "Switch to sidebar"
              }
              style={headerBtnStyle}
            >
              {isSidebar ? "⧉" : "⊞"}
            </button>

            <button
              onClick={() => setShowKeyManager(true)}
              title="Manage API keys"
              style={{
                ...headerBtnStyle,
                background: keys.length === 0 ? "var(--accent-danger)" : "none",
                borderColor:
                  keys.length === 0
                    ? "var(--accent-danger)"
                    : "var(--border-color)",
                color: keys.length === 0 ? "#fff" : "var(--text-muted)",
              }}
            >
              {keys.length === 0 ? "⚠ Keys" : `⚙ ${keys.length}`}
            </button>

            {messages.length > 0 && (
              <button
                onClick={clearChat}
                title="Clear chat"
                style={headerBtnStyle}
              >
                ✕
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              title="Close"
              style={{ ...headerBtnStyle, fontSize: 16, lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              fontSize,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--text-muted)",
                  padding: "32px 16px",
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 10 }}>◈</div>
                <div
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: fontSize + 2,
                    marginBottom: 4,
                  }}
                >
                  Ask me anything about
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: fontSize - 1,
                    color: "var(--accent-primary)",
                  }}
                >
                  {context?.topicTitle ??
                    context?.lessonTitle ??
                    "the current lesson"}
                </div>
              </div>
            )}

            {showSuggestions && messages.length === 0 && keys.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  justifyContent: "center",
                }}
              >
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => doSend(s)}
                    style={{
                      padding: "6px 12px",
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: 20,
                      cursor: "pointer",
                      fontSize: fontSize - 1,
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-sans)",
                      transition: "border-color 150ms, color 150ms",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor =
                        "var(--accent-primary)";
                      e.currentTarget.style.color = "var(--accent-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-color)";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => {
              const exprs =
                msg.role === "assistant" && msg.content
                  ? extractPlottableExpressions(msg.content)
                  : [];
              // Don't show graph button if the message has chart fences (already rendered inline)
              const hasCharts =
                msg.role === "assistant" &&
                extractChartFences(msg.content).length > 0;

              return (
                <div
                  key={i}
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection:
                        msg.role === "user" ? "row-reverse" : "row",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background:
                          msg.role === "user"
                            ? "var(--accent-primary)"
                            : "var(--bg-tertiary)",
                        border: "1px solid var(--border-color)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        flexShrink: 0,
                        color:
                          msg.role === "user" ? "#fff" : "var(--text-muted)",
                      }}
                    >
                      {msg.role === "user" ? "U" : "◈"}
                    </div>
                    <div
                      style={{
                        maxWidth: "85%",
                        padding: "10px 14px",
                        background:
                          msg.role === "user"
                            ? "color-mix(in srgb, var(--accent-primary) 12%, var(--bg-secondary))"
                            : "var(--bg-tertiary)",
                        border: `1px solid ${
                          msg.role === "user"
                            ? "color-mix(in srgb, var(--accent-primary) 30%, var(--border-color))"
                            : "var(--border-color)"
                        }`,
                        borderRadius:
                          msg.role === "user"
                            ? "12px 12px 2px 12px"
                            : "12px 12px 12px 2px",
                        lineHeight: 1.7,
                        color: "var(--text-primary)",
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.content === "" && streaming ? (
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          ▋
                        </span>
                      ) : msg.role === "assistant" ? (
                        <AssistantMessageContent
                          text={msg.content}
                          fontSize={fontSize}
                        />
                      ) : (
                        <ChatBubbleContent
                          text={msg.content}
                          fontSize={fontSize}
                        />
                      )}
                    </div>
                  </div>

                  {exprs.length > 0 && !streaming && !hasCharts && (
                    <GraphToggle
                      key={`graph-${i}`}
                      expressions={exprs}
                      fontSize={fontSize}
                    />
                  )}
                </div>
              );
            })}

            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  background:
                    "color-mix(in srgb, var(--accent-danger) 8%, var(--bg-secondary))",
                  border:
                    "1px solid color-mix(in srgb, var(--accent-danger) 30%, var(--border-color))",
                  borderRadius: 8,
                  fontSize: fontSize - 1,
                  color: "var(--accent-danger)",
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            )}

            {streaming && activeKey && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  textAlign: "center",
                }}
              >
                via {activeKey.label ?? activeKey.provider}
                {chatModelOverride
                  ? ` · ${chatModelOverride
                      .replace(/^gemini-/, "")
                      .replace(/-preview$/, "")
                      .replace(/-\d{2}-\d{2}$/, "")}`
                  : activeKey.model
                    ? ` · ${activeKey.model}`
                    : ""}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: "12px 14px",
              borderTop: "1px solid var(--border-color)",
              background: "var(--bg-tertiary)",
              flexShrink: 0,
            }}
          >
            {/* Model selector */}
            {keys.length > 0 && (
              <div
                style={{
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-muted)",
                    flexShrink: 0,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Model
                </span>
                <select
                  value={chatModelOverride ?? ""}
                  onChange={(e) => setChatModelOverride(e.target.value || null)}
                  disabled={streaming}
                  style={{
                    flex: 1,
                    padding: "3px 6px",
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 4,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-primary)",
                    cursor: streaming ? "not-allowed" : "pointer",
                    outline: "none",
                  }}
                >
                  <option value="">auto (smart routing)</option>
                  {keys.flatMap((key) => {
                    if (key.provider === "gemini") {
                      const models =
                        key.model && GEMINI_FREE_MODELS[key.model]
                          ? [key.model]
                          : Object.keys(GEMINI_FREE_MODELS);
                      return models.map((modelId) => (
                        <option key={`${key.id}::${modelId}`} value={modelId}>
                          {key.label ? `${key.label} · ` : ""}
                          {modelId
                            .replace(/^gemini-/, "")
                            .replace(/-preview$/, "")}
                        </option>
                      ));
                    }
                    if (key.provider === "groq") {
                      const models =
                        key.model && GROQ_FREE_MODELS[key.model]
                          ? [key.model]
                          : Object.keys(GROQ_FREE_MODELS);
                      return models.map((modelId) => (
                        <option key={`${key.id}::${modelId}`} value={modelId}>
                          {key.label ? `${key.label} · ` : ""}
                          {modelId}
                        </option>
                      ));
                    }
                    const modelId =
                      key.model ||
                      PROVIDER_DEFAULTS[key.provider]?.defaultModel ||
                      key.provider;
                    return [
                      <option key={key.id} value={modelId}>
                        {key.label ? `${key.label} · ` : ""}
                        {key.provider} · {modelId}
                      </option>,
                    ];
                  })}
                </select>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  keys.length === 0
                    ? "Add an API key first…"
                    : "Ask a question… (Enter to send, Shift+Enter for newline)"
                }
                disabled={streaming || keys.length === 0}
                rows={1}
                style={{
                  flex: 1,
                  resize: "none",
                  padding: "9px 12px",
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 6,
                  fontFamily: "var(--font-sans)",
                  fontSize,
                  color: "var(--text-primary)",
                  outline: "none",
                  lineHeight: 1.5,
                  maxHeight: 120,
                  overflowY: "auto",
                  transition: "border-color 150ms",
                }}
                onFocus={(e) =>
                  (e.target.style.borderColor = "var(--accent-primary)")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = "var(--border-color)")
                }
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = "auto";
                  t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
                }}
              />
              <button
                onClick={() =>
                  streaming ? abortRef.current?.() : doSend(input)
                }
                disabled={!streaming && (!input.trim() || keys.length === 0)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 6,
                  border: "none",
                  background: streaming
                    ? "var(--accent-danger)"
                    : input.trim() && keys.length > 0
                      ? "var(--accent-primary)"
                      : "var(--bg-tertiary)",
                  color:
                    streaming || (input.trim() && keys.length > 0)
                      ? "#fff"
                      : "var(--text-muted)",
                  cursor:
                    streaming || (input.trim() && keys.length > 0)
                      ? "pointer"
                      : "not-allowed",
                  fontSize: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "background 150ms",
                }}
                title={streaming ? "Stop" : "Send"}
              >
                {streaming ? "■" : "↑"}
              </button>
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                marginTop: 6,
                textAlign: "right",
              }}
            >
              {keys.length > 0
                ? `${keys.length} key${keys.length > 1 ? "s" : ""} · auto-rotates on rate limit`
                : "No keys configured"}
            </div>
          </div>

          {!isSidebar && (
            <>
              {/* Edge handles */}
              <div
                onMouseDown={(e) => onResizeMouseDown(e, "e")}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 0,
                  bottom: 8,
                  width: 5,
                  cursor: "ew-resize",
                  zIndex: 10,
                }}
              />
              <div
                onMouseDown={(e) => onResizeMouseDown(e, "w")}
                style={{
                  position: "absolute",
                  top: 8,
                  left: 0,
                  bottom: 8,
                  width: 5,
                  cursor: "ew-resize",
                  zIndex: 10,
                }}
              />
              <div
                onMouseDown={(e) => onResizeMouseDown(e, "s")}
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 8,
                  right: 8,
                  height: 5,
                  cursor: "ns-resize",
                  zIndex: 10,
                }}
              />
              <div
                onMouseDown={(e) => onResizeMouseDown(e, "n")}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 8,
                  right: 8,
                  height: 5,
                  cursor: "ns-resize",
                  zIndex: 10,
                }}
              />
              {/* Corner handles */}
              <div
                onMouseDown={(e) => onResizeMouseDown(e, "se")}
                title="Drag to resize"
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 14,
                  height: 14,
                  cursor: "se-resize",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                  fontSize: 10,
                  opacity: 0.5,
                  userSelect: "none",
                  zIndex: 11,
                }}
              >
                ⤡
              </div>
              <div
                onMouseDown={(e) => onResizeMouseDown(e, "sw")}
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: 14,
                  height: 14,
                  cursor: "sw-resize",
                  zIndex: 11,
                }}
              />
              <div
                onMouseDown={(e) => onResizeMouseDown(e, "ne")}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: 14,
                  height: 14,
                  cursor: "ne-resize",
                  zIndex: 11,
                }}
              />
              <div
                onMouseDown={(e) => onResizeMouseDown(e, "nw")}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 14,
                  height: 14,
                  cursor: "nw-resize",
                  zIndex: 11,
                }}
              />
            </>
          )}
        </div>
      )}

      {(!isSidebar || !open) && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 901 }}>
          <button
            onClick={() => setOpen((v) => !v)}
            title={open ? "Close assistant" : "Open study assistant"}
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: open ? "var(--bg-tertiary)" : "var(--accent-primary)",
              border: `2px solid ${open ? "var(--border-color)" : "var(--accent-primary)"}`,
              boxShadow: open
                ? "var(--shadow-sm)"
                : "0 4px 20px color-mix(in srgb, var(--accent-primary) 40%, transparent)",
              cursor: "pointer",
              fontSize: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: open ? "var(--text-secondary)" : "#fff",
              transition: "all 200ms cubic-bezier(0.4,0,0.2,1)",
              position: "relative",
            }}
          >
            {open ? "×" : "◈"}
            {!open && keys.length === 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: 14,
                  height: 14,
                  background: "var(--accent-danger)",
                  borderRadius: "50%",
                  border: "2px solid var(--bg-primary)",
                  fontSize: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                !
              </span>
            )}
          </button>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

const headerBtnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border-color)",
  borderRadius: 3,
  padding: "3px 8px",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  color: "var(--text-muted)",
  transition: "all 150ms",
  whiteSpace: "nowrap",
};
