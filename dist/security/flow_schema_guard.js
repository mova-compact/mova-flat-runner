// SECURITY GUARD (CFV-9)
//
// Strict schema for top-level flow keys. The audit found that a flow with
// `__admin_override`, `__privilege_grant`, `__debug_mode` was accepted at
// registration. If those fields are persisted (even silently), an attacker
// can smuggle privilege-elevation hints into the runtime that future code
// paths might read. The safe posture is strict-by-default: refuse any
// top-level key that isn't in the known allow-list.
//
// CFV-10's `class_definition*` keys are blocked specifically by
// class_definition_guard.ts; this guard catches everything else not yet
// covered by a stricter rule.
//
// Side-effect free at import time.
import { ERR, flatErr } from "../types.js";
/** Top-level keys recognized by the MOVA flow schema. */
export const ALLOWED_FLOW_TOP_LEVEL_KEYS = new Set([
    "version",
    "description",
    "entry",
    "steps",
    "parallel_steps",
    "notes",
    "audit_mode",
    "audit_mode_note",
    "class_definition_ref",
    "CONTRACT_CALL_instructions",
    "input_schema",
    "output_schema",
    "metadata",
]);
/** Returns top-level keys present in `flow` that are not in the allow-list. */
export function findUnknownFlowFields(flow) {
    if (!flow || typeof flow !== "object" || Array.isArray(flow))
        return [];
    const f = flow;
    const out = [];
    for (const key of Object.keys(f)) {
        if (!ALLOWED_FLOW_TOP_LEVEL_KEYS.has(key))
            out.push(key);
    }
    return out;
}
/**
 * Returns a FlatRunnerResult when the flow contains unknown top-level fields,
 * or null when the caller may proceed.
 *
 * NOTE: this guard runs AFTER class_definition_guard so that the more specific
 * class_definition_* refusal takes precedence; class_definition fields will not
 * even reach this guard in the normal pipeline.
 */
export function assertNoUnknownFlowFields(flow, requestId) {
    const unknown = findUnknownFlowFields(flow);
    if (unknown.length === 0)
        return null;
    return flatErr(ERR.UNKNOWN_FLOW_FIELD, `Flow contains unknown top-level field(s): ${unknown.join(", ")}. ` +
        "MOVA flows have a strict top-level schema; remove these fields or move legitimate metadata into the 'metadata' object.", {
        unknown_fields: unknown,
        allowed_fields: [...ALLOWED_FLOW_TOP_LEVEL_KEYS].sort(),
        http_status_equivalent: 400,
    }, false, requestId);
}
