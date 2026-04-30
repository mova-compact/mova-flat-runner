import type { MovaConfig } from "../client.js";
export type StatusFetcher = (config: MovaConfig, path: string) => Promise<unknown>;
/**
 * Reads the current step from /run/{run_id}/status and refuses if its
 * execution_mode is HUMAN_GATE. Returns a serialized FlatRunnerResult on
 * rejection, or null when the caller may proceed.
 *
 * Fail-open: if the status fetch fails or the response is malformed we return
 * null and let the runtime adjudicate. The intent is to plug a known-bad path,
 * not to introduce a new failure mode for non-gate steps.
 *
 * `fetcher` is injectable for tests; by default the real movaGet is used.
 */
export declare function assertNotHumanGate(config: MovaConfig, runId: string, stepId: string, requestId: string, fetcher?: StatusFetcher): Promise<string | null>;
