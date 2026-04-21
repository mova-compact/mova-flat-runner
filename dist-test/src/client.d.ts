import { type FlatRunnerResult, type ValidatorRef } from "./types.js";
import { type MovaConfig, shortId } from "./transports/local_seam_bridge.js";
import { movaDelete, movaGet, movaPost, movaPut } from "./transports/remote_api.js";
export type { MovaConfig };
export { shortId, movaPost, movaGet, movaPut, movaDelete };
export declare function movaGetDecisionPoint(cfg: MovaConfig, contractId: string): Promise<{
    ok: boolean;
    error?: string | null;
    human_gate?: {
        step_id?: string | null;
        output_key?: string | null;
        payload?: Record<string, unknown> | null;
        display_data?: {
            title?: string | null;
        } | null;
        decision_options?: unknown[];
    } | null;
}>;
export declare function movaSubmitDecision(cfg: MovaConfig, contractId: string, option: string, reason?: string): Promise<{
    ok: boolean;
    error?: string | null;
    stored_resolution?: {
        step_id?: string | null;
        decision?: string | null;
        reason?: string | null;
    } | null;
}>;
export declare function movaResumeContract(cfg: MovaConfig, contractId: string): Promise<{
    ok: boolean;
    error?: string | null;
    run_state?: {
        status?: string | null;
    } | null;
    terminal_outcome?: {
        outcome_id?: string | null;
        linked_ai_output?: Record<string, unknown> | null;
        linked_human_resolution?: Record<string, unknown> | null;
    } | null;
}>;
export declare function movaGetTerminalOutcome(cfg: MovaConfig, contractId: string): Promise<{
    ok: boolean;
    error?: string | null;
    terminal_outcome?: {
        outcome_id?: string | null;
        linked_ai_output?: Record<string, unknown> | null;
        linked_human_resolution?: Record<string, unknown> | null;
    } | null;
}>;
export declare function movaRunSteps(cfg: MovaConfig, contractId: string, validators: ValidatorRef[], initialInputs?: Record<string, unknown>): Promise<FlatRunnerResult>;
