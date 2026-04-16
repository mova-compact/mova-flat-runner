import { type FlatRunnerResult, type ValidatorRef } from "./types.js";
export interface MovaConfig {
    apiKey: string;
    baseUrl: string;
    llmKey: string;
    llmModel: string;
}
export declare function shortId(): string;
export declare const movaPost: (c: MovaConfig, path: string, body: unknown) => Promise<unknown>;
export declare const movaGet: (c: MovaConfig, path: string) => Promise<unknown>;
export declare const movaPut: (c: MovaConfig, path: string, body: unknown) => Promise<unknown>;
export declare const movaDelete: (c: MovaConfig, path: string) => Promise<unknown>;
export declare function movaRunSteps(cfg: MovaConfig, contractId: string, validators: ValidatorRef[]): Promise<FlatRunnerResult>;
