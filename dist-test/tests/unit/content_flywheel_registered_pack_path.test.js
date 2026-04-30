import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { CONTRACT_MANIFESTS } from "../../src/schemas.js";
import { VALIDATOR_REGISTRY } from "../../src/validators/registry.js";
import { assertNoSystemContractCalls } from "../../src/security/system_contract_guard.js";
import { assertNoInlineClassDefinition } from "../../src/security/class_definition_guard.js";
import { assertFlowGraphValid } from "../../src/security/graph_guard.js";
import { assertStepModesValid } from "../../src/security/step_mode_guard.js";
import { assertNoUnknownFlowFields } from "../../src/security/flow_schema_guard.js";
function fixturePath() {
    return path.resolve("tests", "fixtures", "content_flywheel_registered_pack", "flow.json");
}
async function loadFixtureFlow() {
    const raw = await fs.readFile(fixturePath(), "utf8");
    return JSON.parse(raw);
}
test("content_flywheel is not a built-in manifest in MCP core", () => {
    assert.equal("content_flywheel" in CONTRACT_MANIFESTS, false);
});
test("content_flywheel validator is not in the core validator registry", () => {
    assert.equal(VALIDATOR_REGISTRY.has("content_flywheel.validate_intent_v0"), false);
});
test("external content_flywheel fixture passes registration-path guards", async () => {
    const flow = await loadFixtureFlow();
    const req = "req-cfw-pack-fixture";
    assert.equal(assertNoSystemContractCalls(flow, req), null);
    assert.equal(assertNoInlineClassDefinition(flow, req), null);
    assert.equal(assertFlowGraphValid(flow, req), null);
    assert.equal(assertStepModesValid(flow, req), null);
    assert.equal(assertNoUnknownFlowFields(flow, req), null);
});
