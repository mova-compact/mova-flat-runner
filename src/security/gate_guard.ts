// SECURITY GUARD (CFV-3)
//
// HUMAN_GATE cannot be completed by generic step completion.
// Human confirmation requires the dedicated gate path (gate_approve / gate_reject).
//
// This module is intentionally side-effect free — importing it must not start any
// servers, open sockets, or read env vars. Tests import it directly.

import { ERR, flatErr } from "../types.js";
import type { MovaConfig } from "../client.js";
import { movaGet } from "../client.js";

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
export async function assertNotHumanGate(
  config:    MovaConfig,
  runId:     string,
  stepId:    string,
  requestId: string,
  fetcher:   StatusFetcher = movaGet,
): Promise<string | null> {
  let status: unknown;
  try {
    status = await fetcher(config, `/run/${runId}/status`);
  } catch {
    return null;
  }
  const currentStep = (status as { current_step?: { step_id?: string; execution_mode?: string } } | null)?.current_step;
  if (!currentStep || currentStep.step_id !== stepId) return null;
  if (currentStep.execution_mode !== "HUMAN_GATE") return null;
  return JSON.stringify(flatErr(
    ERR.MUST_USE_GATE_APPROVE,
    `Step "${stepId}" is HUMAN_GATE. Use POST /run/${runId}/gate/${stepId}/approve (or .../reject), not step_complete.`,
    { run_id: runId, step_id: stepId, execution_mode: "HUMAN_GATE", http_status_equivalent: 409 },
    false,
    requestId,
  ));
}
