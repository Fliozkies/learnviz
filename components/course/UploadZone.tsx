"use client";
import { useState, useCallback, useRef, DragEvent, ChangeEvent } from "react";
import { Curriculum } from "@/types/curriculum";

interface Props {
  onLoaded: (curriculum: Curriculum, filename: string) => void;
}

export default function UploadZone({ onLoaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".json")) {
        setError("Please upload a .json file.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const text = await file.text();
        const data = JSON.parse(text) as Curriculum;
        if (!data.course || !data.units) {
          setError(
            'This JSON does not look like a LearnViz curriculum. Expected "course" and "units" fields.',
          );
          return;
        }
        onLoaded(data, file.name);
      } catch {
        setError("Failed to parse JSON. Make sure the file is valid.");
      } finally {
        setLoading(false);
      }
    },
    [onLoaded],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "14px",
      }}
    >
      {/* Hero — compact */}
      <div style={{ textAlign: "center", maxWidth: "540px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            fontWeight: "700",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--accent-primary)",
            background: "var(--accent-primary-soft)",
            border:
              "1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent)",
            padding: "3px 10px",
            borderRadius: "100px",
            marginBottom: "8px",
          }}
        >
          <span>◈</span> LearnViz v1.0.0
        </div>
        <h1
          style={{
            fontSize: "1.6rem",
            marginBottom: "5px",
            lineHeight: "1.15",
            fontFamily: "var(--font-serif)",
            fontWeight: 400,
          }}
        >
          AI Course Viewer
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.82rem",
            lineHeight: "1.5",
            maxWidth: "400px",
            margin: "0 auto",
          }}
        >
          Upload a LearnViz curriculum JSON to explore it as a fully-rendered
          course.
        </p>
      </div>

      {/* Upload drop zone — compact */}
      <div
        className={`upload-zone${dragging ? " drag-over" : ""}`}
        style={{
          width: "100%",
          maxWidth: "560px",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          textAlign: "center",
          cursor: "pointer",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div style={{ fontSize: "24px", lineHeight: 1, opacity: 0.7 }}>
          {loading ? "⏳" : "⊕"}
        </div>
        <div>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "0.9rem",
              fontWeight: "600",
              marginBottom: "3px",
              color: "var(--text-primary)",
            }}
          >
            {loading ? "Parsing curriculum…" : "Drop your curriculum JSON here"}
          </p>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
            }}
          >
            or click to browse · .json · curriculum-schema v1.0.0
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={onChange}
        />
      </div>

      {error && (
        <div
          style={{
            maxWidth: "560px",
            width: "100%",
            padding: "9px 14px",
            background:
              "color-mix(in srgb, var(--accent-danger) 10%, var(--bg-secondary))",
            border: "1px solid var(--accent-danger)",
            borderRadius: "4px",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: "var(--accent-danger)",
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Format guide — light bg, always readable */}
      <div
        style={{
          maxWidth: "560px",
          width: "100%",
          borderRadius: "6px",
          border: "1px solid var(--border-color)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "6px 14px",
            background: "var(--bg-tertiary)",
            borderBottom: "1px solid var(--border-color)",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--text-muted)",
          }}
        >
          Expected structure
        </div>
        {/* Inline bg/color overrides the global pre { background: terminal-bg } rule */}
        <pre
          style={{
            padding: "10px 14px",
            fontSize: "11px",
            margin: 0,
            overflow: "auto",
            lineHeight: 1.5,
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
          }}
        >
          {`{
  "schema_version": "1.0.0",
  "course": {
    "id": "...",
    "title": "Pre-Calculus",
    "subject": "mathematics",
    ...
  },
  "units": [
    {
      "id": "U01",
      "title": "...",
      "lessons": [ ... ]
    }
  ]
}`}
        </pre>
      </div>
    </div>
  );
}
