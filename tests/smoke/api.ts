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

const API_URL  = (process.env.MOVA_API_URL ?? "https://api.mova-lab.eu").replace(/\/$/, "");
const API_KEY  = process.env.MOVA_API_KEY ?? "";
const TIMEOUT  = parseInt(process.env.MOVA_API_TIMEOUT_MS ?? "10000", 10);

type Check = { name: string; ok: boolean; detail?: string };
const results: Check[] = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, detail });
    console.error(`  ✗ ${name}: ${detail}`);
  }
}

async function get(path: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

console.log(`\nMOVA Flat Runner — smoke:api`);
console.log(`API: ${API_URL}`);
console.log(`Key: ${API_KEY ? API_KEY.slice(0, 8) + "…" : "(not set)"}\n`);

if (!API_KEY) {
  console.error("ERROR: MOVA_API_KEY is not set. Cannot run smoke tests.");
  process.exit(1);
}

// ── Checks ────────────────────────────────────────────────────────────────────

await check("GET /health — API reachable", async () => {
  const r = await get("/health") as { ok?: boolean };
  if (!r.ok) throw new Error("ok !== true");
});

await check("GET /api/v1/connectors — connector list accessible", async () => {
  const r = await get("/api/v1/connectors") as { ok?: boolean };
  if (!r.ok) throw new Error("ok !== true");
});

await check("GET /api/v1/contracts/my — user contract list accessible", async () => {
  await get("/api/v1/contracts/my");
  // Any 2xx response is acceptable
});

await check("GET /api/v1/registry/contracts — marketplace accessible", async () => {
  await get("/api/v1/registry/contracts");
});

// ── Summary ───────────────────────────────────────────────────────────────────

const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;

console.log(`\nsmoke:api — ${passed}/${results.length} passed${failed > 0 ? `, ${failed} FAILED` : ""}`);

if (failed > 0) {
  process.exit(1);
}
