import { type FlatRunnerResult } from "../types.js";
export interface MovaConfig {
    apiKey: string;
    baseUrl: string;
    llmKey: string;
    llmModel: string;
}
type SeamGateResult = {
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
};
type SeamResolutionResult = {
    ok: boolean;
    error?: string | null;
    stored_resolution?: {
        step_id?: string | null;
        decision?: string | null;
        reason?: string | null;
    } | null;
};
type SeamResumeResult = {
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
};
type SeamTerminalResult = {
    ok: boolean;
    error?: string | null;
    terminal_outcome?: {
        outcome_id?: string | null;
        linked_ai_output?: Record<string, unknown> | null;
        linked_human_resolution?: Record<string, unknown> | null;
    } | null;
};
export declare function shortId(): string;
export declare function isLocalSeamConfig(config: MovaConfig): boolean;
export declare function movaGetDecisionPointLocal(runReference: string): Promise<SeamGateResult>;
export declare function movaSubmitDecisionLocal(runReference: string, option: string, reason?: string): Promise<SeamResolutionResult>;
export declare function movaResumeContractLocal(runReference: string): Promise<SeamResumeResult>;
export declare function movaGetTerminalOutcomeLocal(runReference: string): Promise<SeamTerminalResult>;
export declare function movaRunStepsLocal(initialInputs?: Record<string, unknown>): Promise<FlatRunnerResult>;
export {};
