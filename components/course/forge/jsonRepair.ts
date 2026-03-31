// ─── JSON repair utilities ────────────────────────────────────────────────────
// Tolerant JSON cleaner for AI-generated output. Handles:
//   - markdown fences  (```json ... ```)\
//   - leading/trailing prose
//   - single-quoted strings (keys and values) → double-quoted
//   - unquoted object keys (bare identifiers) → double-quoted
//   - bad backslash escapes from LaTeX inside strings (\frac, \alpha, etc.)
//   - raw newlines / tabs inside JSON strings (replace with \n / \t)
//   - unbalanced braces / brackets (truncated responses)
//   - trailing commas before ] or }
//
// Strategy:
//   1. fixQuoting       — convert single-quoted and unquoted keys to double-quoted
//   2. sanitizeString   — fix bad escapes + raw control chars (string-aware)
//   3. closeOpen        — close unmatched braces/brackets
//   4. fixOrphanedKeys  — patch "key": immediately followed by , } ] (no value)
//   5. trailing-comma cleanup

export function repairJSON(raw: string): string {
  let s = raw.trim();

  // 0. Strip <think>...</think> reasoning blocks emitted by models like
  //    Qwen3-32b and DeepSeek-R1. These appear BEFORE the JSON and may
  //    contain '{' characters, so they must be removed before the
  //    indexOf("{") scan in step 2, or we extract from inside the block.
  //    Handle both closed tags and unclosed tags (truncated responses).
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const thinkStart = s.search(/<think>/i);
  if (thinkStart !== -1) s = s.slice(0, thinkStart).trim();

  // 1. Strip markdown fences
  s = s
    .replace(/^```[a-zA-Z]*\r?\n?/i, "")
    .replace(/\r?\n?```\s*$/i, "")
    .trim();

  // 2. Extract from first '{' — discards prose before the JSON object
  const start = s.indexOf("{");
  if (start === -1) return s;
  s = s.slice(start);

  // 3. Fix single-quoted strings and unquoted keys
  s = fixQuoting(s);

  // 4. Single-pass: fix bad escapes + raw control chars inside strings
  s = sanitizeString(s);

  // 5. Strip trailing comma, then close open structures
  s = s.trimEnd().replace(/,\s*$/, "");
  s = closeOpen(s);

  // 6. Patch orphaned keys: "key": followed immediately by } ] , or end-of-string.
  //    This happens when a model hits its token limit exactly after the colon of a
  //    key (e.g. `"id":}` or `"is_correct":,`). closeOpen can close the surrounding
  //    braces but cannot supply the missing value, so JSON.parse still throws.
  //    We inject null — parsers downstream can normalise it appropriately.
  s = fixOrphanedKeys(s);

  // 7. Remove trailing commas before ] or }
  s = s.replace(/,(\s*[}\]])/g, "$1");

  // 7. Truncate trailing prose after the root JSON object closes.
  //    Models sometimes append reasoning text after the closing '}' —
  //    JSON.parse rejects anything that follows the root value.
  s = truncateAfterRoot(s);

  return s;
}

// ─── fixQuoting ───────────────────────────────────────────────────────────────
// Character-by-character pass outside of already-valid double-quoted strings.
// Converts:
//   - Single-quoted strings  'hello'  → "hello"
//   - Unquoted object keys   { key:   → { "key":
//     (only in key position: after { or , with optional whitespace before the :)
//
// Operates before sanitizeString so we don't need to worry about LaTeX escapes
// (those are handled in the next pass).

