# Promotion Patch 2 Note v1

## What Was Moved Into `mova-flat-runner`
- bridged local transport in `src/transports/local_seam_bridge.ts`
- remote transport in `src/transports/remote_api.ts`
- thin facade and selector in `src/client.ts`
- canonical freeze test and bridged e2e test

## What Remains Out Of Scope
- pre-existing `Dockerfile` support
- multiple human gates
- second package
- generic workflow abstraction
- shared seam package
- any change to machine-side contract semantics in `mova-intent`

## Canonical Promotion Readiness
- machine-owned six-operation contract is now consumed from `mova-intent`
- opaque run reference remains the external run handle
- bridged path has no remote fallback
- bridged and remote transports are physically separated
- bridge is ready for canonical end-to-end promotion verdict on the proven path
