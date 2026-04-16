#!/usr/bin/env node
/**
 * smoke:api — hits the live MOVA API to verify connectivity.
 * Requires: MOVA_API_KEY, MOVA_API_URL (optional, defaults to production).
 * Does NOT require LLM_KEY (only reads health endpoint and registry).
 *
 * Usage:
 *   MOVA_API_KEY=xxx node dist-test/tests/smoke/api.js
 *
 * Exit 0 = all checks passed. Exit 1 = at least one check failed.
 */
export {};
