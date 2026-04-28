import type { FlatRunnerResult } from "../types.js";
export type ModeViolationKind = "unknown_mode" | "deterministic_with_model" | "ai_atomic_without_model" | "contract_call_without_contract_id" | "human_gate_without_decisions";
export interface ModeViolation {
    kind: ModeViolationKind;
    step_id: string | null;
    execution_mode: string | null;
    message: string;
}
/** Inspect every step. Return list of (mode, content) mismatches. */
export declare function findStepModeViolations(flow: unknown): ModeViolation[];
export declare function assertStepModesValid(flow: unknown, requestId: string): FlatRunnerResult | null;
