// SECURITY (CFV-2): regression tests for the step-mode/content-field guard.
//
// Invariant under test:
//   A step's declared execution_mode must agree with the content fields
//   present on the step:
//     DETERMINISTIC must NOT have a model field
//     AI_ATOMIC must have a model field
//     CONTRACT_CALL must have a contract_id
//     HUMAN_GATE must have a decision_options array
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertStepModesValid, findStepModeViolations } from "../../src/security/step_mode_guard.js";
import { ERR } from "../../src/types.js";
// ── Test 1 — DET with model field is refused ──────────────────────────────────
test("CFV-2: DETERMINISTIC step with model field is refused", () => {
    const flow = {
        steps: [
            {
                id: "a",
                execution_mode: "DETERMINISTIC",
                model: "anthropic:sonnet",
                next: { default: { terminal: "done" } },
            },
        ],
    };
    const r = assertStepModesValid(flow, "req-1");
    assert.notEqual(r, null);
    assert.equal(r.ok, false);
    if (r.ok)
        throw new Error("impossible");
    assert.equal(r.error, ERR.STEP_MODE_FIELD_MISMATCH);
    const details = r.details;
    assert.equal(details.http_status_equivalent, 400);
    assert.equal(details.violations.length, 1);
    assert.equal(details.violations[0].kind, "deterministic_with_model");
    assert.equal(details.violations[0].step_id, "a");
});
// ── Test 2 — DET without model field passes ───────────────────────────────────
test("CFV-2: DETERMINISTIC step without model passes", () => {
    const flow = {
        steps: [{ id: "a", execution_mode: "DETERMINISTIC" }],
    };
    assert.equal(assertStepModesValid(flow, "req-2"), null);
});
// ── Test 3 — AI_ATOMIC needs model ────────────────────────────────────────────
test("CFV-2: AI_ATOMIC without model is flagged", () => {
    const flow = { steps: [{ id: "a", execution_mode: "AI_ATOMIC" }] };
    const v = findStepModeViolations(flow);
    assert.equal(v.length, 1);
    assert.equal(v[0].kind, "ai_atomic_without_model");
});
test("CFV-2: AI_ATOMIC with model passes", () => {
    const flow = { steps: [{ id: "a", execution_mode: "AI_ATOMIC", model: "anthropic:haiku" }] };
    assert.equal(assertStepModesValid(flow, "req-3"), null);
});
// ── Test 4 — CONTRACT_CALL needs contract_id ──────────────────────────────────
test("CFV-2: CONTRACT_CALL without contract_id is flagged", () => {
    const flow = { steps: [{ id: "a", execution_mode: "CONTRACT_CALL" }] };
    const v = findStepModeViolations(flow);
    assert.equal(v.length, 1);
    assert.equal(v[0].kind, "contract_call_without_contract_id");
});
test("CFV-2: CONTRACT_CALL with contract_id passes", () => {
    const flow = { steps: [{ id: "a", execution_mode: "CONTRACT_CALL", contract_id: "my-flow-v1" }] };
    assert.equal(assertStepModesValid(flow, "req-4"), null);
});
// ── Test 5 — HUMAN_GATE needs decision_options ────────────────────────────────
test("CFV-2: HUMAN_GATE without decision_options is flagged", () => {
    const flow = { steps: [{ id: "a", execution_mode: "HUMAN_GATE" }] };
    const v = findStepModeViolations(flow);
    assert.equal(v.length, 1);
    assert.equal(v[0].kind, "human_gate_without_decisions");
});
test("CFV-2: HUMAN_GATE with decision_options passes", () => {
    const flow = {
        steps: [{ id: "a", execution_mode: "HUMAN_GATE", decision_options: [{ id: "approve" }] }],
    };
    assert.equal(assertStepModesValid(flow, "req-5"), null);
});
// ── Test 6 — unknown mode is flagged ──────────────────────────────────────────
test("CFV-2: unknown execution_mode is flagged", () => {
    const flow = { steps: [{ id: "a", execution_mode: "BACKDOOR_MODE" }] };
    const v = findStepModeViolations(flow);
    assert.equal(v.length, 1);
    assert.equal(v[0].kind, "unknown_mode");
});
// ── Test 7 — multiple violations all reported ─────────────────────────────────
test("CFV-2: multiple violations are all reported", () => {
    const flow = {
        steps: [
            { id: "a", execution_mode: "DETERMINISTIC", model: "x" },
            { id: "b", execution_mode: "AI_ATOMIC" },
            { id: "c", execution_mode: "CONTRACT_CALL" },
            { id: "d", execution_mode: "HUMAN_GATE" },
            { id: "e", execution_mode: "WHO_KNOWS" },
        ],
    };
    const v = findStepModeViolations(flow);
    assert.equal(v.length, 5);
    assert.deepEqual(v.map((x) => x.kind).sort(), [
        "ai_atomic_without_model",
        "contract_call_without_contract_id",
        "deterministic_with_model",
        "human_gate_without_decisions",
        "unknown_mode",
    ]);
});
// ── Test 8 — parallel_steps walked too ────────────────────────────────────────
test("CFV-2: parallel_steps are walked", () => {
    const flow = {
        steps: [{ id: "a", execution_mode: "DETERMINISTIC" }],
        parallel_steps: [{ id: "p1", execution_mode: "DETERMINISTIC", model: "x" }],
    };
    const v = findStepModeViolations(flow);
    assert.equal(v.length, 1);
    assert.equal(v[0].step_id, "p1");
});
// ── Test 9 — malformed flow is not a violation ────────────────────────────────
test("CFV-2: malformed flow yields no violations (defensive)", () => {
    assert.deepEqual(findStepModeViolations(null), []);
    assert.deepEqual(findStepModeViolations(undefined), []);
    assert.deepEqual(findStepModeViolations({}), []);
    assert.deepEqual(findStepModeViolations({ steps: "not-an-array" }), []);
});
// ── Test 10 — step without execution_mode is not flagged here ─────────────────
test("CFV-2: step without execution_mode is graph_guard's problem, not ours", () => {
    const flow = { steps: [{ id: "a" }] };
    assert.deepEqual(findStepModeViolations(flow), []);
});
