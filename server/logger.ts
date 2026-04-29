/**
 * Structured logger (Task #386).
 *
 * Replaces ad-hoc `console.log` / `console.error` across `server/`. The API
 * is intentionally compatible with the variadic `console.*` shape so the
 * call-site sweep was a mechanical rename — no need to restructure existing
 * "Error X:", err  argument pairs.
 *
 * Production (`NODE_ENV === 'production'`):
 *   One log line per call, written as a single-line JSON object:
 *     {"level":"info","time":"2026-04-29T...","msg":"...","key":"value",...}
 *   - If the first arg is an `Error`, `msg` becomes `"<name>: <message>"`
 *     and the serialised error (`name`, `message`, `stack`) is merged into
 *     the payload so the stack is never lost.
 *   - Object args (non-Error, non-Array) are merged into the top-level
 *     payload. The first occurrence of a key wins; subsequent collisions
 *     are pushed into `details` so nothing is silently dropped.
 *   - Error args after the first are serialised to {name, message, stack}
 *     and merged the same way.
 *   - Anything else (strings, numbers, arrays) is collected under `details`.
 *   The serialiser is hardened against BigInt and circular references — a
 *   bad meta field cannot collapse the whole payload to "{...,serialiseError}".
 *
 * Development:
 *   Human-readable single line: `h:mm:ss AM [LEVEL] msg ...`. Errors print
 *   `name: message` (full stack trace appended on its own indented line if
 *   present), objects print as JSON, primitives print as-is. Errors and
 *   warnings go to stderr; info/debug go to stdout — matching the prior
 *   `console.*` split.
 *
 * Out of scope (Task #386 explicit exclusions):
 *   - Request-ID middleware.
 *   - External log shipping (Datadog, Logflare, etc.).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

function serializeError(err: Error): Record<string, unknown> {
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
}

function serializeArg(value: unknown): unknown {
  if (value instanceof Error) return serializeError(value);
  return value;
}

// JSON.stringify replacer that survives BigInt and circular references.
// Without this, a single bad meta field could throw inside `emit()` and
// strip the entire payload down to a stub line — losing every other
// contextual field on a critical log call (e.g. audit-spool failure).
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === "bigint") return v.toString() + "n";
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
    }
    return v;
  });
}

function emit(level: LogLevel, args: unknown[]): void {
  const time = new Date().toISOString();
  const first = args[0];

  // First-arg Error gets special treatment so a bare `logger.error(err)`
  // (the prior `console.error(err)` shape) preserves stack/message.
  let msg: string;
  let firstMeta: Record<string, unknown> | null = null;
  if (first instanceof Error) {
    msg = `${first.name}: ${first.message}`;
    firstMeta = serializeError(first);
  } else if (typeof first === "string") {
    msg = first;
  } else if (first === undefined) {
    msg = "";
  } else {
    msg = safeStringify(first) ?? String(first);
  }
  const rest = args.slice(1);

  if (process.env.NODE_ENV === "production") {
    const payload: Record<string, unknown> = { level, time, msg };
    const details: unknown[] = [];
    const mergeObject = (obj: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(obj)) {
        if (k in payload) {
          // Don't overwrite reserved or earlier-merged keys; preserve as detail.
          details.push({ [k]: v });
        } else {
          payload[k] = v;
        }
      }
    };
    if (firstMeta) mergeObject(firstMeta);
    for (const r of rest) {
      const serialised = serializeArg(r);
      if (
        serialised &&
        typeof serialised === "object" &&
        !Array.isArray(serialised)
      ) {
        mergeObject(serialised as Record<string, unknown>);
      } else {
        details.push(serialised);
      }
    }
    if (details.length > 0) payload.details = details;
    let line: string | undefined;
    try {
      line = safeStringify(payload);
    } catch {
      // Should be unreachable because safeStringify handles cycles/BigInt,
      // but keep a fallback so the line is never lost entirely.
      line = JSON.stringify({ level, time, msg });
    }
    const stream =
      level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write((line ?? "") + "\n");
    return;
  }

  // Dev: human-readable, matches the prior console.* look + the prior
  // `vite.ts` log() format.
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const parts: string[] = [
    `${formattedTime} [${level.toUpperCase()}] ${msg}`,
  ];
  const trailingLines: string[] = [];
  if (first instanceof Error && first.stack) {
    trailingLines.push(first.stack);
  }
  for (const r of rest) {
    if (r instanceof Error) {
      parts.push(`${r.name}: ${r.message}`);
      if (r.stack) trailingLines.push(r.stack);
    } else if (typeof r === "string") {
      parts.push(r);
    } else if (r === undefined) {
      parts.push("undefined");
    } else {
      parts.push(safeStringify(r) ?? String(r));
    }
  }
  const stream =
    level === "error" || level === "warn" ? process.stderr : process.stdout;
  let output = parts.join(" ");
  if (trailingLines.length > 0) output += "\n  " + trailingLines.join("\n  ");
  stream.write(output + "\n");
}

export const logger = {
  debug: (...args: unknown[]): void => emit("debug", args),
  info: (...args: unknown[]): void => emit("info", args),
  warn: (...args: unknown[]): void => emit("warn", args),
  error: (...args: unknown[]): void => emit("error", args),
};
