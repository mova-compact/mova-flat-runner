import { type FlatRunnerResult, type ValidatorRef } from "./types.js";
import {
  type MovaConfig,
  isLocalSeamConfig,
  movaGetDecisionPointLocal,
  movaGetTerminalOutcomeLocal,
  movaResumeContractLocal,
  movaRunStepsLocal,
  movaSubmitDecisionLocal,
  shortId,
} from "./transports/local_seam_bridge.js";
import {
  movaDelete,
  movaGet,
  movaPost,
  movaPut,
  movaRunStepsRemote,
} from "./transports/remote_api.js";

export type { MovaConfig };
export { shortId, movaPost, movaGet, movaPut, movaDelete };

export async function movaGetDecisionPoint(cfg: MovaConfig, contractId: string) {
  if (!isLocalSeamConfig(cfg)) {
    throw new Error("remote_decision_point_not_supported_in_bridge_v1");
  }
  return await movaGetDecisionPointLocal(contractId);
}

export async function movaSubmitDecision(cfg: MovaConfig, contractId: string, option: string, reason?: string) {
  if (!isLocalSeamConfig(cfg)) {
    throw new Error("remote_decision_submit_not_supported_in_bridge_v1");
  }
  return await movaSubmitDecisionLocal(contractId, option, reason);
}

export async function movaResumeContract(cfg: MovaConfig, contractId: string) {
  if (!isLocalSeamConfig(cfg)) {
    throw new Error("remote_resume_not_supported_in_bridge_v1");
  }
  return await movaResumeContractLocal(contractId);
}

export async function movaGetTerminalOutcome(cfg: MovaConfig, contractId: string) {
  if (!isLocalSeamConfig(cfg)) {
    throw new Error("remote_terminal_query_not_supported_in_bridge_v1");
  }
  return await movaGetTerminalOutcomeLocal(contractId);
}

export async function movaRunSteps(
  cfg: MovaConfig,
  contractId: string,
  validators: ValidatorRef[],
  initialInputs: Record<string, unknown> = {},
): Promise<FlatRunnerResult> {
  if (isLocalSeamConfig(cfg)) {
    return await movaRunStepsLocal(initialInputs);
  }
  return await movaRunStepsRemote(cfg, contractId, validators, initialInputs);
}
