// ─── Math utilities for Equation Studio ───────────────────────────────────────

export interface Intersection {
  x: number;
  y: number;
}

export interface ComplexRoot {
  real: number;
  imag: number;
}

export interface LineInfo {
  slope: number | null;
  yIntercept: number | null;
  xIntercept: number | null;
}

export function parseYEquals(expr: string): ((x: number) => number) | null {
  let rhs = expr.trim();
  rhs = rhs.replace(/^[yYfFgG]\s*(?:\([xX]\))?\s*=\s*/, "");
  rhs = rhs
    .replace(/\\sin/g, "Math.sin")
    .replace(/\\cos/g, "Math.cos")
    .replace(/\\tan/g, "Math.tan")
    .replace(/\\ln/g, "Math.log")
    .replace(/\\log/g, "Math.log10")
    .replace(/\\sqrt\{([^}]+)\}/g, "Math.sqrt($1)")
    .replace(/\\sqrt/g, "Math.sqrt")
    .replace(/\\pi/g, "Math.PI")
    .replace(/\\e\b/g, "Math.E")
    .replace(/\^/g, "**");
  rhs = rhs.replace(/(?<![a-zA-Z])e(?![a-zA-Z])/g, "Math.E");
  rhs = rhs
    .replace(/(\d)(Math\.|[a-zA-Z(])/g, "$1*$2")
    .replace(/\)(\s*)(Math\.|[a-zA-Z(])/g, ")*$2");
  try {
    const fn = new Function(
      "x",
      `"use strict"; try { return ${rhs}; } catch { return NaN; }`,
    );
    fn(0);
    return fn as (x: number) => number;
  } catch {
    return null;
  }
}

export function findIntersections(exprA: string, exprB: string): Intersection[] {
  const fA = parseYEquals(exprA);
  const fB = parseYEquals(exprB);
  if (!fA || !fB) return [];
  const results: Intersection[] = [];
  const STEPS = 2000, X_MIN = -20, X_MAX = 20;
  const dx = (X_MAX - X_MIN) / STEPS;
  const EPS = 1e-9;

  const pushIfNew = (xi: number, yi: number) => {
    if (isFinite(xi) && isFinite(yi) && !results.some((p) => Math.abs(p.x - xi) < 0.01))
      results.push({ x: Math.round(xi * 10000) / 10000, y: Math.round(yi * 10000) / 10000 });
  };

  let prevDiff = fA(X_MIN) - fB(X_MIN);
  for (let i = 1; i <= STEPS; i++) {
    const x = X_MIN + i * dx;
    const currDiff = fA(x) - fB(x);
    if (!isFinite(prevDiff) || !isFinite(currDiff)) { prevDiff = currDiff; continue; }
    if (Math.abs(currDiff) <= EPS) { pushIfNew(x, (fA(x) + fB(x)) / 2); prevDiff = currDiff; continue; }
    if (prevDiff * currDiff < 0) {
      let lo = x - dx, hi = x;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        const midDiff = fA(mid) - fB(mid);
        if (!isFinite(midDiff)) break;
        if (Math.abs(midDiff) <= EPS) { lo = hi = mid; break; }
        if (midDiff * (fA(lo) - fB(lo)) < 0) hi = mid; else lo = mid;
      }
      pushIfNew((lo + hi) / 2, (fA((lo + hi) / 2) + fB((lo + hi) / 2)) / 2);
    }
    prevDiff = currDiff;
  }
  return results.slice(0, 10);
}

export function findRoots(expr: string): number[] {
  return findIntersections(expr, "y = 0").map((p) => p.x);
}

function extractQuadraticCoeffs(expr: string): { a: number; b: number; c: number } | null {
  const fn = parseYEquals(expr);
  if (!fn) return null;
  try {
    const f0 = fn(0), f1 = fn(1), fn1 = fn(-1);
    if (!isFinite(f0) || !isFinite(f1) || !isFinite(fn1)) return null;
    const c = f0, a = (f1 + fn1 - 2 * c) / 2, b = f1 - a - c;
    const isQuadratic = [2, 3, -2, -3].every((x) => Math.abs(fn(x) - (a * x * x + b * x + c)) < 1e-6);
    if (!isQuadratic || Math.abs(a) < 1e-10) return null;
    return { a, b, c };
  } catch { return null; }
}

export function findComplexRootsForExpr(expr: string): ComplexRoot[] | null {
  const coeffs = extractQuadraticCoeffs(expr);
  if (!coeffs) return null;
  const { a, b, c } = coeffs;
  const disc = b * b - 4 * a * c;
  const round = (n: number) => Math.round(n * 10000) / 10000;
  if (disc >= 0) return null;
  const realPart = round(-b / (2 * a));
  const imagPart = round(Math.sqrt(-disc) / (2 * a));
  return [{ real: realPart, imag: imagPart }, { real: realPart, imag: -imagPart }];
}

export function formatComplexRoot(r: ComplexRoot): string {
  const absImag = Math.abs(r.imag);
  const imagStr = absImag === 1 ? "i" : `${absImag}i`;
  if (r.real === 0) return `x = ${r.imag < 0 ? "\u2212" : ""}${imagStr}`;
  const sign = r.imag < 0 ? " \u2212 " : " + ";
  return `x = ${r.real}${sign}${imagStr}`;
}

export function readLineInfo(expr: string): LineInfo | null {
  const m = expr.match(/^[yY]\s*=\s*(-?\d*\.?\d*)\s*\*?\s*x\s*([+-]\s*\d+\.?\d*)?$/);
  if (!m) {
    const c = expr.match(/^[yY]\s*=\s*(-?\d+\.?\d*)$/);
    if (c) return { slope: 0, yIntercept: parseFloat(c[1]), xIntercept: null };
    return null;
  }
  const slope = m[1] === "" || m[1] === "-" ? (m[1] === "-" ? -1 : 1) : parseFloat(m[1]);
  const yInt = m[2] ? parseFloat(m[2].replace(/\s/g, "")) : 0;
  const xInt = slope !== 0 ? Math.round((-yInt / slope) * 10000) / 10000 : null;
  return { slope, yIntercept: yInt, xIntercept: xInt };
}
