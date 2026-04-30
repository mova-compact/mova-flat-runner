import type { FlatRunnerResult } from "../types.js";
/** Top-level keys that, if present in a flow body, indicate inline class-definition smuggling. */
export declare const FORBIDDEN_FLOW_KEYS: readonly string[];
/** Returns the list of forbidden keys present at the top level of `flow`. */
export declare function findInlineClassDefinitionFields(flow: unknown): string[];
/**
 * Returns a FlatRunnerResult when the flow embeds a forbidden class_definition
 * field, or null when the caller may proceed.
 */
export declare function assertNoInlineClassDefinition(flow: unknown, requestId: string): FlatRunnerResult | null;
