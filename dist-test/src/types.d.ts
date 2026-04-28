/** Typed function in the local validator registry. */
export type ValidatorFn = (inputs: Record<string, unknown>) => {
    ok: boolean;
    value: Record<string, unknown>;
    step_id: string;
};
/** Reference to a registered validator (used in ContractManifest). */
export interface ValidatorRef {
    step_id: string;
    title: string;
    validator_id: string;
}
export declare const ERR: {
    readonly CONFIG_MISSING: "CONFIG_MISSING";
    readonly UNKNOWN_CONTRACT_TYPE: "UNKNOWN_CONTRACT_TYPE";
    readonly MISSING_REQUIRED_INPUTS: "MISSING_REQUIRED_INPUTS";
    readonly LOCAL_VALIDATION_FAILED: "LOCAL_VALIDATION_FAILED";
    readonly UNSUPPORTED_FLOW_SHAPE: "UNSUPPORTED_FLOW_SHAPE";
    readonly API_REQUEST_FAILED: "API_REQUEST_FAILED";
    readonly API_RESPONSE_INVALID: "API_RESPONSE_INVALID";
    readonly VALIDATOR_NOT_ALLOWED: "VALIDATOR_NOT_ALLOWED";
    readonly VALIDATOR_FAILED: "VALIDATOR_FAILED";
    readonly DECISION_POINT_MISSING: "DECISION_POINT_MISSING";
    readonly LOCAL_INVALID_DECISION_OPTION: "LOCAL_INVALID_DECISION_OPTION";
    readonly AUDIT_UNAVAILABLE: "AUDIT_UNAVAILABLE";
    readonly API_TIMEOUT: "API_TIMEOUT";
    readonly MUST_USE_GATE_APPROVE: "MUST_USE_GATE_APPROVE";
    readonly SYSTEM_CONTRACT_NOT_INVOKABLE: "SYSTEM_CONTRACT_NOT_INVOKABLE";
    readonly INLINE_CLASS_DEFINITION_FORBIDDEN: "INLINE_CLASS_DEFINITION_FORBIDDEN";
    readonly FLOW_GRAPH_INVALID: "FLOW_GRAPH_INVALID";
    readonly STEP_MODE_FIELD_MISMATCH: "STEP_MODE_FIELD_MISMATCH";
    readonly UNKNOWN_FLOW_FIELD: "UNKNOWN_FLOW_FIELD";
};
export type ErrCode = typeof ERR[keyof typeof ERR];
export type FlatRunnerResult = {
    ok: true;
    status: "waiting_human";
    contract_id: string;
    question: string;
    options: unknown[];
    recommended?: string | null;
    analysis: Record<string, unknown>;
} | {
    ok: true;
    status: "completed";
    contract_id: string;
    audit_receipt: Record<string, unknown>;
    analysis?: Record<string, unknown>;
} | {
    ok: false;
    error: ErrCode;
    message: string;
    details?: unknown;
    retryable?: boolean;
    request_id?: string;
};
export declare function flatErr(error: ErrCode, message: string, details?: unknown, retryable?: boolean, requestId?: string): FlatRunnerResult;
