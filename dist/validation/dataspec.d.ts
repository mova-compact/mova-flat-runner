import type { DsField } from "../schemas.js";
export interface ValidationError {
    field: string;
    error: string;
}
/** Validate agent-supplied inputs against a DataSpec field list. */
export declare function validateDataSpec(inputs: Record<string, unknown>, fields: DsField[]): {
    ok: boolean;
    errors: ValidationError[];
};
/** Validate that a backend analyze response is a plain object, not a blob or array. */
export declare function validateBackendOutput(output: unknown): {
    ok: boolean;
    error?: string;
};
/** Supported step types for the flat runner flow shape guard. */
export declare const SUPPORTED_STEP_TYPES: Set<string>;
/** Validate that a manifest's steps[] matches the supported analyze→verify→decide shape. */
export declare function validateFlowShape(steps: unknown[]): {
    ok: boolean;
    error?: string;
};
