import { ERR, flatErr, type FlatRunnerResult, type ValidatorRef } from "./types.js";
import { VALIDATOR_REGISTRY } from "./validators/registry.js";
import { validateBackendOutput } from "./validation/dataspec.js";

export interface MovaConfig {
  apiKey:   string;
  baseUrl:  string;
  llmKey:   string;   // may be "" for non-LLM calls
  llmModel: string;
}

export function shortId(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}

const TIMEOUT_MS = parseInt(process.env.MOVA_API_TIMEOUT_MS ?? "30000", 10);

async function movaRequest(
  config: MovaConfig,
  method: string,
  path:   string,
  body?:  unknown,
): Promise<unknown> {
  const url     = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization:  `Bearer ${config.apiKey}`,
  };
  // Only attach LLM headers when a key is present (mova_run path)
  if (config.llmKey) {
    headers["X-LLM-Key"]   = config.llmKey;
    headers["X-LLM-Model"] = config.llmModel;
  }

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json() as unknown;
    if (!res.ok) {
      // Truncated error — do not expose auth tokens or raw headers
      throw Object.assign(
        new Error(`MOVA API ${res.status}: ${safeStringify(data)}`),
        { code: ERR.API_REQUEST_FAILED, retryable: res.status >= 500 },
      );
    }
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw Object.assign(
        new Error(`MOVA API timeout after ${TIMEOUT_MS}ms: ${method} ${path}`),
        { code: ERR.API_TIMEOUT, retryable: true },
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function safeStringify(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s.length > 500 ? s.slice(0, 500) + "…" : s;
  } catch {
    return String(v);
  }
}

export const movaPost   = (c: MovaConfig, path: string, body: unknown) => movaRequest(c, "POST",   path, body);
export const movaGet    = (c: MovaConfig, path: string)                 => movaRequest(c, "GET",    path);
export const movaPut    = (c: MovaConfig, path: string, body: unknown) => movaRequest(c, "PUT",    path, body);
export const movaDelete = (c: MovaConfig, path: string)                 => movaRequest(c, "DELETE", path);

// ── movaRunSteps ──────────────────────────────────────────────────────────────
//
// Orchestrates: analyze → (local validators) → verify → decide
//
// Validators are looked up in VALIDATOR_REGISTRY by validator_id.
// No dynamic code execution — only pre-registered functions are allowed.

export async function movaRunSteps(
  cfg:        MovaConfig,
  contractId: string,
  validators: ValidatorRef[],
): Promise<FlatRunnerResult> {
  let analysis: Record<string, unknown> = {};

  for (const stepId of ["analyze", "verify", "decide"] as const) {
    let result: Record<string, unknown>;
    try {
      result = await movaPost(cfg, `/api/v1/contracts/${contractId}/step`, {
        envelope: {
          kind:        "env.step.execute_v0",
          envelope_id: `env-${shortId()}`,
          contract_id: contractId,
          actor:       { actor_type: "system", actor_id: "mova_runtime" },
          payload:     { step_id: stepId },
        },
      }) as Record<string, unknown>;
    } catch (e) {
      const code      = (e as { code?: string }).code ?? ERR.API_REQUEST_FAILED;
      const retryable = Boolean((e as { retryable?: boolean }).retryable);
      return flatErr(code as typeof ERR[keyof typeof ERR], (e as Error).message, undefined, retryable);
    }

    if (!result.ok) {
      return flatErr(ERR.API_REQUEST_FAILED, `Step "${stepId}" returned ok=false`, result);
    }

    // After analyze: fetch output, run local validators
    if (stepId === "analyze") {
      try {
        const output = await movaGet(cfg, `/api/v1/contracts/${contractId}/steps/analyze/output`);
        if (validateBackendOutput(output).ok) {
          analysis = { ...(output as Record<string, unknown>) };
        }
      } catch { /* non-fatal */ }

      for (const v of validators) {
        const fn = VALIDATOR_REGISTRY.get(v.validator_id);
        if (!fn) {
          analysis[`${v.step_id}_error`] = `VALIDATOR_NOT_ALLOWED: "${v.validator_id}" not in registry`;
          continue;
        }
        try {
          const res = fn(analysis);
          Object.assign(analysis, res.value ?? {});
        } catch (e) {
          analysis[`${v.step_id}_error`] = `VALIDATOR_FAILED: ${String(e)}`;
        }
      }
    }

    if (result.status === "waiting_human") {
      let dp: Record<string, unknown> = {};
      try {
        const dpResp = await movaGet(cfg, `/api/v1/contracts/${contractId}/decision`) as Record<string, unknown>;
        dp = (dpResp.decision_point ?? {}) as Record<string, unknown>;
      } catch { /* non-fatal */ }

      return {
        ok:          true,
        status:      "waiting_human",
        contract_id: contractId,
        question:    (dp.question as string | undefined) ?? "Select action:",
        options:     (dp.options  as unknown[] | undefined) ?? [],
        recommended: (dp.recommended_option_id as string | null | undefined) ?? null,
        analysis,
      };
    }
  }

  try {
    const audit = await movaGet(cfg, `/api/v1/contracts/${contractId}/audit`) as Record<string, unknown>;
    return {
      ok:            true,
      status:        "completed",
      contract_id:   contractId,
      audit_receipt: (audit.audit_receipt ?? {}) as Record<string, unknown>,
      analysis,
    };
  } catch (e) {
    return flatErr(
      ERR.AUDIT_UNAVAILABLE,
      `Contract completed but audit fetch failed: ${(e as Error).message}`,
      { contract_id: contractId, analysis },
    );
  }
}
