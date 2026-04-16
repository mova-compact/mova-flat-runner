// ── MOVA Flat Runner — local validation layer ─────────────────────────────────
//
// Validates tool inputs against DataSpec field definitions before sending
// anything to the backend. Returns normalized errors, never throws.

import type { DsField } from "../schemas.js";

export interface ValidationError {
  field:   string;
  error:   string;
}

/** Validate agent-supplied inputs against a DataSpec field list. */
export function validateDataSpec(
  inputs: Record<string, unknown>,
  fields: DsField[],
): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  for (const f of fields) {
    const val = inputs[f.field];
    const missing = val === undefined || val === null || val === "";

    if (f.required && missing) {
      errors.push({ field: f.field, error: "required field is missing or empty" });
      continue;
    }

    if (missing) continue; // optional, not provided — skip further checks

    switch (f.type) {
      case "string": {
        if (typeof val !== "string") {
          errors.push({ field: f.field, error: `expected string, got ${typeof val}` });
          break;
        }
        if (f.format === "uri" && !val.startsWith("https://")) {
          errors.push({ field: f.field, error: "must be an HTTPS URL (starts with https://)" });
        }
        if (f.format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
          errors.push({ field: f.field, error: "must be ISO date YYYY-MM-DD" });
        }
        if (f.format === "iso-alpha-2" && !/^[A-Z]{2}$/.test(val)) {
          errors.push({ field: f.field, error: "must be ISO 3166-1 alpha-2 uppercase (e.g. DE)" });
        }
        if (f.enum && !f.enum.includes(val)) {
          errors.push({ field: f.field, error: `must be one of: ${f.enum.join(", ")}` });
        }
        break;
      }
      case "number": {
        if (typeof val !== "number" || isNaN(val as number)) {
          errors.push({ field: f.field, error: "expected number" });
        }
        break;
      }
      case "boolean": {
        if (typeof val !== "boolean") {
          errors.push({ field: f.field, error: "expected boolean" });
        }
        break;
      }
      case "array": {
        if (!Array.isArray(val)) {
          errors.push({ field: f.field, error: "expected array" });
        }
        break;
      }
      case "object": {
        if (typeof val !== "object" || Array.isArray(val) || val === null) {
          errors.push({ field: f.field, error: "expected object" });
        }
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Validate that a backend analyze response is a plain object, not a blob or array. */
export function validateBackendOutput(output: unknown): { ok: boolean; error?: string } {
  if (output === null || output === undefined) {
    return { ok: false, error: "backend returned null/undefined" };
  }
  if (typeof output !== "object") {
    return { ok: false, error: `expected object, got ${typeof output}` };
  }
  if (Array.isArray(output)) {
    return { ok: false, error: "backend returned array instead of object" };
  }
  const size = JSON.stringify(output).length;
  if (size > 200_000) {
    return { ok: false, error: `backend output too large (${size} bytes > 200KB limit)` };
  }
  return { ok: true };
}

/** Supported step types for the flat runner flow shape guard. */
export const SUPPORTED_STEP_TYPES = new Set([
  "ai_task",
  "verification",
  "decision_point",
]);

/** Validate that a manifest's steps[] matches the supported analyze→verify→decide shape. */
export function validateFlowShape(
  steps: unknown[],
): { ok: boolean; error?: string } {
  const typed = steps as Array<{ step_id: string; step_type: string }>;

  for (const required of ["analyze", "verify", "decide"]) {
    if (!typed.some(s => s.step_id === required)) {
      return { ok: false, error: `UNSUPPORTED_FLOW_SHAPE: missing required step "${required}"` };
    }
  }

  const unsupported = typed.find(s => !SUPPORTED_STEP_TYPES.has(s.step_type));
  if (unsupported) {
    return {
      ok: false,
      error: `UNSUPPORTED_FLOW_SHAPE: step "${unsupported.step_id}" has unsupported step_type "${unsupported.step_type}"`,
    };
  }

  return { ok: true };
}
