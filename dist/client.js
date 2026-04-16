import { ERR, flatErr } from "./types.js";
import { VALIDATOR_REGISTRY } from "./validators/registry.js";
import { validateBackendOutput } from "./validation/dataspec.js";
export function shortId() {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}
const TIMEOUT_MS = parseInt(process.env.MOVA_API_TIMEOUT_MS ?? "30000", 10);
async function movaRequest(config, method, path, body) {
    const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
    };
    // Only attach LLM headers when a key is present (mova_run path)
    if (config.llmKey) {
        headers["X-LLM-Key"] = config.llmKey;
        headers["X-LLM-Model"] = config.llmModel;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method,
            headers,
            signal: controller.signal,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const data = await res.json();
        if (!res.ok) {
            // Truncated error — do not expose auth tokens or raw headers
            throw Object.assign(new Error(`MOVA API ${res.status}: ${safeStringify(data)}`), { code: ERR.API_REQUEST_FAILED, retryable: res.status >= 500 });
        }
        return data;
    }
    catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
            throw Object.assign(new Error(`MOVA API timeout after ${TIMEOUT_MS}ms: ${method} ${path}`), { code: ERR.API_TIMEOUT, retryable: true });
        }
        throw e;
    }
    finally {
        clearTimeout(timer);
    }
}
function safeStringify(v) {
    try {
        const s = JSON.stringify(v);
        return s.length > 500 ? s.slice(0, 500) + "…" : s;
    }
    catch {
        return String(v);
    }
}
export const movaPost = (c, path, body) => movaRequest(c, "POST", path, body);
export const movaGet = (c, path) => movaRequest(c, "GET", path);
export const movaPut = (c, path, body) => movaRequest(c, "PUT", path, body);
export const movaDelete = (c, path) => movaRequest(c, "DELETE", path);
// ── movaRunSteps ──────────────────────────────────────────────────────────────
//
// Orchestrates: analyze → (local validators) → verify → decide
//
// Validators are looked up in VALIDATOR_REGISTRY by validator_id.
// No dynamic code execution — only pre-registered functions are allowed.
export async function movaRunSteps(cfg, contractId, validators) {
    let analysis = {};
    for (const stepId of ["analyze", "verify", "decide"]) {
        let result;
        try {
            result = await movaPost(cfg, `/api/v1/contracts/${contractId}/step`, {
                envelope: {
                    kind: "env.step.execute_v0",
                    envelope_id: `env-${shortId()}`,
                    contract_id: contractId,
                    actor: { actor_type: "system", actor_id: "mova_runtime" },
                    payload: { step_id: stepId },
                },
            });
        }
        catch (e) {
            const code = e.code ?? ERR.API_REQUEST_FAILED;
            const retryable = Boolean(e.retryable);
            return flatErr(code, e.message, undefined, retryable);
        }
        if (!result.ok) {
            return flatErr(ERR.API_REQUEST_FAILED, `Step "${stepId}" returned ok=false`, result);
        }
        // After analyze: fetch output, run local validators
        if (stepId === "analyze") {
            try {
                const output = await movaGet(cfg, `/api/v1/contracts/${contractId}/steps/analyze/output`);
                if (validateBackendOutput(output).ok) {
                    analysis = { ...output };
                }
            }
            catch { /* non-fatal */ }
            for (const v of validators) {
                const fn = VALIDATOR_REGISTRY.get(v.validator_id);
                if (!fn) {
                    analysis[`${v.step_id}_error`] = `VALIDATOR_NOT_ALLOWED: "${v.validator_id}" not in registry`;
                    continue;
                }
                try {
                    const res = fn(analysis);
                    Object.assign(analysis, res.value ?? {});
                }
                catch (e) {
                    analysis[`${v.step_id}_error`] = `VALIDATOR_FAILED: ${String(e)}`;
                }
            }
        }
        if (result.status === "waiting_human") {
            let dp = {};
            try {
                const dpResp = await movaGet(cfg, `/api/v1/contracts/${contractId}/decision`);
                dp = (dpResp.decision_point ?? {});
            }
            catch { /* non-fatal */ }
            return {
                ok: true,
                status: "waiting_human",
                contract_id: contractId,
                question: dp.question ?? "Select action:",
                options: dp.options ?? [],
                recommended: dp.recommended_option_id ?? null,
                analysis,
            };
        }
    }
    try {
        const audit = await movaGet(cfg, `/api/v1/contracts/${contractId}/audit`);
        return {
            ok: true,
            status: "completed",
            contract_id: contractId,
            audit_receipt: (audit.audit_receipt ?? {}),
            analysis,
        };
    }
    catch (e) {
        return flatErr(ERR.AUDIT_UNAVAILABLE, `Contract completed but audit fetch failed: ${e.message}`, { contract_id: contractId, analysis });
    }
}
