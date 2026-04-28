// SECURITY (CFV-1 + CFV-4): regression tests for the flow graph validator.
//
// Invariants under test:
//   - self-loop (next → same step) is rejected
//   - dangling next (target step not in flow.steps) is rejected
//   - cycle (multi-step) is rejected
//   - flow with step count > maxSteps is rejected (size cap)
//   - duplicate step ids are flagged
//   - missing entry is flagged
//   - clean flows pass

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertFlowGraphValid,
  validateFlowGraph,
  loadMaxSteps,
} from "../../src/security/graph_guard.js";
import { ERR } from "../../src/types.js";

const MAX = 200;

// ── Test 1 — CFV-1a self-loop is rejected ─────────────────────────────────────
test("CFV-1: self-loop is detected", () => {
  const flow = {
    version: "1.0",
    entry: "loop",
    steps: [
      { id: "loop", execution_mode: "DETERMINISTIC", next: { default: "loop" } },
    ],
  };
  const v = validateFlowGraph(flow, MAX);
  assert.equal(v.length, 1);
  assert.equal(v[0]!.kind, "self_loop");
  assert.equal(v[0]!.step_id, "loop");
  assert.equal(v[0]!.outcome, "default");
});

// ── Test 2 — CFV-1b dangling next is rejected ─────────────────────────────────
test("CFV-1: dangling next is detected", () => {
  const flow = {
    version: "1.0",
    entry: "a",
    steps: [
      { id: "a", execution_mode: "DETERMINISTIC", next: { default: "ghost_step_does_not_exist" } },
    ],
  };
  const v = validateFlowGraph(flow, MAX);
  assert.equal(v.length, 1);
  assert.equal(v[0]!.kind, "dangling_next");
  assert.equal(v[0]!.target, "ghost_step_does_not_exist");
});

// ── Test 3 — CFV-1c cycle is rejected ─────────────────────────────────────────
test("CFV-1: 3-step cycle is detected", () => {
  const flow = {
    version: "1.0",
    entry: "a",
    steps: [
      { id: "a", execution_mode: "DETERMINISTIC", next: { default: "b" } },
      { id: "b", execution_mode: "DETERMINISTIC", next: { default: "c" } },
      { id: "c", execution_mode: "DETERMINISTIC", next: { default: "a" } },
    ],
  };
  const v = validateFlowGraph(flow, MAX);
  assert.ok(v.some((x) => x.kind === "cycle"), "must report cycle");
});

// ── Test 4 — CFV-4 size cap ───────────────────────────────────────────────────
test("CFV-4: flow exceeding size cap is rejected", () => {
  const steps: Array<{ id: string; execution_mode: string; next: Record<string, unknown> }> = [];
  for (let i = 0; i < 250; i++) {
    steps.push({
      id: `s${i}`,
      execution_mode: "DETERMINISTIC",
      next: { default: i < 249 ? `s${i + 1}` : { terminal: "done" } },
    });
  }
  const flow = { version: "1.0", entry: "s0", steps };
  const v = validateFlowGraph(flow, MAX);
  assert.ok(v.some((x) => x.kind === "size_limit"), "must flag size cap");
});

test("CFV-4: flow exactly at the cap is accepted", () => {
  const steps: Array<{ id: string; execution_mode: string; next: Record<string, unknown> }> = [];
  for (let i = 0; i < MAX; i++) {
    steps.push({
      id: `s${i}`,
      execution_mode: "DETERMINISTIC",
      next: { default: i < MAX - 1 ? `s${i + 1}` : { terminal: "done" } },
    });
  }
  const flow = { version: "1.0", entry: "s0", steps };
  const v = validateFlowGraph(flow, MAX);
  assert.equal(v.length, 0);
});

// ── Test 5 — clean flow passes ────────────────────────────────────────────────
test("CFV-1+4: clean flow passes the validator", () => {
  const flow = {
    version: "1.0",
    entry: "a",
    steps: [
      { id: "a", execution_mode: "DETERMINISTIC", next: { default: "b" } },
      { id: "b", execution_mode: "DETERMINISTIC", next: { default: { terminal: "ok" } } },
    ],
  };
  assert.equal(assertFlowGraphValid(flow, "req-1", MAX), null);
});

