export interface MovaConfig {
  apiKey: string;
  baseUrl: string;
  llmKey: string;
  llmModel: string;
}

export function shortId(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function movaRequest(
  config: MovaConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "X-LLM-Key": config.llmKey,
      "X-LLM-Model": config.llmModel,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`MOVA API error ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export const movaPost = (c: MovaConfig, path: string, body: unknown) =>
  movaRequest(c, "POST", path, body);

export const movaGet = (c: MovaConfig, path: string) =>
  movaRequest(c, "GET", path);

export const movaPut = (c: MovaConfig, path: string, body: unknown) =>
  movaRequest(c, "PUT", path, body);

export const movaDelete = (c: MovaConfig, path: string) =>
  movaRequest(c, "DELETE", path);

/** Run analyze → verify → decide steps for a started contract.
 *  Returns waiting_human (with analysis + options) or completed (with audit). */
export async function movaRunSteps(cfg: MovaConfig, contractId: string): Promise<unknown> {
  let analysis: unknown = null;

  for (const stepId of ["analyze", "verify", "decide"]) {
    const result = await movaPost(cfg, `/api/v1/contracts/${contractId}/step`, {
      envelope: {
        kind: "env.step.execute_v0",
        envelope_id: `env-${shortId()}`,
        contract_id: contractId,
        actor: { actor_type: "system", actor_id: "mova_runtime" },
        payload: { step_id: stepId },
      },
    }) as Record<string, unknown>;

    if (!result.ok) return result;

    if (stepId === "analyze") {
      try {
        const output = await movaGet(cfg, `/api/v1/contracts/${contractId}/steps/analyze/output`) as Record<string, unknown>;
        if (output.ok !== false) analysis = output;
      } catch { /* non-fatal */ }
    }

    if (result.status === "waiting_human") {
      const dpResp = await movaGet(cfg, `/api/v1/contracts/${contractId}/decision`) as Record<string, unknown>;
      const dp = (dpResp.decision_point ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        status: "waiting_human",
        contract_id: contractId,
        question: dp.question ?? "Select action:",
        options: dp.options ?? [],
        recommended: dp.recommended_option_id ?? null,
        ...(analysis ? { analysis } : {}),
      };
    }
  }

  const audit = await movaGet(cfg, `/api/v1/contracts/${contractId}/audit`) as Record<string, unknown>;
  return {
    ok: true,
    status: "completed",
    contract_id: contractId,
    audit_receipt: audit.audit_receipt ?? {},
    ...(analysis ? { analysis } : {}),
  };
}

export function toolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}
