import { ERR, flatErr, type FlatRunnerResult, type ValidatorRef } from "../types.js";
import { VALIDATOR_REGISTRY } from "../validators/registry.js";
import { validateBackendOutput } from "../validation/dataspec.js";

export interface MovaConfig {
  apiKey: string;
  baseUrl: string;
  llmKey: string;
  llmModel: string;
}

const TIMEOUT_MS = parseInt(process.env.MOVA_API_TIMEOUT_MS ?? "30000", 10);

export function shortId(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((item) => item.toString(16).padStart(2, "0")).join("");
}

function safeStringify(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return String(value);
  }
}

async function movaRequest(
  config: MovaConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
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
    const data = await response.json() as unknown;
    if (!response.ok) {
      throw Object.assign(
        new Error(`MOVA API ${response.status}: ${safeStringify(data)}`),
        { code: ERR.API_REQUEST_FAILED, retryable: response.status >= 500 },
      );
    }
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw Object.assign(
        new Error(`MOVA API timeout after ${TIMEOUT_MS}ms: ${method} ${path}`),
        { code: ERR.API_TIMEOUT, retryable: true },
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const movaPost = (config: MovaConfig, path: string, body: unknown) => movaRequest(config, "POST", path, body);
export const movaGet = (config: MovaConfig, path: string) => movaRequest(config, "GET", path);
export const movaPut = (config: MovaConfig, path: string, body: unknown) => movaRequest(config, "PUT", path, body);
export const movaDelete = (config: MovaConfig, path: string) => movaRequest(config, "DELETE", path);

export async function movaRunStepsRemote(
  cfg: MovaConfig,
  contractId: string,
  validators: ValidatorRef[],
  initialInputs: Record<string, unknown> = {},
): Promise<FlatRunnerResult> {
  let analysis: Record<string, unknown> = {};

  for (const stepId of ["analyze", "verify", "decide"] as const) {
    let result: Record<string, unknown>;
    try {
      result = await movaPost(cfg, `/api/v1/contracts/${contractId}/step`, {
        envelope: {
          kind: "env.step.execute_v0",
          envelope_id: `env-${shortId()}`,
          contract_id: contractId,
          actor: { actor_type: "system", actor_id: "mova_runtime" },
          payload: { step_id: stepId },
        },
      }) as Record<string, unknown>;
    } catch (error) {
      const code = (error as { code?: string }).code ?? ERR.API_REQUEST_FAILED;
      const retryable = Boolean((error as { retryable?: boolean }).retryable);
      return flatErr(code as typeof ERR[keyof typeof ERR], (error as Error).message, undefined, retryable);
    }

    if (!result.ok) {
      return flatErr(ERR.API_REQUEST_FAILED, `Step "${stepId}" returned ok=false`, result);
    }

    if (stepId === "analyze") {
      try {
        const output = await movaGet(cfg, `/api/v1/contracts/${contractId}/steps/analyze/output`);
        if (validateBackendOutput(output).ok) {
          analysis = { ...(output as Record<string, unknown>) };
        }
      } catch {
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
        } catch (error) {
          analysis[`${validator.step_id}_error`] = `VALIDATOR_FAILED: ${String(error)}`;
        }
      }
    }

    if (result.status === "waiting_human") {
      let decisionPoint: Record<string, unknown> = {};
      try {
        const response = await movaGet(cfg, `/api/v1/contracts/${contractId}/decision`) as Record<string, unknown>;
        decisionPoint = (response.decision_point ?? {}) as Record<string, unknown>;
      } catch {
        // non-fatal for legacy remote path
      }

      return {
        ok: true,
        status: "waiting_human",
        contract_id: contractId,
        question: (decisionPoint.question as string | undefined) ?? "Select action:",
        options: (decisionPoint.options as unknown[] | undefined) ?? [],
        recommended: (decisionPoint.recommended_option_id as string | null | undefined) ?? null,
        analysis,
      };
    }
  }

  try {
    const audit = await movaGet(cfg, `/api/v1/contracts/${contractId}/audit`) as Record<string, unknown>;
    return {
      ok: true,
      status: "completed",
      contract_id: contractId,
      audit_receipt: (audit.audit_receipt ?? {}) as Record<string, unknown>,
      analysis,
    };
  } catch (error) {
    return flatErr(
      ERR.AUDIT_UNAVAILABLE,
      `Contract completed but audit fetch failed: ${(error as Error).message}`,
      { contract_id: contractId, analysis },
    );
  }
}
