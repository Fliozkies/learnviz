"use client";
import { useState, useRef, useEffect } from "react";
import { useAI } from "@/components/ai/AIProvider";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are the LearnViz onboarding assistant — a friendly, concise guide embedded in the LearnViz landing page.

LearnViz is an AI-powered curriculum viewer and course generator. Here is everything you need to know to help users:

## What LearnViz does
- Loads structured curriculum JSON files and renders them as an interactive course: lessons, topics, quizzes, charts, glossary, and more.
- Can generate brand-new curriculum JSON using the Curriculum Forge (AI-powered).
- Has an AI chat panel for studying alongside course content.
- All AI features run through user-provided API keys (no built-in billing).

## How to get started
1. **Open a curriculum**: Click "Open Curriculum", then drag-and-drop or click to upload a .json curriculum file.
2. **Use a sample**: Sample page screenshots rotate in the right column — these show what a loaded course looks like.
3. **Recent files**: Previously opened curricula are saved locally and shown in the "Recent" list on the right. Click any to reload.
4. **Forge a new course**: Click the "⚡ Forge" tab to generate a curriculum from a topic or document using AI.

## API Keys
- LearnViz requires at least one API key to use AI features (Forge, AI chat, AI editing).
- Click **Preferences** (top-right ⚙ button) → **Keys** tab to add keys.
- Supported providers: **Gemini** (Google, has a generous free tier), **OpenRouter**, **HuggingFace**, **Anthropic**.
- Keys are stored locally in your browser (never sent to any server).
- **Export keys**: In the Key Manager → Keys tab → "Export Keys" button downloads a .json backup.
- **Import keys**: In the same panel, click "Import from file…" to restore a backup on a new machine.

## Curriculum Forge
- Generates a full structured course JSON from a topic name, description, or uploaded prerequisite document.
- Requires at least one API key with "generation" or "any" role.
- Once generated, you can load it directly or download the JSON for reuse.

## Preferences panel (⚙)
- **Keys tab**: Add/remove/reorder API keys, set roles (chat-only, generation, editing, any), export/import.
- **Budget tab**: Set token or USD spending limits per session to avoid over-use.
- **Token Guide tab**: Explains how many tokens different actions cost.

## Common questions
- "How do I add an API key?" → Click the ⚙ Preferences button top-right → Keys tab → fill in provider/key/model → Add Key.
- "How do I get a free Gemini key?" → Visit https://aistudio.google.com → click "Get API key". The free tier allows hundreds of requests per day.
- "Where is my data stored?" → Everything stays in your browser's localStorage. Nothing is uploaded to a server.
- "Can I use this offline?" → The app itself works offline; AI features need an internet connection to reach the AI provider APIs.
- "How do I move my keys to another computer?" → Export keys from Preferences → Keys → Export, then import the file on the new machine.

