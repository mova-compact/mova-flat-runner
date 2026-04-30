import type { FlatRunnerResult } from "../types.js";
export declare function loadMaxSteps(env?: NodeJS.ProcessEnv): number;
export type GraphViolationKind = "size_limit" | "self_loop" | "dangling_next" | "cycle" | "missing_entry" | "duplicate_step_id";
export interface GraphViolation {
    kind: GraphViolationKind;
    message: string;
    step_id?: string | null;
    outcome?: string;
    target?: string;
}
/**
 * Run the graph validator over `flow`. Returns the list of violations (empty = clean).
 *
 * `maxSteps` defaults to env-derived value. Pass explicit maxSteps in tests to
 * keep them deterministic.
 */
export declare function validateFlowGraph(flow: unknown, maxSteps?: number): GraphViolation[];
/**
 * Returns a FlatRunnerResult when the flow violates graph invariants, or null
 * when the caller may proceed. Pass `maxSteps` explicitly in tests; defaults to
 * env-derived value for production.
 */
export declare function assertFlowGraphValid(flow: unknown, requestId: string, maxSteps?: number): FlatRunnerResult | null;
