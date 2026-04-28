// SECURITY (CFV-11): regression tests for the system-contract-call guard.
//
// Invariant under test:
//   User-supplied flows must not invoke system contracts via CONTRACT_CALL.
//   The runtime treats system contracts as platform-trusted; allowing user
//   flows to call them lets a user escalate beyond their privilege boundary.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoSystemContractCalls,
  findSystemContractViolations,
  loadSystemContractAllowList,
} from "../../src/security/system_contract_guard.js";
import { ERR } from "../../src/types.js";

const ALLOW = new Set(["triage-security-findings-v0", "verify-finding-candidates-v0"]);

// ── Test 1 — CONTRACT_CALL → system contract is refused ───────────────────────
test("CFV-11: assertNoSystemContractCalls refuses user flow calling system contract", () => {
  const flow = {
    version: "1.0",
    entry: "call_system",
    steps: [
      {
        id: "call_system",
        execution_mode: "CONTRACT_CALL",
        contract_id: "triage-security-findings-v0",
        next: { default: { terminal: "done" } },
      },
    ],
  };

  const result = assertNoSystemContractCalls(flow, "req-1", ALLOW);
  assert.notEqual(result, null);
  assert.equal(result!.ok, false);
  if (result!.ok) throw new Error("impossible");
  assert.equal(result!.error, ERR.SYSTEM_CONTRACT_NOT_INVOKABLE);
  const details = result!.details as { violations: unknown[]; http_status_equivalent: number };
  assert.equal(details.http_status_equivalent, 403);
  assert.equal(details.violations.length, 1);
  assert.deepEqual(details.violations[0], {
    step_id: "call_system",
    contract_id: "triage-security-findings-v0",
    execution_mode: "CONTRACT_CALL",
  });
});

// ── Test 2 — Flow with non-system CONTRACT_CALL passes through ────────────────
test("CFV-11: assertNoSystemContractCalls accepts user flow calling user contract", () => {
  const flow = {
    steps: [
      { id: "a", execution_mode: "CONTRACT_CALL", contract_id: "my-helper-v1" },
    ],
  };
  assert.equal(assertNoSystemContractCalls(flow, "req-2", ALLOW), null);
});

// ── Test 3 — DETERMINISTIC steps don't trip the guard regardless of contract_id ─
test("CFV-11: DETERMINISTIC step with stray contract_id field is not a violation", () => {
  // Defensive: a DET step that happens to have a contract_id field should not be
  // flagged. Only execution_mode === "CONTRACT_CALL" matters.
  const flow = {
    steps: [
      { id: "a", execution_mode: "DETERMINISTIC", contract_id: "triage-security-findings-v0" },
    ],
  };
  assert.equal(assertNoSystemContractCalls(flow, "req-3", ALLOW), null);
});

// ── Test 4 — guard walks parallel_steps too ───────────────────────────────────
test("CFV-11: guard visits parallel_steps", () => {
  const flow = {
    steps: [{ id: "a", execution_mode: "DETERMINISTIC" }],
    parallel_steps: [
      { id: "p1", execution_mode: "CONTRACT_CALL", contract_id: "verify-finding-candidates-v0" },
    ],
  };
  const v = findSystemContractViolations(flow, ALLOW);
  assert.equal(v.length, 1);
  assert.equal(v[0]!.step_id, "p1");
  assert.equal(v[0]!.contract_id, "verify-finding-candidates-v0");
});

// ── Test 5 — multiple violations are all reported ─────────────────────────────
test("CFV-11: multiple system-contract calls are all reported", () => {
  const flow = {
    steps: [
      { id: "a", execution_mode: "CONTRACT_CALL", contract_id: "triage-security-findings-v0" },
      { id: "b", execution_mode: "CONTRACT_CALL", contract_id: "verify-finding-candidates-v0" },
      { id: "c", execution_mode: "DETERMINISTIC" },
    ],
  };
  const v = findSystemContractViolations(flow, ALLOW);
  assert.equal(v.length, 2);
  assert.deepEqual(v.map((x) => x.step_id), ["a", "b"]);
});

// ── Test 6 — empty / malformed flow returns no violations (defensive) ─────────
test("CFV-11: empty flow / null / undefined yields no violations", () => {
  assert.deepEqual(findSystemContractViolations({}, ALLOW), []);
  assert.deepEqual(findSystemContractViolations(null, ALLOW), []);
  assert.deepEqual(findSystemContractViolations(undefined, ALLOW), []);
  assert.deepEqual(findSystemContractViolations({ steps: [] }, ALLOW), []);
  assert.deepEqual(findSystemContractViolations({ steps: "not-an-array" }, ALLOW), []);
});

// ── Test 7 — step without contract_id is not flagged ──────────────────────────
test("CFV-11: CONTRACT_CALL step without contract_id is not a violation", () => {
  // A malformed CONTRACT_CALL with no target is a different bug; not ours to flag.
  const flow = {
    steps: [{ id: "a", execution_mode: "CONTRACT_CALL" }],
  };
  assert.deepEqual(findSystemContractViolations(flow, ALLOW), []);
});

// ── Test 8 — env override: empty MOVA_SYSTEM_CONTRACTS disables defaults ──────
test("CFV-11: loadSystemContractAllowList respects empty env override", () => {
  const set = loadSystemContractAllowList({ MOVA_SYSTEM_CONTRACTS: "" } as NodeJS.ProcessEnv);
  assert.equal(set.size, 0);
});

test("CFV-11: loadSystemContractAllowList parses comma-separated env override", () => {
  const set = loadSystemContractAllowList({ MOVA_SYSTEM_CONTRACTS: "a, b ,c" } as NodeJS.ProcessEnv);
  assert.deepEqual([...set].sort(), ["a", "b", "c"]);
});

test("CFV-11: loadSystemContractAllowList default contains the audit-pipeline contracts", () => {
  const set = loadSystemContractAllowList({} as NodeJS.ProcessEnv);
  assert.ok(set.has("triage-security-findings-v0"));
  assert.ok(set.has("verify-finding-candidates-v0"));
  assert.ok(set.has("prove-vulnerability-v0"));
});

// ── Test 9 — version-shape changes (with/without -vN suffix) ──────────────────
test("CFV-11: matching is exact — different version suffix is not blocked", () => {
  // The allow-list is exact. If the platform later versions a system contract,
  // both strings must be added. This test pins that contract.
  const set = new Set(["triage-security-findings-v0"]);
  const flow = {
    steps: [{ id: "a", execution_mode: "CONTRACT_CALL", contract_id: "triage-security-findings-v1" }],
  };
  assert.deepEqual(findSystemContractViolations(flow, set), []);
});