function fixQuoting(s: string): string {
  const out: string[] = [];
  let i = 0;

  // We need a simple state machine that knows:
  //   - are we inside a double-quoted string?
  //   - are we inside a single-quoted string?
  //   - are we at a position that could be a key (after { or ,)?

  let inDouble = false;
  let inSingle = false;

  while (i < s.length) {
    const ch = s[i];

    // ── Inside a double-quoted string ─────────────────────────────────────────
    if (inDouble) {
      if (ch === "\\") {
        // Pass through escape sequences verbatim (sanitizeString will fix bad ones later)
        out.push(ch);
        i++;
        if (i < s.length) { out.push(s[i]); i++; }
      } else if (ch === '"') {
        inDouble = false;
        out.push(ch);
        i++;
      } else {
        out.push(ch);
        i++;
      }
      continue;
    }

    // ── Inside a single-quoted string ─────────────────────────────────────────
    if (inSingle) {
      if (ch === "\\") {
        const next = s[i + 1];
        if (next === "'") {
          // Escaped single-quote inside single-quoted string → just a literal '
          // In the output double-quoted string it doesn't need escaping
          out.push("'");
          i += 2;
        } else if (next === '"') {
          // Escaped double-quote inside single-quoted string → must escape for JSON
          out.push('\\"');
          i += 2;
        } else {
          // All other escapes pass through; sanitizeString handles them
          out.push(ch);
          i++;
          if (i < s.length) { out.push(s[i]); i++; }
        }
      } else if (ch === '"') {
        // Unescaped double-quote inside single-quoted string → escape it
        out.push('\\"');
        i++;
      } else if (ch === "'") {
        // End of single-quoted string → emit closing double-quote
        inSingle = false;
        out.push('"');
        i++;
      } else {
        out.push(ch);
        i++;
      }
      continue;
    }

    // ── Outside any string ────────────────────────────────────────────────────

    if (ch === '"') {
      inDouble = true;
      out.push(ch);
      i++;
      continue;
    }

    if (ch === "'") {
      // Start of single-quoted string → open with double-quote
      inSingle = true;
      out.push('"');
      i++;
      continue;
    }

    // Unquoted key detection:
    // After { or , (with optional whitespace) we may have a bare identifier
    // like:  { key: "value" }  or  , another_key: 123
    // Identifiers: start with letter, $, or _; continue with those + digits
    if (/[a-zA-Z_$]/.test(ch)) {
      // Look back through out[] (ignoring whitespace) to see if the last
      // non-whitespace char was { or ,  (key position)
      let j = out.length - 1;
      while (j >= 0 && /\s/.test(out[j])) j--;
      const prevChar = j >= 0 ? out[j] : "";
      if (prevChar === "{" || prevChar === "," || prevChar === "") {
        // Consume the full identifier
        let ident = ch;
        i++;
        while (i < s.length && /[a-zA-Z0-9_$]/.test(s[i])) {
          ident += s[i];
          i++;
        }
        // Peek ahead past whitespace to confirm there's a colon (key:value)
        let k = i;
        while (k < s.length && /\s/.test(s[k])) k++;
        if (s[k] === ":") {
          // It's an unquoted key — wrap in double-quotes
          out.push('"', ...ident, '"');
        } else {
          // Not a key (e.g. a bare boolean/null/number word) — emit as-is
          out.push(...ident);
        }
        continue;
      }
    }

    // Everything else passes through
    out.push(ch);
    i++;
  }

  // If we ended mid-single-quote (truncation), close it
  if (inSingle) out.push('"');

  return out.join("");
}

// ─── sanitizeString ───────────────────────────────────────────────────────────
// Single character-by-character pass that:
//   - tracks string context precisely
//   - escapes raw control characters (newline, tab, CR) inside strings
//   - doubles backslashes before non-JSON-escape characters (LaTeX etc.)
//   - correctly handles escaped quotes without flipping inString

