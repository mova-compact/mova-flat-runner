# mova-flat-runner

MCP server that gives Claude (and any MCP-compatible AI client) a set of governed decision workflows — invoice approval, AML triage, credit scoring, trade review, compliance audit, and more.

**The key difference from a plain AI tool:** the agent cannot approve or reject anything on its own. Every workflow runs through a mandatory human decision gate, and every decision is stored in a cryptographically signed audit trail. Designed for EU AI Act and AMLD6 compliance.

---

## What it looks like in practice

You share an invoice image. Claude extracts the vendor, IBAN, line items, and totals; checks for duplicate submissions, IBAN changes, and VAT mismatches; shows you a risk score with findings; then asks: **approve / reject / escalate / request info**. After your choice it returns a signed audit receipt with a permanent record of who decided what and when.

Try it — paste this into Claude after setup:

> Process this invoice: `https://raw.githubusercontent.com/mova-compact/mova-flat-runner/main/test_invoice_INV-2026-0441.png`

Same pattern works for AML cases, credit applications, supplier risk reviews, and so on.

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

Same pattern as Claude Desktop — point to `npx mova-mcp` with the three env vars.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `MOVA_API_KEY` | Yes | MOVA API key. Shared open key: `test-key-001` |
| `LLM_KEY` | Yes | OpenRouter key (`sk-or-v1-...`) — get one at [openrouter.ai/keys](https://openrouter.ai/keys) |
| `LLM_MODEL` | No | Model ID (default: `openai/gpt-4o-mini`) |
| `MOVA_API_URL` | No | Override API base URL (default: `https://api.mova-lab.eu`) |

---

## Available workflows

Each workflow follows the same structure: structured input → AI analysis → local validation → human decision gate → signed audit receipt.

| Tool | What it handles |
|---|---|
| `mova_hitl_start` | Supplier invoice — OCR, duplicate check, IBAN change detection, VAT validation |
| `mova_hitl_start_po` | Purchase order approval |
| `mova_hitl_start_aml` | AML / sanctions screening, PEP check, risk scoring |
| `mova_hitl_start_trade` | Crypto trade review — leverage limits, position size escalation |
| `mova_hitl_start_credit` | Credit application — DTI calculation, bureau score check |
| `mova_hitl_start_supply_chain` | Supplier risk assessment |
| `mova_hitl_start_compliance` | Compliance audit |
| `mova_hitl_start_complaint` | Customer complaint handling |
| `mova_hitl_start_churn` | Churn risk prediction with retention action |
| `mova_hitl_start_contract_gen` | Contract generation |

### Decision and audit tools

`mova_hitl_decide` · `mova_hitl_status` · `mova_hitl_audit` · `mova_hitl_audit_compact` · `mova_calibrate_intent`

### Connector registry (bring your own OCR / ERP / VAT API)

`mova_list_connectors` · `mova_register_connector` · `mova_list_connector_overrides` · `mova_delete_connector_override`

### Custom contract registry

`mova_register_contract` · `mova_list_my_contracts` · `mova_run_contract` · `mova_run_status` · `mova_set_contract_visibility` · `mova_delete_contract`

---

## Data flow

- Contract inputs → `api.mova-lab.eu` (Cloudflare Worker, EU-hosted)
- LLM calls → OpenRouter (routed via MOVA proxy, billed to your `LLM_KEY`)
- Audit journal → MOVA R2 storage (cryptographically signed, permanently stored)

---

## License

MIT-0
