"use client";
import { useEffect, useRef } from "react";
import { RichText, resolveText } from "@/types/curriculum";

interface Props {
  content: RichText | undefined | null;
  className?: string;
  inline?: boolean;
}

// Render LaTeX using KaTeX loaded from CDN
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).katex) {
      if (ref.current) renderKatex(ref.current, latex, display);
      return;
    }
    // KaTeX not yet loaded — wait for the script's load event
    const script = document.querySelector(
      'script[src*="katex"]',
    ) as HTMLScriptElement | null;
    if (!script) return;
    const onLoad = () => {
      if (ref.current) renderKatex(ref.current, latex, display);
    };
    script.addEventListener("load", onLoad);
    return () => script.removeEventListener("load", onLoad);
  }, [latex, display]);

  return <span ref={ref} />;
}

// Module-level counter — never resets, so keys are globally unique across
// all render calls regardless of nesting depth or call order.
let _k = 0;
const nk = () => `rt-${_k++}`;

// Very basic inline markdown: **bold**, *italic*, `code`, $latex$
// NOTE: does NOT handle $$...$$ — those are extracted before this runs.
function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex =
    /\$([^$\n]+)\$|\*\*([^*\n]+)\*\*|\*([^*\n]{1,120})\*|`([^`\n]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<span key={nk()}>{text.slice(last, match.index)}</span>);
    }
    if (match[1]) {
      parts.push(<KatexBlock key={nk()} latex={match[1]} display={false} />);
    } else if (match[2]) {
      parts.push(<strong key={nk()}>{parseInlineMarkdown(match[2])}</strong>);
    } else if (match[3]) {
      parts.push(<em key={nk()}>{parseInlineMarkdown(match[3])}</em>);
    } else if (match[4]) {
      parts.push(<code key={nk()}>{match[4]}</code>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length)
    parts.push(<span key={nk()}>{text.slice(last)}</span>);
  return parts;
}

