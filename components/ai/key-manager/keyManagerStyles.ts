import React from "react";

export const sectionLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--text-muted)",
  margin: 0,
};

export const cardStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "14px",
  background: "var(--bg-primary)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 8,
};

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--bg-primary)",
  border: "1px solid var(--border-color)",
  borderRadius: 3,
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

export const smallBtn: React.CSSProperties = {
  padding: "5px 12px",
  border: "1px solid var(--border-color)",
  borderRadius: 4,
  background: "none",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-secondary)",
};

export const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  background: "var(--bg-elevated)",
  padding: "1px 5px",
  borderRadius: 3,
  color: "var(--accent-primary)",
};
