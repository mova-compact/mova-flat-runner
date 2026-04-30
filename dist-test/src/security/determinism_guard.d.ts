import type { FlatRunnerResult } from "../types.js";
export interface DeterminismViolation {
    path: string;
    reason: string;
    sample?: string;
}
/** Walk an output value and collect determinism violations. */
export declare function findDeterminismViolations(output: unknown, now?: number): DeterminismViolation[];
/**
 * Returns a FlatRunnerResult when the step output contains likely
 * non-deterministic content reported under a DETERMINISTIC step, or null when
 * the caller may proceed. Caller passes the step's `execution_mode`; the guard
 * is a no-op for non-DET modes.
 */
export declare function assertDeterministicOutput(executionMode: string | null, output: unknown, stepId: string, requestId: string, now?: number): FlatRunnerResult | null;
