# mova-flat-runner

**Public test release — lightweight contract execution for Claude and MCP-compatible AI clients.**

MOVA Flat Runner is a small, practical facade for running AI-assisted business workflows with human approval and an audit trail.

It gives Claude a contract-shaped way to handle bounded workflows such as invoice review, supplier screening, complaint triage, refund approval, purchase order review, or internal approval tasks.

This is intentionally **not** the full MOVA State engine.

You do not need the broader MOVA ecosystem, a state machine setup, or a custom backend to try it. The goal of this repository is simple:

```
connect MCP client
→ run a contract-shaped workflow
→ keep a human decision gate
→ receive an audit trail
```

This repository is currently in a **public feedback phase**.

A temporary shared API key is provided so the Anthropic / MCP community can try the runner with minimal setup. After feedback is collected, the test API will be replaced by a production implementation with proper accounts, API keys, quotas, private connector configuration, and clearer deployment boundaries.

Use this release for testing, prototyping, and feedback.

> **Do not** send sensitive production data, regulated customer data, secrets, credentials, private keys, or confidential business documents through the shared test API.

---

## What it does

MOVA Flat Runner lets an AI assistant run a bounded workflow instead of improvising.

It can:

- run built-in demo workflows
- run registered custom contracts
- validate inputs before execution
- call a configured LLM provider for analysis steps
- keep a human decision gate before final outcome
- record an audit trail for each run
- work from Claude Desktop, Claude Code, Cursor, or other MCP-compatible clients

The core idea:

```
AI proposes analysis
contract constrains the workflow
human approves the final decision
audit records what happened
```

---

## What it is not

This public test release is:

- not a general autonomous agent
- not a replacement for Claude Skills
- not the full MOVA State 1.5 engine
- not a certified compliance, credit, legal, medical, or financial decision system
- not production infrastructure
- not a place to send sensitive data through the shared API key
- not a system that makes final business decisions without a human gate

The runner is intentionally flat and practical. For high-risk, multi-step, policy-heavy execution with formal transition authority, the broader MOVA State engine is a separate layer.

---

## Current release status

| | |
|---|---|
| Status | Public test release |
| API access | Temporary shared test key |
| Target users | Anthropic / MCP community, AI workflow builders, automation experimenters |
| Goal | Collect feedback before production release |

The shared API key may be rate-limited, rotated, or disabled after the feedback phase.

Production plans include individual API keys, account-scoped contract storage, quotas, private connector configuration, stronger audit export, clearer retention policy, and an optional private execution path for sensitive workflows.

---

## Temporary test API access

For this public test release, use:

```
MOVA_API_KEY=test-key-001
```

This key is shared and temporary. Use it only for testing, prototyping, and feedback — not for real customer data, regulated decisions, confidential documents, credentials, or production workflows.

Use synthetic examples, public test files, or non-sensitive documents.

---

## 60-second test

After setup, ask Claude:

> Use MOVA health check.

Then try the invoice example:

> Process this invoice: `https://raw.githubusercontent.com/mova-compact/mova-flat-runner/main/test_invoice_INV-2026-0441.png`

Expected flow:

```
1. MOVA starts an invoice contract
2. The invoice is analysed
3. Verification findings are returned
4. Claude asks you for a human decision
5. You choose: approve / reject / escalate
6. MOVA returns an audit receipt
```

---

## Built-in demo workflows

These workflows are ready to use as live examples of the contract pattern. They are **demonstration workflows**, not certified domain systems.

| Workflow | What it demonstrates |
|---|---|
| Invoice approval | OCR extraction, duplicate check, IBAN change detection, VAT validation |
| Purchase order review | Structured line-item review and approval |
| Supplier risk | Multi-supplier assessment with country and compliance checks |
| Complaint handling | Customer complaint triage and resolution routing |
| Compliance audit | Policy violation review with severity grading |
| AML triage | Sanctions / PEP-style risk review as a demo pattern |
| Credit review | Threshold-based review as a demo pattern |
| Trade review | Risk and limit review as a demo pattern |
| Churn prediction | Retention risk classification as a demo pattern |
| Contract generation | Structured contract drafting from a natural language brief |

