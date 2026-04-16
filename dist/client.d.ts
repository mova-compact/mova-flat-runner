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
export interface ValidatorDef {
    step_id: string;
    title: string;
    fn: string;
}
/** Run backend steps (analyze → verify → decide) with local deterministic validators
 *  executed after the first ai_task output is fetched.
 *  Returns waiting_human (with analysis + options) or completed (with audit). */
export declare function movaRunSteps(cfg: MovaConfig, contractId: string, validators: ValidatorDef[]): Promise<unknown>;
export declare function toolResult(data: unknown): {
    content: {
        type: "text";
        text: string;
    }[];
    details: unknown;
};
