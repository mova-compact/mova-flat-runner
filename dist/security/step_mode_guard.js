// SECURITY GUARD (CFV-2)
//
// A step's execution_mode pins the operational class (DETERMINISTIC = local JS
// check, AI_ATOMIC = LLM call, HUMAN_GATE = HITL pause, CONTRACT_CALL = nested
// flow). Each mode has its own content fields. If the runtime accepts a step
// where mode and content disagree — DETERMINISTIC with a `model` field, or
// AI_ATOMIC without `model` — execution semantics drift away from declaration:
//
//   * DETERMINISTIC + model      → LLM is silently invoked, breaking determinism
//                                  (CFV-2: mode forge → CFV-12: determinism)
//   * HUMAN_GATE without
//     decision_options             → gate has no decisions, runtime falls back
//                                    to defaults that may auto-approve
//   * CONTRACT_CALL without
//     contract_id                  → undefined target; runtime may use a default
//
// This guard refuses any step whose declared mode disagrees with the fields
// present. It runs alongside the graph guard at registration time.
import { ERR, flatErr } from "../types.js";
const ALLOWED_MODES = new Set([
    "DETERMINISTIC",
    "AI_ATOMIC",
    "HUMAN_GATE",
    "CONTRACT_CALL",
]);
function asStr(v) {
    return typeof v === "string" && v.length > 0 ? v : null;
}
function* walkSteps(flow) {
    if (!flow || typeof flow !== "object")
        return;
    const f = flow;
    if (Array.isArray(f.steps)) {
        for (const s of f.steps)
            if (s && typeof s === "object")
                yield s;
    }
    if (Array.isArray(f.parallel_steps)) {
        for (const s of f.parallel_steps)
            if (s && typeof s === "object")
                yield s;
    }
}
/** Inspect every step. Return list of (mode, content) mismatches. */
export function findStepModeViolations(flow) {
    const out = [];
    for (const step of walkSteps(flow)) {
        const id = asStr(step.id);
        const mode = asStr(step.execution_mode);
        if (mode == null)
            continue; // step shape problems are graph_guard's job
        if (!ALLOWED_MODES.has(mode)) {
            out.push({
                kind: "unknown_mode",
                step_id: id,
                execution_mode: mode,
                message: `step '${id ?? "?"}' has unknown execution_mode '${mode}'`,
            });
            continue;
        }
        if (mode === "DETERMINISTIC" && step.model !== undefined && step.model !== null) {
            out.push({
                kind: "deterministic_with_model",
                step_id: id,
                execution_mode: mode,
                message: `step '${id ?? "?"}' is DETERMINISTIC but declares a 'model' field — DET steps run a local JS check, not an LLM`,
            });
        }
        if (mode === "AI_ATOMIC" && asStr(step.model) === null) {
            out.push({
                kind: "ai_atomic_without_model",
                step_id: id,
                execution_mode: mode,
                message: `step '${id ?? "?"}' is AI_ATOMIC but has no 'model' field`,
            });
        }
        if (mode === "CONTRACT_CALL" && asStr(step.contract_id) === null) {
            out.push({
                kind: "contract_call_without_contract_id",
                step_id: id,
                execution_mode: mode,
                message: `step '${id ?? "?"}' is CONTRACT_CALL but has no 'contract_id'`,
            });
        }
        if (mode === "HUMAN_GATE" && !Array.isArray(step.decision_options)) {
            out.push({
                kind: "human_gate_without_decisions",
                step_id: id,
                execution_mode: mode,
                message: `step '${id ?? "?"}' is HUMAN_GATE but has no 'decision_options' array`,
            });
        }
    }
    return out;
}
export function assertStepModesValid(flow, requestId) {
    const violations = findStepModeViolations(flow);
    if (violations.length === 0)
        return null;
    return flatErr(ERR.STEP_MODE_FIELD_MISMATCH, `Step execution_mode does not agree with content fields: ${violations.length} violation(s) — ${violations.map((v) => v.kind).join(", ")}.`, {
        violations,
        http_status_equivalent: 400,
    }, false, requestId);
}
