# MCP Contract Extension Audit v0

## 1. Current mova-mcp contract model

`mova-mcp` currently exposes two contract models in parallel:

- Built-in contracts (`mova_run`) from `src/schemas.ts` via in-process `CONTRACT_MANIFESTS`.
- Registered/custom contracts (`mova_contract`) loaded from `source_url` or `source_path` and sent to backend registration/run APIs.

Built-in model is tightly coupled to MCP core code:

- manifests in `src/schemas.ts`
- validator selection through `manifest.validators`
- validator functions pre-registered in `src/validators/registry.ts`

Custom model is backend-registered and flow-driven:

- user/system flows are posted to `/api/v1/contracts/register`
- runs execute via `/run/{contract_id}`
- step progression uses `/run/{run_id}/...` endpoints

## 2. Local contract loading path

Local path is implemented in `mova_contract`:

- `source_path` is read by `loadInlineContractFlow(...)` in `src/index.ts`.
- optional `output_schema` refs are resolved from local `_schemas` / `_data-schemas` paths.
- inline flow is guarded by:
  - `assertNoSystemContractCalls`
  - `assertNoInlineClassDefinition`
  - `assertFlowGraphValid`
  - `assertStepModesValid`
  - `assertNoUnknownFlowFields`
- guarded flow is registered through `/api/v1/contracts/register`.
- run path can also accept `source_path` and auto-register before `/run/{contract_id}`.

This is the existing native extension seam for new contract packs without changing core manifests.

## 3. Registry contract loading path

Registry/remote discovery path is exposed via:

- `mova_registry scope=contracts` -> `/api/v1/registry/contracts`
- fallback to local built-ins only if registry call fails

User-managed registered contracts path is:

- `mova_contract list` -> `/api/v1/contracts/my`
- `mova_contract register` -> `/api/v1/contracts/register`
- `mova_contract run` -> `/run/{contract_id}`
- `run_status`, `step_complete`, `gate_approve`, `gate_reject` on `/run/...`

This model treats contracts as external payloads managed by backend registration, not as code-level additions to MCP core.

## 4. Security pipeline integration pattern

Security pipeline appears wired as **system contracts external to user flows**, not as built-in manifests:

- `src/security/system_contract_guard.ts` default system contract list includes:
  - `triage-security-findings-v0`
  - `verify-finding-candidates-v0`
  - `prove-vulnerability-v0`
  - others
- Guard blocks user `CONTRACT_CALL` to these IDs.
- These IDs are **not** defined in `src/schemas.ts` built-in manifests.

This indicates security pipeline contracts are expected to exist as registered/platform system flows, not as MCP-core hardcoded business manifests.

## 5. What belongs in MCP core

Core responsibilities:

- transport/tool surface (`mova_run`, `mova_contract`, `mova_registry`, etc.)
- envelope/data validation primitives
- flow safety guards
- execution facade behavior for analyze/verify/decide built-in path
- deterministic validator runtime mechanism (registry execution model itself)

## 6. What must stay outside MCP core

Should remain outside core for pack-style domain extensions:

- domain/product-specific contract packs (`content_flywheel`, security packs, etc.)
- domain-specific flow JSON and contract descriptors
- domain-specific routing/business states and publication policy semantics
- pack-specific schemas/artifacts unless reused as general core primitives

Those should be delivered through registered contracts and pack assets, using existing `mova_contract` registration/run conventions.

## 7. Correct way to add content_flywheel

Use registered-pack path, not built-in manifest path:

1. Keep pack assets (flows/schemas/descriptors/docs) outside MCP core source.
2. Register contract flow(s) via `mova_contract register` (`source_path` or `source_url`).
3. Execute through `mova_contract run` and existing gate/step APIs.
4. Reuse existing guards and connector override mechanisms.
5. Add only minimal core changes if a generic engine capability is missing (none proven in this audit).

## 8. Assessment of commit 355d638

Commit `355d638` added `content_flywheel` as a built-in seam:

- `src/schemas.ts`
- `src/validators/content_flywheel.ts`
- `src/validators/registry.ts`
- `tests/unit/content_flywheel.test.ts`
- `docs/CONTENT_FLYWHEEL_PACK_V1.md`

Assessment:

- It is technically consistent with the built-in path.
- It is **not aligned** with the extension pattern used for registered/system flows (including security pipeline treatment).
- It embeds domain-specific pack semantics into MCP core, increasing core coupling and validator registry churn.

## 9. Minimal remediation plan

1. Revert core embedding introduced by `355d638`:
   - remove `content_flywheel` manifest from `src/schemas.ts`
   - remove `src/validators/content_flywheel.ts`
   - remove registry/test/docs additions tied to built-in embedding
2. Preserve `mova_contract` registration/run core mechanisms as-is.
3. Recreate `content_flywheel` as registered pack assets and registration instructions, outside MCP core manifests.
4. Add focused tests/docs for registration path usage (not core built-in manifest tests).

## 10. Exact next implementation task

Create a narrowly scoped change set:

- Remove `content_flywheel` built-in wiring from MCP core.
- Add a `docs/` runbook showing exact `mova_contract register` and `mova_contract run` commands for content_flywheel flow registration from local pack path.
- Add one focused integration test (or smoke script) that validates registration path guarding + run invocation for a pack-provided flow file, without editing `CONTRACT_MANIFESTS`.

## Verdict

`REVERT_AND_REIMPLEMENT_AS_REGISTERED_PACK`

