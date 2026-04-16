import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDataSpec } from "../../src/validation/dataspec.js";
import { VALIDATOR_REGISTRY } from "../../src/validators/registry.js";
import { ERR, flatErr } from "../../src/types.js";
// ── Malicious / edge-case inputs ──────────────────────────────────────────────
test("validateDataSpec — XSS string in URL field rejected", () => {
    const fields = [{ field: "url", type: "string", format: "uri", required: true, description: "" }];
    const r = validateDataSpec({ url: "javascript:alert(1)" }, fields);
    assert.equal(r.ok, false);
});
test("validateDataSpec — empty string treated as missing for required", () => {
    const fields = [{ field: "name", type: "string", required: true, description: "" }];
    const r = validateDataSpec({ name: "" }, fields);
    assert.equal(r.ok, false);
});
test("validateDataSpec — null treated as missing for required", () => {
    const fields = [{ field: "name", type: "string", required: true, description: "" }];
    const r = validateDataSpec({ name: null }, fields);
    assert.equal(r.ok, false);
});
test("validateDataSpec — NaN rejected as number", () => {
    const fields = [{ field: "score", type: "number", required: true, description: "" }];
    const r = validateDataSpec({ score: NaN }, fields);
    assert.equal(r.ok, false);
});
test("validateDataSpec — multiple errors reported together", () => {
    const fields = [
        { field: "url", type: "string", format: "uri", required: true, description: "" },
        { field: "score", type: "number", required: true, description: "" },
        { field: "fw", type: "string", required: true, description: "", enum: ["a", "b"] },
    ];
    const r = validateDataSpec({ url: "http://x.com", score: "bad", fw: "c" }, fields);
    assert.equal(r.ok, false);
    assert.equal(r.errors.length, 3);
});
// ── Validator registry — unknown id ──────────────────────────────────────────
test("VALIDATOR_REGISTRY — unknown id returns undefined (not executable)", () => {
    assert.equal(VALIDATOR_REGISTRY.get("evil.arbitrary_code_v0"), undefined);
    assert.equal(VALIDATOR_REGISTRY.get("../../../etc/passwd"), undefined);
    assert.equal(VALIDATOR_REGISTRY.get(""), undefined);
    assert.equal(VALIDATOR_REGISTRY.get("() => process.exit(1)"), undefined);
});
// ── flatErr — error envelope ──────────────────────────────────────────────────
test("flatErr — produces correct structure", () => {
    const r = flatErr(ERR.LOCAL_VALIDATION_FAILED, "bad input", { field: "x" }, false, "req-123");
    assert.equal(r.ok, false);
    if (r.ok)
        throw new Error("impossible");
    assert.equal(r.error, "LOCAL_VALIDATION_FAILED");
    assert.equal(r.message, "bad input");
    assert.deepEqual(r.details, { field: "x" });
    assert.equal(r.request_id, "req-123");
});
test("flatErr — retryable flag", () => {
    const r = flatErr(ERR.API_TIMEOUT, "timeout", undefined, true);
    if (r.ok)
        throw new Error("impossible");
    assert.equal(r.retryable, true);
});
test("flatErr — no extra keys when details omitted", () => {
    const r = flatErr(ERR.CONFIG_MISSING, "no key");
    if (r.ok)
        throw new Error("impossible");
    assert.equal("details" in r, false);
    assert.equal("request_id" in r, false);
});
// ── ERR codes completeness ────────────────────────────────────────────────────
test("ERR — all codes are non-empty strings", () => {
    for (const [key, val] of Object.entries(ERR)) {
        assert.equal(typeof val, "string", `ERR.${key} is not a string`);
        assert.ok(val.length > 0, `ERR.${key} is empty`);
    }
});
test("ERR — codes match their key names (no silent renames)", () => {
    for (const [key, val] of Object.entries(ERR)) {
        assert.equal(key, val, `ERR.${key} value mismatch: "${val}"`);
    }
});