Keep answers short (2–4 sentences). Be direct and helpful. If you don't know something, say so. Don't make up features.`;

// ─── Inline markdown renderer ─────────────────────────────────────────────────
// Handles **bold**, `code`, and [link](url) — enough for assistant responses.

function InlineMd({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  // Combined regex: **bold**, `code`, [text](url)
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      parts.push(
        <strong key={key++} style={{ fontWeight: 700 }}>
          {match[1]}
        </strong>,
      );
    } else if (match[2] !== undefined) {
      parts.push(
        <code
          key={key++}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.9em",
            background: "rgba(0,0,0,0.12)",
            borderRadius: 3,
            padding: "1px 4px",
          }}
        >
          {match[2]}
        </code>,
      );
    } else if (match[3] !== undefined && match[4] !== undefined) {
      parts.push(
        <a
          key={key++}
          href={match[4]}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "inherit",
            textDecoration: "underline",
            opacity: 0.85,
          }}
        >
          {match[3]}
        </a>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function MdMessage({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <>
      {lines.map((line, i) =>
        line === "" ? (
          <br key={i} />
        ) : (
          <span key={i}>
            {i > 0 && lines[i - 1] !== "" && <br />}
            <InlineMd text={line} />
          </span>
        ),
      )}
    </>
  );
}

export default function LandingChat() {
  const { keys, send } = useAI();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasKeys = keys.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setStreaming(true);

    const assistantIdx = next.length;
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    abortRef.current = new AbortController();
    try {
      await send(
        next.map((m) => ({ role: m.role, content: m.content })),
        SYSTEM_PROMPT,
        (delta) => {
          setMessages((m) => {
            const copy = [...m];
            copy[assistantIdx] = {
              role: "assistant",
              content: (copy[assistantIdx]?.content ?? "") + delta,
            };
            return copy;
          });
        },
        600,
        "chat",
        undefined,
        abortRef.current.signal,
      );
    } catch {
      setMessages((m) => {
        const copy = [...m];
        if (!copy[assistantIdx]?.content) {
          copy[assistantIdx] = {
            role: "assistant",
            content:
              "⚠ Could not reach AI. Check your API keys in Preferences.",
          };
        }
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Pill button — always visible
  const pillStyle: React.CSSProperties = {
    position: "fixed",
    bottom: 20,
    right: 24,
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "8px 16px",
    background: "var(--accent-primary)",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
    transition: "transform 150ms, box-shadow 150ms",
  };

  return (
    <>
      {/* Floating toggle pill */}
      {!open && (
        <button
          style={pillStyle}
          onClick={() => setOpen(true)}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.32)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.25)";
          }}
        >
          <span style={{ fontSize: 14 }}>◈</span> Ask LearnViz
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 24,
            zIndex: 200,
            width: "min(380px, calc(100vw - 32px))",
            height: "min(520px, 70vh)",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-subtle)",
              background: "var(--bg-tertiary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 14, color: "var(--accent-primary)" }}>
              ◈
            </span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                LearnViz Assistant
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  marginTop: 1,
                }}
              >
                {hasKeys
                  ? "Ask me anything about this app"
                  : "⚠ No API keys — add one in Preferences"}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: 18,
                lineHeight: 1,
                padding: "2px 4px",
                borderRadius: 4,
                transition: "color 150ms",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--text-primary)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--text-muted)")
              }
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-sans)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Hi! I can help you get started with LearnViz. Try asking:
                </p>
                {[
                  "How do I load a curriculum?",
                  "How do I get a free API key?",
                  "How do I export my keys?",
                  "What is Curriculum Forge?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setInput(q);
                      setTimeout(() => inputRef.current?.focus(), 10);
                    }}
                    style={{
                      padding: "7px 11px",
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-secondary)",
                      textAlign: "left",
                      transition: "all 150ms",
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
                    {q}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent:
                    msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "86%",
                    padding: "8px 11px",
                    borderRadius:
                      msg.role === "user"
                        ? "12px 12px 4px 12px"
                        : "12px 12px 12px 4px",
                    background:
                      msg.role === "user"
                        ? "var(--accent-primary)"
                        : "var(--bg-tertiary)",
                    color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                    fontSize: 12,
                    fontFamily: "var(--font-sans)",
                    lineHeight: 1.5,
                    border:
                      msg.role === "assistant"
                        ? "1px solid var(--border-subtle)"
                        : "none",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.role === "assistant" ? (
                    <MdMessage content={msg.content} />
                  ) : (
                    msg.content
                  )}
                  {streaming &&
                    i === messages.length - 1 &&
                    msg.role === "assistant" && (
                      <span
                        style={{
                          display: "inline-block",
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--accent-primary)",
                          marginLeft: 4,
                          verticalAlign: "middle",
                          animation: "pulse 1s infinite",
                        }}
                      />
                    )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: "10px 12px",
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--bg-tertiary)",
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              flexShrink: 0,
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasKeys
                  ? "Ask anything… (Enter to send)"
                  : "Add an API key in Preferences first"
              }
              disabled={!hasKeys || streaming}
              rows={1}
              style={{
                flex: 1,
                resize: "none",
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                padding: "7px 10px",
                fontSize: 12,
                fontFamily: "var(--font-sans)",
                color: "var(--text-primary)",
                outline: "none",
                lineHeight: 1.4,
                maxHeight: 80,
                overflowY: "auto",
                opacity: !hasKeys ? 0.5 : 1,
              }}
            />
            <button
              onClick={handleSend}
              disabled={!hasKeys || !input.trim() || streaming}
              style={{
                padding: "7px 12px",
                background:
                  hasKeys && input.trim() && !streaming
                    ? "var(--accent-primary)"
                    : "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                cursor:
                  hasKeys && input.trim() && !streaming
                    ? "pointer"
                    : "not-allowed",
                color:
                  hasKeys && input.trim() && !streaming
                    ? "#fff"
                    : "var(--text-muted)",
                fontSize: 14,
                flexShrink: 0,
                transition: "all 150ms",
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </>
  );
}
