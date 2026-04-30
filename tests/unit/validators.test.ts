import { test } from "node:test";
import assert from "node:assert/strict";
import { VALIDATOR_REGISTRY } from "../../src/validators/registry.js";

function run(id: string, inputs: Record<string, unknown>) {
  const fn = VALIDATOR_REGISTRY.get(id);
  assert.ok(fn, `Validator "${id}" not found in registry`);
  return fn(inputs);
}

// ── invoice ───────────────────────────────────────────────────────────────────

test("invoice.validate_totals_v0 — balanced totals pass", () => {
  const r = run("invoice.validate_totals_v0", { subtotal: 100, tax_amount: 20, total_amount: 120 });
  assert.equal(r.ok, true);
  assert.equal(r.value.totals_valid, true);
});

test("invoice.validate_totals_v0 — mismatch fails", () => {
  const r = run("invoice.validate_totals_v0", { subtotal: 100, tax_amount: 20, total_amount: 200 });
  assert.equal(r.value.totals_valid, false);
});

test("invoice.validate_dates_v0 — valid dates pass", () => {
  const r = run("invoice.validate_dates_v0", { invoice_date: "2026-01-01", due_date: "2026-02-01" });
  assert.equal(r.value.dates_valid, true);
});

test("invoice.validate_dates_v0 — due before invoice fails", () => {
  const r = run("invoice.validate_dates_v0", { invoice_date: "2026-03-01", due_date: "2026-01-01" });
  assert.equal(r.value.dates_valid, false);
  assert.equal(r.value.order_ok, false);
});

test("invoice.validate_dates_v0 — bad format fails", () => {
  const r = run("invoice.validate_dates_v0", { invoice_date: "01/01/2026", due_date: "2026-02-01" });
  assert.equal(r.value.dates_valid, false);
});

test("invoice.validate_amounts_v0 — positive amounts pass", () => {
  const r = run("invoice.validate_amounts_v0", { subtotal: 100, tax_amount: 20, total_amount: 120 });
  assert.equal(r.value.amounts_valid, true);
});

test("invoice.validate_amounts_v0 — zero subtotal fails", () => {
  const r = run("invoice.validate_amounts_v0", { subtotal: 0, tax_amount: 20, total_amount: 20 });
  assert.equal(r.value.amounts_valid, false);
});

// ── po ────────────────────────────────────────────────────────────────────────

test("po.validate_inputs_v0 — valid ids pass", () => {
  const r = run("po.validate_inputs_v0", { po_id: "PO-001", approver_employee_id: "EMP-001" });
  assert.equal(r.value.inputs_valid, true);
});

test("po.validate_inputs_v0 — too short fails", () => {
  const r = run("po.validate_inputs_v0", { po_id: "P", approver_employee_id: "EMP-001" });
  assert.equal(r.value.inputs_valid, false);
});

// ── trade ─────────────────────────────────────────────────────────────────────

test("trade.validate_limits_v0 — small trade passes", () => {
  const r = run("trade.validate_limits_v0", { leverage: 2, order_size_usd: 500 });
  assert.equal(r.value.limits_valid, true);
  assert.equal(r.value.hard_reject, false);
  assert.equal(r.value.mandatory_escalate, false);
});

test("trade.validate_limits_v0 — leverage > 10 hard rejects", () => {
  const r = run("trade.validate_limits_v0", { leverage: 15, order_size_usd: 1000 });
  assert.equal(r.value.hard_reject, true);
  assert.equal(r.value.hard_reject_reason, "leverage_exceeds_10x");
});

test("trade.validate_limits_v0 — large order mandatory escalate", () => {
  const r = run("trade.validate_limits_v0", { leverage: 1, order_size_usd: 50000 });
  assert.equal(r.value.mandatory_escalate, true);
  assert.equal(r.value.hard_reject, false);
});

// ── aml ───────────────────────────────────────────────────────────────────────

test("aml.validate_policy_flags_v0 — clean customer passes", () => {
  const r = run("aml.validate_policy_flags_v0", { sanctions_match: false, pep_status: false, risk_score: 25, historical_alerts: [] });
  assert.equal(r.value.mandatory_escalate, false);
  assert.equal(r.value.auto_clear_eligible, true);
});

test("aml.validate_policy_flags_v0 — sanctions match escalates", () => {
  const r = run("aml.validate_policy_flags_v0", { sanctions_match: true, pep_status: false, risk_score: 20 });
  assert.equal(r.value.mandatory_escalate, true);
  assert.equal(r.value.auto_clear_eligible, false);
});

test("aml.validate_policy_flags_v0 — high score escalates", () => {
  const r = run("aml.validate_policy_flags_v0", { sanctions_match: false, pep_status: false, risk_score: 90 });
  assert.equal(r.value.mandatory_escalate, true);
});

// ── complaint ─────────────────────────────────────────────────────────────────

test("complaint.validate_inputs_v0 — valid complaint passes", () => {
  const r = run("complaint.validate_inputs_v0", { complaint_text: "My card was charged twice.", complaint_date: "2026-04-01" });
  assert.equal(r.value.inputs_valid, true);
});

test("complaint.validate_inputs_v0 — too short text fails", () => {
  const r = run("complaint.validate_inputs_v0", { complaint_text: "Bad.", complaint_date: "2026-04-01" });
  assert.equal(r.value.inputs_valid, false);
  assert.equal(r.value.text_ok, false);
});

// ── compliance ────────────────────────────────────────────────────────────────

