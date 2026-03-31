"use client";
import { useState, useEffect } from "react";
import { ApiKey } from "../AIProvider";

export function StatusDot({ keyEntry }: { keyEntry: ApiKey }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!keyEntry.failedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [keyEntry.failedAt]);

  const isFailed = keyEntry.failedAt && now - keyEntry.failedAt < 60_000;
  const color = isFailed
    ? "var(--accent-danger)"
    : keyEntry.errorCount > 0
      ? "var(--accent-warning)"
      : "var(--accent-success)";
  const title = isFailed
    ? `Rate limited: ${keyEntry.lastError ?? "quota exceeded"}`
    : keyEntry.errorCount > 0
      ? `${keyEntry.errorCount} past error(s)`
      : "Ready";

  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        boxShadow: isFailed ? `0 0 6px ${color}` : "none",
      }}
    />
  );
}
