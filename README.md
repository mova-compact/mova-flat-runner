# mova-mcp

MOVA HITL contract execution for Claude Desktop, Claude Code, Cursor, and any MCP-compatible AI client.

25 tools: invoice OCR, PO approval, AML triage, complaints handling, crypto trade review, compliance audit, credit scoring, supply chain risk, churn prediction, contract generation, connector registry, and user contract registry.

## Setup — Claude Desktop

Add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

Get an OpenRouter key at [openrouter.ai/keys](https://openrouter.ai/keys) — LLM usage is billed to your account directly. `MOVA_API_KEY: test-key-001` is the shared open key, no registration needed.

Restart Claude Desktop after saving. The MOVA tools will appear automatically.

## Setup — Claude Code

```bash
claude mcp add mova -- npx -y mova-mcp
claude mcp env mova MOVA_API_KEY=test-key-001
claude mcp env mova LLM_KEY=sk-or-v1-YOUR_OPENROUTER_KEY
```

## Setup — Cursor / other MCP clients

Same pattern as Claude Desktop. Point to `npx mova-mcp` with the three env vars above.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `MOVA_API_KEY` | Yes | MOVA API key. Use the shared key: `test-key-001` |
| `LLM_KEY` | Yes | Your OpenRouter API key (`sk-or-v1-...`) |
| `LLM_MODEL` | No | OpenRouter model ID (default: `openai/gpt-4o-mini`) |
| `MOVA_API_URL` | No | Override API base URL (default: `https://api.mova-lab.eu`) |

## All 25 tools

### HITL contract execution
`mova_hitl_start` · `mova_hitl_start_po` · `mova_hitl_start_trade` · `mova_hitl_start_aml` · `mova_hitl_start_complaint` · `mova_hitl_start_compliance` · `mova_hitl_start_credit` · `mova_hitl_start_supply_chain` · `mova_hitl_start_churn` · `mova_hitl_start_contract_gen`

### Human decisions & audit
`mova_hitl_decide` · `mova_hitl_status` · `mova_hitl_audit` · `mova_hitl_audit_compact` · `mova_calibrate_intent`

### Connector registry
`mova_list_connectors` · `mova_list_connector_overrides` · `mova_register_connector` · `mova_delete_connector_override`

### User contract registry & execution
`mova_register_contract` · `mova_list_my_contracts` · `mova_set_contract_visibility` · `mova_delete_contract` · `mova_run_contract` · `mova_run_status`

## Quick demo

Ask Claude: *"Process this invoice: https://raw.githubusercontent.com/mova-compact/mova-bridge/main/test_invoice_INV-2026-0441.png"*

Claude will call `mova_hitl_start`, show the extracted data with risk score, present the decision options, and after your choice call `mova_hitl_decide` and return the signed audit receipt.

## How MOVA works

MOVA is a governed AI execution runtime. Every contract run produces:
- **Verdict** — `fulfilled` / `partially_fulfilled` / `failed`
- **Structured outputs** — from each step (OCR fields, risk scores, analysis)
- **Signed audit receipt** — immutable record of every event with timestamps. Designed for EU AI Act, AMLD6, and GDPR auditability.

MOVA enforces human control: the agent cannot approve or reject without your explicit decision.

## Data flow

- Contract inputs → `api.mova-lab.eu` (Cloudflare Worker, EU-hosted)
- LLM calls → OpenRouter (via MOVA API proxy, billed to your `LLM_KEY`)
- Audit journal → MOVA R2 storage (cryptographically signed, permanently stored)

## License

MIT-0