function sanitizeString(s: string): string {
  const out: string[] = [];
  let inStr = false;
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (!inStr) {
      if (ch === '"') { inStr = true; out.push(ch); i++; }
      else { out.push(ch); i++; }
    } else {
      if (ch === "\\") {
        const next = s[i + 1];
        if (next === undefined) {
          out.push(ch); i++;
        } else if (isValidEscapeChar(next)) {
          if (next === "u") {
            const hex = s.slice(i + 2, i + 6);
            if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
              out.push(s.slice(i, i + 6)); i += 6;
            } else {
              // Malformed \u — neutralize
              out.push("\\\\"); i++;
            }
          } else {
            out.push(ch, next); i += 2;
          }
        } else {
          // Bad escape (LaTeX \frac, \alpha, \int, etc.) — double the backslash
          out.push("\\\\"); i++;
        }
      } else if (ch === '"') {
        inStr = false; out.push(ch); i++;
      } else if (ch === "\n") {
        out.push("\\n"); i++;
      } else if (ch === "\r") {
        i++; // skip bare CR
      } else if (ch === "\t") {
        out.push("\\t"); i++;
      } else {
        out.push(ch); i++;
      }
    }
  }

  // Truncation ended inside a string — close it
  if (inStr) out.push('"');

  return out.join("");
}

// ─── closeOpen ────────────────────────────────────────────────────────────────
// Counts unmatched { and [ then appends closing chars in reverse order.
// Runs after sanitizeString so escape handling is reliable.

function closeOpen(s: string): string {
  const stack: Array<"{" | "["> = [];
  let inStr = false;
  let i = 0;

  while (i < s.length) {
    const ch = s[i];
    if (inStr) {
      if (ch === "\\") { i += 2; continue; } // skip escaped char
      if (ch === '"')  { inStr = false; }
      i++;
    } else {
      if      (ch === '"') { inStr = true; i++; }
      else if (ch === "{") { stack.push("{"); i++; }
      else if (ch === "[") { stack.push("["); i++; }
      else if (ch === "}") { if (stack[stack.length - 1] === "{") stack.pop(); i++; }
      else if (ch === "]") { if (stack[stack.length - 1] === "[") stack.pop(); i++; }
      else i++;
    }
  }

  for (let j = stack.length - 1; j >= 0; j--) {
    s += stack[j] === "{" ? "}" : "]";
  }
  return s;
}

// ─── truncateAfterRoot ────────────────────────────────────────────────────────
// Finds the position just after the root JSON object closes (depth → 0) and
// slices off any trailing text. This removes model-appended reasoning prose
// that causes JSON.parse to fail with "Unexpected non-whitespace character".
// Must run after sanitizeString so escape sequences inside strings are already
// normalised and cannot confuse the depth counter.

function truncateAfterRoot(s: string): string {
  let depth = 0;
  let inStr = false;
  let i = 0;

  while (i < s.length) {
    const ch = s[i];
    if (inStr) {
      if (ch === "\\") { i += 2; continue; }  // skip escaped char
      if (ch === '"')  { inStr = false; }
      i++;
    } else {
      if      (ch === '"')              { inStr = true; i++; }
      else if (ch === "{" || ch === "[") { depth++; i++; }
      else if (ch === "}" || ch === "]") {
        depth--;
        i++;
        if (depth === 0) return s.slice(0, i); // end of root value
      }
      else i++;
    }
  }

  return s; // no complete root found — return as-is (closeOpen will handle it)
}

// ─── fixOrphanedKeys ──────────────────────────────────────────────────────────
// Handles two truncation patterns where a model runs out of tokens mid-value:
//
//   Pattern A — value is entirely missing (colon present, value absent):
//     `"id":}`   `"difficulty":,`   `"is_correct":\n]`
//     The key + colon were emitted but the value token never arrived.
//     We inject null so the object stays parseable.
//
//   Pattern B — key name was truncated (no colon, no value):
//     After sanitizeString closes the dangling string and closeOpen closes the
//     brace, we get `"is_correct"}` — a string-in-key-position with no colon.
//     We detect this by maintaining an object/array context stack and checking
//     whether a complete string is followed by something other than `:`.
//
// In both patterns we inject null — downstream normalisation can clean it up.

