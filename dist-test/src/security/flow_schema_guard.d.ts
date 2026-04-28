import type { FlatRunnerResult } from "../types.js";
/** Top-level keys recognized by the MOVA flow schema. */
export declare const ALLOWED_FLOW_TOP_LEVEL_KEYS: ReadonlySet<string>;
/** Returns top-level keys present in `flow` that are not in the allow-list. */
export declare function findUnknownFlowFields(flow: unknown): string[];
/**
 * Returns a FlatRunnerResult when the flow contains unknown top-level fields,
 * or null when the caller may proceed.
 *
 * NOTE: this guard runs AFTER class_definition_guard so that the more specific
 * class_definition_* refusal takes precedence; class_definition fields will not
 * even reach this guard in the normal pipeline.
 */
export declare function assertNoUnknownFlowFields(flow: unknown, requestId: string): FlatRunnerResult | null;