// Split text on $$...$$ boundaries, returning inline nodes and
// display-mode KaTeX blocks interleaved.
function parseLineWithDisplayMath(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const ddRegex = /\$\$([\s\S]+?)\$\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = ddRegex.exec(text)) !== null) {
    if (m.index > last) {
      const before = text.slice(last, m.index).trim();
      if (before)
        nodes.push(<span key={nk()}>{parseInlineMarkdown(before)}</span>);
    }
    nodes.push(
      <span
        key={nk()}
        style={{
          display: "block",
          textAlign: "center",
          padding: "10px 0",
          overflowX: "auto",
        }}
      >
        <KatexBlock latex={m[1]} display={true} />
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    const after = text.slice(last).trim();
    if (after) nodes.push(<span key={nk()}>{parseInlineMarkdown(after)}</span>);
  }
  return nodes;
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Display math block $$
    if (line.trim().startsWith("$$")) {
      const trimmed = line.trim();
      // Single-line case: $$....$$ open and close on same line
      const singleLine = trimmed.length > 4 && trimmed.slice(2).includes("$$");
      let latex: string;
      if (singleLine) {
        // Extract content between the first $$ and the last $$
        latex = trimmed.slice(2, trimmed.lastIndexOf("$$"));
      } else {
        // Multi-line: collect until a line ending with $$
        const latexLines = [trimmed.slice(2)];
        i++;
        while (i < lines.length && !lines[i].trim().endsWith("$$")) {
          latexLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) latexLines.push(lines[i].trim().slice(0, -2));
        latex = latexLines.join("\n");
      }
      nodes.push(
        <div
          key={nk()}
          style={{ textAlign: "center", padding: "12px 0", overflowX: "auto" }}
        >
          <KatexBlock latex={latex} display={true} />
        </div>,
      );
      i++;
      continue;
    }

    // Heading
    const hMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const Tag = (["h2", "h3", "h4", "h5"] as const)[level - 1] || "h5";
      const sizes: Record<string, string> = {
        h2: "1.5rem",
        h3: "1.25rem",
        h4: "1.1rem",
        h5: "1rem",
      };
      nodes.push(
        <Tag
          key={nk()}
          style={{
            fontSize: sizes[Tag],
            marginBottom: "8px",
            marginTop: "16px",
          }}
        >
          {parseInlineMarkdown(hMatch[2])}
        </Tag>,
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}\s*$/)) {
      nodes.push(
        <hr
          key={nk()}
          style={{ margin: "16px 0", borderColor: "var(--border, #e5e7eb)" }}
        />,
      );
      i++;
      continue;
    }

    // Code fence ```
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing ```
      nodes.push(
        <pre
          key={nk()}
          style={{
            background: "var(--muted, #f4f4f5)",
            borderRadius: "6px",
            padding: "12px 16px",
            overflowX: "auto",
            marginBottom: "12px",
            fontSize: "0.85rem",
            lineHeight: "1.6",
          }}
        >
          <code data-lang={lang || undefined}>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      nodes.push(
        <blockquote
          key={nk()}
          style={{
            borderLeft: "4px solid var(--border, #e5e7eb)",
            paddingLeft: "12px",
            marginLeft: 0,
            marginBottom: "12px",
            color: "var(--muted-foreground, #6b7280)",
            fontStyle: "italic",
          }}
        >
          {renderMarkdown(quoteLines.join("\n"))}
        </blockquote>,
      );
      continue;
    }

    // Markdown table — pipe-separated rows with a separator line
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      lines[i + 1].match(/^\|?[\s|:-]+\|/)
    ) {
      // Collect all consecutive pipe-containing rows
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }

      const parseRow = (row: string): string[] =>
        row
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());

      // Detect column alignment from separator row (index 1)
      const sepRow = tableLines[1] ? parseRow(tableLines[1]) : [];
      const alignments: Array<"left" | "center" | "right"> = sepRow.map(
        (cell) => {
          const c = cell.replace(/-/g, "");
          if (c.startsWith(":") && c.endsWith(":")) return "center";
          if (c.endsWith(":")) return "right";
          return "left";
        },
      );

      const headerRow = parseRow(tableLines[0]);
      const bodyRows = tableLines.slice(2).map(parseRow);

      nodes.push(
        <div key={nk()} style={{ overflowX: "auto", marginBottom: "16px" }}>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr>
                {headerRow.map((cell, ci) => (
                  <th
                    key={ci}
                    style={{
                      border: "1px solid var(--border, #e5e7eb)",
                      padding: "8px 12px",
                      textAlign: alignments[ci] ?? "left",
                      backgroundColor: "var(--muted, #f9fafb)",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {parseInlineMarkdown(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr
                  key={ri}
                  style={{
                    background:
                      ri % 2 === 1 ? "var(--muted, #f9fafb)" : undefined,
                  }}
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        border: "1px solid var(--border, #e5e7eb)",
                        padding: "8px 12px",
                        textAlign: alignments[ci] ?? "left",
                      }}
                    >
                      {parseInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Unordered list
    if (line.match(/^[\s]*[-*+]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*[-*+]\s/)) {
        items.push(lines[i].replace(/^[\s]*[-*+]\s/, ""));
        i++;
      }
      nodes.push(
        <ul key={nk()} style={{ paddingLeft: "24px", marginBottom: "12px" }}>
          {items.map((it) => (
            <li key={nk()} style={{ marginBottom: "4px" }}>
              {parseInlineMarkdown(it)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      nodes.push(
        <ol key={nk()} style={{ paddingLeft: "24px", marginBottom: "12px" }}>
          {items.map((it) => (
            <li key={nk()} style={{ marginBottom: "4px" }}>
              {parseInlineMarkdown(it)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — accumulate lines but stop at any block-level construct
    const paraLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^#/) &&
      !lines[i].trim().startsWith("$$") &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].startsWith(">") &&
      !lines[i].match(/^[-*_]{3,}\s*$/) &&
      !(
        lines[i].includes("|") &&
        i + 1 < lines.length &&
        lines[i + 1]?.match(/^\|?[\s|:-]+\|/)
      ) &&
      !lines[i].match(/^[\s]*[-*+]\s/) &&
      !lines[i].match(/^\d+\.\s/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    // Join lines with a space, then let parseLineWithDisplayMath split on $$
    const paraText = paraLines.join(" ");
    const paraNodes = parseLineWithDisplayMath(paraText);
    nodes.push(
      <p key={nk()} style={{ marginBottom: "12px", lineHeight: "1.75" }}>
        {paraNodes}
      </p>,
    );
  }

  return <>{nodes}</>;
}

export default function RichTextRenderer({
  content,
  className,
  inline,
}: Props) {
  if (!content) return null;

  if (typeof content === "object" && content.format === "latex") {
    return (
      <span className={className}>
        <KatexBlock latex={content.content} display={!inline} />
      </span>
    );
  }

  const text = resolveText(content);
  if (!text) return null;

  if (inline) {
    return <span className={className}>{parseInlineMarkdown(text)}</span>;
  }

  return (
    <div className={`prose ${className ?? ""}`}>{renderMarkdown(text)}</div>
  );
}
