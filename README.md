# mova-flat-runner

A governed AI execution runtime for Claude and any MCP-compatible AI client.

You describe a decision workflow in plain language — invoice approval, supplier screening, credit review, anything that requires a human gate and an audit trail — and MOVA turns it into a structured contract that your AI assistant can run. Every execution is gated by a human decision and recorded in a cryptographically signed audit journal.

**The built-in workflows (invoice OCR, AML triage, credit scoring, and others) are live examples. The actual product is the ability to build your own.**

---

## How to create your own contract

Tell Claude what you want to automate. Claude calls `mova_calibrate_intent`, which asks clarifying questions and crystallises your intent into a structured contract definition. From that point, your workflow runs just like the built-in ones — with a human gate, local validation rules, and a full audit trail.

Example prompts to get started:

> *"I want a workflow that screens new freelancer applications — checks their portfolio, validates tax ID, and routes high-risk cases to manual review."*

> *"Create a contract for approving refund requests above €500 — extract the reason, cross-check the order ID, and log every decision."*

> *"Build a supplier onboarding workflow with sanctions screening and a compliance officer approval step."*

---

## Built-in workflows (live examples)

These come ready to use and show what a MOVA contract looks like in practice.

| Workflow | What it does |
|---|---|
| Invoice approval | OCR extraction, duplicate check, IBAN change detection, VAT validation |
| AML triage | Sanctions screening, PEP check, risk scoring, mandatory escalation rules |
| Credit review | DTI calculation, bureau score validation, hard reject thresholds |
| Trade review | Leverage limits, position size escalation |
| Purchase order | PO approval with structured line-item review |
| Supplier risk | Multi-supplier assessment with country and compliance checks |
| Compliance audit | Policy violation review with severity grading |
| Complaint handling | Customer complaint triage and resolution routing |
| Churn prediction | Retention risk scoring with recommended action |
| Contract generation | Structured contract drafting from natural language brief |

Try the invoice example — paste this into Claude after setup:

> *"Process this invoice: `https://raw.githubusercontent.com/mova-compact/mova-flat-runner/main/test_invoice_INV-2026-0441.png`"*

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
```

### Cursor / other MCP clients

Same pattern as Claude Desktop — `npx -y mova-mcp` with the three env vars.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `MOVA_API_KEY` | Yes | MOVA API key. Shared open key: `test-key-001` |
| `LLM_KEY` | Yes | OpenRouter key (`sk-or-v1-...`) — get one at [openrouter.ai/keys](https://openrouter.ai/keys) |
| `LLM_MODEL` | No | Model ID (default: `openai/gpt-4o-mini`) |
| `MOVA_API_URL` | No | Override API base URL (default: `https://api.mova-lab.eu`) |

---

## All tools

**Contract execution**
`mova_hitl_start` · `mova_hitl_start_po` · `mova_hitl_start_trade` · `mova_hitl_start_aml` · `mova_hitl_start_complaint` · `mova_hitl_start_compliance` · `mova_hitl_start_credit` · `mova_hitl_start_supply_chain` · `mova_hitl_start_churn` · `mova_hitl_start_contract_gen`

**Custom contracts**
`mova_calibrate_intent` · `mova_register_contract` · `mova_run_contract` · `mova_run_status` · `mova_list_my_contracts` · `mova_set_contract_visibility` · `mova_delete_contract`

**Human decisions & audit**
`mova_hitl_decide` · `mova_hitl_status` · `mova_hitl_audit` · `mova_hitl_audit_compact`

**Connectors (bring your own OCR / ERP / VAT API)**
`mova_list_connectors` · `mova_register_connector` · `mova_list_connector_overrides` · `mova_delete_connector_override`

**Diagnostics**
`mova_health`

---

## Connectors — replace the sandbox mock with your real system

By default every contract uses a sandbox mock. To wire in your real OCR service, ERP, or VAT API, register a connector override. Claude does not create connectors automatically — you register them once and they apply to all subsequent runs.

Ask Claude:

> *"Register my OCR endpoint for MOVA"* — then provide the URL and auth details when asked.

Or register directly:

```
connector_id : connector.ocr.document_extract_v1
endpoint     : https://ocr.yourcompany.com/extract
auth_header  : X-Api-Key
auth_value   : your-secret-key
```

Available connector IDs:

| ID | Replaces |
|---|---|
| `connector.ocr.document_extract_v1` | Document OCR extraction |
| `connector.ocr.vision_llm_v1` | Vision LLM OCR |
| `connector.finance.duplicate_check_v1` | Duplicate invoice detection |
| `connector.tax.vat_validate_v1` | VAT number validation (VIES) |
| `connector.erp.invoice_post_v1` | ERP invoice posting |

---

## Audit journal

Every contract execution produces an immutable event log stored in MOVA R2. Each line is a signed JSON event recording exactly what happened, when, and who decided.

```jsonl
{"event":"contract_started","contract_id":"cnt_3f8a1b","contract_type":"invoice_approval","at":"2026-04-16T14:22:58Z"}
{"event":"step_completed","step":"analyze","duration_ms":1820,"at":"2026-04-16T14:23:00Z"}
{"event":"step_completed","step":"verify","findings":["iban_change_detected","ocr_confidence_low"],"at":"2026-04-16T14:23:03Z"}
{"event":"decision_point","question":"How do you want to proceed?","options":["approve","reject","escalate_accountant"],"recommended":"escalate_accountant","at":"2026-04-16T14:23:05Z"}
{"event":"human_decision","option":"escalate_accountant","reason":"IBAN changed — routing to accountant for manual check","actor":"user","at":"2026-04-16T14:23:41Z"}
{"event":"contract_completed","verdict":"partially_fulfilled","receipt_id":"rec_9c2d4e","signature":"sha256:a3f1c8...","at":"2026-04-16T14:23:41Z"}
```

Retrieve it with `mova_hitl_audit` (signed receipt) or `mova_hitl_audit_compact` (full event chain).

---

## Data flow

- Contract inputs → `api.mova-lab.eu` (Cloudflare Worker, EU-hosted)
- LLM calls → OpenRouter (routed via MOVA proxy, billed to your `LLM_KEY`)
- Audit journal → MOVA R2 storage (cryptographically signed, permanently stored)

---

## License

MIT-0