> **Built-in workflows are examples. Custom contracts are the main idea.**

The runner is useful when you want Claude to follow a bounded workflow instead of inventing a process on the fly.

---

## How to create your own contract

Tell Claude what workflow you want to create. Claude calls `mova_calibrate_intent`, which turns your plain-language request into a structured contract definition. After that, the workflow can be registered and run like the built-in examples.

Example prompts:

> I want a workflow that screens new freelancer applications, checks portfolio completeness, validates tax ID format, and routes high-risk cases to manual review.

> Create a contract for approving refund requests above €500. It should extract the reason, check whether the order ID is present, and log every human decision.

> Build a supplier onboarding workflow with document completeness checks and a compliance officer approval step.

A contract defines:

```
goal
inputs
analysis steps
verification checks
human decision options
audit outcome
```

---

## Setup

### Claude Desktop

Add to `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mova": {
      "command": "npx",
      "args": ["-y", "mova-mcp"],
      "env": {
        "MOVA_API_KEY": "test-key-001",
        "LLM_KEY": "sk-or-v1-YOUR_OPENROUTER_KEY",
        "LLM_MODEL": "openai/gpt-4o-mini"
      }
    }
  }
}
```

Restart Claude Desktop. The MOVA tools appear automatically.

### Claude Code

```bash
claude mcp add mova -- npx -y mova-mcp
claude mcp env mova MOVA_API_KEY=test-key-001
claude mcp env mova LLM_KEY=sk-or-v1-YOUR_OPENROUTER_KEY
claude mcp env mova LLM_MODEL=openai/gpt-4o-mini
```

Then verify: ask Claude Code `Use MOVA health check`.

### Cursor / other MCP clients

Command: `npx -y mova-mcp`

Required env vars:

```
MOVA_API_KEY=test-key-001
LLM_KEY=sk-or-v1-YOUR_OPENROUTER_KEY
LLM_MODEL=openai/gpt-4o-mini
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `MOVA_API_KEY` | Yes | MOVA API key. Shared public test key: `test-key-001` |
| `LLM_KEY` | Yes for workflow runs | OpenRouter key for LLM-backed analysis steps |
| `LLM_MODEL` | No | Model ID (default: `openai/gpt-4o-mini`) |
| `MOVA_API_URL` | No | Override API base URL (default: `https://api.mova-lab.eu`) |
| `MOVA_API_TIMEOUT_MS` | No | API timeout override in milliseconds |

> Never commit your real `LLM_KEY` to a repository.

---

## Tools

### Contract execution

```
mova_hitl_start            invoice approval
mova_hitl_start_po         purchase order review
mova_hitl_start_aml        AML triage
mova_hitl_start_trade      trade review
mova_hitl_start_complaint  complaint handling
mova_hitl_start_compliance compliance audit
mova_hitl_start_credit     credit review
mova_hitl_start_supply_chain  supplier risk
mova_hitl_start_churn      churn prediction
mova_hitl_start_contract_gen  contract generation
```

### Custom contracts

```
mova_calibrate_intent      turn plain language into a contract definition
mova_register_contract     register a custom contract
mova_run_contract          run a registered contract
mova_run_status            check run status
mova_list_my_contracts     list registered contracts
mova_set_contract_visibility  set public / private
mova_delete_contract       delete a contract
```

### Human decisions and audit

```
mova_hitl_decide           submit a human decision
mova_hitl_status           check workflow status
mova_hitl_audit            retrieve signed audit receipt
mova_hitl_audit_compact    retrieve full event journal
```

### Connectors

```
mova_list_connectors            list available connector types
mova_register_connector         register your own endpoint
mova_list_connector_overrides   list active overrides
mova_delete_connector_override  remove an override
```