test("compliance.validate_inputs_v0 — valid inputs pass", () => {
  const r = run("compliance.validate_inputs_v0", { document_url: "https://s3.aws.com/doc.pdf", framework: "gdpr", org_name: "Acme GmbH" });
  assert.equal(r.value.inputs_valid, true);
});

test("compliance.validate_inputs_v0 — HTTP URL fails", () => {
  const r = run("compliance.validate_inputs_v0", { document_url: "http://s3.aws.com/doc.pdf", framework: "gdpr", org_name: "Acme" });
  assert.equal(r.value.url_ok, false);
});

test("compliance.validate_inputs_v0 — unknown framework fails", () => {
  const r = run("compliance.validate_inputs_v0", { document_url: "https://x.com/f", framework: "hipaa", org_name: "Acme" });
  assert.equal(r.value.framework_ok, false);
});

// ── credit ────────────────────────────────────────────────────────────────────

test("credit.validate_calcs_v0 — healthy applicant passes", () => {
  const r = run("credit.validate_calcs_v0", { monthly_income: 5000, total_debt: 12000, bureau_score: 720, requested_amount: 25000 });
  assert.equal(r.value.calcs_valid, true);
  assert.equal(r.value.hard_reject, false);
  assert.ok((r.value.debt_to_income_ratio as number) < 1);
});

test("credit.validate_calcs_v0 — low bureau score hard rejects", () => {
  const r = run("credit.validate_calcs_v0", { monthly_income: 5000, total_debt: 5000, bureau_score: 450, requested_amount: 10000 });
  assert.equal(r.value.hard_reject, true);
  assert.equal(r.value.hard_reject_reason, "bureau_score_below_500");
});

test("credit.validate_calcs_v0 — high DTI hard rejects", () => {
  const r = run("credit.validate_calcs_v0", { monthly_income: 2000, total_debt: 200000, bureau_score: 650, requested_amount: 10000 });
  assert.equal(r.value.hard_reject, true);
  assert.equal(r.value.hard_reject_reason, "dti_exceeds_60pct");
});

// ── supply_chain ──────────────────────────────────────────────────────────────

test("supply_chain.validate_inputs_v0 — valid suppliers pass", () => {
  const r = run("supply_chain.validate_inputs_v0", {
    suppliers: [{ id: "S1", name: "ACME", country: "DE" }, { id: "S2", name: "Beta", country: "US" }],
  });
  assert.equal(r.value.inputs_valid, true);
  assert.equal(r.value.invalid_supplier_count, 0);
});

test("supply_chain.validate_inputs_v0 — empty suppliers fail", () => {
  const r = run("supply_chain.validate_inputs_v0", { suppliers: [] });
  assert.equal(r.value.inputs_valid, false);
  assert.equal(r.value.has_suppliers, false);
});

test("supply_chain.validate_inputs_v0 — lowercase country fails", () => {
  const r = run("supply_chain.validate_inputs_v0", { suppliers: [{ id: "S1", name: "ACME", country: "de" }] });
  assert.equal(r.value.invalid_supplier_count, 1);
  assert.equal(r.value.inputs_valid, false);
});

// ── churn ─────────────────────────────────────────────────────────────────────

test("churn.validate_inputs_v0 — valid inputs pass", () => {
  const r = run("churn.validate_inputs_v0", { threshold: 0.7, period_days: 30 });
  assert.equal(r.value.inputs_valid, true);
});

test("churn.validate_inputs_v0 — threshold > 1 fails", () => {
  const r = run("churn.validate_inputs_v0", { threshold: 1.5, period_days: 30 });
  assert.equal(r.value.threshold_ok, false);
});

test("churn.validate_inputs_v0 — float period_days fails", () => {
  const r = run("churn.validate_inputs_v0", { threshold: 0.5, period_days: 30.5 });
  assert.equal(r.value.period_ok, false);
});

// ── contract_gen ──────────────────────────────────────────────────────────────

test("contract_gen.validate_inputs_v0 — valid contract gen passes", () => {
  const r = run("contract_gen.validate_inputs_v0", { party_a: "Acme Corp", party_b: "Beta GmbH", effective_date: "2026-05-01" });
  assert.equal(r.value.inputs_valid, true);
});

test("contract_gen.validate_inputs_v0 — same parties fail", () => {
  const r = run("contract_gen.validate_inputs_v0", { party_a: "Acme", party_b: "acme", effective_date: "2026-05-01" });
  assert.equal(r.value.parties_distinct, false);
  assert.equal(r.value.inputs_valid, false);
});

test("contract_gen.validate_inputs_v0 — bad date format fails", () => {
  const r = run("contract_gen.validate_inputs_v0", { party_a: "Acme", party_b: "Beta", effective_date: "May 1 2026" });
  assert.equal(r.value.date_ok, false);
});

// ── registry completeness ─────────────────────────────────────────────────────

test("VALIDATOR_REGISTRY — all expected ids registered", () => {
  const expected = [
    "invoice.validate_totals_v0", "invoice.validate_dates_v0", "invoice.validate_amounts_v0",
    "po.validate_inputs_v0",
    "trade.validate_limits_v0",
    "aml.validate_policy_flags_v0",
    "complaint.validate_inputs_v0",
    "compliance.validate_inputs_v0",
    "credit.validate_calcs_v0",
    "supply_chain.validate_inputs_v0",
    "churn.validate_inputs_v0",
    "contract_gen.validate_inputs_v0",
  ];
  for (const id of expected) {
    assert.ok(VALIDATOR_REGISTRY.has(id), `Missing validator: ${id}`);
  }
});
