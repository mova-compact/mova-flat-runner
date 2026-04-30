# MOVA Content Flywheel Pack v1

This repository now carries the content flywheel as a built-in MOVA flat-runner contract seam.

Execution target: existing MOVA MCP flat executor at `D:\Claude_projects\mova-mcp`.
This package does not define a new runner.

## What was added

- `src/schemas.ts` now exposes a `content_flywheel` built-in contract manifest.
- `src/validators/content_flywheel.ts` adds the local intent validator for the manifest.
- `tests/unit/content_flywheel.test.ts` covers the new manifest shape and policy boundary.

## Source package

The source input for this integration remains the portable task package in:

- `D:\Projects_MOVA\mova-content-flywhee`

That package carries the canonical contract descriptors, pipeline sketch, and layer docs that guided this integration.

## Boundary

- No new backend.
- No new orchestrator.
- No new runner.
- No live publication without human approval.

