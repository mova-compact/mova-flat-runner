// SECURITY (CFV-9): regression tests for the strict top-level flow schema.
//
// Invariant under test:
//   Flows have a strict top-level schema. Unknown keys are refused so that
//   attackers cannot smuggle privilege-elevation hints (__admin_override,
//   __privilege_grant, __debug_mode) that future runtime code paths might read.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoUnknownFlowFields,
  findUnknownFlowFields,
  ALLOWED_FLOW_TOP_LEVEL_KEYS,
} from "../../src/security/flow_schema_guard.js";
import { ERR } from "../../src/types.js";

// ── Test 1 — smuggling fields are refused ─────────────────────────────────────
test("CFV-9: __admin_override / __privilege_grant / __debug_mode refused", () => {
  const flow = {
    version: "1.0",
    entry: "a",
    steps: [{ id: "a", execution_mode: "DETERMINISTIC" }],
    __admin_override: { skip_auth: true },
    __privilege_grant: ["read_all_orgs"],
    __debug_mode: true,
  };
  const r = assertNoUnknownFlowFields(flow, "req-1");
  assert.notEqual(r, null);
  assert.equal(r!.ok, false);
  if (r!.ok) throw new Error("impossible");
  assert.equal(r!.error, ERR.UNKNOWN_FLOW_FIELD);
  const details = r!.details as { unknown_fields: string[]; http_status_equivalent: number };
  assert.equal(details.http_status_equivalent, 400);
  assert.deepEqual(details.unknown_fields.sort(), ["__admin_override", "__debug_mode", "__privilege_grant"]);
});

// ── Test 2 — clean flow passes ────────────────────────────────────────────────
test("CFV-9: well-formed flow passes the schema guard", () => {
  const flow = {
    version: "1.0",
    description: "hello",
    entry: "a",
    steps: [{ id: "a", execution_mode: "DETERMINISTIC" }],
    parallel_steps: [],
    notes: "anything",
    audit_mode: "blackbox",
    metadata: { author: "x" },
  };
  assert.equal(assertNoUnknownFlowFields(flow, "req-2"), null);
});

// ── Test 3 — every documented allowed key passes ──────────────────────────────
test("CFV-9: every allowed key passes individually", () => {
  for (const key of ALLOWED_FLOW_TOP_LEVEL_KEYS) {
    const flow = { [key]: "x" };
    assert.deepEqual(findUnknownFlowFields(flow), [], `key '${key}' should be allowed`);
  }
});

// ── Test 4 — typo / camelCase variants of allowed keys are flagged ────────────
test("CFV-9: typo of an allowed key (e.g. 'Steps' vs 'steps') is flagged", () => {
  // Strict means strict — case sensitive, no auto-correct.
  const flow = { Steps: [], Parallel_Steps: [] };
  const v = findUnknownFlowFields(flow);
  assert.deepEqual(v.sort(), ["Parallel_Steps", "Steps"]);
});

// ── Test 5 — empty / null flow yields no violations ───────────────────────────
test("CFV-9: empty / null / undefined flow yields no violations", () => {
  assert.deepEqual(findUnknownFlowFields({}), []);
  assert.deepEqual(findUnknownFlowFields(null), []);
  assert.deepEqual(findUnknownFlowFields(undefined), []);
});

// ── Test 6 — non-object flow yields no violations ─────────────────────────────
test("CFV-9: non-object flow yields no violations", () => {
  assert.deepEqual(findUnknownFlowFields(42), []);
  assert.deepEqual(findUnknownFlowFields("string"), []);
  assert.deepEqual(findUnknownFlowFields([1, 2, 3]), []);
});

// ── Test 7 — error envelope shape ─────────────────────────────────────────────
test("CFV-9: error envelope includes the allowed list for caller context", () => {
  const r = assertNoUnknownFlowFields({ steps: [], evil: 1 }, "req-3");
  assert.notEqual(r, null);
  if (r!.ok) throw new Error("impossible");
  const details = r!.details as { allowed_fields: string[] };
  assert.ok(Array.isArray(details.allowed_fields));
  assert.ok(details.allowed_fields.includes("steps"));
});
