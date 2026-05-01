import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadContractRegistrationSource } from "../../src/package_support.js";
import { assertNoSystemContractCalls } from "../../src/security/system_contract_guard.js";
import { assertNoInlineClassDefinition } from "../../src/security/class_definition_guard.js";
import { assertFlowGraphValid } from "../../src/security/graph_guard.js";
import { assertStepModesValid } from "../../src/security/step_mode_guard.js";
import { assertNoUnknownFlowFields } from "../../src/security/flow_schema_guard.js";

const FIXTURE_DIR = path.resolve("tests", "fixtures", "package_global_support_v0");
const FLOW_FIXTURE = path.resolve("tests", "fixtures", "content_flywheel_registered_pack", "flow.json");

test("package manifest without global_ref still loads", async () => {
  const fixtureDir = await copyFixture("package-global-noglobal");
  const manifestPath = path.join(fixtureDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
  delete manifest.global_ref;
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const loaded = await loadContractRegistrationSource(fixtureDir);
  const referenceFlow = JSON.parse(await fs.readFile(FLOW_FIXTURE, "utf8")) as Record<string, unknown>;

  assert.equal(loaded.kind, "package_manifest");
  assert.equal(loaded.package_global, null);
  assert.deepEqual(loaded.flow_json, referenceFlow);
  assert.equal(assertNoSystemContractCalls(loaded.flow_json, "req-noglobal"), null);
  assert.equal(assertNoInlineClassDefinition(loaded.flow_json, "req-noglobal"), null);
  assert.equal(assertFlowGraphValid(loaded.flow_json, "req-noglobal"), null);
  assert.equal(assertStepModesValid(loaded.flow_json, "req-noglobal"), null);
  assert.equal(assertNoUnknownFlowFields(loaded.flow_json, "req-noglobal"), null);
});

test("package manifest with valid global_ref loads and preserves the same flow", async () => {
  const fixtureDir = await copyFixture("package-global-valid");

  const loaded = await loadContractRegistrationSource(fixtureDir);
  const referenceFlow = JSON.parse(await fs.readFile(FLOW_FIXTURE, "utf8")) as Record<string, unknown>;

  assert.equal(loaded.kind, "package_manifest");
  assert.equal(loaded.package_global?.schema_id, "package.global_v0");
  assert.deepEqual(loaded.flow_json, referenceFlow);
});

test("declared global_ref missing file fails clearly", async () => {
  const fixtureDir = await copyFixture("package-global-missing");
  await fs.rm(path.join(fixtureDir, "global.json"));

  await assert.rejects(
    () => loadContractRegistrationSource(fixtureDir),
    /global\.json|ENOENT|Failed to read/i,
  );
});

test("declared global_ref malformed JSON fails clearly", async () => {
  const fixtureDir = await copyFixture("package-global-malformed");
  await fs.writeFile(path.join(fixtureDir, "global.json"), "{", "utf8");

  await assert.rejects(
    () => loadContractRegistrationSource(fixtureDir),
    /Unexpected token|JSON/i,
  );
});

test("declared global_ref invalid shape fails clearly", async () => {
  const fixtureDir = await copyFixture("package-global-invalid");
  const globalPath = path.join(fixtureDir, "global.json");
  const globalJson = JSON.parse(await fs.readFile(globalPath, "utf8")) as Record<string, unknown>;
  globalJson.scope = "contract_runtime";
  await fs.writeFile(globalPath, JSON.stringify(globalJson, null, 2));

  await assert.rejects(
    () => loadContractRegistrationSource(fixtureDir),
    /global scope must be "contract_package"/i,
  );
});

test("valid global does not alter flow behavior inputs, gates, or terminal shape", async () => {
  const fixtureDir = await copyFixture("package-global-behavior");
  const loadedWithGlobal = await loadContractRegistrationSource(fixtureDir);

  const noGlobalDir = await copyFixture("package-global-behavior-noglobal");
  const noGlobalManifestPath = path.join(noGlobalDir, "manifest.json");
  const noGlobalManifest = JSON.parse(await fs.readFile(noGlobalManifestPath, "utf8")) as Record<string, unknown>;
  delete noGlobalManifest.global_ref;
  await fs.writeFile(noGlobalManifestPath, JSON.stringify(noGlobalManifest, null, 2));
  const loadedWithoutGlobal = await loadContractRegistrationSource(noGlobalDir);

  assert.deepEqual(loadedWithGlobal.flow_json, loadedWithoutGlobal.flow_json);
  assert.equal(assertNoSystemContractCalls(loadedWithGlobal.flow_json, "req-behavior"), null);
  assert.equal(assertNoInlineClassDefinition(loadedWithGlobal.flow_json, "req-behavior"), null);
  assert.equal(assertFlowGraphValid(loadedWithGlobal.flow_json, "req-behavior"), null);
  assert.equal(assertStepModesValid(loadedWithGlobal.flow_json, "req-behavior"), null);
  assert.equal(assertNoUnknownFlowFields(loadedWithGlobal.flow_json, "req-behavior"), null);
});

async function copyFixture(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  await fs.cp(FIXTURE_DIR, dir, { recursive: true });
  return dir;
}
