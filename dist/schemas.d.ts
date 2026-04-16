export declare const ENVELOPE_KINDS: {
    readonly CONTRACT_START: "env.contract.start_v0";
    readonly DECISION_SUBMIT: "env.decision.submit_v0";
    readonly STEP_EXECUTE: "env.step.execute_v0";
    readonly CONTRACT_QUERY: "env.contract.query_v0";
};
export type EnvelopeKind = typeof ENVELOPE_KINDS[keyof typeof ENVELOPE_KINDS];
export interface DsField {
    field: string;
    type: "string" | "number" | "boolean" | "array" | "object";
    format?: string;
    required: boolean;
    description: string;
    enum?: string[];
    items?: {
        type: string;
        description?: string;
    };
    default?: unknown;
}
export interface ContractManifest {
    contract_type: string;
    title: string;
    version: string;
    execution_mode: "human_gated" | "ai_assisted" | "deterministic" | "bounded_variance";
    template_id: string;
    policy_id: string;
    short_id_prefix: string;
    dataspec: {
        schema_version: string;
        inputs: DsField[];
    };
    decision_options: Array<{
        option_id: string;
        label: string;
    }>;
    steps: unknown[];
    validators?: Array<{
        step_id: string;
        title: string;
        fn: string;
    }>;
}
export declare const CONTRACT_MANIFESTS: Record<string, ContractManifest>;
export declare const ENVELOPE_SCHEMA: {
    schema_version: string;
    kinds: ({
        kind: "env.contract.start_v0";
        description: string;
        required_fields: string[];
    } | {
        kind: "env.decision.submit_v0";
        description: string;
        required_fields: string[];
    } | {
        kind: "env.step.execute_v0";
        description: string;
        required_fields: string[];
    } | {
        kind: "env.contract.query_v0";
        description: string;
        required_fields: string[];
    })[];
    actor_types: string[];
};
