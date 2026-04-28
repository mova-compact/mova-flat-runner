// SECURITY (CFV-3): regression tests for the HUMAN_GATE guard on step_complete.
//
// Invariant under test:
//   HUMAN_GATE cannot be completed by generic step completion.
//   Human confirmation requires the dedicated gate path.
//
// The guard is in-process (assertNotHumanGate). It runs BEFORE the network
// call to /run/.../complete, so a rejection cannot have advanced run state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNotHumanGate } from "../../src/security/gate_guard.js";
import { ERR } from "../../src/types.js";
const cfg = { apiKey: "test", baseUrl: "http://invalid.test", llmKey: "", llmModel: "" };
function makeFetcher(response, calls) {
    return async (_c, path) => {
        calls.push(path);
        return response;
    };
}
// ── Test 1 — step_complete cannot advance HUMAN_GATE ──────────────────────────
test("CFV-3: assertNotHumanGate refuses step_complete on HUMAN_GATE step", async () => {
    const calls = [];
    const fetcher = makeFetcher({
        run_id: "run_x",
        current_step: { step_id: "human_gate_step", execution_mode: "HUMAN_GATE", label: "approval" },
    }, calls);
    const result = await assertNotHumanGate(cfg, "run_x", "human_gate_step", "req-1", fetcher);
    assert.notEqual(result, null, "guard must reject HUMAN_GATE");
    const parsed = JSON.parse(result);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error, ERR.MUST_USE_GATE_APPROVE);
    assert.equal(parsed.details.run_id, "run_x");
    assert.equal(parsed.details.step_id, "human_gate_step");
    assert.equal(parsed.details.execution_mode, "HUMAN_GATE");
    assert.equal(parsed.details.http_status_equivalent, 409);
    // Only the status read, no other side-effecting call.
    assert.deepEqual(calls, ["/run/run_x/status"]);
});
// ── Test 2 — non-gate step_complete passes through ────────────────────────────
test("CFV-3: assertNotHumanGate allows DETERMINISTIC step_complete", async () => {
    const calls = [];
    const fetcher = makeFetcher({
        run_id: "run_y",
        current_step: { step_id: "noop", execution_mode: "DETERMINISTIC" },
    }, calls);
    const result = await assertNotHumanGate(cfg, "run_y", "noop", "req-2", fetcher);
    assert.equal(result, null, "non-gate steps must not be blocked");
});
test("CFV-3: assertNotHumanGate allows AI_ATOMIC step_complete", async () => {
    const fetcher = makeFetcher({ current_step: { step_id: "ai_step", execution_mode: "AI_ATOMIC" } }, []);
    const result = await assertNotHumanGate(cfg, "run_z", "ai_step", "req-3", fetcher);
    assert.equal(result, null);
});
// ── Test 3 — guard does not block when step_id mismatches current_step ────────
test("CFV-3: guard returns null when reported step_id does not match current_step", async () => {
    // If the runtime is already past the gate or never on it, current_step.step_id
    // will not match the user-supplied step_id. Don't synthesize a 409 in that case;
    // let the runtime return its own state-machine error.
    const fetcher = makeFetcher({ current_step: { step_id: "different_step", execution_mode: "HUMAN_GATE" } }, []);
    const result = await assertNotHumanGate(cfg, "run_q", "stale_step_id", "req-4", fetcher);
    assert.equal(result, null);
});
// ── Test 4 — fail-open on status fetch error / malformed response ─────────────
test("CFV-3: guard fails open when status fetch throws", async () => {
    const fetcher = async () => { throw new Error("network down"); };
    const result = await assertNotHumanGate(cfg, "run_r", "any_step", "req-5", fetcher);
    assert.equal(result, null, "fail-open: don't introduce a new failure mode for non-gate steps");
});
test("CFV-3: guard fails open when current_step missing from response", async () => {
    const fetcher = makeFetcher({ run_id: "run_s" }, []);
    const result = await assertNotHumanGate(cfg, "run_s", "any_step", "req-6", fetcher);
    assert.equal(result, null);
});
test("CFV-3: guard fails open when response is null/undefined", async () => {
    const fetcher = makeFetcher(null, []);
    const result = await assertNotHumanGate(cfg, "run_t", "any_step", "req-7", fetcher);
    assert.equal(result, null);
});