// ── Test 6 — assert wrapper produces FlatRunnerResult with right shape ────────
test("CFV-1: assertFlowGraphValid returns proper error envelope", () => {
  const flow = { version: "1.0", entry: "loop", steps: [{ id: "loop", next: { default: "loop" } }] };
  const r = assertFlowGraphValid(flow, "req-2", MAX);
  assert.notEqual(r, null);
  assert.equal(r!.ok, false);
  if (r!.ok) throw new Error("impossible");
  assert.equal(r!.error, ERR.FLOW_GRAPH_INVALID);
  const details = r!.details as { violations: unknown[]; http_status_equivalent: number; max_steps: number };
  assert.equal(details.http_status_equivalent, 400);
  assert.equal(details.max_steps, MAX);
  assert.ok(details.violations.length > 0);
});

// ── Test 7 — duplicate step ids ───────────────────────────────────────────────
test("CFV-1: duplicate step ids are flagged", () => {
  const flow = {
    steps: [
      { id: "a", execution_mode: "DETERMINISTIC" },
      { id: "a", execution_mode: "DETERMINISTIC" },
    ],
  };
  const v = validateFlowGraph(flow, MAX);
  assert.ok(v.some((x) => x.kind === "duplicate_step_id"));
});

// ── Test 8 — missing entry ────────────────────────────────────────────────────
test("CFV-1: entry not present in steps is flagged", () => {
  const flow = {
    entry: "ghost",
    steps: [{ id: "a", execution_mode: "DETERMINISTIC" }],
  };
  const v = validateFlowGraph(flow, MAX);
  assert.ok(v.some((x) => x.kind === "missing_entry"));
});

// ── Test 9 — terminal references are not edges ────────────────────────────────
test("CFV-1: terminal references do not count as dangling next", () => {
  const flow = {
    entry: "a",
    steps: [{ id: "a", execution_mode: "DETERMINISTIC", next: { default: { terminal: "done" } } }],
  };
  assert.deepEqual(validateFlowGraph(flow, MAX), []);
});

// ── Test 10 — multiple violations are all reported ────────────────────────────
test("CFV-1: multiple violations are all reported", () => {
  const flow = {
    entry: "missing",
    steps: [
      { id: "a", next: { default: "a" } },                  // self-loop
      { id: "b", next: { default: "ghost" } },              // dangling
      { id: "c", next: { default: "d" } },
      { id: "d", next: { default: "c" } },                  // cycle
    ],
  };
  const kinds = new Set(validateFlowGraph(flow, MAX).map((v) => v.kind));
  assert.ok(kinds.has("self_loop"));
  assert.ok(kinds.has("dangling_next"));
  assert.ok(kinds.has("cycle"));
  assert.ok(kinds.has("missing_entry"));
});

// ── Test 11 — env override for max steps ──────────────────────────────────────
test("CFV-4: loadMaxSteps respects env var", () => {
  assert.equal(loadMaxSteps({ MOVA_FLOW_MAX_STEPS: "50" } as NodeJS.ProcessEnv), 50);
  assert.equal(loadMaxSteps({} as NodeJS.ProcessEnv), 200);
  assert.equal(loadMaxSteps({ MOVA_FLOW_MAX_STEPS: "" } as NodeJS.ProcessEnv), 200);
  assert.equal(loadMaxSteps({ MOVA_FLOW_MAX_STEPS: "garbage" } as NodeJS.ProcessEnv), 200);
});

// ── Test 12 — null/empty flow is not a violation ──────────────────────────────
test("CFV-1: malformed flow returns no violations (defensive)", () => {
  assert.deepEqual(validateFlowGraph(null, MAX), []);
  assert.deepEqual(validateFlowGraph(undefined, MAX), []);
  assert.deepEqual(validateFlowGraph({}, MAX), []);
  assert.deepEqual(validateFlowGraph({ steps: [] }, MAX), []);
});

// ── Test 13 — parallel_steps participate in graph checks ──────────────────────
test("CFV-1: parallel_steps are walked too", () => {
  const flow = {
    steps: [{ id: "a", next: { default: "p1" } }],
    parallel_steps: [{ id: "p1", next: { default: "p1" } }], // self-loop in parallel
  };
  const v = validateFlowGraph(flow, MAX);
  assert.ok(v.some((x) => x.kind === "self_loop" && x.step_id === "p1"));
});