### Diagnostics

```
mova_health    check API connectivity
```

---

## Connectors

By default, demo workflows use sandbox connectors. To route specific steps to your own services — OCR, ERP, VAT validation, internal review APIs — register a connector override.

Claude does not create real connectors automatically. You register them once and they apply to all subsequent runs.

Example prompt:

> Register my OCR endpoint for MOVA.

Example connector data:

```
connector_id : connector.ocr.document_extract_v1
endpoint     : https://ocr.yourcompany.com/extract
auth_header  : X-Api-Key
auth_value   : your-secret-key
```

Available connector IDs:

| Connector ID | Replaces |
|---|---|
| `connector.ocr.document_extract_v1` | Document OCR extraction |
| `connector.ocr.vision_llm_v1` | Vision LLM OCR |
| `connector.finance.duplicate_check_v1` | Duplicate invoice detection |
| `connector.tax.vat_validate_v1` | VAT number validation |
| `connector.erp.invoice_post_v1` | ERP invoice posting |

> Do not use production connector credentials during the public test phase unless you understand the current deployment and data flow.

---

## Audit journal

Every contract execution produces an immutable event log. The journal records exactly what happened, when, and who decided — from contract start to final receipt.

Example:

```jsonl
{"event":"contract_started","contract_id":"cnt_3f8a1b","contract_type":"invoice_approval","at":"2026-04-16T14:22:58Z"}
{"event":"step_completed","step":"analyze","duration_ms":1820,"at":"2026-04-16T14:23:00Z"}
{"event":"step_completed","step":"verify","findings":["iban_change_detected","ocr_confidence_low"],"at":"2026-04-16T14:23:03Z"}
{"event":"decision_point","question":"How do you want to proceed?","options":["approve","reject","escalate_accountant"],"recommended":"escalate_accountant","at":"2026-04-16T14:23:05Z"}
{"event":"human_decision","option":"escalate_accountant","reason":"IBAN changed — routing to accountant for manual check","actor":"user","at":"2026-04-16T14:23:41Z"}
{"event":"contract_completed","verdict":"partially_fulfilled","receipt_id":"rec_9c2d4e","signature":"sha256:a3f1c8...","at":"2026-04-16T14:23:41Z"}
```

Retrieve it with `mova_hitl_audit` (signed receipt) or `mova_hitl_audit_compact` (full event chain).

During the public test phase, audit storage is part of the test infrastructure. Retention, export, and account-level controls will be defined before production release.

---

## Safety model

```
contract defines the workflow
local validation checks inputs
AI analysis is bounded by the contract
human decision is required before final outcome
audit records the run
```

The runner does not give the model uncontrolled authority. A workflow should not claim that an external action was completed unless that action is explicitly part of the configured connector path and the result is returned by the API.

---

## Feedback wanted

This release is for learning what people actually want from contract-shaped AI execution.

Useful feedback:

- which workflow you tried
- where setup was confusing
- whether the human gate felt useful
- whether the audit trail was understandable
- what contract you would want to build next
- what would make this safe enough for real work
- which MCP client you used

Please open a GitHub issue with feedback, bugs, or workflow requests.

---

## Roadmap to production

After the public feedback phase:

```
individual API keys
account-scoped contract storage
quotas and rate limits
private connector configuration
clearer data retention policy
stronger audit export
production deployment boundary
optional private execution path for sensitive workflows
```

---

## Relationship to MOVA

MOVA Flat Runner is a lightweight facade from the broader MOVA contract execution approach. It is designed for quick testing and practical use with MCP-compatible AI clients. It is not the full MOVA State engine.

```
MOVA Flat Runner   = lightweight contract execution facade
MOVA State Engine  = proof-oriented state transition machine for heavier business processes
```

You can use the flat runner without understanding or installing the full MOVA ecosystem.

---

## License

MIT-0
