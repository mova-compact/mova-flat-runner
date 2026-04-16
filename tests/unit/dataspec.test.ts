import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDataSpec, validateBackendOutput, validateFlowShape } from "../../src/validation/dataspec.js";
import type { DsField } from "../../src/schemas.js";

// ── validateDataSpec ──────────────────────────────────────────────────────────

const fields: DsField[] = [
  { field: "file_url",   type: "string",  format: "uri",  required: true,  description: "HTTPS URL" },
  { field: "framework",  type: "string",               required: true,  description: "gdpr etc", enum: ["gdpr", "pci_dss"] },
  { field: "score",      type: "number",               required: true,  description: "0-100" },
  { field: "active",     type: "boolean",              required: false, description: "flag" },
  { field: "items",      type: "array",                required: false, description: "list" },
  { field: "meta",       type: "object",               required: false, description: "obj" },
  { field: "country",    type: "string",  format: "iso-alpha-2", required: false, description: "ISO-2" },
  { field: "date",       type: "string",  format: "date",        required: false, description: "ISO date" },
];

test("validateDataSpec — valid inputs pass", () => {
  const r = validateDataSpec({ file_url: "https://example.com/doc.pdf", framework: "gdpr", score: 80 }, fields);
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
});

test("validateDataSpec — required string missing", () => {
  const r = validateDataSpec({ framework: "gdpr", score: 80 }, fields);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === "file_url" && e.error.includes("required")));
});

test("validateDataSpec — non-HTTPS URL rejected", () => {
  const r = validateDataSpec({ file_url: "http://example.com/doc.pdf", framework: "gdpr", score: 80 }, fields);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === "file_url" && e.error.includes("HTTPS")));
});

test("validateDataSpec — enum violation", () => {
  const r = validateDataSpec({ file_url: "https://x.com/f", framework: "iso_27001", score: 80 }, fields);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === "framework"));
});

test("validateDataSpec — wrong type number→string", () => {
  const r = validateDataSpec({ file_url: "https://x.com/f", framework: "gdpr", score: "not-a-number" }, fields);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === "score" && e.error.includes("number")));
});

test("validateDataSpec — optional missing is ok", () => {
  const r = validateDataSpec({ file_url: "https://x.com/f", framework: "gdpr", score: 50 }, fields);
  assert.equal(r.ok, true);
});

test("validateDataSpec — boolean wrong type", () => {
  const r = validateDataSpec({ file_url: "https://x.com/f", framework: "gdpr", score: 50, active: "yes" }, fields);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === "active"));
});

test("validateDataSpec — array wrong type", () => {
  const r = validateDataSpec({ file_url: "https://x.com/f", framework: "gdpr", score: 50, items: "not-array" }, fields);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === "items"));
});

test("validateDataSpec — object wrong type (array passed)", () => {
  const r = validateDataSpec({ file_url: "https://x.com/f", framework: "gdpr", score: 50, meta: [1, 2] }, fields);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === "meta"));
});

test("validateDataSpec — ISO alpha-2 invalid", () => {
  const r = validateDataSpec({ file_url: "https://x.com/f", framework: "gdpr", score: 50, country: "germany" }, fields);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === "country"));
});

test("validateDataSpec — ISO date invalid", () => {
  const r = validateDataSpec({ file_url: "https://x.com/f", framework: "gdpr", score: 50, date: "01/01/2026" }, fields);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === "date"));
});

test("validateDataSpec — ISO date valid", () => {
  const r = validateDataSpec({ file_url: "https://x.com/f", framework: "gdpr", score: 50, date: "2026-04-16" }, fields);
  assert.equal(r.ok, true);
});

// ── validateBackendOutput ─────────────────────────────────────────────────────

test("validateBackendOutput — valid object passes", () => {
  assert.equal(validateBackendOutput({ vendor: "ACME", total: 100 }).ok, true);
});

test("validateBackendOutput — null fails", () => {
  assert.equal(validateBackendOutput(null).ok, false);
});

test("validateBackendOutput — array fails", () => {
  assert.equal(validateBackendOutput([1, 2, 3]).ok, false);
});

test("validateBackendOutput — string fails", () => {
  assert.equal(validateBackendOutput("raw string").ok, false);
});

test("validateBackendOutput — oversized fails", () => {
  const huge = { data: "x".repeat(250_000) };
  assert.equal(validateBackendOutput(huge).ok, false);
});

// ── validateFlowShape ─────────────────────────────────────────────────────────

const goodSteps = [
  { step_id: "analyze", step_type: "ai_task" },
  { step_id: "verify",  step_type: "verification" },
  { step_id: "decide",  step_type: "decision_point" },
];

test("validateFlowShape — valid flow passes", () => {
  assert.equal(validateFlowShape(goodSteps).ok, true);
});

test("validateFlowShape — missing analyze fails", () => {
  const steps = goodSteps.filter(s => s.step_id !== "analyze");
  const r = validateFlowShape(steps);
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes("analyze"));
});

test("validateFlowShape — missing decide fails", () => {
  const steps = goodSteps.filter(s => s.step_id !== "decide");
  assert.equal(validateFlowShape(steps).ok, false);
});

test("validateFlowShape — unknown step_type fails", () => {
  const steps = [...goodSteps, { step_id: "custom", step_type: "webhook_call" }];
  const r = validateFlowShape(steps);
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes("webhook_call"));
});
