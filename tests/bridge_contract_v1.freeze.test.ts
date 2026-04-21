import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  type MovaConfig,
  movaGetDecisionPoint,
  movaGetTerminalOutcome,
  movaResumeContract,
  movaRunSteps,
  movaSubmitDecision,
} from "../src/client.js";

const PACKAGE_PATH = "D:\\Projects_MOVA\\mova-intent\\contracts\\dockerfile-nodejs-v1";
const SAMPLE_PROJECT_WITH_DOCKER = "D:\\Projects_MOVA\\mova-intent\\examples\\local_developer_flow_v0\\sample_node_app_with_docker";

const LOCAL_SEAM_CONFIG: MovaConfig = {
  apiKey: "",
  baseUrl: "local-seam-v1",
  llmKey: "",
  llmModel: "",
};

test("bridge contract v1 local seam path never falls back to remote fetch and never leaks internal fields", { concurrency: false }, async () => {
  const projectPath = await createProjectWithoutDocker("bridge-freeze-public");
  const stateFile = await tempStateFile("bridge-freeze-public");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("remote fetch must not be called on bridged path");
  }) as typeof fetch;

  try {
    const started = await movaRunSteps(LOCAL_SEAM_CONFIG, "unused", [], {
      package_path: PACKAGE_PATH,
      project_path: projectPath,
      state_file: stateFile,
    });
    assert.equal(started.ok, true);
    assert.match(started.contract_id, /^opaque-run:/);
    assert.doesNotMatch(started.contract_id, /package_path|project_path|state_file|Projects_MOVA|run_state\.json/);
    assert.equal(findInternalField(started), null);

    const gate = await movaGetDecisionPoint(LOCAL_SEAM_CONFIG, started.contract_id);
    assert.equal(gate.ok, true);
    assert.equal(findInternalField(gate), null);

    const submitted = await movaSubmitDecision(
      LOCAL_SEAM_CONFIG,
      started.contract_id,
      "reject",
      "Freeze test decision.",
    );
    assert.equal(submitted.ok, true);
    assert.equal(findInternalField(submitted), null);

    const resumed = await movaResumeContract(LOCAL_SEAM_CONFIG, started.contract_id);
    assert.equal(resumed.ok, true);
    assert.equal(findInternalField(resumed), null);

    const terminal = await movaGetTerminalOutcome(LOCAL_SEAM_CONFIG, started.contract_id);
    assert.equal(terminal.ok, true);
    assert.equal(findInternalField(terminal), null);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bridge contract v1 fails closed when opaque run reference cannot be resolved", { concurrency: false }, async () => {
  await assert.rejects(
    () => movaGetDecisionPoint(LOCAL_SEAM_CONFIG, "opaque-run:missing"),
    /unresolved_opaque_run_ref/,
  );
});

test("bridge contract v1 rejects unsupported sample with existing Dockerfile", { concurrency: false }, async () => {
  const stateFile = await tempStateFile("bridge-freeze-unsupported");

  const started = await movaRunSteps(LOCAL_SEAM_CONFIG, "unused", [], {
    package_path: PACKAGE_PATH,
    project_path: SAMPLE_PROJECT_WITH_DOCKER,
    state_file: stateFile,
  });

  assert.equal(started.ok, false);
  assert.equal(started.error, "API_REQUEST_FAILED");
  assert.match(started.message, /unsupported_path_existing_dockerfile/);
});

test("bridged transport is physically separated from legacy remote transport", { concurrency: false }, async () => {
  const clientSource = await fs.readFile(path.join(process.cwd(), "src", "client.ts"), "utf8");
  const localBridgeSource = await fs.readFile(path.join(process.cwd(), "src", "transports", "local_seam_bridge.ts"), "utf8");
  const remoteSource = await fs.readFile(path.join(process.cwd(), "src", "transports", "remote_api.ts"), "utf8");

  assert.match(clientSource, /from "\.\/transports\/local_seam_bridge\.js"/);
  assert.match(clientSource, /from "\.\/transports\/remote_api\.js"/);
  assert.doesNotMatch(clientSource, /fetch\(/);
  assert.doesNotMatch(clientSource, /start_run\(/);
  assert.match(localBridgeSource, /machineBridgeModulePath/);
  assert.doesNotMatch(localBridgeSource, /fetch\(/);
  assert.match(remoteSource, /fetch\(/);
});

async function tempStateFile(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  return path.join(dir, "run_state.json");
}

async function createProjectWithoutDocker(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  await fs.cp(SAMPLE_PROJECT_WITH_DOCKER, dir, { recursive: true });
  await fs.rm(path.join(dir, "Dockerfile"), { force: true });
  return dir;
}

function findInternalField(value: unknown): string | null {
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
