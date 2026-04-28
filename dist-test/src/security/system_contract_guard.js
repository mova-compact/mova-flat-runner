// SECURITY GUARD (CFV-11)
//
// User-supplied flows must not invoke system contracts via CONTRACT_CALL.
// A user flow that successfully calls a system contract escalates beyond the
// user's privilege boundary because system contracts run with platform trust.
//
// This guard walks every step of a submitted flow and refuses if any step has
//   { execution_mode: "CONTRACT_CALL", contract_id: <in system allow-list> }.
//
// The allow-list is loaded from the env var `MOVA_SYSTEM_CONTRACTS`
// (comma-separated) plus a built-in default list of well-known platform
// contracts. Override with `MOVA_SYSTEM_CONTRACTS=` (empty string) to disable
// the default — useful for tests of the underlying mechanism.
//
// This module is side-effect free at import time.
import { ERR, flatErr } from "../types.js";
/** Built-in allow-list of contracts that user flows must not invoke directly. */
const DEFAULT_SYSTEM_CONTRACTS = Object.freeze([
    "triage-security-findings-v0",
    "verify-finding-candidates-v0",
    "prove-vulnerability-v0",
    "build-finding-candidates-v0",
    "package-escalation-v0",
    "emit-finding-leads-v0",
    "generate-expansion-candidates-v0",
    "normalize-expansion-candidates-v0",
    "bind-optics-profile-v0",
]);
/** Parse `MOVA_SYSTEM_CONTRACTS` if present; otherwise fall back to defaults. */
export function loadSystemContractAllowList(env = process.env) {
    const raw = env.MOVA_SYSTEM_CONTRACTS;
    if (raw === undefined)
        return new Set(DEFAULT_SYSTEM_CONTRACTS);
    const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return new Set(ids);
}
/** Walk every step in a flow (top-level + parallel). Defensive against unknown shapes. */
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
/** Inspect a flow for violating CONTRACT_CALL steps. Returns [] when clean. */
export function findSystemContractViolations(flow, allowList = loadSystemContractAllowList()) {
    const violations = [];
    for (const step of walkSteps(flow)) {
        const mode = typeof step.execution_mode === "string" ? step.execution_mode : null;
        const cid = typeof step.contract_id === "string" ? step.contract_id : null;
        if (mode !== "CONTRACT_CALL" || !cid)
            continue;
        if (allowList.has(cid)) {
            violations.push({
                step_id: typeof step.id === "string" ? step.id : null,
                contract_id: cid,
                execution_mode: mode,
            });
        }
    }
    return violations;
}
/**
 * Returns a FlatRunnerResult when the flow violates CFV-11 (one or more CONTRACT_CALL
 * steps target a system contract), or null when the caller may proceed.
 *
 * The caller is expected to JSON.stringify the result and return it as the tool output.
 */
export function assertNoSystemContractCalls(flow, requestId, allowList = loadSystemContractAllowList()) {
    const violations = findSystemContractViolations(flow, allowList);
    if (violations.length === 0)
        return null;
    return flatErr(ERR.SYSTEM_CONTRACT_NOT_INVOKABLE, `User flow contains CONTRACT_CALL step(s) targeting system contract(s): ${violations.map((v) => v.contract_id).join(", ")}. ` +
        "User contracts may not invoke system-owned contracts directly.", {
        violations,
        allowed_alternative: "Inline the logic, or have a platform admin register the call as a system flow.",
        http_status_equivalent: 403,
    }, false, requestId);
}
