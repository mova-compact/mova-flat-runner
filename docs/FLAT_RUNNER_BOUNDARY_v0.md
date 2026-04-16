# MOVA Flat Runner — Layer Boundary v0

**Version:** 2.0.x  
**Role:** Lightweight contract execution facade between AI agents and the MOVA platform.

---

## What this layer IS

```
MOVA Flat Runner
= simple contract execution facade
= with human gate, local validation, audit retrieval, API boundary
= without Proof Core
= without complex state machine
= without autonomous decision authority
```

It is NOT Engine 1.5. Its role is precisely scoped:

```
accept contract inputs
→ validate inputs locally (types, formats, enums)
→ run analyze / verify / decide steps on the MOVA backend
→ execute pre-registered local validators (deterministic, no dynamic code)
→ return decision point to the human
→ accept human decision
→ return signed audit receipt
```

---

## What the Flat Runner DOES

| Capability | Detail |
|---|---|
| Start built-in contracts | `mova_run` — 10 built-in types (invoice, po, trade, aml, ...) |
| Validate inputs locally | DataSpec type/format/enum/required checks before any API call |
| Run flow guard | Rejects manifests that don't match `analyze → verify → decide` |
| Execute local validators | Registered by `validator_id` — no dynamic code |
| Deliver human decision gate | Returns `waiting_human` with options and analysis |
| Submit human decision | `mova_decide` — validates option against gate before submitting |
| Return signed audit | `mova_query` view=audit or view=audit_compact |
| Health check | `mova_health` — config, API connectivity, version |
| Browse registry | `mova_registry` — marketplace, connectors, user contracts |
| Register connectors | `mova_connector` — register endpoint overrides |
| Manage custom contracts | `mova_contract` — list, register, run, set visibility |

---

## What the Flat Runner does NOT do

```
- Does NOT make final business decisions
- Does NOT execute arbitrary code from manifest (no new Function(), no eval())
- Does NOT call external systems directly (all calls go through MOVA backend)
- Does NOT store or log secrets (auth_value is redacted in all responses)
- Does NOT require LLM_KEY for query/registry/decide/connector operations
- Does NOT skip human approval for any HUMAN_GATE step
- Does NOT support flow shapes other than analyze → verify → decide
- Does NOT perform proof transitions (that is Engine 1.5 territory)
- Does NOT act autonomously on behalf of the human
```

---

## Config requirements

| Variable | Required for | Notes |
|---|---|---|
| `MOVA_API_KEY` | All tools | Always required |
| `LLM_KEY` | `mova_run`, `mova_contract run` | Only for contract execution |
| `LLM_MODEL` | `mova_run` | Defaults to `openai/gpt-4o-mini` |
| `MOVA_API_URL` | All tools | Defaults to `https://api.mova-lab.eu` |
| `MOVA_API_TIMEOUT_MS` | All tools | Defaults to `30000` ms |
| `MOVA_HTTP_PORT` | HTTP mode | Activates HTTP server when set |

---

## Validator registry

All deterministic validators are pre-registered TypeScript functions in `src/validators/`.
No code strings travel in manifests. No dynamic evaluation.

A validator is referenced by `validator_id` (e.g. `invoice.validate_totals_v0`).
If a `validator_id` is not in `VALIDATOR_REGISTRY`, the runner logs an error flag and continues.
It does NOT execute unknown code.

---

## Supported flow shape

```
analyze (ai_task)
  → [local validators run here, results merged into analysis]
verify  (verification)
  → decide (decision_point) → waiting_human
```

Any manifest that deviates from this shape is rejected with `UNSUPPORTED_FLOW_SHAPE`
before any API call is made.

---

## Error codes

| Code | Meaning |
|---|---|
| `CONFIG_MISSING` | Required env var not set |
| `UNKNOWN_CONTRACT_TYPE` | contract_type not in built-in registry |
| `MISSING_REQUIRED_INPUTS` | Required DataSpec field absent (legacy check) |
| `LOCAL_VALIDATION_FAILED` | Type/format/enum validation error on inputs |
| `UNSUPPORTED_FLOW_SHAPE` | Manifest steps don't match supported flow |
| `API_REQUEST_FAILED` | Backend API returned error or non-2xx |
| `API_RESPONSE_INVALID` | Backend output was not a plain object |
| `VALIDATOR_NOT_ALLOWED` | validator_id not in VALIDATOR_REGISTRY |
| `VALIDATOR_FAILED` | Registered validator threw at runtime |
| `DECISION_POINT_MISSING` | Could not fetch decision point for gate |
| `LOCAL_INVALID_DECISION_OPTION` | Submitted option not in gate's valid options |
| `AUDIT_UNAVAILABLE` | Contract completed but audit fetch failed |
| `API_TIMEOUT` | API call exceeded MOVA_API_TIMEOUT_MS |

---

*MOVA Flat Runner boundary document v0 — this layer is a small, reliable execution facade, not a general agent runtime.*
