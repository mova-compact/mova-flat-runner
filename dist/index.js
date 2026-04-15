#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { movaPost, movaGet, movaPut, movaDelete, movaRunSteps, shortId, } from "./client.js";
// ── Config from env ───────────────────────────────────────────────────────────
function cfg() {
    const apiKey = process.env.MOVA_API_KEY;
    const llmKey = process.env.LLM_KEY;
    if (!apiKey)
        throw new Error("MOVA_API_KEY environment variable is not set.");
    if (!llmKey)
        throw new Error("LLM_KEY environment variable is not set.");
    return {
        apiKey,
        baseUrl: process.env.MOVA_API_URL ?? "https://api.mova-lab.eu",
        llmKey,
        llmModel: process.env.LLM_MODEL ?? "openai/gpt-4o-mini",
    };
}
// ── Step definitions ──────────────────────────────────────────────────────────
const INVOICE_STEPS = [
    {
        step_id: "analyze", step_type: "ai_task", title: "OCR Extract and Validate Invoice", next_step_id: "verify",
        config: {
            model: "qwen/qwen3-vl-32b-instruct", api_key_env: "OCR_LLM_KEY",
            system_prompt: "You are an invoice OCR and validation agent. The user message contains the invoice image. Extract all fields and validate. Return ONLY a JSON object with: document_id, vendor_name, vendor_iban, vendor_tax_id, total_amount (number), currency (ISO-4217), invoice_date (ISO-8601), due_date (ISO-8601), po_reference (null if missing), subtotal (number), tax_amount (number), line_items (array of {description, quantity, unit_price, amount}), review_decision (pass_to_ap/hold_for_review/reject), vendor_status (known/unknown/blocked), po_match (matched/partial/not_found), duplicate_flag (bool), ocr_confidence (0.0-1.0), risk_score (0.0-1.0), findings (list of {code, severity, summary}), requires_human_approval (bool), decision_reasoning (string).",
        },
    },
    { step_id: "verify", step_type: "verification", title: "Risk Snapshot", next_step_id: "decide", config: { recommended_action: "review" } },
    {
        step_id: "decide", step_type: "decision_point", title: "AP Decision Gate",
        config: {
            decision_kind: "invoice_approval", question: "Invoice processing complete. Select action:", required_actor: { actor_type: "human" },
            options: [
                { option_id: "approve", label: "Approve — process payment" },
                { option_id: "reject", label: "Reject — notify vendor" },
                { option_id: "escalate_accountant", label: "Escalate to accountant" },
                { option_id: "request_info", label: "Request more information" },
            ],
            route_map: { approve: "__end__", reject: "__end__", escalate_accountant: "__end__", request_info: "__end__", _default: "__end__" },
        },
    },
];
const PO_STEPS = [
    {
        step_id: "analyze", step_type: "ai_task", title: "PO Risk Analysis", next_step_id: "verify",
        config: {
            model: "openai/gpt-4o-mini", api_key_env: "LLM_KEY",
            system_prompt: "You are a procurement risk analyst. Review the purchase order data provided and run all connector checks. Return ONLY a JSON object with: po_id, review_decision (approve/hold/reject/escalate), approval_tier (manager/director/board), budget_check ({within_budget, utilization_pct, budget_remaining}), vendor_status (registered/pending/blacklisted), authority_check ({adequate, reason}), anomaly_flags (array), findings (array of {code, severity, summary}), requires_human_approval (bool), recommended_action (approve/hold/reject/escalate), decision_reasoning (string), risk_score (0.0-1.0).",
        },
    },
    { step_id: "verify", step_type: "verification", title: "Procurement Risk Snapshot", next_step_id: "decide", config: { recommended_action: "review" } },
    {
        step_id: "decide", step_type: "decision_point", title: "Procurement Decision Gate",
        config: {
            decision_kind: "procurement_review", question: "AI analysis complete. Select the procurement decision:", required_actor: { actor_type: "human" },
            options: [
                { option_id: "approve", label: "Approve PO" },
                { option_id: "hold", label: "Hold for review" },
                { option_id: "reject", label: "Reject PO" },
                { option_id: "escalate", label: "Escalate to director/board" },
            ],
            route_map: { approve: "__end__", hold: "__end__", reject: "__end__", escalate: "__end__", _default: "__end__" },
        },
    },
];
const TRADE_STEPS = [
    {
        step_id: "analyze", step_type: "ai_task", title: "Trade Risk Analysis", next_step_id: "verify",
        config: {
            model: "openai/gpt-4o-mini", api_key_env: "LLM_KEY",
            system_prompt: "You are a crypto trade risk analyst. Review the trade order data and run all risk checks. Return ONLY a JSON object with: trade_id, review_decision (approve/reject/escalate_human), risk_level (low/medium/high/critical), market_check ({price_usd, volatility_score, change_24h_pct}), balance_check ({sufficient, available_margin}), portfolio_risk ({concentration_pct, risk_level, var_1d_usd}), sanctions_check ({is_sanctioned, is_pep, list_name}), anomaly_flags (array), findings (array of {code, severity, summary}), rejection_reasons (array), requires_human_approval (bool), decision_reasoning (string), risk_score (0.0-1.0). IMMEDIATE REJECT: sanctions hit OR leverage > 10x. MANDATORY ESCALATE: order_size_usd >= 10000 OR leverage > 3.",
        },
    },
    { step_id: "verify", step_type: "verification", title: "Trade Risk Snapshot", next_step_id: "decide", config: { recommended_action: "review" } },
    {
        step_id: "decide", step_type: "decision_point", title: "Trading Decision Gate",
        config: {
            decision_kind: "trade_review", question: "Trade risk analysis complete. Select trading decision:", required_actor: { actor_type: "human" },
            options: [
                { option_id: "approve", label: "Approve trade" },
                { option_id: "reject", label: "Reject trade" },
                { option_id: "escalate_human", label: "Escalate to human trader" },
            ],
            route_map: { approve: "__end__", reject: "__end__", escalate_human: "__end__", _default: "__end__" },
        },
    },
];
const AML_STEPS = [
    {
        step_id: "analyze", step_type: "ai_task", title: "AML Alert Triage Analysis", next_step_id: "verify",
        config: {
            model: "openai/gpt-4o-mini", api_key_env: "LLM_KEY",
            system_prompt: "You are an AML compliance analyst performing L1 alert triage. Review the alert data and run all connector checks. Return ONLY a JSON object with: alert_id, triage_decision (false_positive/manual_review/immediate_escalate), risk_score_assessment (0-100), sanctions_check ({is_sanctioned, list_name}), pep_check ({is_pep, pep_category}), typology_match ({matched, typology_code, description}), customer_risk ({rating, jurisdiction_risk, burst_intensity}), anomaly_flags (array), findings (array of {code, severity, summary}), requires_human_approval (bool), recommended_action (clear/escalate_l2/immediate_escalate), decision_reasoning (string), risk_score (0.0-1.0). IMMEDIATE ESCALATE: sanctions_match=true OR pep_status=true OR risk_score > 85. FALSE POSITIVE: risk_score <= 30 AND no sanctions AND no PEP AND no prior alerts.",
        },
    },
    { step_id: "verify", step_type: "verification", title: "AML Risk Snapshot", next_step_id: "decide", config: { recommended_action: "review" } },
    {
        step_id: "decide", step_type: "decision_point", title: "AML Triage Decision Gate",
        config: {
            decision_kind: "aml_triage", question: "AML L1 triage complete. Select compliance decision:", required_actor: { actor_type: "human" },
            options: [
                { option_id: "clear", label: "Clear — false positive" },
                { option_id: "escalate_l2", label: "Escalate to L2 analyst" },
                { option_id: "immediate_escalate", label: "Immediate escalation — freeze account" },
            ],
            route_map: { clear: "__end__", escalate_l2: "__end__", immediate_escalate: "__end__", _default: "__end__" },
        },
    },
];
const COMPLAINTS_STEPS = [
    {
        step_id: "analyze", step_type: "ai_task", title: "Complaint Classification & Risk Analysis", next_step_id: "verify",
        config: {
            model: "openai/gpt-4o-mini", api_key_env: "LLM_KEY",
            system_prompt: "You are an EU financial services complaints handler. Review the complaint data and classify it. Return ONLY a JSON object with: complaint_id, triage_decision (routine/manual_review/blocked), product_risk (low/medium/high), sentiment_flags (array: compensation_claim, regulator_threat, fraud_signal, urgent), repeat_customer (bool), completeness_check ({text_present, channel_valid, product_identified}), anomaly_flags (array), findings (array of {code, severity, summary}), requires_human_approval (bool), recommended_action (auto_resolve/manual_review/reject_incomplete), decision_reasoning (string), risk_score (0.0-1.0), draft_response_hint (string). MANDATORY HUMAN REVIEW: compensation claim OR regulator threat OR repeat customer OR product_risk=high OR fraud_signal. BLOCKED: complaint_text empty or under 10 characters.",
        },
    },
    { step_id: "verify", step_type: "verification", title: "Complaint Risk Snapshot", next_step_id: "decide", config: { recommended_action: "review" } },
    {
        step_id: "decide", step_type: "decision_point", title: "Complaints Handler Decision Gate",
        config: {
            decision_kind: "complaint_review", question: "Complaint classification complete. Select handling decision:", required_actor: { actor_type: "human" },
            options: [
                { option_id: "resolve", label: "Resolve — send standard response" },
                { option_id: "escalate", label: "Escalate to complaints officer" },
                { option_id: "reject", label: "Reject — incomplete or invalid" },
                { option_id: "regulator_flag", label: "Flag for regulator reporting" },
            ],
            route_map: { resolve: "__end__", escalate: "__end__", reject: "__end__", regulator_flag: "__end__", _default: "__end__" },
        },
    },
];
const COMPLIANCE_STEPS = [
    {
        step_id: "analyze", step_type: "ai_task", title: "Compliance Rules Check", next_step_id: "verify",
        config: {
            model: "openai/gpt-4o-mini", api_key_env: "LLM_KEY",
            system_prompt: "You are a compliance auditor. Review the document data against the specified regulatory framework. Return ONLY a JSON object with: document_id, framework, pass_count (int), total_checks (int), critical_count (int), findings (array of {code, severity, summary, recommendation}), requires_human_approval (bool), recommended_action (approve/approve_with_conditions/reject/request_corrections), decision_reasoning (string), risk_score (0.0-1.0).",
        },
    },
    { step_id: "verify", step_type: "verification", title: "Compliance Findings Snapshot", next_step_id: "decide", config: { recommended_action: "review" } },
    {
        step_id: "decide", step_type: "decision_point", title: "Compliance Audit Decision Gate",
        config: {
            decision_kind: "compliance_audit", question: "Compliance audit complete. Select decision:", required_actor: { actor_type: "human" },
            options: [
                { option_id: "approve", label: "Approve — document is compliant" },
                { option_id: "approve_with_conditions", label: "Approve with conditions" },
                { option_id: "reject", label: "Reject — document fails compliance" },
                { option_id: "request_corrections", label: "Return for corrections" },
            ],
            route_map: { approve: "__end__", approve_with_conditions: "__end__", reject: "__end__", request_corrections: "__end__", _default: "__end__" },
        },
    },
];
const CREDIT_STEPS = [
    {
        step_id: "analyze", step_type: "ai_task", title: "Credit Risk Scoring", next_step_id: "verify",
        config: {
            model: "openai/gpt-4o-mini", api_key_env: "LLM_KEY",
            system_prompt: "You are a credit risk analyst. Evaluate the applicant's creditworthiness based on the provided financial data. Return ONLY a JSON object with: applicant_id, score (0-1000), risk_band (excellent/good/fair/poor/very_poor), recommended_limit (number), debt_to_income_ratio (number), key_factors (array of {factor, impact: positive/negative, weight}), model_version (string), findings (array of {code, severity, summary}), requires_human_approval (bool), recommended_action (approve/approve_reduced/reject/request_info), decision_reasoning (string), risk_score (0.0-1.0). MANDATORY HUMAN APPROVAL for all decisions.",
        },
    },
    { step_id: "verify", step_type: "verification", title: "Credit Risk Snapshot", next_step_id: "decide", config: { recommended_action: "review" } },
    {
        step_id: "decide", step_type: "decision_point", title: "Credit Decision Gate",
        config: {
            decision_kind: "credit_decision", question: "Credit scoring complete. Select credit decision:", required_actor: { actor_type: "human" },
            options: [
                { option_id: "approve", label: "Approve at recommended limit" },
                { option_id: "approve_reduced", label: "Approve at reduced limit — specify amount in reason" },
                { option_id: "reject", label: "Reject application" },
                { option_id: "request_info", label: "Request additional documents" },
            ],
            route_map: { approve: "__end__", approve_reduced: "__end__", reject: "__end__", request_info: "__end__", _default: "__end__" },
        },
    },
];
const SUPPLY_CHAIN_STEPS = [
    {
        step_id: "analyze", step_type: "ai_task", title: "Supplier Screening & Risk Analysis", next_step_id: "verify",
        config: {
            model: "openai/gpt-4o-mini", api_key_env: "LLM_KEY",
            system_prompt: "You are a supply chain risk analyst. Screen each supplier against sanctions lists, PEP registries, ESG ratings, and financial stability indicators. Return ONLY a JSON object with: total_count (int), critical_count (int), high_count (int), clean_count (int), results (array of {id, name, country, risk_band: low/medium/high/critical, sanctions_match: bool, pep_match: bool, esg_rating, financial_stability, findings: array}), requires_human_approval (bool), recommended_action (approve_all/approve_clean/reject_all/escalate), decision_reasoning (string), risk_score (0.0-1.0).",
        },
    },
    { step_id: "verify", step_type: "verification", title: "Supply Chain Risk Snapshot", next_step_id: "decide", config: { recommended_action: "review" } },
    {
        step_id: "decide", step_type: "decision_point", title: "Supply Chain Approval Gate",
        config: {
            decision_kind: "supply_chain_review", question: "Supplier screening complete. Select procurement decision:", required_actor: { actor_type: "human" },
            options: [
                { option_id: "approve_all", label: "Approve all screened suppliers" },
                { option_id: "approve_clean", label: "Approve clean suppliers only — block high-risk" },
                { option_id: "reject_all", label: "Block entire batch — pending further review" },
                { option_id: "escalate", label: "Escalate to compliance team" },
            ],
            route_map: { approve_all: "__end__", approve_clean: "__end__", reject_all: "__end__", escalate: "__end__", _default: "__end__" },
        },
    },
];
const CHURN_STEPS = [
    {
        step_id: "analyze", step_type: "ai_task", title: "Churn Risk Prediction", next_step_id: "verify",
        config: {
            model: "openai/gpt-4o-mini", api_key_env: "LLM_KEY",
            system_prompt: "You are a customer retention analyst. Analyze customer behavior signals and predict churn risk. Return ONLY a JSON object with: segment_id, total_analyzed (int), at_risk_count (int), avg_churn_score (number), model_version (string), top_at_risk (array of {customer_id, churn_score, top_factor, recommended_action}), key_signals (array of {signal, importance}), findings (array of {code, severity, summary}), requires_human_approval (bool), recommended_action (launch_campaign/launch_selective/defer/escalate), decision_reasoning (string), risk_score (0.0-1.0).",
        },
    },
    { step_id: "verify", step_type: "verification", title: "Churn Risk Snapshot", next_step_id: "decide", config: { recommended_action: "review" } },
    {
        step_id: "decide", step_type: "decision_point", title: "Retention Campaign Decision Gate",
        config: {
            decision_kind: "churn_retention", question: "Churn analysis complete. Select retention action:", required_actor: { actor_type: "human" },
            options: [
                { option_id: "launch_campaign", label: "Launch retention campaign for all high-risk customers" },
                { option_id: "launch_selective", label: "Launch for top-N only — specify N in reason" },
                { option_id: "defer", label: "Defer to next review cycle" },
                { option_id: "escalate", label: "Escalate to VP of Customer Success" },
            ],
            route_map: { launch_campaign: "__end__", launch_selective: "__end__", defer: "__end__", escalate: "__end__", _default: "__end__" },
        },
    },
];
const CONTRACT_GEN_STEPS = [
    {
        step_id: "analyze", step_type: "ai_task", title: "Legal Document Draft Generation", next_step_id: "verify",
        config: {
            model: "openai/gpt-4o-mini", api_key_env: "LLM_KEY",
            system_prompt: "You are a legal document specialist. Generate a structured legal document draft from the provided parameters. Return ONLY a JSON object with: document_id (string), doc_type, party_a, party_b, jurisdiction, sections (array of {section_id, title, content}), terms_extracted (object), findings (array of {code, severity, summary}), requires_human_approval (bool, always true), recommended_action (always 'review_sections'), decision_reasoning (string), risk_score (0.0-1.0).",
        },
    },
    { step_id: "verify", step_type: "verification", title: "Document Draft Ready for Review", next_step_id: "decide", config: { recommended_action: "review" } },
    {
        step_id: "decide", step_type: "decision_point", title: "Legal Review & Sign-off Gate",
        config: {
            decision_kind: "contract_review", question: "Document draft generated. Select review action:", required_actor: { actor_type: "human" },
            options: [
                { option_id: "approve_section", label: "Approve current section as written" },
                { option_id: "edit_section", label: "Accept with edits — provide edited text in reason" },
                { option_id: "reject_section", label: "Reject section — request redraft" },
                { option_id: "escalate", label: "Escalate to senior legal counsel" },
            ],
            route_map: { approve_section: "__end__", edit_section: "__end__", reject_section: "__end__", escalate: "__end__", _default: "__end__" },
        },
    },
];
// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
    {
        name: "mova_hitl_start",
        description: "Submit a financial document (invoice, receipt, bill) for OCR extraction and human-in-the-loop approval. Returns analysis results and a decision gate.",
        inputSchema: {
            type: "object",
            properties: {
                file_url: { type: "string", description: "Direct HTTPS URL to the document image (PDF, JPEG, PNG)" },
                document_id: { type: "string", description: "Optional document ID (auto-generated if not provided)" },
            },
            required: ["file_url"],
        },
    },
    {
        name: "mova_hitl_start_po",
        description: "Submit a purchase order for automated risk analysis and human procurement approval.",
        inputSchema: {
            type: "object",
            properties: {
                po_id: { type: "string", description: "Purchase order number, e.g. PO-2026-001" },
                approver_employee_id: { type: "string", description: "HR employee ID of the approver, e.g. EMP-1042" },
            },
            required: ["po_id", "approver_employee_id"],
        },
    },
    {
        name: "mova_hitl_start_trade",
        description: "Submit a crypto trade order for sanctions screening, portfolio risk analysis, and human decision gate. Mandatory escalation for orders ≥ $10,000 or leverage > 3x.",
        inputSchema: {
            type: "object",
            properties: {
                trade_id: { type: "string", description: "Trade order ID, e.g. TRD-2026-0001" },
                wallet_address: { type: "string", description: "Wallet address to screen" },
                chain: { type: "string", description: "Blockchain: ethereum, bitcoin, solana" },
                token_pair: { type: "string", description: "Token pair, e.g. BTC/USDT" },
                side: { type: "string", enum: ["buy", "sell"] },
                order_type: { type: "string", description: "Order type: market, limit, stop" },
                order_size_usd: { type: "number", description: "Order size in USD" },
                leverage: { type: "number", description: "Leverage multiplier, 1 = no leverage" },
            },
            required: ["trade_id", "wallet_address", "chain", "token_pair", "side", "order_type", "order_size_usd", "leverage"],
        },
    },
    {
        name: "mova_hitl_start_aml",
        description: "Submit an AML alert for automated L1 triage: sanctions screening, PEP check, typology matching, and human compliance decision gate.",
        inputSchema: {
            type: "object",
            properties: {
                alert_id: { type: "string" },
                rule_id: { type: "string" },
                rule_description: { type: "string" },
                risk_score: { type: "number", description: "Risk score 0–100" },
                customer_id: { type: "string" },
                customer_name: { type: "string" },
                customer_risk_rating: { type: "string", enum: ["low", "medium", "high"] },
                customer_type: { type: "string", enum: ["individual", "business"] },
                customer_jurisdiction: { type: "string", description: "ISO 3166-1 alpha-2, e.g. DE" },
                triggered_transactions: { type: "array", items: { type: "object", properties: { transaction_id: { type: "string" }, amount_eur: { type: "number" } }, required: ["transaction_id", "amount_eur"] } },
                pep_status: { type: "boolean" },
                sanctions_match: { type: "boolean" },
                historical_alerts: { type: "array", items: { type: "string" } },
            },
            required: ["alert_id", "rule_id", "rule_description", "risk_score", "customer_id", "customer_name", "customer_risk_rating", "customer_type", "customer_jurisdiction", "triggered_transactions", "pep_status", "sanctions_match"],
        },
    },
    {
        name: "mova_hitl_start_complaint",
        description: "Submit a customer complaint for EU-compliant AI classification and human decision gate.",
        inputSchema: {
            type: "object",
            properties: {
                complaint_id: { type: "string" },
                customer_id: { type: "string" },
                complaint_text: { type: "string" },
                channel: { type: "string", description: "Submission channel: web, email, phone, chat, branch" },
                product_category: { type: "string", description: "e.g. payments, mortgage, insurance" },
                complaint_date: { type: "string", description: "ISO date, e.g. 2026-03-19" },
                previous_complaints: { type: "array", items: { type: "string" } },
                customer_segment: { type: "string" },
                preferred_language: { type: "string" },
            },
            required: ["complaint_id", "customer_id", "complaint_text", "channel", "product_category", "complaint_date"],
        },
    },
    {
        name: "mova_hitl_start_compliance",
        description: "Submit a document for compliance audit against GDPR, PCI-DSS, ISO 27001, or SOC 2 with a human review gate.",
        inputSchema: {
            type: "object",
            properties: {
                document_url: { type: "string", description: "Direct HTTPS URL to the document" },
                framework: { type: "string", description: "Compliance framework: gdpr, pci_dss, iso_27001, soc2" },
                org_name: { type: "string", description: "Organization name" },
                document_id: { type: "string", description: "Document ID (auto-generated if omitted)" },
            },
            required: ["document_url", "framework", "org_name"],
        },
    },
    {
        name: "mova_hitl_start_credit",
        description: "Submit applicant data for automated credit risk scoring and human approval gate.",
        inputSchema: {
            type: "object",
            properties: {
                applicant_id: { type: "string" },
                monthly_income: { type: "number" },
                total_debt: { type: "number" },
                credit_history_months: { type: "number" },
                bureau_score: { type: "number" },
                requested_amount: { type: "number" },
                loan_purpose: { type: "string", description: "home, auto, business, personal" },
            },
            required: ["applicant_id", "monthly_income", "total_debt", "credit_history_months", "bureau_score", "requested_amount", "loan_purpose"],
        },
    },
    {
        name: "mova_hitl_start_supply_chain",
        description: "Screen a supplier list against sanctions, PEP registries, ESG ratings, and financial stability data with a human approval gate.",
        inputSchema: {
            type: "object",
            properties: {
                suppliers: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, country: { type: "string" } }, required: ["id", "name", "country"] } },
                category: { type: "string", description: "raw_materials, logistics, technology, services" },
                requestor_id: { type: "string" },
            },
            required: ["suppliers", "category", "requestor_id"],
        },
    },
    {
        name: "mova_hitl_start_churn",
        description: "Analyze customer behavior signals to predict churn risk and route retention campaign decision through a human approval gate.",
        inputSchema: {
            type: "object",
            properties: {
                segment_id: { type: "string" },
                period_days: { type: "number" },
                threshold: { type: "number", description: "Churn probability threshold 0.0–1.0" },
                requestor_id: { type: "string" },
            },
            required: ["segment_id", "period_days", "threshold", "requestor_id"],
        },
    },
    {
        name: "mova_hitl_start_contract_gen",
        description: "Generate a legal document (NDA, service agreement, supply contract, SLA) with section-by-section human review gates.",
        inputSchema: {
            type: "object",
            properties: {
                doc_type: { type: "string", description: "nda, service_agreement, supply_contract, sla" },
                party_a: { type: "string" },
                party_b: { type: "string" },
                jurisdiction: { type: "string", description: "e.g. DE, US-NY, EU" },
                effective_date: { type: "string", description: "ISO date, e.g. 2026-04-01" },
                terms: { type: "object", description: "Additional terms as key-value pairs" },
                template_id: { type: "string" },
            },
            required: ["doc_type", "party_a", "party_b", "jurisdiction", "effective_date"],
        },
    },
    {
        name: "mova_hitl_decide",
        description: "Submit a human decision for a contract waiting at a human gate. Use the contract_id returned by mova_hitl_start* tools.",
        inputSchema: {
            type: "object",
            properties: {
                contract_id: { type: "string", description: "Contract ID from mova_hitl_start* response" },
                option: { type: "string", description: "Decision option, e.g. approve, reject, escalate" },
                reason: { type: "string", description: "Human reasoning for the decision" },
            },
            required: ["contract_id", "option"],
        },
    },
    {
        name: "mova_hitl_status",
        description: "Get the current status of a MOVA contract.",
        inputSchema: {
            type: "object",
            properties: { contract_id: { type: "string" } },
            required: ["contract_id"],
        },
    },
    {
        name: "mova_hitl_audit",
        description: "Get the full audit receipt for a completed MOVA contract.",
        inputSchema: {
            type: "object",
            properties: { contract_id: { type: "string" } },
            required: ["contract_id"],
        },
    },
    {
        name: "mova_hitl_audit_compact",
        description: "Get the compact audit journal for a contract — full signed event chain with timestamps.",
        inputSchema: {
            type: "object",
            properties: { contract_id: { type: "string" } },
            required: ["contract_id"],
        },
    },
    {
        name: "mova_calibrate_intent",
        description: "Pre-flight check before starting a MOVA contract. Call when the user's request is ambiguous or missing required fields. Returns next question (ASK) or confirmation all inputs are ready (VALID).",
        inputSchema: {
            type: "object",
            properties: {
                contract_type: { type: "string", description: "invoice | po | trade | complaint | aml | compliance | credit | supply_chain | churn | contract_gen" },
                answers: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            field: { type: "string" },
                            value: { type: "string" },
                        },
                        required: ["field", "value"],
                    },
                    description: "Answers collected so far. Empty array on first call.",
                },
            },
            required: ["contract_type", "answers"],
        },
    },
    {
        name: "mova_list_connectors",
        description: "List all available MOVA connectors. Optionally filter by keyword.",
        inputSchema: {
            type: "object",
            properties: { keyword: { type: "string", description: "Filter keyword, e.g. erp, aml, ocr" } },
        },
    },
    {
        name: "mova_list_connector_overrides",
        description: "List all connector overrides registered for your org.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "mova_register_connector",
        description: "Register your own HTTPS endpoint for a MOVA connector. After registration all contracts in your org will call your endpoint instead of the sandbox mock.",
        inputSchema: {
            type: "object",
            properties: {
                connector_id: { type: "string", description: "Connector ID, e.g. connector.erp.po_lookup_v1" },
                endpoint: { type: "string", description: "Your HTTPS endpoint URL" },
                label: { type: "string" },
                auth_header: { type: "string", description: "Auth header name, e.g. X-Api-Key" },
                auth_value: { type: "string" },
            },
            required: ["connector_id", "endpoint"],
        },
    },
    {
        name: "mova_delete_connector_override",
        description: "Remove a connector override — the connector reverts to the MOVA sandbox mock.",
        inputSchema: {
            type: "object",
            properties: { connector_id: { type: "string" } },
            required: ["connector_id"],
        },
    },
    {
        name: "mova_discover_contracts",
        description: "Browse the public MOVA contract marketplace.",
        inputSchema: {
            type: "object",
            properties: {
                keyword: { type: "string" },
                execution_mode: { type: "string", description: "deterministic, bounded_variance, ai_assisted, human_gated" },
            },
        },
    },
    {
        name: "mova_register_contract",
        description: "Register a MOVA contract by providing its source_url and manifest.",
        inputSchema: {
            type: "object",
            properties: {
                source_url: { type: "string" },
                title: { type: "string" },
                version: { type: "string" },
                execution_mode: { type: "string" },
                description: { type: "string" },
                required_connectors: { type: "array", items: { type: "string" } },
                visibility: { type: "string", description: "private or public" },
            },
            required: ["source_url", "title", "version", "execution_mode"],
        },
    },
    {
        name: "mova_list_my_contracts",
        description: "List all contracts registered by your organization.",
        inputSchema: {
            type: "object",
            properties: { keyword: { type: "string" } },
        },
    },
    {
        name: "mova_set_contract_visibility",
        description: "Change the visibility of a registered contract to private or public.",
        inputSchema: {
            type: "object",
            properties: {
                contract_id: { type: "string" },
                visibility: { type: "string", description: "private or public" },
            },
            required: ["contract_id", "visibility"],
        },
    },
    {
        name: "mova_delete_contract",
        description: "Remove a contract registration from MOVA.",
        inputSchema: {
            type: "object",
            properties: { contract_id: { type: "string" } },
            required: ["contract_id"],
        },
    },
    {
        name: "mova_run_contract",
        description: "Execute a registered MOVA contract. Returns verdict with output.",
        inputSchema: {
            type: "object",
            properties: {
                contract_id: { type: "string" },
                inputs: { type: "object", description: "Input key-value pairs for the contract" },
                connector_overrides: { type: "object", description: "Override connector endpoints for this run only" },
            },
            required: ["contract_id"],
        },
    },
    {
        name: "mova_run_status",
        description: "Get the status and result of a previously started contract run.",
        inputSchema: {
            type: "object",
            properties: { run_id: { type: "string" } },
            required: ["run_id"],
        },
    },
];
// ── Intent calibration schemas ────────────────────────────────────────────────
const CONTRACT_SCHEMAS = {
    invoice: [
        { field: "file_url", question: "Provide the direct HTTPS URL to the invoice document (PDF, JPEG or PNG).", example: "https://example.com/invoice.jpg", required: true },
        { field: "document_id", question: "Provide a document ID, or reply 'skip' to auto-generate.", example: "INV-2026-0441", required: false },
    ],
    po: [
        { field: "po_id", question: "What is the purchase order number?", example: "PO-2026-001", required: true },
        { field: "approver_employee_id", question: "What is the HR employee ID of the approver?", example: "EMP-1042", required: true },
    ],
    trade: [
        { field: "trade_id", question: "What is the trade order ID?", example: "TRD-2026-0001", required: true },
        { field: "wallet_address", question: "What is the wallet address to screen?", example: "0xabc123…", required: true },
        { field: "chain", question: "Which blockchain network?", example: "ethereum", required: true },
        { field: "token_pair", question: "Which token pair?", example: "BTC/USDT", required: true },
        { field: "side", question: "Buy or sell?", example: "buy", required: true },
        { field: "order_type", question: "What order type?", example: "market", required: true },
        { field: "order_size_usd", question: "What is the order size in USD?", example: "5000", required: true },
        { field: "leverage", question: "What leverage multiplier? (1 = no leverage)", example: "1", required: true },
    ],
    complaint: [
        { field: "complaint_id", question: "What is the complaint ID?", example: "CMP-2026-1001", required: true },
        { field: "customer_id", question: "What is the customer ID?", example: "C-789", required: true },
        { field: "complaint_text", question: "Provide the full complaint text.", example: "Payment deducted twice…", required: true },
        { field: "channel", question: "Through which channel was the complaint submitted?", example: "web, email, phone, chat", required: true },
        { field: "product_category", question: "Which product or service category?", example: "payments, mortgage, insurance", required: true },
        { field: "complaint_date", question: "What is the complaint date (ISO format)?", example: "2026-03-25", required: true },
    ],
    aml: [
        { field: "alert_id", question: "What is the AML alert ID?", example: "ALERT-1002", required: true },
        { field: "rule_id", question: "What is the transaction monitoring rule ID?", example: "TM-STRUCT-11", required: true },
        { field: "rule_description", question: "Describe the rule that triggered the alert.", example: "Structuring pattern", required: true },
        { field: "risk_score", question: "What is the risk score (0–100)?", example: "72", required: true },
        { field: "customer_id", question: "What is the customer ID?", example: "C-1042", required: true },
        { field: "customer_name", question: "What is the customer's full name?", example: "Ivan Petrov", required: true },
        { field: "customer_risk_rating", question: "What is the customer risk rating?", example: "low, medium, or high", required: true },
        { field: "customer_type", question: "Is the customer an individual or a business?", example: "individual", required: true },
        { field: "customer_jurisdiction", question: "What is the customer's jurisdiction (ISO alpha-2)?", example: "DE", required: true },
        { field: "triggered_transactions", question: "List triggered transactions as JSON array.", example: '[{"transaction_id":"TXN-001","amount_eur":9800}]', required: true },
        { field: "pep_status", question: "Is the customer a PEP? (true/false)", example: "false", required: true },
        { field: "sanctions_match", question: "Is there a sanctions list match? (true/false)", example: "false", required: true },
    ],
    compliance: [
        { field: "document_url", question: "Provide the direct HTTPS URL to the document to audit.", example: "https://example.com/policy.pdf", required: true },
        { field: "framework", question: "Which compliance framework?", example: "gdpr, pci_dss, iso_27001, soc2", required: true },
        { field: "org_name", question: "What is the organization name?", example: "Acme Corp", required: true },
        { field: "document_id", question: "Provide a document ID, or reply 'skip' to auto-generate.", example: "POL-2026-001", required: false },
    ],
    credit: [
        { field: "applicant_id", question: "What is the applicant ID?", example: "APP-2026-0042", required: true },
        { field: "monthly_income", question: "What is the monthly income?", example: "5000", required: true },
        { field: "total_debt", question: "What is the total existing debt?", example: "12000", required: true },
        { field: "credit_history_months", question: "How many months of credit history?", example: "36", required: true },
        { field: "bureau_score", question: "What is the credit bureau score?", example: "720", required: true },
        { field: "requested_amount", question: "What loan amount is requested?", example: "25000", required: true },
        { field: "loan_purpose", question: "What is the purpose of the loan?", example: "home, auto, business, personal", required: true },
    ],
    supply_chain: [
        { field: "suppliers", question: "Provide the supplier list as a JSON array with id, name, and country.", example: '[{"id":"SUP-001","name":"Acme GmbH","country":"DE"}]', required: true },
        { field: "category", question: "What is the procurement category?", example: "raw_materials, logistics, technology, services", required: true },
        { field: "requestor_id", question: "What is the requestor employee ID?", example: "EMP-1042", required: true },
    ],
    churn: [
        { field: "segment_id", question: "What is the customer segment ID to analyze?", example: "SEG-enterprise-2026", required: true },
        { field: "period_days", question: "How many days of activity history to analyze?", example: "30", required: true },
        { field: "threshold", question: "What churn probability threshold to flag (0.0–1.0)?", example: "0.7", required: true },
        { field: "requestor_id", question: "What is the requestor employee ID?", example: "EMP-1042", required: true },
    ],
    contract_gen: [
        { field: "doc_type", question: "What type of document to generate?", example: "nda, service_agreement, supply_contract, sla", required: true },
        { field: "party_a", question: "What is the name of Party A?", example: "Acme Corp", required: true },
        { field: "party_b", question: "What is the name of Party B?", example: "Beta LLC", required: true },
        { field: "jurisdiction", question: "What is the governing law jurisdiction?", example: "DE, US-NY, EU", required: true },
        { field: "effective_date", question: "What is the effective date (ISO format)?", example: "2026-04-01", required: true },
        { field: "template_id", question: "Provide a template ID, or reply 'skip' to use default.", example: "TMPL-NDA-001", required: false },
    ],
};
const START_TOOL = {
    invoice: "mova_hitl_start", po: "mova_hitl_start_po", trade: "mova_hitl_start_trade",
    complaint: "mova_hitl_start_complaint", aml: "mova_hitl_start_aml", compliance: "mova_hitl_start_compliance",
    credit: "mova_hitl_start_credit", supply_chain: "mova_hitl_start_supply_chain",
    churn: "mova_hitl_start_churn", contract_gen: "mova_hitl_start_contract_gen",
};
async function executeTool(name, args) {
    const config = cfg();
    async function startContract(contractId, templateId, policyRef, inputs, steps) {
        await movaPost(config, "/api/v1/contracts", {
            envelope: { kind: "env.contract.start_v0", envelope_id: `env-${shortId()}`, contract_id: contractId, actor: { actor_type: "human", actor_id: "user" }, payload: { template_id: templateId, policy_profile_ref: policyRef, initial_inputs: inputs } },
            steps,
        });
        return movaRunSteps(config, contractId);
    }
    switch (name) {
        case "mova_hitl_start": {
            const docId = args.document_id || `INV-${shortId().toUpperCase()}`;
            const cid = `ctr-invoice-${shortId()}`;
            return JSON.stringify(await startContract(cid, "tpl.finance.invoice_ocr_hitl_v0", "policy.hitl.finance.invoice_ocr_v0", [
                { key: "document_id", value: docId }, { key: "document_type", value: "invoice" }, { key: "file_url", value: args.file_url },
            ], INVOICE_STEPS));
        }
        case "mova_hitl_start_po": {
            const cid = `ctr-po-${shortId()}`;
            return JSON.stringify(await startContract(cid, "tpl.erp.po_approval_hitl_v0", "policy.hitl.erp.po_approval_v0", [
                { key: "po_id", value: args.po_id }, { key: "approver_employee_id", value: args.approver_employee_id },
            ], PO_STEPS));
        }
        case "mova_hitl_start_trade": {
            const cid = `ctr-trade-${shortId()}`;
            return JSON.stringify(await startContract(cid, "tpl.crypto.trade_review_hitl_v0", "policy.hitl.crypto.trade_review_v0", [
                { key: "trade_id", value: args.trade_id }, { key: "wallet_address", value: args.wallet_address },
                { key: "chain", value: args.chain }, { key: "token_pair", value: args.token_pair },
                { key: "side", value: args.side }, { key: "order_type", value: args.order_type },
                { key: "order_size_usd", value: String(args.order_size_usd) }, { key: "leverage", value: String(args.leverage) },
            ], TRADE_STEPS));
        }
        case "mova_hitl_start_aml": {
            const cid = `ctr-aml-${shortId()}`;
            return JSON.stringify(await startContract(cid, "tpl.aml.alert_triage_hitl_v0", "policy.hitl.aml.alert_triage_v0", [
                { key: "alert_id", value: args.alert_id }, { key: "rule_id", value: args.rule_id },
                { key: "rule_description", value: args.rule_description }, { key: "risk_score", value: String(args.risk_score) },
                { key: "customer_id", value: args.customer_id }, { key: "customer_name", value: args.customer_name },
                { key: "customer_risk_rating", value: args.customer_risk_rating }, { key: "customer_type", value: args.customer_type },
                { key: "customer_jurisdiction", value: args.customer_jurisdiction },
                { key: "triggered_transactions", value: JSON.stringify(args.triggered_transactions) },
                { key: "pep_status", value: String(args.pep_status) }, { key: "sanctions_match", value: String(args.sanctions_match) },
                { key: "historical_alerts", value: JSON.stringify(args.historical_alerts ?? []) },
            ], AML_STEPS));
        }
        case "mova_hitl_start_complaint": {
            const cid = `ctr-cmp-${shortId()}`;
            return JSON.stringify(await startContract(cid, "tpl.complaints.handler_hitl_v0", "policy.hitl.complaints.handler_v0", [
                { key: "complaint_id", value: args.complaint_id }, { key: "customer_id", value: args.customer_id },
                { key: "complaint_text", value: args.complaint_text }, { key: "channel", value: args.channel },
                { key: "product_category", value: args.product_category }, { key: "complaint_date", value: args.complaint_date },
                { key: "previous_complaints", value: JSON.stringify(args.previous_complaints ?? []) },
                { key: "customer_segment", value: args.customer_segment ?? "" },
                { key: "preferred_language", value: args.preferred_language ?? "en" },
            ], COMPLAINTS_STEPS));
        }
        case "mova_hitl_start_compliance": {
            const cid = `ctr-cmp-${shortId()}`;
            return JSON.stringify(await startContract(cid, "tpl.compliance.audit_hitl_v0", "policy.hitl.compliance.audit_v0", [
                { key: "document_url", value: args.document_url }, { key: "framework", value: args.framework },
                { key: "org_name", value: args.org_name }, { key: "document_id", value: args.document_id ?? `DOC-${shortId()}` },
            ], COMPLIANCE_STEPS));
        }
        case "mova_hitl_start_credit": {
            const cid = `ctr-crd-${shortId()}`;
            return JSON.stringify(await startContract(cid, "tpl.credit.scoring_hitl_v0", "policy.hitl.credit.scoring_v0", [
                { key: "applicant_id", value: args.applicant_id }, { key: "monthly_income", value: String(args.monthly_income) },
                { key: "total_debt", value: String(args.total_debt) }, { key: "credit_history_months", value: String(args.credit_history_months) },
                { key: "bureau_score", value: String(args.bureau_score) }, { key: "requested_amount", value: String(args.requested_amount) },
                { key: "loan_purpose", value: args.loan_purpose },
            ], CREDIT_STEPS));
        }
        case "mova_hitl_start_supply_chain": {
            const cid = `ctr-scr-${shortId()}`;
            return JSON.stringify(await startContract(cid, "tpl.supply_chain.risk_hitl_v0", "policy.hitl.supply_chain.risk_v0", [
                { key: "suppliers", value: JSON.stringify(args.suppliers) }, { key: "category", value: args.category },
                { key: "requestor_id", value: args.requestor_id },
            ], SUPPLY_CHAIN_STEPS));
        }
        case "mova_hitl_start_churn": {
            const cid = `ctr-chu-${shortId()}`;
            return JSON.stringify(await startContract(cid, "tpl.churn.prediction_hitl_v0", "policy.hitl.churn.prediction_v0", [
                { key: "segment_id", value: args.segment_id }, { key: "period_days", value: String(args.period_days) },
                { key: "threshold", value: String(args.threshold) }, { key: "requestor_id", value: args.requestor_id },
            ], CHURN_STEPS));
        }
        case "mova_hitl_start_contract_gen": {
            const cid = `ctr-cng-${shortId()}`;
            return JSON.stringify(await startContract(cid, args.template_id ?? `tpl.legal.${args.doc_type}_hitl_v0`, "policy.hitl.legal.contract_gen_v0", [
                { key: "doc_type", value: args.doc_type }, { key: "party_a", value: args.party_a },
                { key: "party_b", value: args.party_b }, { key: "jurisdiction", value: args.jurisdiction },
                { key: "effective_date", value: args.effective_date }, { key: "terms", value: JSON.stringify(args.terms ?? {}) },
            ], CONTRACT_GEN_STEPS));
        }
        case "mova_hitl_decide": {
            const cid = args.contract_id;
            const dpResp = await movaGet(config, `/api/v1/contracts/${cid}/decision`);
            const dp = (dpResp.decision_point ?? {});
            const result = await movaPost(config, `/api/v1/contracts/${cid}/decision`, {
                envelope: {
                    kind: "env.decision.submit_v0", envelope_id: `env-${shortId()}`, contract_id: cid,
                    decision_point_id: dp.decision_point_id ?? "",
                    actor: { actor_type: "human", actor_id: "user" },
                    payload: { selected_option_id: args.option, selection_reason: args.reason ?? "decision via MOVA MCP" },
                },
            });
            if (!result.ok)
                return JSON.stringify(result);
            const audit = await movaGet(config, `/api/v1/contracts/${cid}/audit`);
            return JSON.stringify({ ok: true, status: "completed", contract_id: cid, decision: args.option, audit_receipt: audit.audit_receipt ?? {} });
        }
        case "mova_hitl_status":
            return JSON.stringify(await movaGet(config, `/api/v1/contracts/${args.contract_id}`));
        case "mova_hitl_audit":
            return JSON.stringify(await movaGet(config, `/api/v1/contracts/${args.contract_id}/audit`));
        case "mova_hitl_audit_compact": {
            const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/v1/contracts/${args.contract_id}/audit/compact/sidecar.jsonl`, { headers: { Authorization: `Bearer ${config.apiKey}`, "X-LLM-Key": config.llmKey, "X-LLM-Model": config.llmModel } });
            return JSON.stringify({ ok: res.ok, status: res.status, journal: await res.text() });
        }
        case "mova_calibrate_intent": {
            const schema = CONTRACT_SCHEMAS[args.contract_type];
            if (!schema)
                return JSON.stringify({ status: "UNKNOWN_CONTRACT_TYPE", message: `Unknown: "${args.contract_type}". Available: ${Object.keys(CONTRACT_SCHEMAS).join(", ")}` });
            const answersMap = new Map(args.answers.map(a => [a.field, a.value.trim()]));
            const required = schema.filter(f => f.required);
            const missing = required.filter(f => !answersMap.get(f.field));
            if (missing.length > 0) {
                const next = missing[0];
                return JSON.stringify({ status: "ASK", field: next.field, question: next.question, example: next.example, progress: `${required.length - missing.length} of ${required.length} required fields collected`, instruction: "Ask the user this question exactly." });
            }
            const resolved = {};
            for (const f of schema) {
                const v = answersMap.get(f.field);
                if (v)
                    resolved[f.field] = v;
            }
            return JSON.stringify({ status: "VALID", contract_type: args.contract_type, resolved_inputs: resolved, next_tool: START_TOOL[args.contract_type], instruction: `All inputs collected. Call ${START_TOOL[args.contract_type]} with these resolved_inputs.` });
        }
        case "mova_list_connectors": {
            const data = await movaGet(config, "/api/v1/connectors");
            let list = data.connectors ?? [];
            if (args.keyword) {
                const kw = args.keyword.toLowerCase();
                list = list.filter(c => c.connector_id.toLowerCase().includes(kw) || c.display_name.toLowerCase().includes(kw) || c.description.toLowerCase().includes(kw));
            }
            return JSON.stringify({ connectors: list, total: list.length });
        }
        case "mova_list_connector_overrides":
            return JSON.stringify(await movaGet(config, "/api/v1/connectors/overrides"));
        case "mova_register_connector":
            return JSON.stringify(await movaPut(config, `/api/v1/connectors/${args.connector_id}/override`, {
                endpoint: args.endpoint, label: args.label, auth_header: args.auth_header, auth_value: args.auth_value,
            }));
        case "mova_delete_connector_override":
            return JSON.stringify(await movaDelete(config, `/api/v1/connectors/${args.connector_id}/override`));
        case "mova_discover_contracts": {
            const params = new URLSearchParams();
            if (args.keyword)
                params.set("keyword", args.keyword);
            if (args.execution_mode)
                params.set("execution_mode", args.execution_mode);
            const qs = params.toString();
            return JSON.stringify(await movaGet(config, qs ? `/api/v1/contracts/public?${qs}` : "/api/v1/contracts/public"));
        }
        case "mova_register_contract":
            return JSON.stringify(await movaPost(config, "/api/v1/contracts/register", {
                source_url: args.source_url, visibility: args.visibility ?? "private",
                manifest: { title: args.title, version: args.version, execution_mode: args.execution_mode, description: args.description ?? "", required_connectors: args.required_connectors ?? [] },
            }));
        case "mova_list_my_contracts":
            return JSON.stringify(await movaGet(config, args.keyword ? `/api/v1/contracts/mine?keyword=${encodeURIComponent(args.keyword)}` : "/api/v1/contracts/mine"));
        case "mova_set_contract_visibility":
            return JSON.stringify(await movaPut(config, `/api/v1/contracts/${args.contract_id}/visibility`, { visibility: args.visibility }));
        case "mova_delete_contract":
            return JSON.stringify(await movaDelete(config, `/api/v1/contracts/${args.contract_id}`));
        case "mova_run_contract":
            return JSON.stringify(await movaPost(config, `/api/v1/run/${args.contract_id}`, { inputs: args.inputs ?? {}, connector_overrides: args.connector_overrides ?? {} }));
        case "mova_run_status":
            return JSON.stringify(await movaGet(config, `/api/v1/run/${args.run_id}`));
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server({ name: "mova-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        const result = await executeTool(name, (args ?? {}));
        return { content: [{ type: "text", text: result }] };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: msg }) }], isError: true };
    }
});
const transport = new StdioServerTransport();
await server.connect(transport);
