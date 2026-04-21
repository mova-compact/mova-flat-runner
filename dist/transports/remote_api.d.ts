import { type FlatRunnerResult, type ValidatorRef } from "../types.js";
export interface MovaConfig {
    apiKey: string;
    baseUrl: string;
    llmKey: string;
    llmModel: string;
}
export declare function shortId(): string;
export declare const movaPost: (config: MovaConfig, path: string, body: unknown) => Promise<unknown>;
export declare const movaGet: (config: MovaConfig, path: string) => Promise<unknown>;
export declare const movaPut: (config: MovaConfig, path: string, body: unknown) => Promise<unknown>;
export declare const movaDelete: (config: MovaConfig, path: string) => Promise<unknown>;
export declare function movaRunStepsRemote(cfg: MovaConfig, contractId: string, validators: ValidatorRef[], initialInputs?: Record<string, unknown>): Promise<FlatRunnerResult>;
