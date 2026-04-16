// ── MOVA Schema Layer ─────────────────────────────────────────────────────────
// Contract manifests, DataSpecs, and Envelope type definitions.
// This is the structural source of truth for the MCP server.
// Business logic lives on the MOVA platform; this file carries only the
// schema skeleton needed for input validation and Resource exposure.
// ── Envelope kinds ────────────────────────────────────────────────────────────
export const ENVELOPE_KINDS = {
    CONTRACT_START: "env.contract.start_v0",
    DECISION_SUBMIT: "env.decision.submit_v0",
    STEP_EXECUTE: "env.step.execute_v0",
    CONTRACT_QUERY: "env.contract.query_v0",
};
// ── Step builders (internal) ──────────────────────────────────────────────────
function aiStep(stepId, title, nextStepId, systemPrompt, model = "openai/gpt-4o-mini") {
    return { step_id: stepId, step_type: "ai_task", title, next_step_id: nextStepId, config: { model, api_key_env: "LLM_KEY", system_prompt: systemPrompt } };
}
function deterministicStep(stepId, title, nextStepId, fn) {
    return { step_id: stepId, step_type: "deterministic", title, next_step_id: nextStepId, config: { function: fn } };
}
function verifyStep(title) {
    return { step_id: "verify", step_type: "verification", title, next_step_id: "decide", config: { recommended_action: "review" } };
}
function decideStep(title, decisionKind, question, options) {
    const routeMap = Object.fromEntries(options.map(o => [o.option_id, "__end__"]));
    routeMap["_default"] = "__end__";
    return { step_id: "decide", step_type: "decision_point", title, config: { decision_kind: decisionKind, question, required_actor: { actor_type: "human" }, options, route_map: routeMap } };
}
// ── Contract manifests ────────────────────────────────────────────────────────
export const CONTRACT_MANIFESTS = {
    invoice: {
        contract_type: "invoice",
        title: "Invoice OCR & AP Approval",
        version: "1.0.0",
        execution_mode: "human_gated",
        template_id: "tpl.finance.invoice_ocr_hitl_v0",
        policy_id: "policy.hitl.finance.invoice_ocr_v0",
        short_id_prefix: "invoice",
        dataspec: {
            schema_version: "1.0",
            inputs: [
                { field: "file_url", type: "string", format: "uri", required: true, description: "Direct HTTPS URL to the invoice image (PDF, JPEG, PNG)" },
                { field: "document_id", type: "string", required: false, description: "Document ID — auto-generated if omitted" },
            ],
        },
        decision_options: [
            { option_id: "approve", label: "Approve — process payment" },
            { option_id: "reject", label: "Reject — notify vendor" },
            { option_id: "escalate_accountant", label: "Escalate to accountant" },
            { option_id: "request_info", label: "Request more information" },
        ],
        steps: [
            aiStep("analyze", "OCR Extract Invoice Fields", "verify", "You are an invoice OCR agent. The user message contains the invoice image. Extract all fields. Return ONLY a JSON object with: document_id, vendor_name, vendor_iban, vendor_tax_id, total_amount (number), currency (ISO-4217), invoice_date (ISO-8601), due_date (ISO-8601), po_reference (null if missing), subtotal (number), tax_amount (number), line_items (array of {description, quantity, unit_price, amount}), vendor_status (known/unknown/blocked), po_match (matched/partial/not_found), duplicate_flag (bool), ocr_confidence (0.0-1.0), findings (array of {code, severity, summary}).", "qwen/qwen3-vl-32b-instruct"),
            verifyStep("Risk Snapshot"),
            decideStep("AP Decision Gate", "invoice_approval", "Invoice processing complete. Select action:", [
                { option_id: "approve", label: "Approve — process payment" },
                { option_id: "reject", label: "Reject — notify vendor" },
                { option_id: "escalate_accountant", label: "Escalate to accountant" },
                { option_id: "request_info", label: "Request more information" },
            ]),
        ],
        validators: [
            { step_id: "validate_totals", title: "Validate Invoice Totals",
                fn: "(inputs) => { const sub = Math.round((Number(inputs.subtotal) || 0) * 100); const tax = Math.round((Number(inputs.tax_amount) || 0) * 100); const total = Math.round((Number(inputs.total_amount) || 0) * 100); const diff = Math.abs(sub + tax - total); return { ok: true, value: { totals_valid: diff <= 5, expected_total: (sub + tax) / 100, actual_total: total / 100, diff_cents: diff }, step_id: 'validate_totals' }; }" },
            { step_id: "validate_dates", title: "Validate Invoice Dates",
                fn: "(inputs) => { const inv = String(inputs.invoice_date || ''); const due = String(inputs.due_date || ''); const fmt = /^\\d{4}-\\d{2}-\\d{2}$/; const inv_ok = fmt.test(inv); const due_ok = fmt.test(due); const order_ok = !inv_ok || !due_ok || due >= inv; return { ok: true, value: { dates_valid: inv_ok && due_ok && order_ok, invoice_date: inv, due_date: due, format_ok: inv_ok && due_ok, order_ok }, step_id: 'validate_dates' }; }" },
            { step_id: "validate_amounts", title: "Validate Invoice Amounts",
                fn: "(inputs) => { const sub = Number(inputs.subtotal); const tax = Number(inputs.tax_amount); const total = Number(inputs.total_amount); return { ok: true, value: { amounts_valid: sub > 0 && tax >= 0 && total > 0, subtotal: sub, tax_amount: tax, total_amount: total }, step_id: 'validate_amounts' }; }" },
        ],
    },
    po: {
        contract_type: "po",
        title: "Purchase Order Approval",
        version: "1.0.0",
        execution_mode: "human_gated",
        template_id: "tpl.erp.po_approval_hitl_v0",
        policy_id: "policy.hitl.erp.po_approval_v0",
        short_id_prefix: "po",
        dataspec: {
            schema_version: "1.0",
            inputs: [
                { field: "po_id", type: "string", required: true, description: "Purchase order number, e.g. PO-2026-001" },
                { field: "approver_employee_id", type: "string", required: true, description: "HR employee ID of the approver, e.g. EMP-1042" },
            ],
        },
        decision_options: [
            { option_id: "approve", label: "Approve PO" },
            { option_id: "hold", label: "Hold for review" },
            { option_id: "reject", label: "Reject PO" },
            { option_id: "escalate", label: "Escalate to director/board" },
        ],
        steps: [
            aiStep("analyze", "PO Risk Analysis", "verify", "You are a procurement risk analyst. Review the purchase order data provided and run all connector checks. Return ONLY a JSON object with: po_id, review_decision (approve/hold/reject/escalate), approval_tier (manager/director/board), budget_check ({within_budget, utilization_pct, budget_remaining}), vendor_status (registered/pending/blacklisted), authority_check ({adequate, reason}), anomaly_flags (array), findings (array of {code, severity, summary}), requires_human_approval (bool), recommended_action (approve/hold/reject/escalate), decision_reasoning (string), risk_score (0.0-1.0)."),
            verifyStep("Procurement Risk Snapshot"),
            decideStep("Procurement Decision Gate", "procurement_review", "AI analysis complete. Select the procurement decision:", [
                { option_id: "approve", label: "Approve PO" },
                { option_id: "hold", label: "Hold for review" },
                { option_id: "reject", label: "Reject PO" },
                { option_id: "escalate", label: "Escalate to director/board" },
            ]),
        ],
        validators: [
            { step_id: "validate_inputs", title: "Validate PO Inputs",
                fn: "(inputs) => { const po = String(inputs.po_id || ''); const emp = String(inputs.approver_employee_id || ''); const po_ok = po.length >= 3; const emp_ok = emp.length >= 3; return { ok: true, value: { inputs_valid: po_ok && emp_ok, po_id_present: po_ok, approver_present: emp_ok }, step_id: 'validate_inputs' }; }" },
        ],
    },
    trade: {
        contract_type: "trade",
        title: "Crypto Trade Review",
        version: "1.0.0",
        execution_mode: "human_gated",
        template_id: "tpl.crypto.trade_review_hitl_v0",
        policy_id: "policy.hitl.crypto.trade_review_v0",
        short_id_prefix: "trade",
        dataspec: {
            schema_version: "1.0",
            inputs: [
                { field: "trade_id", type: "string", required: true, description: "Trade order ID, e.g. TRD-2026-0001" },
                { field: "wallet_address", type: "string", required: true, description: "Wallet address to screen" },
                { field: "chain", type: "string", required: true, description: "Blockchain: ethereum, bitcoin, solana" },
                { field: "token_pair", type: "string", required: true, description: "Token pair, e.g. BTC/USDT" },
                { field: "side", type: "string", required: true, description: "buy or sell", enum: ["buy", "sell"] },
                { field: "order_type", type: "string", required: true, description: "market, limit, stop" },
                { field: "order_size_usd", type: "number", required: true, description: "Order size in USD" },
                { field: "leverage", type: "number", required: true, description: "Leverage multiplier, 1 = no leverage" },
            ],
        },
        decision_options: [
            { option_id: "approve", label: "Approve trade" },
            { option_id: "reject", label: "Reject trade" },
            { option_id: "escalate_human", label: "Escalate to human trader" },
        ],
        steps: [
            aiStep("analyze", "Trade Risk Analysis", "verify", "You are a crypto trade risk analyst. Review the trade order data and run all risk checks. Return ONLY a JSON object with: trade_id, review_decision (approve/reject/escalate_human), risk_level (low/medium/high/critical), market_check ({price_usd, volatility_score, change_24h_pct}), balance_check ({sufficient, available_margin}), portfolio_risk ({concentration_pct, risk_level, var_1d_usd}), sanctions_check ({is_sanctioned, is_pep, list_name}), anomaly_flags (array), findings (array of {code, severity, summary}), rejection_reasons (array), requires_human_approval (bool), decision_reasoning (string), risk_score (0.0-1.0). IMMEDIATE REJECT: hard_reject=true OR sanctions hit. MANDATORY ESCALATE: mandatory_escalate=true."),
            verifyStep("Trade Risk Snapshot"),
            decideStep("Trading Decision Gate", "trade_review", "Trade risk analysis complete. Select trading decision:", [
                { option_id: "approve", label: "Approve trade" },
                { option_id: "reject", label: "Reject trade" },
                { option_id: "escalate_human", label: "Escalate to human trader" },
            ]),
        ],
        validators: [
            { step_id: "validate_limits", title: "Validate Trade Limits",
                fn: "(inputs) => { const lev = Number(inputs.leverage) || 0; const size = Number(inputs.order_size_usd) || 0; const lev_ok = lev >= 1 && lev <= 100; const size_ok = size > 0; const hard_reject = lev > 10; const mandatory_escalate = size >= 10000 || lev > 3; return { ok: true, value: { limits_valid: lev_ok && size_ok, leverage: lev, order_size_usd: size, hard_reject, hard_reject_reason: hard_reject ? 'leverage_exceeds_10x' : null, mandatory_escalate }, step_id: 'validate_limits' }; }" },
        ],
    },
    aml: {
        contract_type: "aml",
        title: "AML Alert Triage",
        version: "1.0.0",
        execution_mode: "human_gated",
        template_id: "tpl.aml.alert_triage_hitl_v0",
        policy_id: "policy.hitl.aml.alert_triage_v0",
        short_id_prefix: "aml",
        dataspec: {
            schema_version: "1.0",
            inputs: [
                { field: "alert_id", type: "string", required: true, description: "Alert ID" },
                { field: "rule_id", type: "string", required: true, description: "Rule ID that triggered the alert" },
                { field: "rule_description", type: "string", required: true, description: "Human-readable rule description" },
                { field: "risk_score", type: "number", required: true, description: "Risk score 0–100" },
                { field: "customer_id", type: "string", required: true, description: "Customer ID" },
                { field: "customer_name", type: "string", required: true, description: "Customer full name" },
                { field: "customer_risk_rating", type: "string", required: true, description: "low, medium, or high", enum: ["low", "medium", "high"] },
                { field: "customer_type", type: "string", required: true, description: "individual or business", enum: ["individual", "business"] },
                { field: "customer_jurisdiction", type: "string", required: true, description: "ISO 3166-1 alpha-2, e.g. DE" },
                { field: "triggered_transactions", type: "array", required: true, description: "Array of {transaction_id, amount_eur}", items: { type: "object" } },
                { field: "pep_status", type: "boolean", required: true, description: "Is customer a PEP?" },
                { field: "sanctions_match", type: "boolean", required: true, description: "Does customer match sanctions list?" },
                { field: "historical_alerts", type: "array", required: false, description: "Prior alert IDs", items: { type: "string" } },
            ],
        },
        decision_options: [
            { option_id: "clear", label: "Clear — false positive" },
            { option_id: "escalate_l2", label: "Escalate to L2 analyst" },
            { option_id: "immediate_escalate", label: "Immediate escalation — freeze account" },
        ],
        steps: [
            aiStep("analyze", "AML Alert Triage Analysis", "verify", "You are an AML compliance analyst performing L1 alert triage. Review the alert data and run all connector checks. Return ONLY a JSON object with: alert_id, triage_decision (false_positive/manual_review/immediate_escalate), risk_score_assessment (0-100), sanctions_check ({is_sanctioned, list_name}), pep_check ({is_pep, pep_category}), typology_match ({matched, typology_code, description}), customer_risk ({rating, jurisdiction_risk, burst_intensity}), anomaly_flags (array), findings (array of {code, severity, summary}), requires_human_approval (bool), recommended_action (clear/escalate_l2/immediate_escalate), decision_reasoning (string), risk_score (0.0-1.0). IMMEDIATE ESCALATE: mandatory_escalate=true. AUTO-CLEAR ONLY IF: auto_clear_eligible=true."),
            verifyStep("AML Risk Snapshot"),
            decideStep("AML Triage Decision Gate", "aml_triage", "AML L1 triage complete. Select compliance decision:", [
                { option_id: "clear", label: "Clear — false positive" },
                { option_id: "escalate_l2", label: "Escalate to L2 analyst" },
                { option_id: "immediate_escalate", label: "Immediate escalation — freeze account" },
            ]),
        ],
        validators: [
            { step_id: "validate_policy_flags", title: "Validate AML Policy Flags",
                fn: "(inputs) => { const sanctions = Boolean(inputs.sanctions_match); const pep = Boolean(inputs.pep_status); const score = Number(inputs.risk_score) || 0; const score_ok = score >= 0 && score <= 100; const mandatory_escalate = sanctions || pep || score > 85; const auto_clear = score <= 30 && !sanctions && !pep && (!inputs.historical_alerts || inputs.historical_alerts.length === 0); return { ok: true, value: { policy_flags_valid: score_ok, sanctions_match: sanctions, pep_status: pep, risk_score: score, mandatory_escalate, auto_clear_eligible: auto_clear }, step_id: 'validate_policy_flags' }; }" },
        ],
    },
    complaint: {
        contract_type: "complaint",
        title: "EU Consumer Complaints Handler",
        version: "1.0.0",
        execution_mode: "human_gated",
        template_id: "tpl.complaints.handler_hitl_v0",
        policy_id: "policy.hitl.complaints.handler_v0",
        short_id_prefix: "cmp",
        dataspec: {
            schema_version: "1.0",
            inputs: [
                { field: "complaint_id", type: "string", required: true, description: "Complaint ID" },
                { field: "customer_id", type: "string", required: true, description: "Customer ID" },
                { field: "complaint_text", type: "string", required: true, description: "Full complaint text" },
                { field: "channel", type: "string", required: true, description: "web, email, phone, chat, branch" },
                { field: "product_category", type: "string", required: true, description: "e.g. payments, mortgage, insurance" },
                { field: "complaint_date", type: "string", required: true, description: "ISO date, e.g. 2026-03-19" },
                { field: "previous_complaints", type: "array", required: false, description: "Prior complaint IDs", items: { type: "string" } },
                { field: "customer_segment", type: "string", required: false, description: "Customer segment" },
                { field: "preferred_language", type: "string", required: false, description: "ISO 639-1 language code", default: "en" },
            ],
        },
        decision_options: [
            { option_id: "resolve", label: "Resolve — send standard response" },
            { option_id: "escalate", label: "Escalate to complaints officer" },
            { option_id: "reject", label: "Reject — incomplete or invalid" },
            { option_id: "regulator_flag", label: "Flag for regulator reporting" },
        ],
        steps: [
            aiStep("analyze", "Complaint Classification & Risk Analysis", "verify", "You are an EU financial services complaints handler. Review the complaint data and classify it. Return ONLY a JSON object with: complaint_id, triage_decision (routine/manual_review/blocked), product_risk (low/medium/high), sentiment_flags (array: compensation_claim, regulator_threat, fraud_signal, urgent), repeat_customer (bool), completeness_check ({text_present, channel_valid, product_identified}), anomaly_flags (array), findings (array of {code, severity, summary}), requires_human_approval (bool), recommended_action (auto_resolve/manual_review/reject_incomplete), decision_reasoning (string), risk_score (0.0-1.0), draft_response_hint (string). BLOCKED if inputs_valid=false. MANDATORY HUMAN REVIEW: compensation claim OR regulator threat OR repeat customer OR product_risk=high OR fraud_signal."),
            verifyStep("Complaint Risk Snapshot"),
            decideStep("Complaints Handler Decision Gate", "complaint_review", "Complaint classification complete. Select handling decision:", [
                { option_id: "resolve", label: "Resolve — send standard response" },
                { option_id: "escalate", label: "Escalate to complaints officer" },
                { option_id: "reject", label: "Reject — incomplete or invalid" },
                { option_id: "regulator_flag", label: "Flag for regulator reporting" },
            ]),
        ],
        validators: [
            { step_id: "validate_inputs", title: "Validate Complaint Inputs",
                fn: "(inputs) => { const text = String(inputs.complaint_text || ''); const date = String(inputs.complaint_date || ''); const text_ok = text.trim().length >= 10; const date_ok = /^\\d{4}-\\d{2}-\\d{2}$/.test(date); return { ok: true, value: { inputs_valid: text_ok && date_ok, text_length: text.trim().length, text_ok, date_ok, complaint_date: date }, step_id: 'validate_inputs' }; }" },
        ],
    },
    compliance: {
        contract_type: "compliance",
        title: "Compliance Audit",
        version: "1.0.0",
        execution_mode: "human_gated",
        template_id: "tpl.compliance.audit_hitl_v0",
        policy_id: "policy.hitl.compliance.audit_v0",
        short_id_prefix: "cmp",
        dataspec: {
            schema_version: "1.0",
            inputs: [
                { field: "document_url", type: "string", format: "uri", required: true, description: "Direct HTTPS URL to the document" },
                { field: "framework", type: "string", required: true, description: "gdpr, pci_dss, iso_27001, soc2", enum: ["gdpr", "pci_dss", "iso_27001", "soc2"] },
                { field: "org_name", type: "string", required: true, description: "Organization name" },
                { field: "document_id", type: "string", required: false, description: "Document ID — auto-generated if omitted" },
            ],
        },
        decision_options: [
            { option_id: "approve", label: "Approve — document is compliant" },
            { option_id: "approve_with_conditions", label: "Approve with conditions" },
            { option_id: "reject", label: "Reject — document fails compliance" },
            { option_id: "request_corrections", label: "Return for corrections" },
        ],
        steps: [
            aiStep("analyze", "Compliance Rules Check", "verify", "You are a compliance auditor. Review the document data against the specified regulatory framework. Return ONLY a JSON object with: document_id, framework, pass_count (int), total_checks (int), critical_count (int), findings (array of {code, severity, summary, recommendation}), requires_human_approval (bool), recommended_action (approve/approve_with_conditions/reject/request_corrections), decision_reasoning (string), risk_score (0.0-1.0)."),
            verifyStep("Compliance Findings Snapshot"),
            decideStep("Compliance Audit Decision Gate", "compliance_audit", "Compliance audit complete. Select decision:", [
                { option_id: "approve", label: "Approve — document is compliant" },
                { option_id: "approve_with_conditions", label: "Approve with conditions" },
                { option_id: "reject", label: "Reject — document fails compliance" },
                { option_id: "request_corrections", label: "Return for corrections" },
            ]),
        ],
        validators: [
            { step_id: "validate_inputs", title: "Validate Compliance Inputs",
                fn: "(inputs) => { const url = String(inputs.document_url || ''); const fw = String(inputs.framework || ''); const url_ok = url.startsWith('https://'); const valid_frameworks = ['gdpr', 'pci_dss', 'iso_27001', 'soc2']; const fw_ok = valid_frameworks.includes(fw); const org_ok = String(inputs.org_name || '').trim().length >= 2; return { ok: true, value: { inputs_valid: url_ok && fw_ok && org_ok, url_ok, framework_ok: fw_ok, org_ok, document_url: url, framework: fw }, step_id: 'validate_inputs' }; }" },
        ],
    },
    credit: {
        contract_type: "credit",
        title: "Credit Scoring",
        version: "1.0.0",
        execution_mode: "human_gated",
        template_id: "tpl.credit.scoring_hitl_v0",
        policy_id: "policy.hitl.credit.scoring_v0",
        short_id_prefix: "crd",
        dataspec: {
            schema_version: "1.0",
            inputs: [
                { field: "applicant_id", type: "string", required: true, description: "Applicant ID" },
                { field: "monthly_income", type: "number", required: true, description: "Monthly income in local currency" },
                { field: "total_debt", type: "number", required: true, description: "Total outstanding debt" },
                { field: "credit_history_months", type: "number", required: true, description: "Credit history length in months" },
                { field: "bureau_score", type: "number", required: true, description: "Credit bureau score" },
                { field: "requested_amount", type: "number", required: true, description: "Requested loan amount" },
                { field: "loan_purpose", type: "string", required: true, description: "home, auto, business, personal", enum: ["home", "auto", "business", "personal"] },
            ],
        },
        decision_options: [
            { option_id: "approve", label: "Approve at recommended limit" },
            { option_id: "approve_reduced", label: "Approve at reduced limit — specify amount in reason" },
            { option_id: "reject", label: "Reject application" },
            { option_id: "request_info", label: "Request additional documents" },
        ],
        steps: [
            aiStep("analyze", "Credit Risk Scoring", "verify", "You are a credit risk analyst. Evaluate the applicant's creditworthiness based on the provided financial data. Return ONLY a JSON object with: applicant_id, score (0-1000), risk_band (excellent/good/fair/poor/very_poor), recommended_limit (number), debt_to_income_ratio (number), key_factors (array of {factor, impact: positive/negative, weight}), model_version (string), findings (array of {code, severity, summary}), requires_human_approval (bool), recommended_action (approve/approve_reduced/reject/request_info), decision_reasoning (string), risk_score (0.0-1.0). MANDATORY HUMAN APPROVAL for all decisions."),
            verifyStep("Credit Risk Snapshot"),
            decideStep("Credit Decision Gate", "credit_decision", "Credit scoring complete. Select credit decision:", [
                { option_id: "approve", label: "Approve at recommended limit" },
                { option_id: "approve_reduced", label: "Approve at reduced limit — specify amount in reason" },
                { option_id: "reject", label: "Reject application" },
                { option_id: "request_info", label: "Request additional documents" },
            ]),
        ],
        validators: [
            { step_id: "validate_calcs", title: "Validate Credit Calculations",
                fn: "(inputs) => { const income = Number(inputs.monthly_income) || 0; const debt = Number(inputs.total_debt) || 0; const bureau = Number(inputs.bureau_score) || 0; const requested = Number(inputs.requested_amount) || 0; const income_ok = income > 0; const bureau_ok = bureau >= 300 && bureau <= 850; const requested_ok = requested > 0; const dti = income_ok ? debt / (income * 12) : null; const hard_reject = bureau < 500 || (dti !== null && dti > 0.6); return { ok: true, value: { calcs_valid: income_ok && bureau_ok && requested_ok, monthly_income: income, total_debt: debt, bureau_score: bureau, requested_amount: requested, debt_to_income_ratio: dti, hard_reject, hard_reject_reason: hard_reject ? (bureau < 500 ? 'bureau_score_below_500' : 'dti_exceeds_60pct') : null }, step_id: 'validate_calcs' }; }" },
        ],
    },
    supply_chain: {
        contract_type: "supply_chain",
        title: "Supply Chain Risk Screening",
        version: "1.0.0",
        execution_mode: "human_gated",
        template_id: "tpl.supply_chain.risk_hitl_v0",
        policy_id: "policy.hitl.supply_chain.risk_v0",
        short_id_prefix: "scr",
        dataspec: {
            schema_version: "1.0",
            inputs: [
                { field: "suppliers", type: "array", required: true, description: "Array of {id, name, country (ISO alpha-2)}", items: { type: "object" } },
                { field: "category", type: "string", required: true, description: "raw_materials, logistics, technology, services", enum: ["raw_materials", "logistics", "technology", "services"] },
                { field: "requestor_id", type: "string", required: true, description: "Requestor employee or system ID" },
            ],
        },
        decision_options: [
            { option_id: "approve_all", label: "Approve all screened suppliers" },
            { option_id: "approve_clean", label: "Approve clean suppliers only — block high-risk" },
            { option_id: "reject_all", label: "Block entire batch — pending further review" },
            { option_id: "escalate", label: "Escalate to compliance team" },
        ],
        steps: [
            aiStep("analyze", "Supplier Screening & Risk Analysis", "verify", "You are a supply chain risk analyst. Screen each supplier against sanctions lists, PEP registries, ESG ratings, and financial stability indicators. Return ONLY a JSON object with: total_count (int), critical_count (int), high_count (int), clean_count (int), results (array of {id, name, country, risk_band: low/medium/high/critical, sanctions_match: bool, pep_match: bool, esg_rating, financial_stability, findings: array}), requires_human_approval (bool), recommended_action (approve_all/approve_clean/reject_all/escalate), decision_reasoning (string), risk_score (0.0-1.0)."),
            verifyStep("Supply Chain Risk Snapshot"),
            decideStep("Supply Chain Approval Gate", "supply_chain_review", "Supplier screening complete. Select procurement decision:", [
                { option_id: "approve_all", label: "Approve all screened suppliers" },
                { option_id: "approve_clean", label: "Approve clean suppliers only — block high-risk" },
                { option_id: "reject_all", label: "Block entire batch — pending further review" },
                { option_id: "escalate", label: "Escalate to compliance team" },
            ]),
        ],
        validators: [
            { step_id: "validate_inputs", title: "Validate Supply Chain Inputs",
                fn: "(inputs) => { const suppliers = Array.isArray(inputs.suppliers) ? inputs.suppliers : []; const non_empty = suppliers.length > 0; const valid_items = suppliers.filter(s => s && typeof s === 'object' && String(s.id || '').length > 0 && String(s.name || '').length > 0 && /^[A-Z]{2}$/.test(String(s.country || ''))); const all_valid = non_empty && valid_items.length === suppliers.length; const invalid_count = suppliers.length - valid_items.length; return { ok: true, value: { inputs_valid: all_valid, supplier_count: suppliers.length, valid_supplier_count: valid_items.length, invalid_supplier_count: invalid_count, has_suppliers: non_empty }, step_id: 'validate_inputs' }; }" },
        ],
    },
    churn: {
        contract_type: "churn",
        title: "Churn Prediction",
        version: "1.0.0",
        execution_mode: "human_gated",
        template_id: "tpl.churn.prediction_hitl_v0",
        policy_id: "policy.hitl.churn.prediction_v0",
        short_id_prefix: "chu",
        dataspec: {
            schema_version: "1.0",
            inputs: [
                { field: "segment_id", type: "string", required: true, description: "Customer segment ID" },
                { field: "period_days", type: "number", required: true, description: "Analysis period in days" },
                { field: "threshold", type: "number", required: true, description: "Churn probability threshold 0.0–1.0" },
                { field: "requestor_id", type: "string", required: true, description: "Requestor employee or system ID" },
            ],
        },
        decision_options: [
            { option_id: "launch_campaign", label: "Launch retention campaign for all high-risk customers" },
            { option_id: "launch_selective", label: "Launch for top-N only — specify N in reason" },
            { option_id: "defer", label: "Defer to next review cycle" },
            { option_id: "escalate", label: "Escalate to VP of Customer Success" },
        ],
        steps: [
            aiStep("analyze", "Churn Risk Prediction", "verify", "You are a customer retention analyst. Analyze customer behavior signals and predict churn risk. Return ONLY a JSON object with: segment_id, total_analyzed (int), at_risk_count (int), avg_churn_score (number), model_version (string), top_at_risk (array of {customer_id, churn_score, top_factor, recommended_action}), key_signals (array of {signal, importance}), findings (array of {code, severity, summary}), requires_human_approval (bool), recommended_action (launch_campaign/launch_selective/defer/escalate), decision_reasoning (string), risk_score (0.0-1.0)."),
            verifyStep("Churn Risk Snapshot"),
            decideStep("Retention Campaign Decision Gate", "churn_retention", "Churn analysis complete. Select retention action:", [
                { option_id: "launch_campaign", label: "Launch retention campaign for all high-risk customers" },
                { option_id: "launch_selective", label: "Launch for top-N only — specify N in reason" },
                { option_id: "defer", label: "Defer to next review cycle" },
                { option_id: "escalate", label: "Escalate to VP of Customer Success" },
            ]),
        ],
        validators: [
            { step_id: "validate_inputs", title: "Validate Churn Inputs",
                fn: "(inputs) => { const threshold = Number(inputs.threshold); const period = Number(inputs.period_days); const threshold_ok = threshold >= 0.0 && threshold <= 1.0; const period_ok = Number.isInteger(period) && period > 0; return { ok: true, value: { inputs_valid: threshold_ok && period_ok, threshold, period_days: period, threshold_ok, period_ok }, step_id: 'validate_inputs' }; }" },
        ],
    },
    contract_gen: {
        contract_type: "contract_gen",
        title: "Legal Contract Generation",
        version: "1.0.0",
        execution_mode: "human_gated",
        template_id: "tpl.legal.contract_gen_hitl_v0",
        policy_id: "policy.hitl.legal.contract_gen_v0",
        short_id_prefix: "cng",
        dataspec: {
            schema_version: "1.0",
            inputs: [
                { field: "doc_type", type: "string", required: true, description: "nda, service_agreement, supply_contract, sla", enum: ["nda", "service_agreement", "supply_contract", "sla"] },
                { field: "party_a", type: "string", required: true, description: "First party name" },
                { field: "party_b", type: "string", required: true, description: "Second party name" },
                { field: "jurisdiction", type: "string", required: true, description: "e.g. DE, US-NY, EU" },
                { field: "effective_date", type: "string", required: true, description: "ISO date, e.g. 2026-04-01" },
                { field: "terms", type: "object", required: false, description: "Additional terms as key-value pairs" },
                { field: "template_id", type: "string", required: false, description: "Override template ID" },
            ],
        },
        decision_options: [
            { option_id: "approve_section", label: "Approve current section as written" },
            { option_id: "edit_section", label: "Accept with edits — provide edited text in reason" },
            { option_id: "reject_section", label: "Reject section — request redraft" },
            { option_id: "escalate", label: "Escalate to senior legal counsel" },
        ],
        steps: [
            aiStep("analyze", "Legal Document Draft Generation", "verify", "You are a legal document specialist. Generate a structured legal document draft from the provided parameters. Return ONLY a JSON object with: document_id (string), doc_type, party_a, party_b, jurisdiction, sections (array of {section_id, title, content}), terms_extracted (object), findings (array of {code, severity, summary}), requires_human_approval (bool, always true), recommended_action (always 'review_sections'), decision_reasoning (string), risk_score (0.0-1.0)."),
            verifyStep("Document Draft Ready for Review"),
            decideStep("Legal Review & Sign-off Gate", "contract_review", "Document draft generated. Select review action:", [
                { option_id: "approve_section", label: "Approve current section as written" },
                { option_id: "edit_section", label: "Accept with edits — provide edited text in reason" },
                { option_id: "reject_section", label: "Reject section — request redraft" },
                { option_id: "escalate", label: "Escalate to senior legal counsel" },
            ]),
        ],
        validators: [
            { step_id: "validate_inputs", title: "Validate Contract Gen Inputs",
                fn: "(inputs) => { const a = String(inputs.party_a || '').trim(); const b = String(inputs.party_b || '').trim(); const date = String(inputs.effective_date || ''); const a_ok = a.length >= 2; const b_ok = b.length >= 2; const date_ok = /^\\d{4}-\\d{2}-\\d{2}$/.test(date); const parties_distinct = a.toLowerCase() !== b.toLowerCase(); return { ok: true, value: { inputs_valid: a_ok && b_ok && date_ok && parties_distinct, party_a_ok: a_ok, party_b_ok: b_ok, date_ok, parties_distinct, effective_date: date }, step_id: 'validate_inputs' }; }" },
        ],
    },
};
// ── Envelope schema (for Resource exposure) ───────────────────────────────────
export const ENVELOPE_SCHEMA = {
    schema_version: "1.0",
    kinds: [
        {
            kind: ENVELOPE_KINDS.CONTRACT_START,
            description: "Start a new contract execution. Submitted by agent to begin a workflow.",
            required_fields: ["kind", "envelope_id", "contract_id", "actor", "payload.template_id", "payload.policy_profile_ref", "payload.initial_inputs"],
        },
        {
            kind: ENVELOPE_KINDS.DECISION_SUBMIT,
            description: "Submit a human decision at a contract gate.",
            required_fields: ["kind", "envelope_id", "contract_id", "decision_point_id", "actor", "payload.selected_option_id"],
        },
        {
            kind: ENVELOPE_KINDS.STEP_EXECUTE,
            description: "Trigger a step execution. Used internally by the runtime.",
            required_fields: ["kind", "envelope_id", "contract_id", "actor", "payload.step_id"],
        },
        {
            kind: ENVELOPE_KINDS.CONTRACT_QUERY,
            description: "Query contract state or audit trail.",
            required_fields: ["kind", "envelope_id", "contract_id", "actor"],
        },
    ],
    actor_types: ["human", "ai", "system"],
};
