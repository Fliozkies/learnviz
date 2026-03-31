import React from "react";

export const COLORS = ["#2d70b3", "#c74440", "#388c46", "#fa7e19", "#6042a6", "#000000"];

export interface Template {
  label: string;
  group: string;
  exprs: string[];
}

export const TEMPLATES: Template[] = [
  { group: "Linear", label: "y = mx + b", exprs: ["y = 2x + 1"] },
  { group: "Linear", label: "Two lines", exprs: ["y = 2x + 1", "y = -x + 4"] },
  { group: "Quadratic", label: "Parabola", exprs: ["y = x^2"] },
  { group: "Quadratic", label: "Vertex form", exprs: ["y = (x-2)^2 + 1"] },
  { group: "Quadratic", label: "Factored", exprs: ["y = (x+1)(x-3)"] },
  { group: "Polynomial", label: "Cubic", exprs: ["y = x^3 - 3x"] },
  { group: "Polynomial", label: "Quartic", exprs: ["y = x^4 - 4x^2 + 2"] },
  { group: "Rational", label: "1/x", exprs: ["y = 1/x"] },
  { group: "Rational", label: "(x+2)/(x-1)", exprs: ["y = (x+2)/(x-1)"] },
  { group: "Exp/Log", label: "2^x", exprs: ["y = 2^x"] },
  { group: "Exp/Log", label: "ln(x)", exprs: ["y = \\ln(x)"] },
  { group: "Exp/Log", label: "e^x vs ln(x)", exprs: ["y = e^x", "y = \\ln(x)", "y = x"] },
  { group: "Trig", label: "sin(x)", exprs: ["y = \\sin(x)"] },
  { group: "Trig", label: "cos(x)", exprs: ["y = \\cos(x)"] },
  { group: "Trig", label: "tan(x)", exprs: ["y = \\tan(x)"] },
  { group: "Trig", label: "sin + cos", exprs: ["y = \\sin(x)", "y = \\cos(x)"] },
  { group: "Conics", label: "Circle", exprs: ["x^2 + y^2 = 25"] },
  { group: "Conics", label: "Ellipse", exprs: ["\\frac{x^2}{9} + \\frac{y^2}{4} = 1"] },
  { group: "Conics", label: "Hyperbola x²-y²", exprs: ["x^2 - y^2 = 9"] },
  { group: "Conics", label: "Parabola x=y²", exprs: ["x = y^2"] },
  { group: "Inequalities", label: "Half-plane", exprs: ["y > x + 1"] },
  { group: "Inequalities", label: "System", exprs: ["y > x + 1", "y < -x + 4"] },
];

export const GROUPS = [...new Set(TEMPLATES.map((t) => t.group))];

export const hdrBtn: React.CSSProperties = {
  background: "none", border: "1px solid var(--border-color)", borderRadius: 5,
  padding: "3px 7px", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10,
  fontWeight: 700, color: "var(--text-muted)", transition: "all 150ms", whiteSpace: "nowrap", lineHeight: 1.4,
};

export function pillBtn(fontSize: number): React.CSSProperties {
  return {
    border: "1px solid", borderRadius: 20, padding: "2px 8px", cursor: "pointer",
    fontFamily: "var(--font-mono)", fontSize: fontSize - 3, fontWeight: 700, transition: "all 120ms",
  };
}

export function resizeHandleStyle(h: string): React.CSSProperties {
  const base: React.CSSProperties = { position: "absolute", zIndex: 10 };
  if (h === "e") return { ...base, top: 8, right: 0, bottom: 8, width: 5, cursor: "ew-resize" };
  if (h === "w") return { ...base, top: 8, left: 0, bottom: 8, width: 5, cursor: "ew-resize" };
  if (h === "s") return { ...base, bottom: 0, left: 8, right: 8, height: 5, cursor: "ns-resize" };
  if (h === "n") return { ...base, top: 0, left: 8, right: 8, height: 5, cursor: "ns-resize" };
  if (h === "se") return { ...base, bottom: 0, right: 0, width: 14, height: 14, cursor: "se-resize" };
  if (h === "sw") return { ...base, bottom: 0, left: 0, width: 14, height: 14, cursor: "sw-resize" };
  if (h === "ne") return { ...base, top: 0, right: 0, width: 14, height: 14, cursor: "ne-resize" };
  return { ...base, top: 0, left: 0, width: 14, height: 14, cursor: "nw-resize" };
}
