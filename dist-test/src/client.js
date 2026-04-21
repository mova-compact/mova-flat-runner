import { isLocalSeamConfig, movaGetDecisionPointLocal, movaGetTerminalOutcomeLocal, movaResumeContractLocal, movaRunStepsLocal, movaSubmitDecisionLocal, shortId, } from "./transports/local_seam_bridge.js";
import { movaDelete, movaGet, movaPost, movaPut, movaRunStepsRemote, } from "./transports/remote_api.js";
export { shortId, movaPost, movaGet, movaPut, movaDelete };
export async function movaGetDecisionPoint(cfg, contractId) {
    if (!isLocalSeamConfig(cfg)) {
        throw new Error("remote_decision_point_not_supported_in_bridge_v1");
    }
    return await movaGetDecisionPointLocal(contractId);
}
export async function movaSubmitDecision(cfg, contractId, option, reason) {
    if (!isLocalSeamConfig(cfg)) {
        throw new Error("remote_decision_submit_not_supported_in_bridge_v1");
    }
    return await movaSubmitDecisionLocal(contractId, option, reason);
}
export async function movaResumeContract(cfg, contractId) {
    if (!isLocalSeamConfig(cfg)) {
        throw new Error("remote_resume_not_supported_in_bridge_v1");
    }
    return await movaResumeContractLocal(contractId);
}
export async function movaGetTerminalOutcome(cfg, contractId) {
    if (!isLocalSeamConfig(cfg)) {
        throw new Error("remote_terminal_query_not_supported_in_bridge_v1");
    }
    return await movaGetTerminalOutcomeLocal(contractId);
}
export async function movaRunSteps(cfg, contractId, validators, initialInputs = {}) {
    if (isLocalSeamConfig(cfg)) {
        return await movaRunStepsLocal(initialInputs);
    }
    return await movaRunStepsRemote(cfg, contractId, validators, initialInputs);
}
