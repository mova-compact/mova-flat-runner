// ── MOVA Flat Runner — canonical types ────────────────────────────────────────

/** Typed function in the local validator registry. */
export type ValidatorFn = (inputs: Record<string, unknown>) => {
  ok: boolean;
  value: Record<string, unknown>;
  step_id: string;
};

/** Reference to a registered validator (used in ContractManifest). */
export interface ValidatorRef {
  step_id:      string;
  title:        string;
  validator_id: string;   // key in VALIDATOR_REGISTRY, e.g. "invoice.validate_totals_v0"
}

// ── Error codes ───────────────────────────────────────────────────────────────

export const ERR = {
  CONFIG_MISSING:                "CONFIG_MISSING",
  UNKNOWN_CONTRACT_TYPE:         "UNKNOWN_CONTRACT_TYPE",
  MISSING_REQUIRED_INPUTS:       "MISSING_REQUIRED_INPUTS",
  LOCAL_VALIDATION_FAILED:       "LOCAL_VALIDATION_FAILED",
  UNSUPPORTED_FLOW_SHAPE:        "UNSUPPORTED_FLOW_SHAPE",
  API_REQUEST_FAILED:            "API_REQUEST_FAILED",
  API_RESPONSE_INVALID:          "API_RESPONSE_INVALID",
  VALIDATOR_NOT_ALLOWED:         "VALIDATOR_NOT_ALLOWED",
  VALIDATOR_FAILED:              "VALIDATOR_FAILED",
  DECISION_POINT_MISSING:        "DECISION_POINT_MISSING",
  LOCAL_INVALID_DECISION_OPTION: "LOCAL_INVALID_DECISION_OPTION",
  AUDIT_UNAVAILABLE:             "AUDIT_UNAVAILABLE",
  API_TIMEOUT:                   "API_TIMEOUT",
} as const;

export type ErrCode = typeof ERR[keyof typeof ERR];

// ── Result envelope ───────────────────────────────────────────────────────────

export type FlatRunnerResult =
  | {
      ok:          true;
      status:      "waiting_human";
      contract_id: string;
      question:    string;
      options:     unknown[];
      recommended?: string | null;
      analysis:    Record<string, unknown>;
    }
  | {
      ok:            true;
      status:        "completed";
      contract_id:   string;
      audit_receipt: Record<string, unknown>;
      analysis?:     Record<string, unknown>;
    }
  | {
      ok:         false;
      error:      ErrCode;
      message:    string;
      details?:   unknown;
      retryable?: boolean;
      request_id?: string;
    };

export function flatErr(
  error:      ErrCode,
  message:    string,
  details?:   unknown,
  retryable = false,
  requestId?: string,
): FlatRunnerResult {
  return {
    ok: false,
    error,
    message,
    ...(details   !== undefined ? { details }           : {}),
    ...(retryable               ? { retryable: true }   : {}),
    ...(requestId               ? { request_id: requestId } : {}),
  };
}
