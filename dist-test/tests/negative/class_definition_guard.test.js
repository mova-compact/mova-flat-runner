// SECURITY (CFV-10): regression tests for inline-class-definition guard.
//
// Invariant under test:
//   Class definitions must come from the registry (resolved by class_id),
//   never from the flow body. A flow with class_definition / class_definition_inline
//   / class_def_override / class_def at the top level is refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNoInlineClassDefinition, findInlineClassDefinitionFields, FORBIDDEN_FLOW_KEYS, } from "../../src/security/class_definition_guard.js";
import { ERR } from "../../src/types.js";
// ── Test 1 — class_definition_inline is refused ───────────────────────────────
test("CFV-10: refuses flow with class_definition_inline", () => {
    const flow = {
        version: "1.0",
        entry: "a",
        steps: [{ id: "a", execution_mode: "DETERMINISTIC" }],
        class_definition_inline: {
            class_id: "contract_flow_vulnerabilities",
            severity: { escalate_bands: ["critical", "high", "medium", "low"] },
            optics: { noise_control: { forbidden_outputs: [] } },
        },
    };
    const r = assertNoInlineClassDefinition(flow, "req-1");
    assert.notEqual(r, null);
    assert.equal(r.ok, false);
    if (r.ok)
        throw new Error("impossible");
    assert.equal(r.error, ERR.INLINE_CLASS_DEFINITION_FORBIDDEN);
    const details = r.details;
    assert.deepEqual(details.forbidden_fields, ["class_definition_inline"]);
    assert.equal(details.http_status_equivalent, 400);
});
// ── Test 2 — class_definition top-level field is refused ──────────────────────
test("CFV-10: refuses flow with class_definition top-level field", () => {
    const flow = { steps: [], class_definition: { class_id: "x" } };
    const r = assertNoInlineClassDefinition(flow, "req-2");
    assert.notEqual(r, null);
});
// ── Test 3 — clean flow passes through ────────────────────────────────────────
test("CFV-10: clean flow passes the guard", () => {
    const flow = {
        version: "1.0",
        entry: "a",
        steps: [{ id: "a", execution_mode: "DETERMINISTIC" }],
    };
    assert.equal(assertNoInlineClassDefinition(flow, "req-3"), null);
});
// ── Test 4 — multiple forbidden fields all reported ───────────────────────────
test("CFV-10: multiple forbidden fields are all reported", () => {
    const flow = {
        steps: [],
        class_definition: { x: 1 },
        class_definition_inline: { y: 2 },
        class_def_override: { z: 3 },
    };
    const found = findInlineClassDefinitionFields(flow);
    assert.deepEqual(found.sort(), ["class_def_override", "class_definition", "class_definition_inline"]);
});
// ── Test 5 — null/empty/non-object flow is not a violation ────────────────────
test("CFV-10: malformed flow is not a violation (defensive)", () => {
    assert.deepEqual(findInlineClassDefinitionFields(null), []);
    assert.deepEqual(findInlineClassDefinitionFields(undefined), []);
    assert.deepEqual(findInlineClassDefinitionFields("string"), []);
    assert.deepEqual(findInlineClassDefinitionFields(42), []);
    assert.deepEqual(findInlineClassDefinitionFields({}), []);
});
// ── Test 6 — class_id alone is fine (it's a reference, not a definition) ──────
test("CFV-10: class_id reference is fine — only definitions are blocked", () => {
    const flow = { class_id: "contract_flow_vulnerabilities", steps: [] };
    assert.equal(assertNoInlineClassDefinition(flow, "req-6"), null);
});
// ── Test 7 — guard list is frozen and sealed (no accidental drift) ────────────
test("CFV-10: forbidden-keys list is frozen", () => {
    assert.ok(Object.isFrozen(FORBIDDEN_FLOW_KEYS));
    assert.ok(FORBIDDEN_FLOW_KEYS.includes("class_definition"));
    assert.ok(FORBIDDEN_FLOW_KEYS.includes("class_definition_inline"));
});
