// SECURITY GUARD (CFV-10)
//
// User-supplied flows must not embed an inline class_definition. Class
// definitions drive triage severity bands and output sanitization; if the
// runtime trusts them verbatim from the flow body, an attacker can:
//  - inflate severity.escalate_bands so every finding auto-escalates
//  - blank out optics.noise_control.forbidden_outputs so sanitizers no-op
//  - swap the class_id to redirect downstream stages
//
// Class definitions must come from the registry (_class-definitions/<class_id>.json)
// and never from the flow body.
//
// This guard refuses any flow with a top-level `class_definition` /
// `class_definition_inline` / `class_def_override` field. Caller may strip
// instead of refuse by using `stripInlineClassDefinitionFields` if a softer
// posture is preferred — but refuse is the secure default.
//
// Side-effect free at import time.

import { ERR, flatErr } from "../types.js";
import type { FlatRunnerResult } from "../types.js";

/** Top-level keys that, if present in a flow body, indicate inline class-definition smuggling. */
export const FORBIDDEN_FLOW_KEYS: readonly string[] = Object.freeze([
  "class_definition",
  "class_definition_inline",
  "class_def_override",
  "class_def",
]);

/** Returns the list of forbidden keys present at the top level of `flow`. */
export function findInlineClassDefinitionFields(flow: unknown): string[] {
  if (!flow || typeof flow !== "object") return [];
  const f = flow as Record<string, unknown>;
  return FORBIDDEN_FLOW_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(f, k));
}

/**
 * Returns a FlatRunnerResult when the flow embeds a forbidden class_definition
 * field, or null when the caller may proceed.
 */
export function assertNoInlineClassDefinition(
  flow:      unknown,
  requestId: string,
): FlatRunnerResult | null {
  const found = findInlineClassDefinitionFields(flow);
  if (found.length === 0) return null;
  return flatErr(
    ERR.INLINE_CLASS_DEFINITION_FORBIDDEN,
    `Flow body contains inline class-definition field(s): ${found.join(", ")}. ` +
    "Class definitions must be resolved from the registry by class_id, not embedded in the flow.",
    {
      forbidden_fields: found,
      remediation: "Remove these fields and reference the class via class_id; the registry is the only authority on severity bands and noise control.",
      http_status_equivalent: 400,
    },
    false,
    requestId,
  );
}
