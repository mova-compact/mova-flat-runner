import type { FlatRunnerResult } from "../types.js";
/** Parse `MOVA_SYSTEM_CONTRACTS` if present; otherwise fall back to defaults. */
export declare function loadSystemContractAllowList(env?: NodeJS.ProcessEnv): Set<string>;
export interface SystemContractViolation {
    step_id: string | null;
    contract_id: string;
    execution_mode: string;
}
/** Inspect a flow for violating CONTRACT_CALL steps. Returns [] when clean. */
export declare function findSystemContractViolations(flow: unknown, allowList?: Set<string>): SystemContractViolation[];
/**
 * Returns a FlatRunnerResult when the flow violates CFV-11 (one or more CONTRACT_CALL
 * steps target a system contract), or null when the caller may proceed.
 *
 * The caller is expected to JSON.stringify the result and return it as the tool output.
 */
export declare function assertNoSystemContractCalls(flow: unknown, requestId: string, allowList?: Set<string>): FlatRunnerResult | null;
