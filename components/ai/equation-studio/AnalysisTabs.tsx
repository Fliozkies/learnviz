"use client";
import { COLORS } from "./constants";
import {
  readLineInfo, findRoots, findComplexRootsForExpr, formatComplexRoot,
  findIntersections, Intersection,
} from "./mathUtils";

// ─── Shared primitives ────────────────────────────────────────────────────────

export function Muted({ children, fontSize }: { children: React.ReactNode; fontSize: number }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize, color: "var(--text-muted)" }}>
      {children}
    </span>
  );
}

export function Chip({ children, color, fontSize }: { children: React.ReactNode; color: string; fontSize: number }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4,
      background: `color-mix(in srgb, ${color} 12%, var(--bg-tertiary))`,
      border: `1px solid color-mix(in srgb, ${color} 30%, var(--border-color))`,
      fontFamily: "var(--font-mono)", fontSize, color: "var(--text-primary)",
    }}>
      {children}
    </span>
  );
}

// ─── Tab components ───────────────────────────────────────────────────────────

export function InfoTab({ expressions, fontSize }: { expressions: string[]; fontSize: number }) {
  if (!expressions.length) return <Muted fontSize={fontSize}>Add equations to see analysis.</Muted>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {expressions.map((expr, i) => {
        const info = readLineInfo(expr.trim());
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0, marginTop: 3 }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fontSize - 2, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              <code style={{ color: "var(--text-primary)" }}>{expr}</code>
              {info ? (
                <span style={{ color: "var(--text-muted)" }}>
                  {info.slope !== null && <> · slope: <b style={{ color: "var(--text-secondary)" }}>{info.slope}</b></>}
                  {info.yIntercept !== null && <> · y-int: <b style={{ color: "var(--text-secondary)" }}>{info.yIntercept}</b></>}
                  {info.xIntercept !== null && <> · x-int: <b style={{ color: "var(--text-secondary)" }}>{info.xIntercept}</b></>}
                </span>
              ) : (
                <span style={{ color: "var(--text-muted)" }}> · use Roots tab for zeros</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RootsTab({ expressions, fontSize }: { expressions: string[]; fontSize: number }) {
  if (!expressions.length) return <Muted fontSize={fontSize}>Add equations to find roots.</Muted>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {expressions.map((expr, i) => {
        const roots = findRoots(expr);
        const complexRoots = roots.length === 0 ? findComplexRootsForExpr(expr) : null;
        return (
          <div key={i}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
              <code style={{ fontFamily: "var(--font-mono)", fontSize: fontSize - 2, color: "var(--text-primary)" }}>{expr}</code>
            </div>
            {roots.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 14 }}>
                {roots.map((r, ri) => <Chip key={ri} color={COLORS[i % COLORS.length]} fontSize={fontSize - 2}>x = {r}</Chip>)}
              </div>
            ) : complexRoots ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 14 }}>
                {complexRoots.map((r, ri) => <Chip key={ri} color={COLORS[i % COLORS.length]} fontSize={fontSize - 2}>{formatComplexRoot(r)}</Chip>)}
              </div>
            ) : (
              <Muted fontSize={fontSize - 1}>No real roots found in [−20, 20]</Muted>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function IntersectionsTab({ expressions, fontSize }: { expressions: string[]; fontSize: number }) {
  if (expressions.length < 2) return <Muted fontSize={fontSize}>Add at least 2 equations to find intersections.</Muted>;
  const pairs: Array<{ a: number; b: number; pts: Intersection[] }> = [];
  for (let a = 0; a < expressions.length; a++)
    for (let b = a + 1; b < expressions.length; b++)
      pairs.push({ a, b, pts: findIntersections(expressions[a], expressions[b]) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {pairs.map(({ a, b, pts }, pi) => (
        <div key={pi}>
          <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[a % COLORS.length] }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fontSize - 3, color: "var(--text-muted)" }}>∩</span>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[b % COLORS.length] }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fontSize - 2, color: "var(--text-muted)" }}>
              {expressions[a].length > 18 ? expressions[a].slice(0, 18) + "…" : expressions[a]}
              {" & "}
              {expressions[b].length > 18 ? expressions[b].slice(0, 18) + "…" : expressions[b]}
            </span>
          </div>
          {pts.length === 0 ? (
            <Muted fontSize={fontSize - 1}>No intersections found in [−20, 20]</Muted>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 14 }}>
              {pts.map((pt, pti) => <Chip key={pti} color="#666" fontSize={fontSize - 2}>({pt.x}, {pt.y})</Chip>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
