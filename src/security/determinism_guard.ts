// SECURITY GUARD (CFV-12)
//
// DETERMINISTIC steps must produce output that is reproducible from inputs alone.
// The runtime today trusts agent-supplied output for DET steps without
// re-executing the check or hash-locking; an agent (or compromised client) can
// inject Date.now() / Math.random() / a fresh UUID and still have the run
// recorded as "deterministic." Two replays then produce different audit trails.
//
// The proper fix is server-side: re-execute the check JS or compare a hash. As
// a client-side defense in depth, this guard scans outputs reported under a
// DETERMINISTIC step for known non-deterministic markers and refuses to forward
// them. Detection is intentionally conservative; false positives are harmless
// (caller renames the field and retries) and false negatives degrade gracefully
// (eventual server-side fix is the real backstop).

import { ERR, flatErr } from "../types.js";
import type { FlatRunnerResult } from "../types.js";

/** Field-name markers that almost always indicate non-determinism. */
const SUSPICIOUS_FIELD_NAMES: ReadonlySet<string> = new Set([
  "timestamp",
  "timestamp_ms",
  "timestamp_ns",
  "now",
  "now_ms",
  "iat",                  // JWT issued-at
  "nonce",
  "random",
  "random_seed",
  "rand",
  "entropy",
  "uuid",
  "request_id",           // any per-call id
  "trace_id",
]);

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

/** Conservative epoch-ms range: now ± 365 days. */
function isLikelyRecentEpochMs(n: number, now: number): boolean {
  if (!Number.isFinite(n)) return false;
  if (n <= 0) return false;
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  return Math.abs(n - now) < oneYearMs && n > 1_000_000_000_000; // > year 2001 in ms
}

function isLikelyRecentEpochSec(n: number, now: number): boolean {
  if (!Number.isFinite(n)) return false;
  if (n <= 0) return false;
  const oneYearSec = 365 * 24 * 60 * 60;
  const nowSec = now / 1000;
  return Math.abs(n - nowSec) < oneYearSec && n > 1_000_000_000; // > year 2001 in s
}

export interface DeterminismViolation {
  path:    string;
  reason:  string;
  sample?: string;
}

/** Walk an output value and collect determinism violations. */
export function findDeterminismViolations(
  output: unknown,
  now:    number = Date.now(),
): DeterminismViolation[] {
  const out: DeterminismViolation[] = [];

  function walk(value: unknown, path: string): void {
    if (value === null || value === undefined) return;
    if (typeof value === "string") {
      if (ISO_DATETIME_RE.test(value)) {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed) && Math.abs(parsed - now) < 365 * 24 * 60 * 60 * 1000) {
          out.push({ path, reason: "iso_datetime_recent", sample: value });
        }
      }
      return;
    }
    if (typeof value === "number") {
      if (isLikelyRecentEpochMs(value, now)) {
        out.push({ path, reason: "epoch_ms_recent", sample: String(value) });
      } else if (isLikelyRecentEpochSec(value, now)) {
        out.push({ path, reason: "epoch_s_recent", sample: String(value) });
      }
      return;
    }
    if (typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) walk(value[i], `${path}[${i}]`);
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path === "" ? k : `${path}.${k}`;
      if (SUSPICIOUS_FIELD_NAMES.has(k.toLowerCase())) {
        out.push({ path: childPath, reason: "suspicious_field_name" });
      }
      walk(v, childPath);
    }
  }

  walk(output, "");
  return out;
}

/**
 * Returns a FlatRunnerResult when the step output contains likely
 * non-deterministic content reported under a DETERMINISTIC step, or null when
 * the caller may proceed. Caller passes the step's `execution_mode`; the guard
 * is a no-op for non-DET modes.
 */
export function assertDeterministicOutput(
  executionMode: string | null,
  output:        unknown,
  stepId:        string,
  requestId:     string,
  now:           number = Date.now(),
): FlatRunnerResult | null {
  if (executionMode !== "DETERMINISTIC") return null;
  if (output === undefined || output === null) return null;
  const violations = findDeterminismViolations(output, now);
  if (violations.length === 0) return null;
  return flatErr(
    ERR.NON_DETERMINISTIC_OUTPUT,
    `Step "${stepId}" is DETERMINISTIC but the supplied output contains likely non-deterministic content (${violations.length} indicator(s)). ` +
    "DETERMINISTIC steps must produce output reproducible from inputs alone.",
    {
      step_id: stepId,
      execution_mode: "DETERMINISTIC",
      violations,
      remediation:
        "If the value is genuinely needed, change the step to AI_ATOMIC or move the timestamp/uuid to step inputs so it becomes part of the deterministic seed.",
      http_status_equivalent: 400,
    },
    false,
    requestId,
  );
}
