"use client";
import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphViewProps {
  expressions: string[];
  /** Optional label rendered above the graph */
  title?: string;
  /** Height in px, or -1 to fill the flex parent (use display:flex on wrapper) */
  height?: number;
}

// ─── Desmos loader ────────────────────────────────────────────────────────────

let desmosLoaded = false;
let desmosCallbacks: Array<() => void> = [];

function loadDesmos(cb: () => void) {
  if (desmosLoaded) {
    cb();
    return;
  }
  desmosCallbacks.push(cb);
  if (document.getElementById("desmos-script")) return; // already loading
  const s = document.createElement("script");
  s.id = "desmos-script";
  s.src =
    "https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6";
  s.onload = () => {
    desmosLoaded = true;
    desmosCallbacks.forEach((fn) => fn());
    desmosCallbacks = [];
  };
  document.head.appendChild(s);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GraphView({
  expressions,
  title,
  height = 320,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calcRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Don't render an empty graph — caller should check before rendering
  const hasExpressions = expressions.length > 0;

  // Load Desmos and initialize calculator
  useEffect(() => {
    loadDesmos(() => {
      if (!containerRef.current) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Desmos = (window as any).Desmos;
        if (!Desmos) {
          setError("Desmos failed to load");
          return;
        }
        calcRef.current = Desmos.GraphingCalculator(containerRef.current, {
          keypad: false,
          settingsMenu: false,
          expressionsTopbar: false,
          zoomButtons: true,
          expressions: false, // hide expression list panel
          border: false,
          backgroundColor: "transparent",
        });
        setReady(true);
      } catch (e) {
        setError(String(e));
      }
    });
    return () => {
      calcRef.current?.destroy();
    };
  }, []);

  // Set expressions whenever they change
  useEffect(() => {
    if (!ready || !calcRef.current) return;
    const calc = calcRef.current;
    calc.setBlank();
    expressions.forEach((expr, i) => {
      try {
        calc.setExpression({
          id: `e${i}`,
          latex: expr,
          color: COLORS[i % COLORS.length],
        });
      } catch {
        // silently skip invalid expressions
      }
    });
  }, [ready, expressions]);

  if (error)
    return (
      <div
        style={{
          padding: "12px 16px",
          background:
            "color-mix(in srgb, var(--accent-danger) 8%, var(--bg-secondary))",
          border:
            "1px solid color-mix(in srgb, var(--accent-danger) 25%, var(--border-color))",
          borderRadius: 6,
          fontSize: 12,
          color: "var(--accent-danger)",
        }}
      >
        Graph error: {error}
      </div>
    );

  // Nothing to plot — render nothing rather than an empty axis grid
  if (!hasExpressions) return null;

  const fillFlex = height === -1;

  return (
    <div
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--bg-secondary)",
        ...(fillFlex
          ? { flex: 1, display: "flex", flexDirection: "column" }
          : {}),
      }}
    >
      {title && (
        <div
          style={{
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-secondary)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          {title}
        </div>
      )}
      {/* Desmos canvas */}
      <div
        style={{
          position: "relative",
          ...(fillFlex ? { flex: 1 } : { height }),
        }}
      >
        {!ready && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
            }}
          >
            Loading graph…
          </div>
        )}
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "100%",
            opacity: ready ? 1 : 0,
            transition: "opacity 300ms",
          }}
        />
      </div>
    </div>
  );
}

// ─── Color palette ─────────────────────────────────────────────────────────────

const COLORS = [
  "#2d70b3", // blue
  "#c74440", // red
  "#388c46", // green
  "#fa7e19", // orange
  "#6042a6", // purple
  "#000000", // black
];
