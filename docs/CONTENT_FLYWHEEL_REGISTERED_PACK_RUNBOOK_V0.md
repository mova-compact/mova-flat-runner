# Content Flywheel Registered Pack Runbook v0

## Purpose

This runbook defines how to integrate and run `content_flywheel` as an external registered contract pack through the existing `mova-mcp` flat executor surface.

## Why content_flywheel is not a built-in MCP manifest

`mova-mcp` core must stay a generic execution and registration surface.
Domain-specific packs (including `content_flywheel`) should be registered via `mova_contract register/run`, not hardcoded into `CONTRACT_MANIFESTS` or core validator registry.

## Target executor: existing mova-mcp flat executor

- Executor: `D:\Claude_projects\mova-mcp`
- Runtime surface: `mova_contract` actions (`register`, `run`, `run_status`, `step_complete`, `gate_approve`, `gate_reject`)

## Expected local pack location

Use a local pack path parameter, for example:

- `D:\Projects_MOVA\mova-content-flywheel\contracts\content_flywheel_pipeline_v0.json`

If your workspace uses a different directory, replace the path in commands below.

## Register from local source_path

Example MCP tool call payload (`mova_contract`, action `register`):

```json
{
  "action": "register",
  "contract_id": "content-flywheel-v0",
  "source_path": "D:\\Projects_MOVA\\mova-content-flywheel\\contracts\\content_flywheel_pipeline_v0.json",
  "title": "Content Flywheel Registered Pack",
  "version": "0.1.0",
  "execution_type": "agent",
  "visibility": "private"
}
```

## Run registered contract

Example payload (`mova_contract`, action `run`):

```json
{
  "action": "run",
  "contract_id": "content-flywheel-v0",
  "inputs": {
    "business_context": "example",
    "target_audience": "example",
    "content_goal": "example"
  }
}
```

## Check run status

```json
{
  "action": "run_status",
  "run_id": "<run_id>"
}
```

## Complete step / approve gate / reject gate

Step complete:

```json
{
  "action": "step_complete",
  "run_id": "<run_id>",
  "step_id": "<step_id>",
  "outcome": "default",
  "output": {}
}
```

Gate approve:

```json
{
  "action": "gate_approve",
  "run_id": "<run_id>",
  "step_id": "<step_id>",
  "outcome": "approved"
}
```

Gate reject:

```json
{
  "action": "gate_reject",
  "run_id": "<run_id>",
  "step_id": "<step_id>"
}
```

## Publication boundary: no human approval = no publication

Publication and external publishing actions must remain human-gated.
`mova-mcp` core must not grant autonomous publication by embedding domain logic.

## What must not be added to MCP core

- No `content_flywheel` entry in `src/schemas.ts` `CONTRACT_MANIFESTS`.
- No `content_flywheel` validator in `src/validators/registry.ts`.
- No domain-specific pack wiring in MCP core tools/resources.
- No new runner/backend/orchestrator for this pack.

