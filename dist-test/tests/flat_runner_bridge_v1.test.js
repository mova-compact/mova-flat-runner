import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { movaGetDecisionPoint, movaGetTerminalOutcome, movaResumeContract, movaRunSteps, movaSubmitDecision, } from "../src/client.js";
const PACKAGE_PATH = "D:\\Projects_MOVA\\mova-intent\\contracts\\dockerfile-nodejs-v1";
const SAMPLE_PROJECT_WITH_DOCKER = "D:\\Projects_MOVA\\mova-intent\\examples\\local_developer_flow_v0\\sample_node_app_with_docker";
const LOCAL_SEAM_CONFIG = {
    apiKey: "",
    baseUrl: "local-seam-v1",
    llmKey: "",
    llmModel: "",
};
test("flat-runner canonical repo drives one real bridge run end-to-end", async () => {
    const projectPath = await createProjectWithoutDocker("flat-runner-bridge");
    const stateFile = await tempStateFile("flat-runner-bridge");
    const started = await movaRunSteps(LOCAL_SEAM_CONFIG, "unused", [], {
        package_path: PACKAGE_PATH,
        project_path: projectPath,
        state_file: stateFile,
    });
    assert.equal(started.ok, true);
    assert.equal(started.status, "waiting_human");
    assert.equal(started.analysis.base_image, "node:20-alpine");
    assert.match(started.contract_id, /^opaque-run:/);
    assert.doesNotMatch(started.contract_id, /package_path|project_path|state_file|Projects_MOVA|run_state\.json/);
    assert.equal(findInternalField(started), null);
    const afterRestartGate = await movaGetDecisionPoint(LOCAL_SEAM_CONFIG, started.contract_id);
    assert.equal(afterRestartGate.ok, true);
    assert.ok(afterRestartGate.human_gate);
    assert.ok(afterRestartGate.human_gate.payload);
    assert.equal(afterRestartGate.human_gate.step_id, "review_strategy");
    assert.equal(afterRestartGate.human_gate.payload.base_image, "node:20-alpine");
    assert.equal(findInternalField(afterRestartGate), null);
    const submitted = await movaSubmitDecision(LOCAL_SEAM_CONFIG, started.contract_id, "reject", "Rejected through canonical flat-runner bridge.");
    assert.equal(submitted.ok, true);
    assert.ok(submitted.stored_resolution);
    assert.equal(submitted.stored_resolution.decision, "reject");
    assert.equal(findInternalField(submitted), null);
    const resumed = await movaResumeContract(LOCAL_SEAM_CONFIG, started.contract_id);
    assert.equal(resumed.ok, true);
    assert.ok(resumed.run_state);
    assert.ok(resumed.terminal_outcome);
    assert.equal(resumed.run_state.status, "completed");
    assert.equal(resumed.terminal_outcome.outcome_id, "completed_rejected");
    assert.equal(findInternalField(resumed), null);
    const terminal = await movaGetTerminalOutcome(LOCAL_SEAM_CONFIG, started.contract_id);
    assert.equal(terminal.ok, true);
    assert.ok(terminal.terminal_outcome);
    assert.ok(terminal.terminal_outcome.linked_ai_output);
    assert.ok(terminal.terminal_outcome.linked_human_resolution);
    assert.equal(terminal.terminal_outcome.linked_ai_output.step_id, "propose_container_strategy");
    assert.equal(terminal.terminal_outcome.linked_human_resolution.step_id, "review_strategy");
    assert.equal(findInternalField(terminal), null);
    const persistedBeforeReentry = JSON.parse(await fs.readFile(stateFile, "utf8"));
    const secondResume = await movaResumeContract(LOCAL_SEAM_CONFIG, started.contract_id);
    const persistedAfterReentry = JSON.parse(await fs.readFile(stateFile, "utf8"));
    assert.equal(secondResume.ok, true);
    assert.ok(secondResume.terminal_outcome);
    assert.equal(secondResume.terminal_outcome.outcome_id, "completed_rejected");
    assert.equal(persistedAfterReentry.terminal_commit_count, persistedBeforeReentry.terminal_commit_count);
});
async function tempStateFile(prefix) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
    return path.join(dir, "run_state.json");
}
async function createProjectWithoutDocker(prefix) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
    await fs.cp(SAMPLE_PROJECT_WITH_DOCKER, dir, { recursive: true });
    await fs.rm(path.join(dir, "Dockerfile"), { force: true });
    return dir;
}
function findInternalField(value) {
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findInternalField(item);
            if (found) {
                return found;
            }
        }
        return null;
    }
    if (!value || typeof value !== "object") {
        return null;
    }
    for (const [key, child] of Object.entries(value)) {
        if (["bridge_anchors", "last_terminal_bridge", "terminal_commit_count", "_state15_bridge", "trace", "outputs", "context"].includes(key)) {
            return key;
        }
        const nested = findInternalField(child);
        if (nested) {
            return nested;
        }
    }
    return null;
}
