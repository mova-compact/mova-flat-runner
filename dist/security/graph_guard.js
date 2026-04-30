// SECURITY GUARD (CFV-1 + CFV-4)
//
// One visitor over the flow graph, run at registration time, that catches:
//
//   CFV-1: schema invariant bypass
//     - self-loop: step.next[outcome] points to step.id
//     - dangling next: step.next[outcome] names a step not present in flow.steps
//     - cycle: any reachable cycle through next-edges (DFS gray/black coloring)
//
//   CFV-4: resource exhaustion via contract structure
//     - step count exceeds MAX_STEPS (default 200)
//
// Cycles and self-loops do not let runs make progress; dangling next defers a
// runtime panic that should be caught at admission. Massive flows are accepted
// today and force the runtime to allocate proportional state.
//
// All checks are pure; this module has no side effects at import time.
import { ERR, flatErr } from "../types.js";
/** Default step-count cap. Override with env MOVA_FLOW_MAX_STEPS. */
const DEFAULT_MAX_STEPS = 200;
export function loadMaxSteps(env = process.env) {
    const raw = env.MOVA_FLOW_MAX_STEPS;
    if (raw === undefined || raw === "")
        return DEFAULT_MAX_STEPS;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_STEPS;
}
/** Extract a string id field defensively. */
function asStr(v) {
    return typeof v === "string" && v.length > 0 ? v : null;
}
/** Read outgoing edges from a step's `next` map. Skip terminal references. */
function outgoingEdges(step) {
    const next = step.next;
    if (!next || typeof next !== "object")
        return [];
    const out = [];
    for (const [outcome, ref] of Object.entries(next)) {
        if (typeof ref === "string") {
            out.push({ outcome, target: ref });
        }
        // {terminal: ...} or other shapes: not an edge
    }
    return out;
}
/**
 * Run the graph validator over `flow`. Returns the list of violations (empty = clean).
 *
 * `maxSteps` defaults to env-derived value. Pass explicit maxSteps in tests to
 * keep them deterministic.
 */
export function validateFlowGraph(flow, maxSteps = loadMaxSteps()) {
    if (!flow || typeof flow !== "object")
        return [];
    const f = flow;
    const steps = Array.isArray(f.steps) ? f.steps : [];
    const parallel = Array.isArray(f.parallel_steps) ? f.parallel_steps : [];
    const allSteps = [...steps, ...parallel];
    const violations = [];
    // ── CFV-4: size cap ─────────────────────────────────────────────────────────
    if (allSteps.length > maxSteps) {
        violations.push({
            kind: "size_limit",
            message: `flow has ${allSteps.length} steps, exceeds limit of ${maxSteps}`,
        });
        // Continue running other checks so the user sees everything wrong at once.
    }
    // Build id index, detect duplicates.
    const byId = new Map();
    for (const s of allSteps) {
        const id = asStr(s.id);
        if (!id)
            continue;
        if (byId.has(id)) {
            violations.push({
                kind: "duplicate_step_id",
                message: `duplicate step id '${id}'`,
                step_id: id,
            });
        }
        else {
            byId.set(id, s);
        }
    }
    // ── Entry must exist (only if any steps) ────────────────────────────────────
    const entry = asStr(f.entry);
    if (allSteps.length > 0 && entry && !byId.has(entry)) {
        violations.push({
            kind: "missing_entry",
            message: `entry '${entry}' is not present in steps`,
            step_id: entry,
        });
    }
    // ── CFV-1a: self-loop ───────────────────────────────────────────────────────
    // ── CFV-1b: dangling next ───────────────────────────────────────────────────
    for (const s of allSteps) {
        const id = asStr(s.id);
        if (!id)
            continue;
        for (const { outcome, target } of outgoingEdges(s)) {
            if (target === id) {
                violations.push({
                    kind: "self_loop",
                    message: `step '${id}' has self-loop on outcome '${outcome}'`,
                    step_id: id,
                    outcome,
                    target,
                });
                continue;
            }
            if (!byId.has(target)) {
                violations.push({
                    kind: "dangling_next",
                    message: `step '${id}' next.${outcome} points to non-existent step '${target}'`,
                    step_id: id,
                    outcome,
                    target,
                });
            }
        }
    }
    // ── CFV-1c: cycle detection (DFS gray/black) ────────────────────────────────
    // Skip if we already saw missing_entry / dangling_next that would distort the
    // graph; cycle detection still works on present-only edges.
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    for (const id of byId.keys())
        color.set(id, WHITE);
    const cycleEdges = [];
    function visit(u) {
        color.set(u, GRAY);
        const step = byId.get(u);
        if (step) {
            for (const { target } of outgoingEdges(step)) {
                if (!byId.has(target))
                    continue;
                if (target === u)
                    continue; // self-loop already reported separately
                const c = color.get(target);
                if (c === GRAY) {
                    cycleEdges.push({ from: u, to: target });
                }
                else if (c === WHITE) {
                    visit(target);
                }
            }
        }
        color.set(u, BLACK);
    }
    for (const id of byId.keys()) {
        if (color.get(id) === WHITE)
            visit(id);
    }
    for (const e of cycleEdges) {
        violations.push({
            kind: "cycle",
            message: `cycle detected via edge '${e.from}' → '${e.to}'`,
            step_id: e.from,
            target: e.to,
        });
    }
    return violations;
}
/**
 * Returns a FlatRunnerResult when the flow violates graph invariants, or null
 * when the caller may proceed. Pass `maxSteps` explicitly in tests; defaults to
 * env-derived value for production.
 */
export function assertFlowGraphValid(flow, requestId, maxSteps = loadMaxSteps()) {
    const violations = validateFlowGraph(flow, maxSteps);
    if (violations.length === 0)
        return null;
    return flatErr(ERR.FLOW_GRAPH_INVALID, `Flow graph invalid: ${violations.length} violation(s) — ${violations.map((v) => v.kind).join(", ")}.`, {
        violations,
        max_steps: maxSteps,
        http_status_equivalent: 400,
    }, false, requestId);
}