function fixOrphanedKeys(s: string): string {
  const out: string[] = [];
  let i = 0;

  // Context stack tracks whether we are inside an object or array.
  // "object" means the next non-whitespace string token should be a key.
  // "array"  means the next non-whitespace string token is a value.
  type Ctx = "object" | "array";
  const ctxStack: Ctx[] = [];
  const currentCtx = (): Ctx | null => ctxStack.length ? ctxStack[ctxStack.length - 1] : null;

  // Whether the cursor is at a position that expects an object key.
  // True after { and after , inside an object.
  let expectKey = false;

  function readString(): string | null {
    // Called when s[i] === '"'. Reads the full string (including escape sequences)
    // and returns the raw characters consumed (with the surrounding quotes).
    if (s[i] !== '"') return null;
    let j = i + 1;
    const buf = ['"'];
    while (j < s.length) {
      const ch = s[j];
      buf.push(ch);
      if (ch === "\\") { j++; if (j < s.length) { buf.push(s[j]); j++; } continue; }
      if (ch === '"') { j++; break; }
      j++;
    }
    // Advance global index past this string
    i = j;
    return buf.join("");
  }

  while (i < s.length) {
    const ch = s[i];

    // ── Structural characters ────────────────────────────────────────────────
    if (ch === "{") {
      ctxStack.push("object");
      expectKey = true;
      out.push(ch);
      i++;
      continue;
    }
    if (ch === "[") {
      ctxStack.push("array");
      expectKey = false;
      out.push(ch);
      i++;
      continue;
    }
    if (ch === "}") {
      if (ctxStack[ctxStack.length - 1] === "object") ctxStack.pop();
      expectKey = currentCtx() === "object"; // after closing object, parent may be object
      out.push(ch);
      i++;
      continue;
    }
    if (ch === "]") {
      if (ctxStack[ctxStack.length - 1] === "array") ctxStack.pop();
      expectKey = currentCtx() === "object";
      out.push(ch);
      i++;
      continue;
    }
    if (ch === ",") {
      // After a comma, inside an object we expect a key next
      expectKey = currentCtx() === "object";
      out.push(ch);
      i++;
      continue;
    }
    if (ch === ":") {
      // ── Pattern A: colon with no value following ─────────────────────────
      // Peek past whitespace; if the next char terminates (} ] ,) or string
      // ends, the value is missing.
      let j = i + 1;
      while (j < s.length && " \t\n\r".includes(s[j])) j++;
      const next = j < s.length ? s[j] : null;
      if (next === "}" || next === "]" || next === "," || next === null) {
        out.push(": null");
        i++; // advance past ":"
      } else {
        out.push(ch);
        i++;
      }
      expectKey = false; // we just processed the key, next token is a value
      continue;
    }

    // ── String tokens ────────────────────────────────────────────────────────
    if (ch === '"') {
      const savedI = i;
      const str = readString(); // advances i
      if (str === null) { out.push(ch); i++; continue; }

      if (expectKey && currentCtx() === "object") {
        // This string should be a key. Peek past whitespace for ':'.
        let j = i;
        while (j < s.length && " \t\n\r".includes(s[j])) j++;
        const next = j < s.length ? s[j] : null;

        if (next === ":") {
          // Normal key:value — emit as-is; the ':' handler above deals with value
          out.push(str);
          expectKey = false;
        } else {
          // ── Pattern B: key string with no colon following ────────────────
          out.push(str);
          out.push(": null");
          expectKey = false;
          // If next token is ',' or '}' let the outer loop handle it
        }
      } else {
        // Value context — emit as-is
        out.push(str);
        expectKey = false;
      }
      void savedI; // suppress unused-variable lint
      continue;
    }

    // ── Whitespace and everything else (numbers, booleans, null) ────────────
    out.push(ch);
    i++;
  }

  return out.join("");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_ESCAPE_CHARS = new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"]);
function isValidEscapeChar(ch: string): boolean {
  return VALID_ESCAPE_CHARS.has(ch);
}

// ─── fixBadEscapes (kept for backward compatibility) ─────────────────────────
export function fixBadEscapes(s: string): string {
  return sanitizeString(s);
}