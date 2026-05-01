# MCP Package Global Support v0

`mova-mcp` supports optional package-local `global_ref` on package manifests as read-only semantic metadata.

## Rules

- `global_ref` is optional.
- If `global_ref` is absent, registration behaves exactly as before.
- If `global_ref` is present, `mova-mcp` resolves it relative to the package source, loads the JSON file, and validates the package-global shape.
- If the declared `global_ref` is missing, unreadable, malformed, or structurally invalid, registration fails.
- `global` is non-authoritative metadata only.
- `global` must not change flow transitions, human gates, terminal outcomes, runtime bindings, permissions, or execution mode.

## Runtime boundary

Runtime execution still follows the flow, classification, and binding data already used by `mova-mcp`.
`global` may be returned with registration metadata for AI/operator context, but it must not be consulted as an execution authority.
