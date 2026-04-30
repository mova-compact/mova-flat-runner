import { test } from "node:test";
import assert from "node:assert/strict";

import { CONTRACT_MANIFESTS } from "../../src/schemas.js";
import { validateDataSpec, validateFlowShape } from "../../src/validation/dataspec.js";
import { VALIDATOR_REGISTRY } from "../../src/validators/registry.js";

const manifest = CONTRACT_MANIFESTS.content_flywheel;

test("content_flywheel manifest is registered", () => {
  assert.ok(manifest, "content_flywheel manifest missing");
  assert.equal(manifest.contract_type, "content_flywheel");
  assert.equal(manifest.execution_mode, "human_gated");
});

test("content_flywheel manifest uses the supported analyze->verify->decide shape", () => {
  assert.equal(validateFlowShape(manifest.steps as unknown[]).ok, true);
});

test("content_flywheel manifest exposes the publication approval boundary", () => {
  const options = manifest.decision_options.map((option) => option.option_id);
  assert.deepEqual(options.slice(0, 3), [
    "APPROVED_FOR_PUBLICATION",
    "APPROVED_WITH_EDITS",
    "APPROVED_FOR_SCHEDULED_PUBLICATION",
  ]);
  for (const blocked of [
    "NEEDS_REWRITE",
    "RISK_REVIEW_REQUIRED",
    "OFF_STRATEGY",
    "TOO_HYPE",
    "TOO_TECHNICAL_FOR_LAYER",
    "NO_GO",
  ]) {
    assert.ok(options.includes(blocked), `missing blocked publication status ${blocked}`);
  }
});

test("content_flywheel DataSpec accepts a representative integration request", () => {
  const result = validateDataSpec(
    {
      business_context: "MOVA content system for compact contract-pack onboarding",
      target_audience: "MOVA operators and product-minded builders",
      flywheel_layer: "LAYER_03_REVENUE_PROCESS_METHOD",
      content_goal: "Create a draft that turns a Contract Candidate into the next qualified action",
      topic_seed: "One process. One leak. One AI leverage point.",
      platform: "site article",
      format: "article",
      route_intent: "PRODUCT_CREATION_WITH_CONTRACT_CODING",
    },
    manifest.dataspec.inputs,
  );
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test("content_flywheel validator is registered and enriches analysis", () => {
  const fn = VALIDATOR_REGISTRY.get("content_flywheel.validate_intent_v0");
  assert.ok(fn, "content_flywheel validator missing");
  const result = fn!({
    flywheel_layer: "LAYER_04_MOVA_ECOSYSTEM_FORK",
    route_intent: "BUSINESS_AUTOMATION_WITH_CONTRACTS",
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.flywheel_layer_known, true);
  assert.equal(result.value.flywheel_layer_index, 4);
  assert.equal(result.value.route_intent_known, true);
  assert.equal(result.value.human_review_required, true);
  assert.equal(result.value.publication_allowed, false);
});

