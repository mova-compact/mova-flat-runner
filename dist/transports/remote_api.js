import { ERR, flatErr } from "../types.js";
import { VALIDATOR_REGISTRY } from "../validators/registry.js";
import { validateBackendOutput } from "../validation/dataspec.js";
const TIMEOUT_MS = parseInt(process.env.MOVA_API_TIMEOUT_MS ?? "30000", 10);
export function shortId() {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return Array.from(buf).map((item) => item.toString(16).padStart(2, "0")).join("");
}
function safeStringify(value) {
    try {
        const text = JSON.stringify(value);
        return text.length > 500 ? `${text.slice(0, 500)}…` : text;
    }
    catch {
        return String(value);
    }
}
async function movaRequest(config, method, path, body) {
    const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
    };
    if (config.llmKey) {
        headers["X-LLM-Key"] = config.llmKey;
        headers["X-LLM-Model"] = config.llmModel;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method,
            headers,
            signal: controller.signal,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const data = await response.json();
        if (!response.ok) {
            throw Object.assign(new Error(`MOVA API ${response.status}: ${safeStringify(data)}`), { code: ERR.API_REQUEST_FAILED, retryable: response.status >= 500 });
        }
        return data;
    }
    catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw Object.assign(new Error(`MOVA API timeout after ${TIMEOUT_MS}ms: ${method} ${path}`), { code: ERR.API_TIMEOUT, retryable: true });
        }
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}
export const movaPost = (config, path, body) => movaRequest(config, "POST", path, body);
export const movaGet = (config, path) => movaRequest(config, "GET", path);
export const movaPut = (config, path, body) => movaRequest(config, "PUT", path, body);
export const movaDelete = (config, path) => movaRequest(config, "DELETE", path);
export async function movaRunStepsRemote(cfg, contractId, validators, initialInputs = {}) {
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
        catch (error) {
            const code = error.code ?? ERR.API_REQUEST_FAILED;
            const retryable = Boolean(error.retryable);
            return flatErr(code, error.message, undefined, retryable);
        }
        if (!result.ok) {
            return flatErr(ERR.API_REQUEST_FAILED, `Step "${stepId}" returned ok=false`, result);
        }
        if (stepId === "analyze") {
            try {
                const output = await movaGet(cfg, `/api/v1/contracts/${contractId}/steps/analyze/output`);
                if (validateBackendOutput(output).ok) {
                    analysis = { ...output };
                }
            }
            catch {
                // non-fatal for legacy remote path
            }
            const validatorContext = { ...initialInputs, ...analysis };
            for (const validator of validators) {
                const fn = VALIDATOR_REGISTRY.get(validator.validator_id);
                if (!fn) {
                    analysis[`${validator.step_id}_error`] = `VALIDATOR_NOT_ALLOWED: "${validator.validator_id}" not in registry`;
                    continue;
                }
                try {
                    const resultValue = fn(validatorContext);
                    Object.assign(analysis, resultValue.value ?? {});
                }
                catch (error) {
                    analysis[`${validator.step_id}_error`] = `VALIDATOR_FAILED: ${String(error)}`;
                }
            }
        }
        if (result.status === "waiting_human") {
            let decisionPoint = {};
            try {
                const response = await movaGet(cfg, `/api/v1/contracts/${contractId}/decision`);
                decisionPoint = (response.decision_point ?? {});
            }
            catch {
                // non-fatal for legacy remote path
            }
            return {
                ok: true,
                status: "waiting_human",
                contract_id: contractId,
                question: decisionPoint.question ?? "Select action:",
                options: decisionPoint.options ?? [],
                recommended: decisionPoint.recommended_option_id ?? null,
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
    catch (error) {
        return flatErr(ERR.AUDIT_UNAVAILABLE, `Contract completed but audit fetch failed: ${error.message}`, { contract_id: contractId, analysis });
    }
}
