// ── MOVA Flat Runner — canonical types ────────────────────────────────────────
// ── Error codes ───────────────────────────────────────────────────────────────
export const ERR = {
    CONFIG_MISSING: "CONFIG_MISSING",
    UNKNOWN_CONTRACT_TYPE: "UNKNOWN_CONTRACT_TYPE",
    MISSING_REQUIRED_INPUTS: "MISSING_REQUIRED_INPUTS",
    LOCAL_VALIDATION_FAILED: "LOCAL_VALIDATION_FAILED",
    UNSUPPORTED_FLOW_SHAPE: "UNSUPPORTED_FLOW_SHAPE",
    API_REQUEST_FAILED: "API_REQUEST_FAILED",
    API_RESPONSE_INVALID: "API_RESPONSE_INVALID",
    VALIDATOR_NOT_ALLOWED: "VALIDATOR_NOT_ALLOWED",
    VALIDATOR_FAILED: "VALIDATOR_FAILED",
    DECISION_POINT_MISSING: "DECISION_POINT_MISSING",
    LOCAL_INVALID_DECISION_OPTION: "LOCAL_INVALID_DECISION_OPTION",
    AUDIT_UNAVAILABLE: "AUDIT_UNAVAILABLE",
    API_TIMEOUT: "API_TIMEOUT",
    MUST_USE_GATE_APPROVE: "MUST_USE_GATE_APPROVE",
    SYSTEM_CONTRACT_NOT_INVOKABLE: "SYSTEM_CONTRACT_NOT_INVOKABLE",
    INLINE_CLASS_DEFINITION_FORBIDDEN: "INLINE_CLASS_DEFINITION_FORBIDDEN",
};
export function flatErr(error, message, details, retryable = false, requestId) {
    return {
        ok: false,
        error,
        message,
        ...(details !== undefined ? { details } : {}),
        ...(retryable ? { retryable: true } : {}),
        ...(requestId ? { request_id: requestId } : {}),
    };
}
